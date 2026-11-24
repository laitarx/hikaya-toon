(function () {
  const S = window.SITE || {};
  const url = (S.gumroadUrl || '').trim();
  const okUrl = /^https:\/\/([a-z0-9-]+\.)?gumroad\.com\//i.test(url);

  // buy buttons -> Gumroad checkout (only real gumroad.com links are accepted)
  document.querySelectorAll('[data-price]').forEach((el) => { el.textContent = S.price || ''; });
  document.querySelectorAll('[data-buy]').forEach((a) => {
    if (okUrl) {
      a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    } else {
      a.classList.add('soon'); a.removeAttribute('href');
      a.firstChild.textContent = 'قريباً · ';
    }
  });
  if (S.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(S.email)) {
    const row = document.querySelector('[data-email-row]'); const a = document.querySelector('[data-email]');
    a.textContent = S.email; a.href = 'mailto:' + S.email; row.hidden = false;
  }

  // demo with sound in a modal
  const modal = document.getElementById('modal'); const demo = document.getElementById('demoVideo');
  document.getElementById('soundBtn').addEventListener('click', () => { modal.hidden = false; demo.currentTime = 0; demo.play().catch(() => {}); });
  const close = () => { demo.pause(); modal.hidden = true; };
  document.getElementById('closeBtn').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // light copy protection for the page's media and text (deterrent only; see SECURITY.md)
  document.addEventListener('contextmenu', (e) => { if (e.target.closest('img, video, .phone, .gallery')) e.preventDefault(); });
  document.addEventListener('dragstart', (e) => { if (e.target.closest('img, video')) e.preventDefault(); });
  document.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'u' || k === 'p')) e.preventDefault();
  });

  // refuse to run inside someone else's frame (anti-clickjacking for static hosting)
  if (window.top !== window.self) { try { window.top.location = window.self.location; } catch (_) { document.body.innerHTML = ''; } }
})();
