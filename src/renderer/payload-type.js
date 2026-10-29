/* Shared structured-payload detection for BOTH action palettes (the in-window
   Ctrl+K palette and the standalone floating palette).

   Regex-only mirror of core/capabilities.js DETECTORS — no decoding happens
   here, we only classify and label. Keep the two files in sync when adding a
   type; until now each palette carried its own drifted copy (both missing
   text/base64, which Smart Peek on the home view DID detect). */
(() => {
  const TESTS = [
    {
      // arithmetic-only charset (digits + operators): letters/braces/URLs
      // never match, so math is the most specific probe and runs first.
      // Mirrors the math/expression detector in core/capabilities.js —
      // keep the guards (date/phone/version shapes) in sync with it.
      type: 'math/expression', labelZh: '算式求值', labelEn: 'Math',
      test: () => true,
      gate: t => {
        if (t.length < 3 || t.length > 200) return false;
        if (!/^[\d\s+\-*/().%^,×÷−]+$/.test(t)) return false;
        if (!/[+\-*/%^×÷−]/.test(t)) return false;
        if (t.replace(/[^\d]/g, '').length < 2) return false;
        const compact = t.replace(/\s/g, '');
        if (/^\d{1,4}[-/.]\d{1,4}([-/.]\d{1,4})?$/.test(compact)) return false;
        if (/^\d{2,4}(-\d{2,4}){2,}$/.test(compact)) return false;
        return true;
      },
    },
    {
      type: 'application/json', labelZh: 'JSON 数据', labelEn: 'JSON',
      test: t => { try { JSON.parse(t); return true; } catch { return false; } },
      gate: t => /^\s*[\{\[]/.test(t),
    },
    {
      type: 'text/timestamp', labelZh: 'Unix 时间戳', labelEn: 'Timestamp',
      test: () => true,
      gate: t => /^\d{10}(\d{3})?$/.test(t),
    },
    {
      type: 'text/jwt', labelZh: 'JWT 令牌', labelEn: 'JWT',
      test: () => true,
      gate: t => /^ey[A-Za-z0-9_-]+\.ey/.test(t),
    },
    {
      type: 'text/unicode', labelZh: 'Unicode 转义', labelEn: 'Unicode',
      test: () => true,
      gate: t => /^(\\u(\{[0-9a-fA-F]{1,6}\}|[0-9a-fA-F]{4})|&#x[0-9a-fA-F]+;)/.test(t),
    },
    {
      // hex wins over base64: an even-length a-f0-9 string is valid base64
      // charset too, but reads as hex when it carries hex letters
      type: 'text/hex', labelZh: 'Hex 十六进制', labelEn: 'Hex',
      test: t => {
        const bare = t.replace(/0x/gi, '').replace(/[\s,:;-]+/g, '');
        return bare.length >= 8 && bare.length % 2 === 0 && /^[0-9a-f]+$/i.test(bare) && /[a-f]/i.test(bare);
      },
      gate: t => /^0x[0-9a-f]/i.test(t) || (() => {
        const bare = t.replace(/0x/gi, '').replace(/[\s,:;-]+/g, '');
        return bare.length >= 8 && bare.length % 2 === 0 && /^[0-9a-f]+$/i.test(bare) && /[a-f]/i.test(bare);
      })(),
    },
    {
      type: 'text/base64', labelZh: 'Base64 编码', labelEn: 'Base64',
      test: () => true,
      gate: t => {
        if (t.length < 8 || t.length % 4 !== 0) return false;
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(t)) return false;
        // short pure-alpha strings read as words, not encodings
        if (/^[a-zA-Z]+$/.test(t) && t.length < 16) return false;
        return true;
      },
    },
    {
      type: 'text/url', labelZh: 'URL 网址', labelEn: 'URL',
      test: () => true,
      gate: t => /^https?:\/\//i.test(t),
    },
  ];

  const PLAIN = { type: 'text/plain', labelZh: '文本内容', labelEn: 'Text' };

  function detect(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const text = raw.trim();
    if (!text) return null;
    for (const d of TESTS) {
      if (!d.gate(text)) continue;
      if (d.test(text)) return { type: d.type, labelZh: d.labelZh, labelEn: d.labelEn };
    }
    return { ...PLAIN };
  }

  window.PayloadType = { detect };
})();
