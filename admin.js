(function () {
  const S = window.SITE || {};
  const API = (S.supabaseUrl || '').replace(/\/$/, '');
  const KEY = S.supabaseKey || '';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const mins = (s) => { s = Math.round(s || 0); return s < 60 ? s + ' ث' : Math.floor(s / 60) + ' د ' + (s % 60) + ' ث'; };
  const STAGES = ['', 'زار الصفحة', 'تفاعل (30ث أو نص الصفحة)', 'شاف الفيديو', 'ضغط شراء', 'كتب إيميله ورقمه', 'راح لصفحة الدفع', 'اشترى'];

  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(API) || !KEY) { $('setup').hidden = false; return; }

  // ------------------------------------------------------------ auth
  let sess = null;
  try { sess = JSON.parse(sessionStorage.getItem('hk_admin') || 'null'); } catch (_) {}
  const save = (s) => { sess = s; try { s ? sessionStorage.setItem('hk_admin', JSON.stringify(s)) : sessionStorage.removeItem('hk_admin'); } catch (_) {} };
  async function auth(path, body) {
    const r = await fetch(API + '/auth/v1/' + path, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.msg || j.error_description || j.message || 'خطأ');
    return j;
  }
  function keep(j) { save({ at: j.access_token, rt: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 - 60000 }); }
  async function token() {
    if (!sess) throw new Error('auth');
    if (Date.now() > sess.exp) keep(await auth('token?grant_type=refresh_token', { refresh_token: sess.rt }));
    return sess.at;
  }
  async function api(path, opt = {}) {
    const t = await token();
    const r = await fetch(API + '/rest/v1/' + path, { ...opt, headers: { apikey: KEY, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opt.headers || {}) } });
    if (r.status === 401) { save(null); location.reload(); }
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error((j && (j.message || j.hint)) || 'خطأ ' + r.status);
    return j;
  }

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); $('loginMsg').textContent = '';
    const f = e.target;
    try { keep(await auth('token?grant_type=password', { email: f.email.value.trim(), password: f.password.value })); await enter(); }
    catch (err) { $('loginMsg').textContent = /Email not confirmed/i.test(err.message) ? 'أكّد إيميلك من الرسالة اللي وصلتك أول' : 'الإيميل أو كلمة المرور غلط'; }
  });
  $('firstTime').addEventListener('click', async () => {
    const f = $('loginForm'); $('loginMsg').textContent = '';
    if (!f.email.value || f.password.value.length < 10) { $('loginMsg').textContent = 'اكتب إيميلك وكلمة مرور قوية (10 أحرف أو أكثر) وبعدين اضغط هنا'; return; }
    try {
      const j = await auth('signup', { email: f.email.value.trim(), password: f.password.value });
      if (j.access_token) { keep(j); await enter(); }
      else $('loginMsg').textContent = 'وصلك إيميل تأكيد. أكّده وبعدين ارجع وسجّل دخول.';
    } catch (err) { $('loginMsg').textContent = err.message; }
  });
  $('logout').addEventListener('click', async () => { try { await fetch(API + '/auth/v1/logout', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + sess.at } }); } catch (_) {} save(null); location.reload(); });

  async function enter() {
    const ok = await api('rpc/claim_admin', { method: 'POST', body: '{}' });
    if (ok !== true) { save(null); $('login').hidden = false; $('app').hidden = true; $('loginMsg').textContent = 'هذا الحساب ما عنده صلاحية.'; return; }
    $('login').hidden = true; $('app').hidden = false; load();
  }

  // ------------------------------------------------------------ data
  let DATA = {};
  async function load() {
    const days = +$('range').value; const since = new Date(Date.now() - days * 864e5).toISOString();
    const q = encodeURIComponent(since);
    const [sessions, visitors, leads, sales, refs, events] = await Promise.all([
      api(`sessions?select=id,visitor_id,ref,started_at,duration_sec,max_scroll,max_stage,video_sec&started_at=gte.${q}&limit=20000`),
      api(`visitors?select=id,referrer,utm,device,first_ref&last_seen=gte.${q}&limit=20000`),
      api(`v_lead_profiles?select=*&created_at=gte.${q}&order=created_at.desc&limit=5000`),
      api(`sales?select=sale_id,email,price_cents,currency,ref,refunded,is_test,created_at&created_at=gte.${q}&order=created_at.desc&limit=5000`),
      api('v_ref_stats?select=*&order=revenue_cents.desc'),
      api(`events?select=type,data&at=gte.${q}&type=in.(section,faq_open)&limit=20000`),
    ]);
    DATA = { sessions, visitors, leads, sales, refs, events };
    render();
  }
  $('range').addEventListener('change', load); $('reload').addEventListener('click', load);

  function bars(el, rows, total) {
    const max = Math.max(1, ...rows.map((r) => r[1]));
    el.innerHTML = rows.map(([label, n, extra]) => `<div class="bar"><span class="lbl">${esc(label)}</span><span class="track"><span data-w="${(n / max) * 100}"></span></span><span class="num">${fmt(n)}${total ? ' · ' + Math.round((n / Math.max(1, total)) * 100) + '%' : ''}${extra ? ' · ' + esc(extra) : ''}</span></div>`).join('') || '<p class="small">ما فيه بيانات للحين</p>';
  }

  function render() {
    const { sessions, visitors, leads, sales, refs, events } = DATA;
    const real = sales.filter((s) => !s.is_test && !s.refunded);
    const revenue = real.reduce((a, s) => a + (s.price_cents || 0), 0) / 100;
    const uniq = new Set(sessions.map((s) => s.visitor_id)).size;
    const avg = sessions.length ? sessions.reduce((a, s) => a + s.duration_sec, 0) / sessions.length : 0;
    // per-visitor best stage
    const best = new Map();
    sessions.forEach((s) => best.set(s.visitor_id, Math.max(best.get(s.visitor_id) || 0, s.max_stage)));
    const reached = (k) => [...best.values()].filter((v) => v >= k).length;
    const kpi = [
      ['زوار', uniq], ['زيارات', sessions.length], ['متوسط الوقت', mins(avg)], ['ضغطوا شراء', reached(4)],
      ['عملاء محتملين', leads.length], ['مبيعات', real.length], ['الدخل', '$' + revenue.toFixed(0)], ['تحويل زائر ← شراء', uniq ? ((real.length / uniq) * 100).toFixed(1) + '%' : '0%'],
    ];
    $('kpis').innerHTML = kpi.map(([l, v]) => `<div class="kpi"><b>${esc(typeof v === 'number' ? fmt(v) : v)}</b><span>${esc(l)}</span></div>`).join('');

    // funnel
    const fun = [1, 2, 3, 4, 5, 6].map((k) => [STAGES[k], reached(k)]);
    fun.push([STAGES[7], real.length]);
    const top = Math.max(1, fun[0][1]);
    $('funnel').innerHTML = fun.map(([l, n], i) => {
      const prev = i ? fun[i - 1][1] : n; const drop = i && prev ? Math.round((1 - n / prev) * 100) : 0;
      return `<div class="step"><span class="lbl">${i + 1}. ${esc(l)}</span><span class="track"><span data-w="${(n / top) * 100}"></span></span><span class="num">${fmt(n)}${i ? ` <em>(−${drop}%)</em>` : ''}</span></div>`;
    }).join('');

    // time + scroll
    const tb = [['أقل من 10ث', 0, 10], ['10-30ث', 10, 30], ['30ث-1د', 30, 60], ['1-2 د', 60, 120], ['2-5 د', 120, 300], ['أكثر من 5 د', 300, 1e9]];
    bars($('timeDist'), tb.map(([l, a, b]) => [l, sessions.filter((s) => s.duration_sec >= a && s.duration_sec < b).length]), sessions.length);
    const byStage = [1, 4, 5, 6].map((k) => { const ss = sessions.filter((s) => s.max_stage >= k); return STAGES[k] + ': ' + mins(ss.reduce((a, s) => a + s.duration_sec, 0) / Math.max(1, ss.length)); });
    $('timeNote').textContent = 'متوسط الوقت لكل مرحلة — ' + byStage.join(' · ');
    const sb = [['أقل من 25%', 0, 25], ['25-50%', 25, 50], ['50-75%', 50, 75], ['75-99%', 75, 99], ['آخر الصفحة', 99, 101]];
    bars($('scrollDist'), sb.map(([l, a, b]) => [l, sessions.filter((s) => s.max_scroll >= a && s.max_scroll < b).length]), sessions.length);

    renderLeads(); renderRefs();

    // sources
    const src = {};
    visitors.forEach((v) => {
      let k = v.first_ref ? 'رابط دعوة: ' + v.first_ref : v.utm && v.utm.utm_source ? 'utm: ' + v.utm.utm_source : '';
      if (!k) { try { k = v.referrer ? new URL(v.referrer).hostname.replace(/^www\./, '').replace(/^l\./, '') : 'مباشر / بايو'; } catch (_) { k = 'غير معروف'; } }
      src[k] = (src[k] || 0) + 1;
    });
    const dev = { mobile: 0, desktop: 0 }; visitors.forEach((v) => { if (dev[v.device] != null) dev[v.device]++; });
    $('sources').innerHTML = '<tr><th>المصدر</th><th>زوار</th></tr>' + Object.entries(src).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => `<tr><td>${esc(k)}</td><td>${fmt(n)}</td></tr>`).join('') +
      `<tr><td class="small">جوال / كمبيوتر</td><td class="small">${fmt(dev.mobile)} / ${fmt(dev.desktop)}</td></tr>`;
    $('sales').innerHTML = '<tr><th>التاريخ</th><th>الإيميل</th><th>المبلغ</th><th>الرابط</th></tr>' + sales.slice(0, 30).map((s) =>
      `<tr class="${s.refunded || s.is_test ? 'muted' : ''}"><td>${esc(new Date(s.created_at).toLocaleString('ar'))}</td><td dir="ltr">${esc(s.email)}</td><td>${esc(((s.price_cents || 0) / 100).toFixed(2) + ' ' + (s.currency || ''))}${s.refunded ? ' (مسترجع)' : ''}${s.is_test ? ' (تجربة)' : ''}</td><td>${esc(s.ref || '—')}</td></tr>`).join('');

    const count = (type, key) => { const m = {}; events.filter((e) => e.type === type).forEach((e) => { const k = e.data && e.data[key]; if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    bars($('sections'), count('section', 't'), sessions.length);
    bars($('faqs'), count('faq_open', 'q'));
    document.querySelectorAll('[data-w]').forEach((el) => { el.style.width = Math.max(0, Math.min(100, +el.dataset.w)) + '%'; });
  }

  function score(l) {
    if (l.bought) return ['bought', 'اشترى ✅'];
    const hot = l.stage >= 6 && (l.total_sec >= 120 || l.video_sec >= 20 || l.sessions >= 2);
    return hot ? ['hot', 'اتصل الحين 🔥'] : ['warm', 'تابع'];
  }
  function renderLeads() {
    const f = $('leadFilter').value;
    const rows = DATA.leads.map((l) => ({ l, s: score(l) })).filter(({ s }) => f === 'all' || s[0] === f)
      .sort((a, b) => ({ hot: 0, warm: 1, bought: 2 }[a.s[0]] - { hot: 0, warm: 1, bought: 2 }[b.s[0]]) || b.l.total_sec - a.l.total_sec);
    $('leads').innerHTML = '<tr><th>التوصية</th><th>الإيميل</th><th>الجوال</th><th>وصل لـ</th><th>الوقت</th><th>الفيديو</th><th>زيارات</th><th>الرابط</th><th>الحالة</th><th>التاريخ</th></tr>' +
      rows.map(({ l, s }) => `<tr data-id="${esc(l.id)}"><td><span class="tag ${s[0]}">${esc(s[1])}</span></td><td dir="ltr">${esc(l.email)}</td>
        <td dir="ltr"><a href="https://wa.me/${esc(String(l.phone).replace(/\D/g, ''))}" target="_blank" rel="noopener noreferrer">${esc(l.phone)}</a></td>
        <td>${esc(STAGES[Math.min(7, l.stage || 5)])}</td><td>${esc(mins(l.total_sec))}</td><td>${esc(mins(l.video_sec))}</td><td>${fmt(l.sessions)}</td><td>${esc(l.ref || '—')}</td>
        <td><select class="status">${['new', 'contacted', 'bought', 'not_interested'].map((v) => `<option value="${v}" ${v === l.status ? 'selected' : ''}>${{ new: 'جديد', contacted: 'تواصلت', bought: 'اشترى', not_interested: 'غير مهتم' }[v]}</option>`).join('')}</select></td>
        <td>${esc(new Date(l.created_at).toLocaleDateString('ar'))}</td></tr>`).join('');
  }
  $('leadFilter').addEventListener('change', renderLeads);
  $('leads').addEventListener('change', async (e) => {
    if (!e.target.classList.contains('status')) return;
    const id = e.target.closest('tr').dataset.id;
    try { await api('leads?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) }); } catch (err) { alert(err.message); }
  });
  $('exportLeads').addEventListener('click', () => {
    const head = ['email', 'phone', 'stage', 'total_sec', 'video_sec', 'sessions', 'ref', 'status', 'bought', 'created_at'];
    const csv = [head.join(',')].concat(DATA.leads.map((l) => head.map((h) => '"' + String(l[h] ?? '').replace(/"/g, '""') + '"').join(','))).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'leads.csv'; a.click();
  });

  const siteBase = location.origin + location.pathname.replace(/admin\.html$/, '');
  function renderRefs() {
    $('refs').innerHTML = '<tr><th>المسوّق</th><th>الرابط</th><th>زوار</th><th>ضغطوا شراء</th><th>عملاء</th><th>مبيعات</th><th>الدخل</th><th>عمولته</th><th>تحويل</th><th></th></tr>' +
      DATA.refs.map((r) => {
        const rev = (r.revenue_cents || 0) / 100; const link = siteBase + '?ref=' + r.code;
        return `<tr class="${r.active ? '' : 'muted'}" data-code="${esc(r.code)}"><td>${esc(r.name)}</td><td dir="ltr"><button class="link copy" data-link="${esc(link)}">${esc(link.replace(/^https?:\/\//, ''))} 📋</button></td>
        <td>${fmt(r.visitors)}</td><td>${fmt(r.buy_clicks)}</td><td>${fmt(r.leads)}</td><td>${fmt(r.sales)}</td><td>$${rev.toFixed(0)}</td><td>$${((rev * r.commission_pct) / 100).toFixed(0)} (${esc(r.commission_pct)}%)</td>
        <td>${r.visitors ? ((r.sales / r.visitors) * 100).toFixed(1) + '%' : '—'}</td><td><button class="link toggle">${r.active ? 'إيقاف' : 'تفعيل'}</button></td></tr>`;
      }).join('');
  }
  $('refs').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('copy')) { navigator.clipboard.writeText(b.dataset.link).then(() => { b.textContent = 'تم النسخ ✓'; }); return; }
    if (b.classList.contains('toggle')) {
      const code = b.closest('tr').dataset.code; const r = DATA.refs.find((x) => x.code === code);
      await api('ref_links?code=eq.' + encodeURIComponent(code), { method: 'PATCH', body: JSON.stringify({ active: !r.active }) }); load();
    }
  });
  $('refForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; $('refMsg').textContent = '';
    const code = f.code.value.trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,32}$/.test(code)) { $('refMsg').textContent = 'الكود حروف إنجليزية صغيرة وأرقام فقط'; return; }
    try {
      await api('ref_links', { method: 'POST', body: JSON.stringify({ code, name: f.name.value.trim(), contact: f.contact.value.trim() || null, commission_pct: +f.pct.value || 0 }) });
      f.reset(); f.pct.value = 20; load();
    } catch (err) { $('refMsg').textContent = /duplicate/i.test(err.message) ? 'الكود مستخدم' : err.message; }
  });

  // ------------------------------------------------------------ start
  if (sess) enter().catch((e) => { console.error(e); save(null); $('login').hidden = false; $('app').hidden = true; }); else $('login').hidden = false;
})();
