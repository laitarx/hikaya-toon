(function () {
  const S = window.SITE || {};
  if (S.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(S.email)) {
    document.querySelectorAll('[data-email]').forEach((a) => { a.textContent = S.email; a.href = 'mailto:' + S.email; });
    document.querySelectorAll('[data-email-row]').forEach((r) => { r.hidden = false; });
  }
})();
