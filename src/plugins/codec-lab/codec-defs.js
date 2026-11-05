/* codec-lab shared definitions (extracted from panel.js):
   byte/base64 helpers, i18n dict, codec registry, radix helpers,
   per-scope localStorage history, category constants.
   Pure data & functions only — no DOM, no panel state. */
(() => {
  'use strict';
  const enc = new TextEncoder();
  const dec = new TextDecoder('utf-8', { fatal: false });

  /* ---------- bytes & encoding helpers ---------- */
  // 分块拼接：一次性展开全部字节作为函数实参会在 ~65KB 以上触发
  // RangeError (Maximum call stack size exceeded)
  const bytesToB64 = bytes => {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  };
  // accept padded and unpadded / base64url input
  const b64ToBytes = s => {
    const norm = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(norm + '='.repeat((4 - (norm.length % 4)) % 4)), c => c.charCodeAt(0));
  };
  const bytesToHex = (bytes, { case: lower = true, sep = ' ' } = {}) => {
    let out = '';
    for (const b of bytes) out += (lower ? b.toString(16) : b.toString(16).toUpperCase()).padStart(2, '0') + sep;
    return sep ? out.slice(0, -sep.length) : out;
  };
  const hexToBytes = s => Uint8Array.from(
    (s.replace(/0x/gi, '').replace(/[\s,:-]+/g, '').match(/.{1,2}/g) || []).map(h => parseInt(h, 16)));

  const IMG_MAGIC = [
    [0x89, 0x50, 0x4e, 0x47], // PNG
    [0xff, 0xd8, 0xff],       // JPEG
    [0x47, 0x49, 0x46, 0x38], // GIF
  ];
  const sniffImageMime = bytes => {
    const head = [...bytes.subarray(0, 12)];
    if (IMG_MAGIC.some(m => m.every((v, i) => head[i] === v))) {
      if (head[0] === 0x89) return 'image/png';
      if (head[0] === 0xff) return 'image/jpeg';
      return 'image/gif';
    }
    // RIFF....WEBP
    if (head.length >= 12 && head[0] === 0x52 && head[8] === 0x57 && head[11] === 0x50) return 'image/webp';
    return null;
  };

  /* ---------- i18n ---------- */
  const T = {
    zh: {
      in: '输入', out: '输出', ph: '在此输入或粘贴文本…',
      swap: '⇅ 对调', copyOut: '复制结果', clear: '清空', history: '🕘 历史',
      copied: '✓ 已复制', decodeOnly: '该格式仅支持解码', chars: '字', failed: '处理失败',
      now: '现在', imgPrev: '图片预览', download: '下载', copyImg: '复制图片', imgCopied: '✓ 图片已复制',
      radixMore: '更多进制', radixBad: '进制字符无效',
      hashUpper: '大写', hashPerLine: '每行独立', hashHmac: 'HMAC', hashSalt: '盐值', hashKey: '密钥',
      hashEmpty: '输入内容后实时计算', hashCopied: '✓ 已复制',
      cipEnc: '加密', cipDec: '解密', cipPwdMode: '口令', cipKeyMode: '密钥',
      cipPwd: '口令', cipKey: '密钥', cipIv: 'IV', cipPad: '填充', cipKdf: '派生',
      cipPwdHint: 'Salted__ 格式，与 crypto-js / openssl enc 兼容',
      cipInFmt: '输入', cipOutFmt: '输出',
      histEmpty: '暂无历史', histClear: '清空历史',
      catCodec: '编解码', catRadix: '进制', catHash: '哈希', catCipher: '加密',
      sepSpace: '空格', sepNone: '无', sepColon: '冒号', sepComma: '逗号',
      caseLower: '小写', caseUpper: '大写', b64Std: '标准', b64Url: 'URL 安全',
      modeEnc: '编码', modeDec: '解码', modeZip: '压缩', modeUnzip: '解压',
    },
    en: {
      in: 'IN', out: 'OUT', ph: 'type / paste here…',
      swap: '⇅ swap', copyOut: 'copy out', clear: 'clear', history: '🕘 history',
      copied: '✓ copied', decodeOnly: 'decode-only codec', chars: 'ch', failed: 'error',
      now: 'now', imgPrev: 'image', download: 'download', copyImg: 'copy image', imgCopied: '✓ image copied',
      radixMore: 'more radices', radixBad: 'invalid digit for radix',
      hashUpper: 'UPPERCASE', hashPerLine: 'per line', hashHmac: 'HMAC', hashSalt: 'salt', hashKey: 'key',
      hashEmpty: 'hashing happens as you type', hashCopied: '✓ copied',
      cipEnc: 'Encrypt', cipDec: 'Decrypt', cipPwdMode: 'password', cipKeyMode: 'raw key',
      cipPwd: 'password', cipKey: 'key', cipIv: 'IV', cipPad: 'padding', cipKdf: 'kdf',
      cipPwdHint: 'Salted__ blob, crypto-js / openssl enc compatible',
      cipInFmt: 'in', cipOutFmt: 'out',
      histEmpty: 'no history yet', histClear: 'clear history',
      catCodec: 'Codecs', catRadix: 'Radix', catHash: 'Hash', catCipher: 'Crypto',
      sepSpace: 'space', sepNone: 'none', sepColon: 'colon', sepComma: 'comma',
      caseLower: 'lower', caseUpper: 'upper', b64Std: 'std', b64Url: 'url-safe',
      modeEnc: 'Encode', modeDec: 'Decode', modeZip: 'Compress', modeUnzip: 'Decompress',
    },
  };

  /* ---------- codec registry (编解码 category) ---------- */
  const CODECS = {
    base64: {
      label: { zh: 'Base64', en: 'Base64' },
      encode: (text, bytes, o) => {
        const b = bytesToB64(bytes);
        return o && o.urlsafe ? b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b;
      },
      decode: s => dec.decode(b64ToBytes(s)),
      decodeBytes: b64ToBytes,
      hint: { zh: 'UTF-8 ↔ Base64 编解码', en: 'UTF-8 → Base64' },
      imageable: true, outKind: 'base64',
    },
    url: {
      label: { zh: 'URL 编码', en: 'URL' },
      encode: s => encodeURIComponent(s),
      decode: s => decodeURIComponent(s.replace(/\+/g, ' ')),
      hint: { zh: '百分号 URL 转义 / 解码', en: 'percent-encoding' },
    },
    hex: {
      label: { zh: 'Hex 十六进制', en: 'Hex' },
      encode: (text, bytes, o) => bytesToHex(bytes, o || {}),
      decode: s => dec.decode(hexToBytes(s)),
      decodeBytes: hexToBytes,
      hint: { zh: '十六进制字节 ↔ UTF-8 文本', en: 'bytes in hex' },
      imageable: true, outKind: 'hex',
    },
    unicode: {
      label: { zh: 'Unicode 转义', en: 'Unicode' },
      encode: s => [...s].map(c => '\\u' + c.codePointAt(0).toString(16).padStart(4, '0')).join(''),
      decode: s => s.replace(/\\u\{([0-9a-f]+)\}|\\u([0-9a-f]{4})|&#x([0-9a-f]+);|\\x([0-9a-f]{2})/gi, (_, b1, b2, b3, b4) => String.fromCodePoint(parseInt(b1 || b2 || b3 || b4, 16))),
      hint: { zh: '\\uXXXX / \\u{X} / &#xX; 转义字符', en: '\\uXXXX / \\u{X} / &#xX;' },
    },
    html: {
      label: { zh: 'HTML 实体', en: 'HTML' },
      encode: s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
      // textarea round-trip decodes every named entity the engine knows
      decode: s => { const d = document.createElement('textarea'); d.innerHTML = s; return d.value; },
      hint: { zh: 'HTML 实体 ↔ 文本', en: 'HTML entities ↔ text' },
    },
    gzip: {
      label: { zh: 'GZIP', en: 'GZIP' },
      async: true,
      // all codec entry points share the call signature (text, bytes, opts, call, isZh)
      encode: (text, bytes, o, call) => call('gzip', { op: 'compress', input: bytesToB64(bytes), inputFormat: 'base64', outputFormat: (o && o.fmt) || 'base64' }),
      decode: (text, bytes, o, call) => call('gzip', { op: 'decompress', input: text, inputFormat: (o && o.fmt) || 'base64', outputFormat: 'text' }),
      hint: { zh: '文本压缩 / 解压（gzip）', en: 'compress / decompress' },
      outKind: 'gzipfmt',
    },
    jwt: {
      label: { zh: 'JWT 解析', en: 'JWT' },
      encode: null, // JWT is decode-only here: signing needs a secret
      decode: (s, _b, _o, _c, isZh) => {
        const parts = s.trim().split('.');
        if (parts.length < 2) throw new Error(isZh ? '无效的 JWT 格式（需包含 header.payload）' : 'not a JWT (need header.payload)');
        const j = part => JSON.stringify(JSON.parse(dec.decode(b64ToBytes(part))), null, 2);
        const ann = json => json.split('\n').map(line => {
          const m = line.match(/^(\s*"(?:exp|nbf|iat|auth_time)"\s*:\s*)(\d{9,14})(,?\s*)$/);
          if (!m) return line;
          const ms = Number(m[2]) > 1e11 ? Number(m[2]) : Number(m[2]) * 1000;
          const d = new Date(ms);
          if (isNaN(d)) return line;
          const expired = /exp|auth_time/.test(m[1]) && Date.now() > ms;
          return `${m[1]}${m[2]}${m[3]}  // ${d.toLocaleString()}${expired ? (isZh ? ' ⚠ 已过期' : ' ⚠ expired') : ''}`;
        }).join('\n');
        const out = [
          `// ${isZh ? '头部 (header)' : 'header'}\n${j(parts[0])}`,
          `// ${isZh ? '载荷 (payload)' : 'payload'}\n${ann(j(parts[1]))}`,
        ];
        if (parts[2]) out.push(`// ${isZh ? '签名原始值 (signature raw)' : 'signature (raw)'}\n${parts[2]}`);
        return out.join('\n\n');
      },
      hint: { zh: 'JWT 令牌结构解析（含时间字段注释）', en: 'decode with time hints' },
    },
    timestamp: {
      label: { zh: '时间戳', en: 'Timestamp' },
      encode: () => String(Math.floor(Date.now() / 1000)),
      decode: (s, _b, _o, _c, isZh) => {
        const n = Number(s.replace(/[^\d]/g, ''));
        if (!Number.isFinite(n) || n <= 0) throw new Error(isZh ? '无效的时间戳数值' : 'not a timestamp');
        const ms = n > 1e14 ? n / 1000 : n > 1e11 ? n : n * 1000;
        const d = new Date(ms);
        if (isNaN(d)) throw new Error(isZh ? '时间戳数值超出范围' : 'out of range');
        const p = (x, w = 2) => String(x).padStart(w, '0');
        return [
          `${isZh ? '本地时间 (local)' : 'local'}  ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
          `${isZh ? '协调时 (UTC)' : 'UTC'}    ${d.toISOString().slice(0, 19).replace('T', ' ')}`,
          `${isZh ? '国际标准 (ISO)' : 'ISO'}    ${d.toISOString()}`,
          `${isZh ? 'Unix 秒 / 毫秒' : 'unix'}   ${Math.floor(ms / 1000)} (s) / ${Math.floor(ms)} (ms)`,
        ].join('\n');
      },
      hint: { zh: '秒 / 毫秒 / 微秒 ↔ 本地时间 / UTC / ISO', en: 's / ms / µs → date' },
    },
  };
  const CODEC_ORDER = ['base64', 'url', 'hex', 'unicode', 'html', 'gzip', 'jwt', 'timestamp'];
  const PAYLOAD_TARGET = {
    'text/jwt': ['jwt', 'decode'],
    'text/base64': ['base64', 'decode'],
    'text/url': ['url', 'decode'],
    'text/timestamp': ['timestamp', 'decode'], // arriving WITH a value means convert it; "now" stays one click away
    'text/hex': ['hex', 'decode'],
    'text/unicode': ['unicode', 'decode'],
  };

  /* ---------- radix helpers (BigInt, custom alphabet beyond 36) ---------- */
  const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/';
  const bigToStr = (v, r) => {
    const neg = v < 0n;
    let n = neg ? -v : v;
    if (r <= 36) return (neg ? '-' : '') + n.toString(r);
    const B = BigInt(r);
    let out = '';
    while (n) { out = ALPHABET[Number(n % B)] + out; n /= B; }
    return (neg ? '-' : '') + (out || '0');
  };
  const strToBig = (s, r) => {
    s = s.trim().replace(/[\s:_]/g, '');
    if (!s) return undefined;
    const neg = s[0] === '-';
    if (neg) s = s.slice(1);
    const norm = r <= 36 ? s.toLowerCase() : s;
    let v = 0n;
    const B = BigInt(r);
    for (const ch of norm) {
      const d = ALPHABET.indexOf(ch);
      if (d < 0 || d >= r) return null; // invalid digit for this radix
      v = v * B + BigInt(d);
    }
    return neg ? -v : v;
  };

  /* ---------- history (per-scope, localStorage, Ctool-style caps) ---------- */
  const HKEY = 'cdc-history-v2';
  const readHist = () => { try { return JSON.parse(localStorage.getItem(HKEY) || '{}'); } catch { return {}; } };
  const writeHist = store => localStorage.setItem(HKEY, JSON.stringify(store));
  const pushHist = (scope, value) => {
    if (!value || !value.trim() || value.length > 200_000) return;
    const store = readHist();
    const list = (store[scope] || []).filter(e => e.v !== value);
    list.unshift({ v: value, t: Date.now() });
    store[scope] = list.slice(0, 50);
    writeHist(store);
  };

  const CATS = [
    { key: 'codec', labelKey: 'catCodec' },
    { key: 'radix', labelKey: 'catRadix' },
    { key: 'hash', labelKey: 'catHash' },
    { key: 'cipher', labelKey: 'catCipher' },
  ];

  const CodecLabDefs = { IMG_MAGIC, T, CODECS, CODEC_ORDER, PAYLOAD_TARGET, ALPHABET, HKEY, CATS,
    enc, dec, bytesToB64, b64ToBytes, bytesToHex, hexToBytes, sniffImageMime,
    bigToStr, strToBig, readHist, writeHist, pushHist };
  if (typeof window !== 'undefined') window.CodecLabDefs = CodecLabDefs;
  if (typeof module !== 'undefined' && module.exports) module.exports = CodecLabDefs;
})();
