(function () {
  const S = window.SITE || {};
  const API = (S.supabaseUrl || '').replace(/\/$/, ''); const KEY = S.supabaseKey || '';
  const $ = (id) => document.getElementById(id);
  const show = (id) => ['ask', 'confirm', 'done'].forEach((x) => { $(x).hidden = x !== id; });
  const here = (/^https:\/\//.test(S.siteUrl || '') ? S.siteUrl : 'https://laitarx.github.io/hikaya-toon/').replace(/\/?$/, '/') + 'delete.html';

  // step 2: came back from the email link with a session in the address hash
  const h = new URLSearchParams(location.hash.slice(1));
  const at = h.get('access_token');
  if (h.get('error_description')) { $('askMsg').textContent = 'الرابط انتهى أو استُخدم. اطلب رابط جديد.'; }
  if (at) {
    history.replaceState(null, '', location.pathname);
    let email = ''; try { email = JSON.parse(atob(at.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || ''; } catch (_) {}
    $('who').textContent = email; show('confirm');
    $('confirmForm').addEventListener('submit', async (e) => {
      e.preventDefault(); $('confirmMsg').textContent = '';
      if (e.target.word.value.trim() !== 'احذف') { $('confirmMsg').textContent = 'اكتب كلمة احذف بالضبط'; return; }
      const b = e.target.querySelector('button'); b.disabled = true; b.textContent = 'لحظة...';
      try {
        const r = await fetch(API + '/rest/v1/rpc/delete_my_data', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' }, body: '{}' });
        if (!r.ok) throw new Error(await r.text());
        const n = await r.json();
        $('doneText').textContent = n ? 'انحذفت بياناتك من عندنا، وما يقدر أحد يشوفها بعد الحين.' : 'ما لقينا أي بيانات بهذا الإيميل، وما عندنا شي محفوظ عنك.';
        show('done');
      } catch (_) { b.disabled = false; b.textContent = 'احذف بياناتي نهائياً'; $('confirmMsg').textContent = 'الرابط انتهى. ارجع واطلب رابط جديد.'; }
    });
    return;
  }

  // step 1: send the confirmation link
  $('askForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; $('askMsg').textContent = '';
    const email = f.email.value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) { $('askMsg').textContent = 'اكتب إيميل صحيح'; return; }
    if (!f.ok.checked) { $('askMsg').textContent = 'لازم توافق إن الحذف نهائي'; return; }
    const b = f.querySelector('button'); b.disabled = true;
    try {
      const r = await fetch(API + '/auth/v1/otp?redirect_to=' + encodeURIComponent(here), { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, create_user: true }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.msg || j.message || ''); }
      $('askMsg').style.color = 'var(--g)'; $('askMsg').textContent = 'أرسلنا رابط لإيميلك. افتحه وأكّد الحذف (شيك الرسائل المزعجة).';
    } catch (err) { b.disabled = false; $('askMsg').textContent = /rate|seconds/i.test(err.message) ? 'انتظر دقيقة قبل ما تطلب رابط ثاني' : 'صار خطأ، جرّب بعد شوي'; }
  });
})();
