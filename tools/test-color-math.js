/* Color math + color capability unit tests (no Electron needed):
   node tools/test-color-math.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CM = require('../src/plugins/color-lab/color-math');

let checks = 0;
const ok = (cond, label, extra) => {
  checks++;
  if (!cond) throw new Error(`${label}${extra === undefined ? '' : ` => ${JSON.stringify(extra)}`}`);
};
const eqColor = (a, b, label) => {
  ok(a && a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a, label, a);
};

/* --- parsing --------------------------------------------------------------- */
eqColor(CM.parse('#FFAB2E'), { r: 255, g: 171, b: 46, a: 255 }, 'hex6');
eqColor(CM.parse('#fab'), { r: 255, g: 170, b: 187, a: 255 }, 'hex3');
eqColor(CM.parse('#FAB8'), { r: 255, g: 170, b: 187, a: 136 }, 'hex4');
eqColor(CM.parse('#FFAB2E80'), { r: 255, g: 171, b: 46, a: 128 }, 'hex8');
eqColor(CM.parse('0xFFAB2E'), { r: 255, g: 171, b: 46, a: 255 }, '0x RRGGBB');
eqColor(CM.parse('0x80FFAB2E'), { r: 255, g: 171, b: 46, a: 128 }, '0x AARRGGBB');
eqColor(CM.parse('rgba(255, 171, 46, 0.5)'), { r: 255, g: 171, b: 46, a: 128 }, 'rgba comma');
eqColor(CM.parse('rgba(255 171 46 / 50%)'), { r: 255, g: 171, b: 46, a: 128 }, 'rgba css4');
eqColor(CM.parse('rgb(100%, 50%, 0%)'), { r: 255, g: 128, b: 0, a: 255 }, 'rgb percent');
eqColor(CM.parse('hsl(0, 100%, 50%)'), { r: 255, g: 0, b: 0, a: 255 }, 'hsl red');
eqColor(CM.parse('hsl(120 100% 25%)'), { r: 0, g: 128, b: 0, a: 255 }, 'hsl css4 green');
eqColor(CM.parse('hsv(120, 100%, 100%)'), { r: 0, g: 255, b: 0, a: 255 }, 'hsv green');
eqColor(CM.parse('255, 171, 46, 128'), { r: 255, g: 171, b: 46, a: 128 }, 'bare rgba 0-255');
eqColor(CM.parse('red'), { r: 255, g: 0, b: 0, a: 255 }, 'named red');
eqColor(CM.parse('transparent'), { r: 0, g: 0, b: 0, a: 0 }, 'named transparent');
eqColor(CM.parse({ r: 1, g: 2, b: 3 }), { r: 1, g: 2, b: 3, a: 255 }, 'object input');

for (const bad of ['#12', '#GGGGGG', 'rgb(1,2)', 'hello', '999, 0, 0', '', '2026-10-29']) {
  ok(CM.parse(bad) === null, `invalid input rejected: ${JSON.stringify(bad)}`, CM.parse(bad));
}

/* --- formatting ------------------------------------------------------------ */
const c = { r: 255, g: 171, b: 46, a: 255 };
ok(CM.format(c, 'hex') === '#FFAB2E', 'format hex', CM.format(c, 'hex'));
ok(CM.format(c, 'hex8') === '#FFAB2EFF', 'format hex8', CM.format(c, 'hex8'));
ok(CM.format(c, 'rgb') === 'rgb(255, 171, 46)', 'format rgb', CM.format(c, 'rgb'));
ok(CM.format(c, 'rgba') === 'rgba(255, 171, 46, 1)', 'format rgba', CM.format(c, 'rgba'));
ok(CM.format(c, 'hsl') === 'hsl(36, 100%, 59%)', 'format hsl', CM.format(c, 'hsl'));
ok(CM.format(c, 'hsv') === 'hsv(36, 82%, 100%)', 'format hsv', CM.format(c, 'hsv'));
ok(CM.format(c, 'argb') === '#FFFFAB2E', 'format argb', CM.format(c, 'argb'));
ok(CM.format(c, 'int') === '0xFFAB2E', 'format int', CM.format(c, 'int'));
ok(CM.format(c, 'channels') === '255, 171, 46, 255', 'format channels', CM.format(c, 'channels'));
ok(CM.format({ r: 255, g: 171, b: 46, a: 128 }, 'rgba') === 'rgba(255, 171, 46, 0.5)', 'format rgba alpha');

