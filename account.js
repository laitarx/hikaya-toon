// Password change with a code sent to the account email (Supabase reauthentication nonce).
// The private encryption key is re-wrapped under the new password at the same time, so no customer data is lost.
window.HKPassword = function (opts) {
  const { panel, API, KEY, token, api, uid } = opts;
  const $ = (s) => panel.querySelector(s);
  panel.innerHTML = `
    <h2>تغيير كلمة المرور</h2>
    <p class="small">نرسل رمز لإيميلك عشان نتأكد إنه أنت. ما ينفع تدخل بدون كلمة المرور، فاحفظ الجديدة في مكان آمن.</p>
    <form class="pw-form">
      <label>كلمة المرور الحالية<input name="cur" type="password" autocomplete="current-password" dir="ltr" required></label>
      <label>كلمة المرور الجديدة (10 أحرف أو أكثر)<input name="nw" type="password" autocomplete="new-password" dir="ltr" minlength="10" required></label>
      <label>أعد كتابة الجديدة<input name="nw2" type="password" autocomplete="new-password" dir="ltr" minlength="10" required></label>
      <button class="btn ghost" type="button" data-send>أرسل الرمز لإيميلي</button>
      <label data-code hidden>الرمز اللي وصلك بالإيميل<input name="code" inputmode="numeric" autocomplete="one-time-code" dir="ltr" maxlength="10"></label>
      <button class="btn" type="submit" data-code hidden>غيّر كلمة المرور</button>
      <p class="err" role="alert"></p>
    </form>`;
  const f = $('form'); const msg = $('.err');
  const say = (t, ok) => { msg.textContent = t; msg.style.color = ok ? 'var(--g)' : ''; };
  function check() {
    if (!f.cur.value) return 'اكتب كلمة المرور الحالية';
    if (f.nw.value.length < 10) return 'كلمة المرور الجديدة لازم 10 أحرف أو أكثر';
    if (f.nw.value !== f.nw2.value) return 'كلمتين المرور الجديدة مو متطابقة';
    if (f.nw.value === f.cur.value) return 'اختر كلمة مرور مختلفة عن الحالية';
    return '';
  }
  async function auth(method, path, body) {
    const r = await fetch(API + '/auth/v1/' + path, { method, headers: { apikey: KEY, Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.msg || j.error_description || j.message || 'خطأ ' + r.status);
    return j;
  }
  let row = null; let changed = false;
  $('[data-send]').addEventListener('click', async () => {
    const e = check(); if (e) { say(e); return; }
    try {
      const rows = await api('keyring?select=user_id,pub,priv_enc,salt,iv&user_id=eq.' + uid());
      row = rows[0] || null;
      if (row) { try { await HKCrypto.unlock(row, f.cur.value); } catch (_) { say('كلمة المرور الحالية غلط'); return; } }
      await auth('GET', 'reauthenticate');
      panel.querySelectorAll('[data-code]').forEach((el) => { el.hidden = false; }); f.code.focus();
      say('أرسلنا رمز لإيميلك. اكتبه هنا (يوصل خلال دقيقة، شيك الرسائل المزعجة).', true);
    } catch (err) { say(/rate|seconds/i.test(err.message) ? 'انتظر شوي قبل ما تطلب رمز ثاني' : err.message); }
  });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault(); const e = check(); if (e) { say(e); return; }
    const code = f.code.value.trim(); if (!code) { say('اكتب الرمز'); return; }
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const wrapped = row ? await HKCrypto.rewrapPrivate(row, f.cur.value, f.nw.value) : null;
      if (!changed) { await auth('PUT', 'user', { password: f.nw.value, nonce: code, current_password: f.cur.value }); changed = true; }
      if (wrapped) {
        let ok = false;
        for (let i = 0; i < 3 && !ok; i++) { try { await api('keyring?user_id=eq.' + uid(), { method: 'PATCH', body: JSON.stringify({ ...wrapped, updated_at: new Date().toISOString() }) }); ok = true; } catch (_) { await new Promise((r) => setTimeout(r, 800)); } }
        if (!ok) { say('تغيّرت كلمة المرور، بس مفتاح التشفير ما انحفظ. لا تقفل الصفحة واضغط "غيّر" مرة ثانية.'); btn.disabled = false; return; }
      }
      changed = false; row = null; f.reset(); panel.querySelectorAll('[data-code]').forEach((el) => { el.hidden = true; });
      say('تغيّرت كلمة المرور ✓ استخدم الجديدة من الحين.', true);
    } catch (err) { say(/nonce|otp|token|reauth/i.test(err.message) ? 'الرمز غلط أو انتهى، اطلب رمز جديد' : err.message); }
    btn.disabled = false;
  });
};
