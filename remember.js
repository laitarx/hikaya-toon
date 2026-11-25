// "Remember this device for 30 days": keeps the login session (localStorage) and the decryption key
// (IndexedDB, as a NON-extractable CryptoKey: scripts can use it to decrypt but can never read or export it)
// on this device only. Fixed 30 days from the login, and logging out wipes both at once.
window.HKRemember = function (ns) {
  const LS = 'hk_dev_' + ns, DAYS = 30;
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('hk-device', 1); r.onupgradeneeded = () => r.result.createObjectStore('keys'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('keys', mode); const q = fn(t.objectStore('keys')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
  const read = () => { try { const d = JSON.parse(localStorage.getItem(LS) || 'null'); if (d && d.until > Date.now()) return d; } catch (_) {} return null; };
  return {
    // the device record, or null when absent / older than 30 days (then it is wiped)
    get() { const d = read(); if (!d) this.clear(); return d; },
    async key(uid) { try { const v = await tx('readonly', (s) => s.get(ns)); return v && v.uid === uid ? v.priv : null; } catch (_) { return null; } },
    async store(sess, uid, priv) {
      if (!priv || priv.extractable) return false; // only a key that can never be exported may be kept
      await tx('readwrite', (s) => s.put({ uid, priv }, ns));
      localStorage.setItem(LS, JSON.stringify({ uid, sess, until: Date.now() + DAYS * 864e5 }));
      return true;
    },
    // refresh tokens rotate: keep the stored session current
    touch(sess) { const d = read(); if (d && sess) { d.sess = sess; try { localStorage.setItem(LS, JSON.stringify(d)); } catch (_) {} } },
    clear() { try { localStorage.removeItem(LS); } catch (_) {} tx('readwrite', (s) => s.delete(ns)).catch(() => {}); },
  };
};
