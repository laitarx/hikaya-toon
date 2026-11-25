(function () {
  const S = window.SITE || {};
  const API = (S.supabaseUrl || '').replace(/\/$/, '');
  const KEY = S.supabaseKey || '';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const money = (c) => '$' + (Number(c || 0) / 100).toFixed(2).replace(/\.00$/, '');
  const mins = (s) => { s = Math.round(s || 0); return s < 60 ? s + ' ث' : Math.floor(s / 60) + ' د ' + (s % 60) + ' ث'; };
  const STAGES = ['', 'زار الصفحة', 'تفاعل', 'شاف الفيديو', 'ضغط شراء', 'كتب إيميله ورقمه', 'راح للدفع', 'اشترى'];
  const TYPES = window.HK_TYPES || [];
  const show = (id) => ['login', 'unlock', 'pending', 'app', 'setup', 'reset'].forEach((x) => { $(x).hidden = x !== id; });
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(API) || !KEY) { show('setup'); return; }
  const siteBase = (/^https:\/\//.test(S.siteUrl || '') ? S.siteUrl : 'https://laitarx.github.io/hikaya-toon/').replace(/\/?$/, '/');

  // ------------------------------------------------------------ auth (session lives in this tab only)
  let sess = null;
  try { sess = JSON.parse(sessionStorage.getItem('hk_partner') || 'null'); } catch (_) {}
  const DEV = HKRemember('partner');
  const save = (s) => { sess = s; try { s ? sessionStorage.setItem('hk_partner', JSON.stringify(s)) : sessionStorage.removeItem('hk_partner'); } catch (_) {} if (s) DEV.touch(s); };
  async function auth(path, body) {
    const r = await fetch(API + '/auth/v1/' + path, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.msg || j.error_description || j.message || 'خطأ');
    return j;
  }
  const keep = (j) => save({ at: j.access_token, rt: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 - 60000, meta: (j.user && j.user.user_metadata) || (sess && sess.meta) || {} });
  async function token() { if (!sess) throw new Error('auth'); if (Date.now() > sess.exp) keep(await auth('token?grant_type=refresh_token', { refresh_token: sess.rt })); return sess.at; }
  async function api(path, opt = {}) {
    const r = await fetch(API + '/rest/v1/' + path, { ...opt, headers: { apikey: KEY, Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opt.headers || {}) } });
    if (r.status === 401) { save(null); DEV.clear(); location.reload(); }
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error((j && (j.message || j.hint)) || 'خطأ ' + r.status);
    return j;
  }
  const rpc = (fn, body) => api('rpc/' + fn, { method: 'POST', body: JSON.stringify(body || {}) });

  let mode = 'in';
  document.querySelectorAll('#loginForm .seg button').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode; document.querySelectorAll('#loginForm .seg button').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('[data-up]').forEach((el) => { el.hidden = mode !== 'up'; });
    $('loginBtn').textContent = mode === 'up' ? 'أنشئ الحساب' : 'دخول'; $('loginMsg').textContent = '';
  }));
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; $('loginMsg').textContent = '';
    const email = f.email.value.trim(); const pw = f.password.value;
    try {
      if (mode === 'up') {
        if (!f.name.value.trim()) { $('loginMsg').textContent = 'اكتب اسمك'; return; }
        if (!/^[a-z0-9_-]{2,32}$/i.test(f.code.value.trim())) { $('loginMsg').textContent = 'اكتب كود رابطك (حروف إنجليزية وأرقام)'; return; }
        if (pw.length < 10) { $('loginMsg').textContent = 'كلمة المرور 10 أحرف أو أكثر'; return; }
        const j = await auth('signup?redirect_to=' + encodeURIComponent(siteBase + 'partner.html'), { email, password: pw, data: { name: f.name.value.trim(), contact: f.contact.value.trim(), code: f.code.value.trim().toLowerCase() } });
        if (j.access_token) { keep(j); await enter(pw); } else $('loginMsg').textContent = 'وصلك إيميل تأكيد. أكّده، وبعدين ارجع هنا وسجّل دخول.';
        return;
      }
      keep(await auth('token?grant_type=password', { email, password: pw })); await enter(pw);
    } catch (err) { $('loginMsg').textContent = /not confirmed/i.test(err.message) ? 'أكّد إيميلك من الرسالة اللي وصلتك أول' : /registered|exists/i.test(err.message) ? 'هذا الإيميل مسجّل، اختر دخول' : mode === 'up' ? err.message : 'الإيميل أو كلمة المرور غلط'; }
  });
  document.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', async () => {
    try { await fetch(API + '/auth/v1/logout', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + sess.at } }); } catch (_) {}
    save(null); DEV.clear(); location.reload();
  }));

  // ------------------------------------------------------------ keys
  let PRIV = null, UID = null, ME = null;
  const uidOf = (t) => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; } catch (_) { return null; } };
  async function keys(pw) {
    const rows = await api('keyring?select=user_id,pub,priv_enc,salt,iv&user_id=eq.' + UID);
    if (rows.length) { PRIV = await HKCrypto.unlock(rows[0], pw); return; }
    const k = await HKCrypto.newKeyring(pw);
    await api('keyring', { method: 'POST', body: JSON.stringify({ user_id: UID, ...k.row }) }); PRIV = k.priv;
  }
  async function enter(pw) {
    UID = uidOf(await token());
    ME = await rpc('aff_me');
    if (!ME) { const m = sess.meta || {}; try { await rpc('affiliate_apply', { p_name: m.name || 'مسوّق', p_contact: m.contact || '', p_code: m.code || '' }); } catch (e) { codeError(e); } ME = await rpc('aff_me'); }
    if (pw) { try { await keys(pw); } catch (e) { console.error(e); } }
    if (!ME) { $('pendingText').textContent = 'اكتب كود رابطك عشان نكمل طلبك.'; $('codeForm').hidden = false; show('pending'); return; }
    applyTheme(ME.theme || {});
    if (ME.status !== 'approved' || !ME.codes.length) {
      $('pendingText').textContent = ME.status === 'rejected' ? 'للأسف ما انقبل طلبك. لو عندك سؤال تواصل مع صاحب الأداة.'
        : ME.status === 'approved' ? 'انقبل حسابك ✅ باقي يربطك صاحب الأداة برابطك، وبعدها تطلع أرقامك هنا.' : 'صاحب الأداة يراجع طلبك. أول ما يوافق ويربطك برابطك، تطلع لك أرقامك هنا.';
      $('codeForm').hidden = ME.status !== 'pending'; if (ME.requested_code) $('codeForm').code.value = ME.requested_code;
      show('pending'); return;
    }
    if (!PRIV) { show('unlock'); return; }
    show('app'); load();
  }
  function codeError(e) { const m = String(e && e.message || e); $('codeMsg').textContent = /not found/.test(m) ? 'الكود هذا مو موجود، تأكد منه من صاحب الأداة' : /taken/.test(m) ? 'الكود هذا مربوط بحساب ثاني' : /confirm/.test(m) ? 'أكّد إيميلك أول' : 'صار خطأ، جرّب مرة ثانية'; }
  $('codeForm').addEventListener('submit', async (e) => {
    e.preventDefault(); $('codeMsg').textContent = '';
    const m = sess.meta || {};
    try { await rpc('affiliate_apply', { p_name: (ME && ME.name) || m.name || 'مسوّق', p_contact: m.contact || '', p_code: e.target.code.value.trim().toLowerCase() }); $('codeMsg').style.color = 'var(--g)'; $('codeMsg').textContent = 'انحفظ ✓ ينتظر موافقة صاحب الأداة'; ME = await rpc('aff_me'); }
    catch (err) { $('codeMsg').style.color = ''; codeError(err); }
  });
  HKPassword({ panel: $('pwPanel'), API, KEY, token, api, uid: () => UID });
  $('pwBtn').addEventListener('click', () => { $('pwPanel').hidden = !$('pwPanel').hidden; });
  $('newKey').addEventListener('click', async () => {
    const pw = $('unlockForm').password.value; $('unlockMsg').textContent = '';
    if (pw.length < 10) { $('unlockMsg').textContent = 'اكتب كلمة مرورك الحالية فوق أول'; return; }
    if (!confirm('ينشئ مفتاح تشفير جديد بكلمة مرورك الحالية. عملاؤك القدامى يرجعون يطلعون لك بعد ما يفتح صاحب الأداة لوحته. متأكد؟')) return;
    try { const k = await HKCrypto.newKeyring(pw); await api('keyring?user_id=eq.' + UID, { method: 'PATCH', body: JSON.stringify({ ...k.row, updated_at: new Date().toISOString() }) }); PRIV = k.priv; $('unlockForm').reset(); show('app'); load(); }
    catch (err) { $('unlockMsg').textContent = err.message; }
  });
  $('unlockForm').addEventListener('submit', async (e) => {
    e.preventDefault(); $('unlockMsg').textContent = '';
    try { await keys(e.target.password.value); e.target.reset(); show('app'); load(); } catch (_) { $('unlockMsg').textContent = 'كلمة المرور غلط'; }
  });

  // ------------------------------------------------------------ theme (saved to the account)
  const COLORS = ['#ffd43b', '#ff8787', '#69db7c', '#74c0fc', '#b197fc', '#ffa94d', '#63e6be', '#f783ac'];
  let THEME = {};
  function applyTheme(t) {
    THEME = Object.assign({ color: COLORS[0], mode: 'auto', size: 'm', corners: 'round', density: 'cozy', first: 'money' }, t || {});
    const R = document.documentElement;
    R.style.setProperty('--acc', COLORS.includes(THEME.color) ? THEME.color : COLORS[0]);
    if (THEME.mode === 'auto') R.removeAttribute('data-mode'); else R.setAttribute('data-mode', THEME.mode === 'dark' ? 'dark' : 'light');
    R.style.setProperty('--fs', { s: '13px', m: '15px', l: '18px' }[THEME.size] || '15px');
    R.style.setProperty('--rad', THEME.corners === 'sharp' ? '4px' : '18px');
    R.style.setProperty('--pad', THEME.density === 'compact' ? '10px' : '16px');
    const order = [THEME.first].concat(['money', 'visits', 'customers'].filter((x) => x !== THEME.first));
    order.forEach((k) => { const el = document.querySelector(`[data-block="${k}"]`); if (el) $('blocks').appendChild(el); });
    $('swatches').innerHTML = COLORS.map((c) => `<button type="button" data-c="${c}" class="${c === THEME.color ? 'on' : ''}" aria-label="${c}"></button>`).join('');
    $('swatches').querySelectorAll('button').forEach((b) => { b.style.background = b.dataset.c; });
    document.querySelectorAll('#themePanel .seg').forEach((g) => g.querySelectorAll('button').forEach((b) => b.classList.toggle('on', THEME[g.dataset.key] === b.dataset.v)));
  }
  let saveT = null;
  function setTheme(k, v) { THEME[k] = v; applyTheme(THEME); clearTimeout(saveT); saveT = setTimeout(() => rpc('aff_set_theme', { p_theme: THEME }).then(() => { $('themeMsg').textContent = 'انحفظ ✓'; }).catch(() => { $('themeMsg').textContent = 'ما انحفظ، جرّب مرة ثانية'; }), 500); }
  $('swatches').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setTheme('color', b.dataset.c); });
  document.querySelectorAll('#themePanel .seg').forEach((g) => g.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setTheme(g.dataset.key, b.dataset.v); }));
  $('themeBtn').addEventListener('click', () => { $('themePanel').hidden = !$('themePanel').hidden; });

  // ------------------------------------------------------------ data (refreshes every 30 s)
  async function load() {
    if (!load.rem) { load.rem = true; if (PRIV && ($('loginForm').remember.checked || $('unlockForm').remember.checked)) DEV.store(sess, UID, PRIV).catch(() => {}); }
    const days = +$('range').value;
    try {
      const [st, leads, sales] = await Promise.all([rpc('aff_stats', { p_days: days }), rpc('aff_leads', { p_days: days }), rpc('aff_sales', { p_days: days })]);
      for (const l of leads) { const d = PRIV && l.enc && await HKCrypto.open(l.enc, UID, PRIV); l.email = d ? d.email : '🔒'; l.phone = d ? d.phone : ''; }
      for (const x of sales) { const d = PRIV && x.enc && await HKCrypto.open(x.enc, UID, PRIV); x.email = d ? d.email : ''; }
      render(st, leads, sales); $('live').classList.remove('off'); $('live').textContent = '● مباشر · ' + new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { console.error(e); $('live').classList.add('off'); $('live').textContent = '● متوقف'; }
  }
  $('range').addEventListener('change', load);
  setInterval(() => { if (!document.hidden && !$('app').hidden) load(); }, 30000);

  function render(st, leads, sales) {
    $('hello').textContent = 'أهلاً ' + (ME.name || '');
    const kpi = [['عمولتك', money(st.commission_cents), true], ['مبيعات', fmt(st.sales)], ['زوار', fmt(st.visitors)], ['عملاء محتملين', fmt(st.leads)],
      ['متوسط الوقت', mins(st.avg_sec)], ['تحويل', st.visitors ? ((st.sales / st.visitors) * 100).toFixed(1) + '%' : '0%']];
    $('kpis').innerHTML = kpi.map(([l, v, big]) => `<div class="kpi ${big ? 'big' : ''}"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
    const typeName = (k) => (TYPES.find((t) => t.key === k) || TYPES[0] || {}).name || '';
    $('byCode').innerHTML = '<tr><th>رابطك</th><th>النوع اللي يشوفه زوارك</th><th>النسبة</th><th>زوار</th><th>مبيعات</th><th>عمولتك</th></tr>' + st.by_code.map((c) => {
      const me = ME.codes.find((x) => x.code === c.code) || {}; const link = siteBase + '?ref=' + c.code;
      return `<tr><td dir="ltr"><button class="link copy" data-link="${esc(link)}">${esc(link.replace(/^https?:\/\//, ''))} 📋</button></td><td>${esc(typeName(me.type))}</td><td>${esc(+c.pct)}%</td><td>${fmt(c.visitors)}</td><td>${fmt(c.sales)}</td><td>${money(c.commission_cents)}</td></tr>`;
    }).join('');
    $('sales').innerHTML = '<tr><th>التاريخ</th><th>العميل</th><th>المبلغ</th><th>عمولتك</th></tr>' + (sales.map((x) =>
      `<tr class="${x.refunded ? 'muted' : ''}"><td>${esc(new Date(x.created_at).toLocaleString('ar'))}</td><td dir="ltr">${esc(x.email || '—')}</td><td>${money(x.price_cents)}${x.refunded ? ' (مسترجع)' : ''}</td><td>${x.refunded ? '—' : money(x.commission_cents)}</td></tr>`).join('') || '<tr><td colspan="4" class="small">ما فيه مبيعات بهذي الفترة للحين</td></tr>');
    // daily visitors
    const days = Math.min(+$('range').value, 30); const map = new Map(st.daily.map((d) => [d.d, d.v])); const arr = [];
    for (let i = days - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); arr.push([d, map.get(d) || 0]); }
    const mx = Math.max(1, ...arr.map((a) => a[1]));
    $('daily').innerHTML = arr.map(([d, v]) => `<span data-h="${(v / mx) * 100}" title="${esc(d)}: ${v}"><i>${v || ''}</i></span>`).join('');
    $('daily').querySelectorAll('span').forEach((el) => { el.style.height = Math.max(2, +el.dataset.h) + '%'; });
    const f = st.funnel || []; const top = Math.max(1, f[0] || 0);
    $('funnel').innerHTML = f.map((n, i) => `<div class="step"><span class="lbl">${esc(STAGES[i + 1])}</span><span class="track"><span data-w="${(n / top) * 100}"></span></span><span class="num">${fmt(n)}</span></div>`).join('');
    $('funnel').querySelectorAll('[data-w]').forEach((el) => { el.style.width = Math.max(0, Math.min(100, +el.dataset.w)) + '%'; });
    $('leads').innerHTML = '<tr><th>الإيميل</th><th>الجوال</th><th>وصل لـ</th><th>وقته بالصفحة</th><th>الرابط</th><th>التاريخ</th></tr>' + (leads.map((l) =>
      `<tr><td dir="ltr">${esc(l.email)}</td><td dir="ltr">${l.phone ? `<a href="https://wa.me/${esc(String(l.phone).replace(/\D/g, ''))}" target="_blank" rel="noopener noreferrer">${esc(l.phone)}</a>` : ''}</td>
        <td>${l.bought ? '<span class="tag bought">اشترى ✅</span>' : esc(STAGES[Math.min(7, l.stage || 5)])}</td><td>${esc(mins(l.total_sec))}</td><td class="code">${esc(l.ref)}</td><td>${esc(new Date(l.created_at).toLocaleDateString('ar'))}</td></tr>`).join('') || '<tr><td colspan="6" class="small">ما فيه عملاء بهذي الفترة للحين</td></tr>');
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('button.copy'); if (b) navigator.clipboard.writeText(b.dataset.link).then(() => { b.textContent = 'تم النسخ ✓'; }); });

  // back from the confirmation email: the session is in the address hash
  const hh = new URLSearchParams(location.hash.slice(1));
  if (hh.get('access_token')) {
    let meta = {}; try { meta = JSON.parse(atob(hh.get('access_token').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).user_metadata || {}; } catch (_) {}
    save({ at: hh.get('access_token'), rt: hh.get('refresh_token'), exp: Date.now() + (+hh.get('expires_in') || 3600) * 1000 - 60000, meta });
    history.replaceState(null, '', location.pathname);
  }
  const recovering = HKRecover({ API, KEY, redirect: location.origin + location.pathname, forgotBtn: $('forgot'), emailField: $('loginForm').email, msg: $('loginMsg'), resetSection: $('reset'),
    onDone: async (tok, pw) => { keep(tok); await enter(pw); } });
  if (recovering) show('reset');
  else if (DEV.get()) (async () => {
    const d = DEV.get(); if (!sess) save(d.sess);
    if (uidOf(sess.at) === d.uid) PRIV = await DEV.key(d.uid);
    if (!PRIV) DEV.clear();
    await enter();
  })().catch(() => { DEV.clear(); save(null); show('login'); });
  else if (sess) enter().catch(() => { save(null); show('login'); }); else show('login');
})();
