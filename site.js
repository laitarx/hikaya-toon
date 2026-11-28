(function () {
  const S = window.SITE || {};
  const url = (S.gumroadUrl || '').trim();
  const okUrl = /^https:\/\/([a-z0-9-]+\.)?gumroad\.com\//i.test(url);
  const API = (S.supabaseUrl || '').replace(/\/$/, '');
  const KEY = S.supabaseKey || '';
  const tracking = /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(API) && KEY;

  // ------------------------------------------------------------ ids, invite code
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
  };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));
  let vid = store.get('hk_vid'); if (!vid) { vid = uuid(); store.set('hk_vid', vid); }
  const sid = uuid();
  const params = new URLSearchParams(location.search);
  const refParam = (params.get('ref') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
  if (refParam) { store.set('hk_ref', refParam); store.set('hk_ref_at', String(Date.now())); }
  const refAt = +(store.get('hk_ref_at') || 0);
  const ref = Date.now() - refAt < 30 * 864e5 ? (store.get('hk_ref') || '') : '';
  // clean the address bar so shared links do not carry someone else's code by accident
  if (refParam && history.replaceState) { params.delete('ref'); history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash); }

  function rpc(fn, body, keepalive) {
    if (!tracking) return Promise.resolve(null);
    const headers = { apikey: KEY, 'Content-Type': 'application/json' };
    if (KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + KEY;
    return fetch(API + '/rest/v1/rpc/' + fn, { method: 'POST', headers, body: JSON.stringify(body), keepalive: !!keepalive })
      .then((r) => (r.ok ? r.json().catch(() => null) : r.json().then((e) => Promise.reject(e)).catch((e) => Promise.reject(e))));
  }

  // ------------------------------------------------------------ session + engagement
  const utm = {}; ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach((k) => { if (params.get(k)) utm[k] = params.get(k).slice(0, 60); });
  const device = /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
  rpc('track_session', { p_session: sid, p_visitor: vid, p_ref: ref, p_referrer: document.referrer.slice(0, 300), p_utm: Object.keys(utm).length ? utm : null, p_device: device, p_page: location.pathname }).catch(() => {});

  let active = 0, lastTick = Date.now(), visible = !document.hidden, maxScroll = 0, stage = 1, videoSec = 0;
  const raise = (s) => { if (s > stage) { stage = s; ping(); } };
  setInterval(() => { const now = Date.now(); if (visible) active += (now - lastTick) / 1000; lastTick = now; if (active >= 30) raise(2); }, 1000);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; lastTick = Date.now(); if (!visible) ping(true); });
  window.addEventListener('pagehide', () => ping(true));
  window.addEventListener('scroll', () => {
    const h = document.documentElement; const p = Math.round(((h.scrollTop + innerHeight) / h.scrollHeight) * 100);
    if (p > maxScroll) { maxScroll = Math.min(100, p); if (maxScroll >= 50) raise(2); }
  }, { passive: true });
  function ping(keep) { rpc('track_ping', { p_session: sid, p_duration: Math.round(active), p_scroll: maxScroll, p_stage: stage, p_video: Math.round(videoSec) }, keep).catch(() => {}); }
  setInterval(() => { if (visible) ping(); }, 15000);
  const ev = (type, data) => rpc('track_event', { p_session: sid, p_type: type, p_data: data || null }).catch(() => {});

  // sections seen
  if ('IntersectionObserver' in window) {
    const seen = new Set();
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      const t = e.target.querySelector('h2')?.textContent.trim().slice(0, 40);
      if (e.isIntersecting && t && !seen.has(t)) { seen.add(t); ev('section', { t }); }
    }), { threshold: 0.5 });
    document.querySelectorAll('main section').forEach((s) => io.observe(s));
  }
  document.querySelectorAll('details').forEach((d) => d.addEventListener('toggle', () => { if (d.open) ev('faq_open', { q: d.querySelector('summary').textContent.slice(0, 60) }); }));

  // ------------------------------------------------------------ prices, email
  document.querySelectorAll('[data-price]').forEach((el) => { el.textContent = S.price || ''; });
  if (S.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(S.email)) {
    const row = document.querySelector('[data-email-row]'); const a = document.querySelector('[data-email]');
    a.textContent = S.email; a.href = 'mailto:' + S.email; row.hidden = false;
  }


  // ------------------------------------------------------------ video types: one click switches the whole page
  const TYPES = window.HK_TYPES || []; const CONNECT = window.HK_CONNECT || {};
  const base = { title: document.title };
  function applyType(key, why) {
    const T = TYPES.find((x) => x.key === key) || TYPES[0]; if (!T) return;
    const $ = (id) => document.getElementById(id);
    document.documentElement.style.setProperty('--red', T.color);
    $('hKicker').textContent = T.kicker; $('hTitle').innerHTML = T.h1; $('hLead').textContent = T.lead;
    $('hChips').replaceChildren(...['ويندوز + أي وكيل ذكاء اصطناعي'].concat(T.chips).map((c) => Object.assign(document.createElement('li'), { textContent: c })));
    const hv = $('heroVideo');
    if (!hv.src.endsWith(T.full ? 'assets/hero.mp4' : T.video)) { hv.poster = T.full ? 'assets/poster.jpg' : T.poster; hv.src = T.full ? 'assets/hero.mp4' : T.video; hv.play().catch(() => {}); }
    hv.muted = true; $('soundBtn').textContent = T.full ? '▶ شغّل الحلقة كاملة بالصوت' : '🔊 شغّل بالصوت';
    $('tFits').textContent = T.fits; $('tEngine').textContent = T.engine;
    $('tConnect').replaceChildren(...T.connect.map((k) => { const c = CONNECT[k]; const li = document.createElement('li');
      const b = document.createElement('b'); b.textContent = c.name; const sp = document.createElement('span'); sp.textContent = c.how;
      li.append(b, ' · ' + c.what, document.createElement('br'), sp); return li; }));
    document.querySelectorAll('#steps li p').forEach((p, i) => { if (T.steps[i]) p.textContent = T.steps[i]; });
    $('gallery').hidden = !['challenge', 'rise', 'city'].includes(T.key);
    document.querySelectorAll('#typesBar a, .tcards a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.type === T.key));
    const cur = document.querySelector('#typesBar a[aria-current]'); if (cur && why === 'click') cur.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    document.title = T.key === 'challenge' ? base.title : T.name + ' | حكاية تون';
    if (why) ev('type_view', { t: T.key, by: why });
    window.HK_TYPE = T.key;
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-type]'); if (!a) return;
    e.preventDefault(); applyType(a.dataset.type, 'click');
    const u = new URL(location.href); u.searchParams.set('type', a.dataset.type); history.replaceState(null, '', u.pathname + u.search);
    if (!a.closest('#typesBar')) { document.getElementById('top').scrollIntoView({ behavior: 'smooth' }); if (a.closest('.tcards')) playHero(); }
  });
  const typeParam = (params.get('type') || '').toLowerCase();
  if (TYPES.some((x) => x.key === typeParam)) applyType(typeParam, 'link');
  else if (ref) rpc('ref_info', { p_code: ref }).then((r) => { const t = Array.isArray(r) ? r[0] && r[0].default_type : r && r.default_type; if (t && TYPES.some((x) => x.key === t)) applyType(t, 'ref'); }).catch(() => {});

  // ------------------------------------------------------------ buy -> lead form -> Gumroad
  const leadModal = document.getElementById('leadModal');
  const form = document.getElementById('leadForm');
  const msg = document.getElementById('leadMsg');
  // two offers: data-buy (the $49 tool) and data-buy="sub" (the $5/month subscription, S.gumroadSubUrl).
  // Both carry the same invite code and lead id, so the affiliate gets the sale either way.
  const subUrl = (S.gumroadSubUrl || '').trim();
  const okSub = /^https:\/\/([a-z0-9-]+\.)?gumroad\.com\//i.test(subUrl);
  let wantSub = false;
  function checkoutUrl(leadId) {
    const u = new URL(wantSub ? subUrl : url); u.searchParams.set('wanted', 'true');
    if (ref) u.searchParams.set('ref', ref);
    if (leadId) u.searchParams.set('lid', leadId);
    return u.toString();
  }
  document.querySelectorAll('[data-buy]').forEach((a) => {
    const sub = a.dataset.buy === 'sub';
    if (!(sub ? okSub : okUrl)) { a.classList.add('soon'); a.removeAttribute('href'); a.firstChild.textContent = 'قريباً · '; return; }
    a.href = '#buy';
    a.addEventListener('click', (e) => {
      wantSub = sub;
      e.preventDefault(); raise(4); ev('buy_click', { where: a.closest('section,header')?.className || '', offer: sub ? 'sub' : 'one-time' });
      if (!tracking) { location.href = checkoutUrl(null); return; }
      leadModal.hidden = false; ev('lead_form_open'); setTimeout(() => form.email.focus(), 50);
    });
  });
  document.getElementById('leadClose').addEventListener('click', () => { leadModal.hidden = true; });
  leadModal.addEventListener('click', (e) => { if (e.target === leadModal) leadModal.hidden = true; });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    msg.textContent = '';
    const email = form.email.value.trim();
    const phone = (form.cc.value + form.phone.value.replace(/^0+/, '')).replace(/[^0-9+]/g, '');
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) { msg.textContent = 'اكتب إيميل صحيح'; return; }
    if (!/^\+[0-9]{8,15}$/.test(phone)) { msg.textContent = 'اكتب رقم جوال صحيح'; return; }
    if (!form.consent.checked) { msg.textContent = 'لازم توافق على حفظ البيانات عشان نكمل'; return; }
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'لحظة...';
    // encrypted in this browser for the owner (and the affiliate who sent the visitor) only
    rpc('lead_keys', { p_session: sid })
      .then(async (keys) => {
        if (!Array.isArray(keys) || !keys.length || !window.HKCrypto) return null;
        const enc = await HKCrypto.seal({ email, phone }, keys);
        return rpc('submit_lead_enc', { p_session: sid, p_visitor: vid, p_enc: enc, p_email_hash: await HKCrypto.emailHash(email), p_consent: true });
      })
      .then((id) => { stage = Math.max(stage, 6); ping(true); ev('checkout_redirect'); location.href = checkoutUrl(typeof id === 'string' ? id : null); })
      .catch(() => { btn.disabled = false; btn.textContent = 'كمّل للدفع'; msg.textContent = 'صار خطأ، تأكد من البيانات وجرّب مرة ثانية'; });
  });

  // ------------------------------------------------------------ demo modal
  const modal = document.getElementById('modal'); const demo = document.getElementById('demoVideo');
  let vStart = 0;
  const hero = document.getElementById('heroVideo');
  function playHero() { const T = (window.HK_TYPES || []).find((x) => x.key === window.HK_TYPE) || {}; if (T.full) return;
    hero.muted = false; hero.currentTime = 0; hero.loop = true; hero.play().catch(() => { hero.muted = true; hero.play().catch(() => {}); });
    document.getElementById('soundBtn').textContent = '🔇 كتم الصوت'; ev('video_play', { t: window.HK_TYPE }); }
  window.playHero = playHero;
  hero.addEventListener('timeupdate', () => { if (!hero.muted) { videoSec = Math.max(videoSec, hero.currentTime); if (videoSec >= 8) raise(3); } });
  document.getElementById('soundBtn').addEventListener('click', () => {
    const T = (window.HK_TYPES || []).find((x) => x.key === window.HK_TYPE) || { full: true };
    if (T.full) { modal.hidden = false; demo.currentTime = 0; demo.play().catch(() => {}); ev('video_play'); return; }
    if (hero.muted) playHero(); else { hero.muted = true; document.getElementById('soundBtn').textContent = '🔊 شغّل بالصوت'; }
  });
  demo.addEventListener('timeupdate', () => { videoSec = Math.max(videoSec, demo.currentTime); if (videoSec >= 10) raise(3); });
  demo.addEventListener('ended', () => ev('video_end', { s: Math.round(demo.duration) }));
  const close = () => { demo.pause(); modal.hidden = true; ping(); };
  document.getElementById('closeBtn').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); leadModal.hidden = true; } });

  // ------------------------------------------------------------ light copy protection (deterrent only)
  document.addEventListener('contextmenu', (e) => { if (e.target.closest('img, video, .phone, .gallery')) e.preventDefault(); });
  document.addEventListener('dragstart', (e) => { if (e.target.closest('img, video')) e.preventDefault(); });
  document.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'u' || k === 'p')) e.preventDefault();
  });
  if (window.top !== window.self) { try { window.top.location = window.self.location; } catch (_) { document.body.innerHTML = ''; } }
})();
