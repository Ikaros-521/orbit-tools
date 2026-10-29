/* codec-lab backend — crypto/zlib services the renderer cannot do itself:
   legacy digests (MD5 / SM3), raw-key symmetric ciphers, gzip.
   All handlers are synchronous and stateless. */
const crypto = require('crypto');
const zlib = require('zlib');

// key/iv lengths in bytes; iv 0 = no IV (stream/ECB). rc4 takes any key length.
const CIPHERS = {
  'aes-128-cbc': { key: 16, iv: 16 },
  'aes-192-cbc': { key: 24, iv: 16 },
  'aes-256-cbc': { key: 32, iv: 16 },
  'aes-128-ecb': { key: 16, iv: 0 },
  'aes-192-ecb': { key: 24, iv: 0 },
  'aes-256-ecb': { key: 32, iv: 0 },
  'aes-128-ctr': { key: 16, iv: 16 },
  'aes-192-ctr': { key: 24, iv: 16 },
  'aes-256-ctr': { key: 32, iv: 16 },
  'des-cbc': { key: 8, iv: 8 },
  'des-ede3-cbc': { key: 24, iv: 8 },
  'rc4': { key: 0, iv: 0 },
};

// EVP_BytesToKey (OpenSSL, 1 iteration) — the derivation behind `openssl enc -pass`
// and crypto-js `AES.encrypt(text, passphrase)`, so simple-mode ciphertext
// round-trips with those tools byte for byte. Digest matters: crypto-js and
// OpenSSL 1.x use md5, OpenSSL 3.x CLI defaults to sha256.
function evpBytesToKey(digest, password, salt, keyLen, ivLen) {
  let out = Buffer.alloc(0);
  let last = null;
  while (out.length < keyLen + ivLen) {
    const h = crypto.createHash(digest);
    if (last) h.update(last);
    h.update(password, 'utf8');
    h.update(salt);
    last = h.digest();
    out = Buffer.concat([out, last]);
  }
  return { key: out.subarray(0, keyLen), iv: out.subarray(keyLen, keyLen + ivLen) };
}

const toBuffer = (input, format) => {
  if (format === 'base64') {
    const norm = String(input).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(norm + '='.repeat((4 - (norm.length % 4)) % 4), 'base64');
  }
  if (format === 'hex') return Buffer.from(String(input).replace(/[^0-9a-f]/gi, ''), 'hex');
  return Buffer.from(String(input), 'utf8');
};

const fromBuffer = (buf, format) => {
  if (format === 'hex') return buf.toString('hex');
  if (format === 'base64') return buf.toString('base64');
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
};

// rc4 sits in OpenSSL 3's legacy provider, unavailable to createCipheriv by
// default — the algorithm is 15 lines, so just do it by hand.
function rc4(keyBuf, data) {
  const S = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + keyBuf[i % keyBuf.length]) & 255;
    [S[i], S[j]] = [S[j], S[i]];
  }
  const out = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let n = 0; n < data.length; n++) {
    i = (i + 1) & 255;
    j = (j + S[i]) & 255;
    [S[i], S[j]] = [S[j], S[i]];
    out[n] = data[n] ^ S[(S[i] + S[j]) & 255];
  }
  return out;
}