/* --- round-trips ----------------------------------------------------------- */
const SAMPLES = [
  { r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, { r: 255, g: 0, b: 0 },
  { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 }, { r: 12, g: 34, b: 56 },
  { r: 200, g: 31, b: 144 }, { r: 250, g: 240, b: 3 }, { r: 88, g: 86, b: 214 },
];
for (const s of SAMPLES) {
  const hsl = CM.rgbToHsl(s.r, s.g, s.b);
  const back = CM.hslToRgb(hsl.h, hsl.s, hsl.l);
  ok(Math.abs(back.r - s.r) <= 1 && Math.abs(back.g - s.g) <= 1 && Math.abs(back.b - s.b) <= 1,
    `hsl round-trip ${JSON.stringify(s)}`, { hsl, back });
  const hsv = CM.rgbToHsv(s.r, s.g, s.b);
  const back2 = CM.hsvToRgb(hsv.h, hsv.s, hsv.v);
  ok(Math.abs(back2.r - s.r) <= 1 && Math.abs(back2.g - s.g) <= 1 && Math.abs(back2.b - s.b) <= 1,
    `hsv round-trip ${JSON.stringify(s)}`, { hsv, back: back2 });
}

/* --- contrast ink ---------------------------------------------------------- */
ok(CM.contrastInk({ r: 255, g: 255, b: 255, a: 255 }) === '#101413', 'white gets dark ink');
ok(CM.contrastInk({ r: 0, g: 0, b: 0, a: 255 }) === '#FFFFFF', 'black gets light ink');

/* --- color detector -------------------------------------------------------- */
const { DETECTORS } = require('../src/core/capabilities');
const det = DETECTORS['color/css'];
for (const good of ['#FFAB2E', '#fab', '#FFAB2E80', 'rgba(0, 128, 255, 0.5)', 'hsl(0, 100%, 50%)', '0xFFAB2E']) {
  ok(det.test(good), `detector accepts ${good}`);
}
for (const bad of ['2026-10-29', '1710000000', '#12', 'hello', 'rgb(1,2)']) {
  ok(!det.test(bad), `detector rejects ${bad}`);
}
// 8-digit 0x values stay hex byte strings (0xdeadbeef is far more likely data)
ok(!det.test('0xdeadbeef'), 'detector leaves 8-digit 0x to text/hex');
const resolved = det.resolve('rgba(0, 128, 255, 0.5)');
ok(resolved && resolved.type === 'color/css' && resolved.payload.color === '#0080FF', 'detector resolve payload', resolved);
ok(resolved.copyValue === '#0080FF', 'detector copyValue is hex');

/* --- palette payload classification (renderer script) ---------------------- */
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'payload-type.js'), 'utf8'), sandbox);
const PT = sandbox.window.PayloadType;
ok(PT && PT.detect('#FFAB2E').type === 'color/css', 'palette detects #FFAB2E');
ok(PT.detect('rgba(0, 128, 255, 0.5)').type === 'color/css', 'palette detects rgba');
ok(PT.detect('0xFFAB2E').type === 'color/css', 'palette detects 0x color before hex');
ok(PT.detect('deadbeefdeadbeef').type === 'text/hex', 'palette still detects hex bytes');
ok(PT.detect('0xdeadbeef').type === 'text/hex', 'palette leaves 8-digit 0x to hex');

console.log(`COLOR MATH PASS (${checks} checks)`);
