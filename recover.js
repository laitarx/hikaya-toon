// "Forgot password": a reset link goes to the account email; the link opens this page with a recovery session,
// where the owner sets a new password themselves. Returns true when it took over the page (recovery link).
window.HKRecover = function (o) {
  const { API, KEY, redirect, forgotBtn, emailField, msg, resetSection, onDone } = o;
  forgotBtn.addEventListener('click', async () => {
    const email = emailField.value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) { msg.textContent = 'اكتب إيميلك فوق وبعدين اضغط "نسيت كلمة المرور"'; return; }
    forgotBtn.disabled = true;
    try {
      const r = await fetch(API + '/auth/v1/recover?redirect_to=' + encodeURIComponent(redirect), { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.msg || j.message || ''); }
      msg.style.color = 'var(--g)'; msg.textContent = 'لو الإيميل مسجّل عندنا، بيوصلك رابط لتعيين كلمة مرور جديدة (شيك الرسائل المزعجة).';
    } catch (err) { msg.style.color = ''; msg.textContent = /rate|seconds/i.test(err.message) ? 'انتظر دقيقة قبل ما تطلب رابط ثاني' : 'صار خطأ، جرّب بعد شوي'; }
    forgotBtn.disabled = false;
  });

  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('error_description')) { msg.textContent = 'الرابط انتهى أو استُخدم قبل. اطلب رابط جديد.'; history.replaceState(null, '', location.pathname); }
  if (h.get('type') !== 'recovery' || !h.get('access_token')) return false;
  const tok = { access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_in: +h.get('expires_in') || 3600 };
  history.replaceState(null, '', location.pathname);
  resetSection.innerHTML = `<form class="card login" id="resetForm">
      <h1>كلمة مرور جديدة</h1>
      <p class="small">اختر كلمة مرور قوية (10 أحرف أو أكثر) واحفظها في مكان آمن. ما فيه دخول بدونها.</p>
      <label>كلمة المرور الجديدة<input name="pw" type="password" autocomplete="new-password" dir="ltr" minlength="10" required></label>
      <label>أعد كتابتها<input name="pw2" type="password" autocomplete="new-password" dir="ltr" minlength="10" required></label>
      <button class="btn" type="submit">احفظ وادخل</button>
      <p class="err" role="alert"></p></form>`;
  resetSection.hidden = false;
  const f = resetSection.querySelector('form'); const m = f.querySelector('.err');
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); m.textContent = '';
    if (f.pw.value.length < 10) { m.textContent = 'كلمة المرور لازم 10 أحرف أو أكثر'; return; }
    if (f.pw.value !== f.pw2.value) { m.textContent = 'الكلمتين مو متطابقة'; return; }
    const b = f.querySelector('button'); b.disabled = true;
    try {
      const r = await fetch(API + '/auth/v1/user', { method: 'PUT', headers: { apikey: KEY, Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: f.pw.value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.msg || j.message || 'خطأ ' + r.status);
      resetSection.hidden = true; await onDone(tok, f.pw.value);
    } catch (err) { b.disabled = false; m.textContent = /expired|invalid|jwt/i.test(err.message) ? 'الرابط انتهى، اطلب رابط جديد' : err.message; }
  });
  return true;
};