module.exports = {
  activate(ctx) {
    // md5 is not in WebCrypto; sm3 depends on the OpenSSL build, so probe it
    ctx.ipc.handle('digestAlgos', () => {
      const avail = new Set(crypto.getHashes());
      return ['md5', 'sha1', 'sha256', 'sha512', 'sm3'].filter(a => avail.has(a));
    });

    // des/rc4 sit in OpenSSL 3's legacy provider, so surface only what this
    // runtime can actually run (rc4 is hand-rolled above, always available)
    ctx.ipc.handle('ciphers', () => {
      const avail = new Set(crypto.getCiphers());
      return Object.keys(CIPHERS).filter(a => a === 'rc4' || avail.has(a));
    });

    // perLine: hash each non-empty line separately → results become arrays
    ctx.ipc.handle('hash', ({ input, algos, perLine = false, hmacKey = '', salt = '' }) => {
      const digest = (text, algo) => {
        if (!/^[a-z0-9]{2,10}$/.test(algo)) throw new Error(`bad algo: ${algo}`);
        const data = salt
          ? Buffer.concat([Buffer.from(text, 'utf8'), Buffer.from(salt, 'utf8')])
          : Buffer.from(text, 'utf8');
        return hmacKey
          ? crypto.createHmac(algo, hmacKey).update(data).digest('hex')
          : crypto.createHash(algo).update(data).digest('hex');
      };
      const lines = String(input).split(/\r?\n/).filter(l => l.length);
      const out = {};
      for (const algo of algos) {
        out[algo] = perLine ? lines.map(l => digest(l, algo)) : digest(String(input), algo);
      }
      return out;
    });

    ctx.ipc.handle('cipher', ({ op, algo, password = '', kdfDigest = 'md5', key = '', keyFormat = 'utf8', iv = '', ivFormat = 'utf8', padding = 'pkcs7', input, inputFormat = 'text', outputFormat }) => {
      const spec = CIPHERS[algo];
      if (!spec) throw new Error(`unsupported algo: ${algo}`);
      const encrypt = op !== 'decrypt';
      // sensible default per direction: ciphertext prints as base64/hex, plaintext as text
      if (!outputFormat) outputFormat = encrypt ? 'base64' : 'text';

      let keyBuf, ivBuf, ct;
      if (password) {
        if (!spec.key) throw new Error('rc4 does not support password mode, use key');
        if (!crypto.getHashes().includes(kdfDigest)) throw new Error(`bad kdf digest: ${kdfDigest}`);
        const blob = toBuffer(input, inputFormat);
        if (encrypt) {
          const salt = crypto.randomBytes(8);
          const d = evpBytesToKey(kdfDigest, password, salt, spec.key, spec.iv);
          const c = crypto.createCipheriv(algo, d.key, spec.iv ? d.iv : null);
          ct = Buffer.concat([Buffer.from('Salted__'), salt, c.update(blob), c.final()]);
        } else {
          if (blob.length < 16 || blob.subarray(0, 8).toString('utf8') !== 'Salted__') {
            throw new Error('not an OpenSSL "Salted__" blob (crypto-js password output expected)');
          }
          const d = evpBytesToKey(kdfDigest, password, blob.subarray(8, 16), spec.key, spec.iv);
          const c = crypto.createDecipheriv(algo, d.key, spec.iv ? d.iv : null);
          ct = Buffer.concat([c.update(blob.subarray(16)), c.final()]);
        }
        // password-mode ciphertext always carries the Salted__ blob, so encrypt
        // only makes sense as base64/hex; decrypt yields plaintext per outputFormat
        return fromBuffer(ct, encrypt && outputFormat === 'text' ? 'base64' : outputFormat);
      }

      keyBuf = toBuffer(key, keyFormat);
      if (!keyBuf.length) throw new Error('key is required');
      if (spec.key && keyBuf.length !== spec.key) throw new Error(`key must be ${spec.key} bytes for ${algo}, got ${keyBuf.length}`);
      ivBuf = spec.iv ? toBuffer(iv, ivFormat) : null;
      if (spec.iv && ivBuf.length !== spec.iv) throw new Error(`iv must be ${spec.iv} bytes for ${algo}, got ${ivBuf.length}`);

      if (algo === 'rc4') return fromBuffer(rc4(keyBuf, toBuffer(input, inputFormat)), outputFormat);

      const c = encrypt
        ? crypto.createCipheriv(algo, keyBuf, ivBuf)
        : crypto.createDecipheriv(algo, keyBuf, ivBuf);
      if (padding === 'none') c.setAutoPadding(false);
      ct = Buffer.concat([c.update(toBuffer(input, inputFormat)), c.final()]);
      return fromBuffer(ct, outputFormat);
    });

    // gzip: compressed bytes only make sense as base64/hex; decompress emits utf-8 text
    ctx.ipc.handle('gzip', ({ op, input, inputFormat = 'text', outputFormat }) => {
      const buf = toBuffer(input, inputFormat);
      const out = op === 'decompress' ? zlib.gunzipSync(buf) : zlib.gzipSync(buf);
      const fmt = op === 'decompress' && outputFormat !== 'base64' && outputFormat !== 'hex' ? 'text' : (outputFormat === 'text' ? 'base64' : outputFormat || 'base64');
      return fromBuffer(out, fmt);
    });
  },
};
