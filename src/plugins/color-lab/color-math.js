/* Color math shared by three worlds: the panel (host renderer), the screen
   picker overlay and backend.js (main process). UMD so main can require() it
   while windows load it with a plain <script> tag.
   Canonical color = { r, g, b, a } with every channel 0-255 (alpha included,
   per the "RGBA 0-255" requirement). Everything else is derived on demand. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ColorMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const clamp255 = n => clamp(Math.round(Number(n) || 0), 0, 255);
  const round2 = n => Math.round(n * 100) / 100;
  const hex2 = n => clamp255(n).toString(16).padStart(2, '0').toUpperCase();

  const NAMED = {
    transparent: { r: 0, g: 0, b: 0, a: 0 },
    black: '#000000', silver: '#C0C0C0', gray: '#808080', grey: '#808080',
    white: '#FFFFFF', maroon: '#800000', red: '#FF0000', purple: '#800080',
    fuchsia: '#FF00FF', magenta: '#FF00FF', green: '#008000', lime: '#00FF00',
    olive: '#808000', yellow: '#FFFF00', navy: '#000080', blue: '#0000FF',
    teal: '#008080', aqua: '#00FFFF', cyan: '#00FFFF', orange: '#FFA500',
    pink: '#FFC0CB', brown: '#A52A2A', gold: '#FFD700', indigo: '#4B0082',
    violet: '#EE82EE', tomato: '#FF6347', coral: '#FF7F50', salmon: '#FA8072',
    khaki: '#F0E68C', crimson: '#DC143C', turquoise: '#40E0D0', orchid: '#DA70D6',
    darkgray: '#A9A9A9', darkgrey: '#A9A9A9', lightgray: '#D3D3D3', lightgrey: '#D3D3D3',
    darkblue: '#00008B', darkgreen: '#006400', darkred: '#8B0000', skyblue: '#87CEEB',
  };

  function normalize(input) {
    if (!input || typeof input !== 'object') return null;
    const r = Number(input.r), g = Number(input.g), b = Number(input.b);
    if (![r, g, b].every(Number.isFinite)) return null;
    const a = input.a === undefined || input.a === null ? 255 : Number(input.a);
    if (!Number.isFinite(a)) return null;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a: clamp255(a) };
  }

  /* --- parsers -------------------------------------------------------------- */

  function parseHex(raw) {
    let h = String(raw || '').trim().replace(/^#/, '');
    if (!/^[0-9a-f]+$/i.test(h)) return null;
    if (h.length === 3 || h.length === 4) {
      h = h.split('').map(c => c + c).join('');
    }
    if (h.length === 6) {
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 255 };
    }
    if (h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16), a: parseInt(h.slice(6, 8), 16),
      };
    }
    return null;
  }

  // rgb()/hsl() bodies: comma syntax, and CSS4 "255 136 0 / 50%".
  function splitArgs(body) {
    let alpha = null;
    let main = String(body || '').trim();
    const slash = main.split('/');
    if (slash.length === 2) { alpha = slash[1].trim(); main = slash[0].trim(); }
    let parts = main.includes(',') ? main.split(',') : main.split(/\s+/);
    parts = parts.map(p => p.trim()).filter(Boolean);
    if (alpha !== null) parts.push(alpha);
    return parts;
  }

  const parseAlpha = v => {
    if (v === undefined || v === null || v === '') return 255;
    const s = String(v).trim();
    const pct = s.endsWith('%');
    const n = parseFloat(pct ? s.slice(0, -1) : s);
    if (!Number.isFinite(n)) return null;
    if (pct) return clamp255(n / 100 * 255);
    if (n <= 1) return clamp255(n * 255);
    return clamp255(n);
  };

  const parseChannel = (v, max) => {
    if (v === undefined || v === null || v === '') return null;
    const s = String(v).trim();
    const pct = s.endsWith('%');
    const n = parseFloat(pct ? s.slice(0, -1) : s);
    if (!Number.isFinite(n)) return null;
    return clamp255(pct ? n / 100 * max : n);
  };

  const parseHue = v => {
    const s = String(v || '').trim().toLowerCase();
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return null;
    let deg = n;
    if (s.endsWith('turn')) deg = n * 360;
    else if (s.endsWith('rad')) deg = n * 180 / Math.PI;
    else if (s.endsWith('grad')) deg = n * 0.9;
    return ((deg % 360) + 360) % 360;
  };

  const parsePercent = v => {
    const n = parseFloat(String(v || '').replace('%', ''));
    return Number.isFinite(n) ? clamp(n, 0, 100) : null;
  };

  function parse(input) {
    if (!input) return null;
    if (typeof input === 'object') return normalize(input);
    let s = String(input).trim();
    if (!s || s.length > 120) return null;
    const lower = s.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(NAMED, lower)) {
      const n = NAMED[lower];
      return typeof n === 'string' ? parseHex(n) : { ...n };
    }
    if (s[0] === '#') return parseHex(s);
    if (/^0x/i.test(s)) {
      const h = s.slice(2);
      if (/^[0-9a-f]{6}$/i.test(h)) return parseHex(h);
      // Android/ARGB convention for 8 digits
      if (/^[0-9a-f]{8}$/i.test(h)) {
        return { ...parseHex(h.slice(2)), a: parseInt(h.slice(0, 2), 16) };
      }
      return null;
    }

    const fn = s.match(/^([a-z]+)\s*\(([^()]*)\)$/i);
    if (fn) {
      const name = fn[1].toLowerCase();
      const parts = splitArgs(fn[2]);
      if (name === 'rgb' || name === 'rgba') {
        if (parts.length < 3) return null;
        const r = parseChannel(parts[0], 255), g = parseChannel(parts[1], 255), b = parseChannel(parts[2], 255);
        const a = parts.length > 3 ? parseAlpha(parts[3]) : 255;
        if (r === null || g === null || b === null || a === null) return null;
        return { r, g, b, a };
      }
      if (name === 'hsl' || name === 'hsla') {
        if (parts.length < 3) return null;
        const h = parseHue(parts[0]), sat = parsePercent(parts[1]), light = parsePercent(parts[2]);
        const a = parts.length > 3 ? parseAlpha(parts[3]) : 255;
        if (h === null || sat === null || light === null || a === null) return null;
        return { ...hslToRgb(h, sat, light), a };
      }
      if (name === 'hsv' || name === 'hsb' || name === 'hsva' || name === 'hsba') {
        if (parts.length < 3) return null;
        const h = parseHue(parts[0]), sat = parsePercent(parts[1]), val = parsePercent(parts[2]);
        const a = parts.length > 3 ? parseAlpha(parts[3]) : 255;
        if (h === null || sat === null || val === null || a === null) return null;
        return { ...hsvToRgb(h, sat, val), a };
      }
      return null;
    }

    // bare "255, 136, 0" / "255 136 0 128" — RGBA 0-255 shorthand
    const bare = splitArgs(s);
    if (bare.length === 3 || bare.length === 4) {
      const nums = bare.map(v => parseFloat(v));
      if (nums.every(Number.isFinite) && nums.slice(0, 3).every(n => n >= 0 && n <= 255)) {
        const a = bare.length === 4 ? clamp255(nums[3]) : 255;
        return { r: clamp255(nums[0]), g: clamp255(nums[1]), b: clamp255(nums[2]), a };
      }
    }
    return null;
  }

  /* --- conversions ---------------------------------------------------------- */

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d > 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: max > 0 ? (d / max) * 100 : 0, v: max * 100 };
  }

  function hsvToRgb(h, s, v) {
    const hh = ((h % 360) + 360) % 360 / 60;
    const ss = clamp(s, 0, 100) / 100;
    const vv = clamp(v, 0, 100) / 100;
    const c = vv * ss;
    const x = c * (1 - Math.abs((hh % 2) - 1));
    const m = vv - c;
    let r = 0, g = 0, b = 0;
    if (hh < 1) { r = c; g = x; }
    else if (hh < 2) { r = x; g = c; }
    else if (hh < 3) { g = c; b = x; }
    else if (hh < 4) { g = x; b = c; }
    else if (hh < 5) { r = x; b = c; }
    else { r = c; b = x; }
    return { r: clamp255((r + m) * 255), g: clamp255((g + m) * 255), b: clamp255((b + m) * 255) };
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (d > 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: s * 100, l: l * 100 };
  }

  function hslToRgb(h, s, l) {
    const hh = ((h % 360) + 360) % 360 / 60;
    const ss = clamp(s, 0, 100) / 100;
    const ll = clamp(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * ll - 1)) * ss;
    const x = c * (1 - Math.abs((hh % 2) - 1));
    const m = ll - c / 2;
    let r = 0, g = 0, b = 0;
    if (hh < 1) { r = c; g = x; }
    else if (hh < 2) { r = x; g = c; }
    else if (hh < 3) { g = c; b = x; }
    else if (hh < 4) { g = x; b = c; }
    else if (hh < 5) { r = x; b = c; }
    else { r = c; b = x; }
    return { r: clamp255((r + m) * 255), g: clamp255((g + m) * 255), b: clamp255((b + m) * 255) };
  }

  /* --- formatting ----------------------------------------------------------- */

  const alpha01 = a => String(round2(a / 255));

  function hex(c, withAlpha = false) {
    const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
    return withAlpha ? `${base}${hex2(c.a)}` : base;
  }

  function format(c, key) {
    const col = normalize(c);
    if (!col) return '';
    const { r, g, b, a } = col;
    switch (key) {
      case 'hex': return hex(col);
      case 'hex8': return hex(col, true);
      case 'rgb': return `rgb(${r}, ${g}, ${b})`;
      case 'rgba': return `rgba(${r}, ${g}, ${b}, ${alpha01(a)})`;
      case 'hsl': {
        const x = rgbToHsl(r, g, b);
        return `hsl(${Math.round(x.h)}, ${Math.round(x.s)}%, ${Math.round(x.l)}%)`;
      }
      case 'hsla': {
        const x = rgbToHsl(r, g, b);
        return `hsla(${Math.round(x.h)}, ${Math.round(x.s)}%, ${Math.round(x.l)}%, ${alpha01(a)})`;
      }
      case 'hsv': {
        const x = rgbToHsv(r, g, b);
        return `hsv(${Math.round(x.h)}, ${Math.round(x.s)}%, ${Math.round(x.v)}%)`;
      }
      case 'argb': return `#${hex2(a)}${hex2(r)}${hex2(g)}${hex2(b)}`;
      case 'int': return `0x${hex2(r)}${hex2(g)}${hex2(b)}`;
      case 'channels': return `${r}, ${g}, ${b}, ${a}`;
      case 'cssvar': return `--color: ${hex(col)};`;
      default: return hex(col);
    }
  }

  const FORMATS = [
    { key: 'hex', label: 'HEX' },
    { key: 'hex8', label: 'HEX8' },
    { key: 'rgb', label: 'RGB' },
    { key: 'rgba', label: 'RGBA' },
    { key: 'hsl', label: 'HSL' },
    { key: 'hsla', label: 'HSLA' },
    { key: 'hsv', label: 'HSV / HSB' },
    { key: 'argb', label: 'ARGB' },
    { key: 'int', label: '0x' },
    { key: 'channels', label: 'RGBA 0-255' },
  ];

  const COPY_FORMATS = ['hex', 'hex8', 'rgb', 'rgba', 'hsl'];

  function luminance(c) {
    const f = v => {
      const n = clamp255(v) / 255;
      return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  // readable ink for a label sitting on top of the color
  function contrastInk(c) {
    return luminance(c) > 0.42 ? '#101413' : '#FFFFFF';
  }

  return {
    clamp, clamp255, normalize, parse,
    rgbToHsv, hsvToRgb, rgbToHsl, hslToRgb,
    hex, format, FORMATS, COPY_FORMATS, luminance, contrastInk, alpha01,
  };
});
