// Hikaya Toon end-to-end encryption for customer data (WebCrypto only, no libraries).
// A record is sealed with a fresh AES-256-GCM key; that key is wrapped with RSA-OAEP-2048 (SHA-256) for every reader.
// A reader's private key is kept in the database encrypted with AES-GCM under PBKDF2(password, salt, 310000, SHA-256),
// so only someone who knows that reader's password can open it.
(function () {
  const C = crypto.subtle; const te = new TextEncoder(); const td = new TextDecoder();
  const b64 = (buf) => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' };
  const ITER = 310000;

  async function pwKey(password, salt) {
    const base = await C.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
    return C.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  // new key pair -> { pub (JWK), priv_enc, salt, iv } for the keyring table, and the usable private key
  async function newKeyring(password) {
    const kp = await C.generateKey({ ...RSA, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt']);
    const pub = await C.exportKey('jwk', kp.publicKey);
    const pk = await C.exportKey('pkcs8', kp.privateKey);
    const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await C.encrypt({ name: 'AES-GCM', iv }, await pwKey(password, salt), pk);
    return { row: { pub: { kty: pub.kty, n: pub.n, e: pub.e, alg: pub.alg }, priv_enc: b64(ct), salt: b64(salt), iv: b64(iv) }, priv: kp.privateKey };
  }
  async function unlock(row, password) {
    const pk = await C.decrypt({ name: 'AES-GCM', iv: unb64(row.iv) }, await pwKey(password, unb64(row.salt)), unb64(row.priv_enc));
    return C.importKey('pkcs8', pk, RSA, false, ['decrypt']);
  }
  // re-encrypt the same private key under a new password (password change)
  async function rewrapPrivate(row, oldPw, newPw) {
    const pk = await C.decrypt({ name: 'AES-GCM', iv: unb64(row.iv) }, await pwKey(oldPw, unb64(row.salt)), unb64(row.priv_enc));
    const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await C.encrypt({ name: 'AES-GCM', iv }, await pwKey(newPw, salt), pk);
    return { priv_enc: b64(ct), salt: b64(salt), iv: b64(iv) };
  }
  const importPub = (jwk) => C.importKey('jwk', { ...jwk, alg: 'RSA-OAEP-256', ext: true }, RSA, false, ['encrypt']);
  // recipients: [{kid, pub}] -> { v, iv, ct, k: { kid: wrappedKey } }
  async function seal(obj, recipients) {
    const raw = crypto.getRandomValues(new Uint8Array(32)); const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await C.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
    const ct = await C.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
    const k = {};
    const kv = {};
    for (const r of recipients) { k[r.kid] = b64(await C.encrypt(RSA, await importPub(r.pub), raw)); if (r.ver) kv[r.kid] = r.ver; }
    raw.fill(0);
    return { v: 1, iv: b64(iv), ct: b64(ct), k, kv };
  }
  async function rawKey(enc, kid, priv) { const w = enc && enc.k && enc.k[kid]; if (!w) return null; return new Uint8Array(await C.decrypt(RSA, priv, unb64(w))); }
  async function open(enc, kid, priv) {
    try {
      const raw = await rawKey(enc, kid, priv); if (!raw) return null;
      const key = await C.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
      return JSON.parse(td.decode(await C.decrypt({ name: 'AES-GCM', iv: unb64(enc.iv) }, key, unb64(enc.ct))));
    } catch (_) { return null; }
  }
  // give another reader access to a record I can open (keeps the data itself unchanged)
  async function share(enc, kid, priv, toKid, toPub, toVer) {
    const raw = await rawKey(enc, kid, priv); if (!raw) return null;
    const k = Object.assign({}, enc.k, { [toKid]: b64(await C.encrypt(RSA, await importPub(toPub), raw)) });
    const kv = Object.assign({}, enc.kv || {}); if (toVer) kv[toKid] = toVer;
    return Object.assign({}, enc, { k, kv });
  }
  async function emailHash(email) { return [...new Uint8Array(await C.digest('SHA-256', te.encode('hk:' + email.trim().toLowerCase())))].map((x) => x.toString(16).padStart(2, '0')).join(''); }
  window.HKCrypto = { newKeyring, unlock, rewrapPrivate, seal, open, share, emailHash };
})();
