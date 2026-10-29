// One-off generator: builds src/renderer/pinyin.js from mozillazg/pinyin-data
// (first reading per hanzi, tone-stripped, ü→v, CJK basic block only).
const fs = require('fs');
const path = require('path');
const raw = fs.readFileSync(process.argv[2], 'utf8');
const out = [];
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^U\+([0-9A-F]+):\s*([^\s#,]+)/);
  if (!m) continue;
  const cp = parseInt(m[1], 16);
  if (cp < 0x4e00 || cp > 0x9fa5) continue;
  let py = m[2].toLowerCase().replace(/ü/g, 'v');
  py = py.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!/^[a-z]+$/.test(py)) continue;
  out.push(String.fromCodePoint(cp) + py);
}
const data = out.join('');
const header = `/* Pinyin search index for the launcher-style searches (both action palettes,
   home deck, plugin center). Generated from mozillazg/pinyin-data (first
   reading per hanzi, tones stripped, ü→v, CJK basic block). Entries are
   "<hanzi><pinyin>" pairs concatenated — hanzi are all outside ASCII so the
   string splits unambiguously. Unknown chars fall back to themselves, so
   rare/missing hanzi still match by literal text. */
(() => {
  const DATA = "${data}";
  let map = null;
  function build() {
    map = new Map();
    const re = /([\\u4e00-\\u9fa5])([a-z]+)/g;
    let m;
    while ((m = re.exec(DATA)) !== null) map.set(m[1], m[2]);
  }
  const pyOf = ch => {
    if (!map) build();
    return map.get(ch) || null;
  };
  const isHanzi = ch => ch >= '\\u4e00' && ch <= '\\u9fa5';

  /* full pinyin with latin/digits kept (whitespace dropped so queries typed
     without spaces still substring-match): "截图 Pin" -> "jietupin" */
  function pyFull(s) {
    let outStr = '';
    for (const ch of String(s || '')) {
      if (isHanzi(ch)) outStr += pyOf(ch) || ch;
      else if (!/\\s/.test(ch)) outStr += ch;
    }
    return outStr.toLowerCase();
  }
  /* initials: hanzi -> first pinyin letter, latin/digits kept as-is */
  function pyInit(s) {
    let outStr = '';
    for (const ch of String(s || '')) {
      if (isHanzi(ch)) {
        const py = pyOf(ch);
        outStr += py ? py[0] : ch;
      } else if (/[a-z0-9]/i.test(ch)) outStr += ch;
    }
    return outStr.toLowerCase();
  }
  const keyCache = new Map();
  function keys(s) {
    const str = String(s || '');
    let v = keyCache.get(str);
    if (!v) {
      v = pyFull(str) + '\\n' + pyInit(str);
      if (keyCache.size > 2000) keyCache.clear();
      keyCache.set(str, v);
    }
    return v;
  }
  window.Pinyin = { pyFull, pyInit, keys };
})();
`;
fs.writeFileSync(path.join(__dirname, '..', 'src', 'renderer', 'pinyin.js'), header);
console.log('entries:', out.length, 'bytes:', Buffer.byteLength(header));
