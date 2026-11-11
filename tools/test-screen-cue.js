/* screen-cue pure-logic unit tests (no Electron needed):
   node tools/test-screen-cue.js */
const assert = require('assert');
const {
  DEFAULTS,
  INK_TOOLS,
  normalizeSettings,
  parseGdiLine,
  captureRegion,
  fpsForRegion,
  captureSig,
  sanitizeStroke,
} = require('../src/plugins/screen-cue/cue-core');

let checks = 0;
const ok = (cond, label, extra) => {
  checks++;
  if (!cond) throw new Error(`${label}${extra === undefined ? '' : ` => ${JSON.stringify(extra)}`}`);
};

/* --- normalizeSettings ----------------------------------------------------- */
{
  const d = normalizeSettings(null);
  ok(d.ink.tool === DEFAULTS.ink.tool, 'defaults on empty input');
  ok(d.ink.exitAction === 'keep', 'default exitAction keep');
  ok(d.lens.shape === 'circle', 'default lens shape circle');
  ok(d.lens.zoom === DEFAULTS.lens.zoom, 'default zoom');

  const c = normalizeSettings({
    ink: { tool: 'ellipse', color: '#FF4D4F', width: 999, exitAction: 'fade', fadeSeconds: 1 },
    lens: { shape: 'weird', circleD: 10, rectW: 99999, rectH: -5, zoom: 100 },
  });
  ok(c.ink.tool === 'ellipse', 'valid tool kept');
  ok(c.ink.color === '#ff4d4f', 'color lowercased');
  ok(c.ink.width === 40, 'width clamped to 40', c.ink.width);
  ok(c.ink.exitAction === 'fade', 'valid exitAction kept');
  ok(c.ink.fadeSeconds === 2, 'fadeSeconds clamped to 2', c.ink.fadeSeconds);
  ok(c.lens.shape === 'circle', 'invalid shape falls back');
  ok(c.lens.circleD === 120, 'circleD clamped to 120', c.lens.circleD);
  ok(c.lens.rectW === 1400, 'rectW clamped to 1400', c.lens.rectW);
  ok(c.lens.rectH === 80, 'rectH clamped to 80', c.lens.rectH);
  ok(c.lens.zoom === 8, 'zoom clamped to 8', c.lens.zoom);

  const garbage = normalizeSettings('nonsense');
  ok(garbage.ink.tool === DEFAULTS.ink.tool, 'garbage input falls back to defaults');
}

/* --- parseGdiLine ---------------------------------------------------------- */
{
  const m = parseGdiLine('1918,1040,1798,900,/9j/4AAQSkZJRgABAQ==');
  ok(m && m.cursor.x === 1918 && m.cursor.y === 1040, 'cursor parsed');
  ok(m.origin.x === 1798 && m.origin.y === 900, 'origin parsed');
  ok(m.b64 === '/9j/4AAQSkZJRgABAQ==', 'base64 payload kept');

  const neg = parseGdiLine('-1920,100,-1920,50,AAAA');
  ok(neg && neg.cursor.x === -1920 && neg.origin.x === -1920, 'negative coords parsed');

  for (const bad of ['', 'hello', '1,2,3,4', '1,2,3,4,not!base64', null, '1,2,3,4,']) {
    ok(parseGdiLine(bad) === null, `invalid line rejected: ${JSON.stringify(bad)}`);
  }
}

/* --- captureRegion --------------------------------------------------------- */
{
  // circle 280px @3x zoom on a 1.0-scale display → 94px source (280/3)
  const r = captureRegion({ shape: 'circle', circleD: 280, rectW: 360, rectH: 260, zoom: 3 }, 1920, 1080, 1);
  ok(r.w === 93 && r.h === 93, 'circle region = round(d/zoom)', r);

  const rr = captureRegion({ shape: 'rect', circleD: 280, rectW: 360, rectH: 260, zoom: 2 }, 1920, 1080, 1);
  ok(rr.w === 180 && rr.h === 130, 'rect region = w/zoom × h/zoom', rr);

  // fullscreen @2x on 1920×1080 → 960×540
  const fs1 = captureRegion({ shape: 'fullscreen', zoom: 2 }, 1920, 1080, 1);
  ok(fs1.w === 960 && fs1.h === 540, 'fullscreen region = screen/zoom', fs1);

  // scale factor multiplies physical size
  const fs15 = captureRegion({ shape: 'fullscreen', zoom: 2 }, 1920, 1080, 1.5);
  ok(fs15.w === 1440 && fs15.h === 810, 'scaleFactor scales capture', fs15);

  // cap: 3840×2160 @1.5x zoom would want 2560×1440 → capped at 1600 wide
  const capped = captureRegion({ shape: 'fullscreen', zoom: 1.5 }, 3840, 2160, 1);
  ok(capped.w === 1600, 'capture width capped at 1600', capped);

  // tiny lens at min zoom never collapses below 64px
  const tiny = captureRegion({ shape: 'circle', circleD: 120, zoom: 8 }, 1920, 1080, 1);
  ok(tiny.w === 64 && tiny.h === 64, 'capture floor 64px', tiny);
}

/* --- fpsForRegion ---------------------------------------------------------- */
{
  ok(fpsForRegion(280, 280) === 24, 'small region → 24fps');
  ok(fpsForRegion(960, 540) === 24, 'hd-ish region → 24fps');
  ok(fpsForRegion(900, 700) === 16, 'over 0.6MP → 16fps');
  ok(fpsForRegion(1400, 900) === 12, 'over 1.2MP → 12fps');
}

/* --- captureSig ------------------------------------------------------------ */
{
  const a = normalizeSettings(null);
  const b = normalizeSettings({ lens: { zoom: a.lens.zoom } });
  ok(captureSig(a.lens) === captureSig(b.lens), 'same lens → same sig');
  const c = normalizeSettings({ lens: { zoom: 4 } });
  ok(captureSig(a.lens) !== captureSig(c.lens), 'zoom change → different sig');
  const d = normalizeSettings({ ink: { width: 20 } });
  ok(captureSig(a.lens) === captureSig(d.lens), 'ink changes do not touch the sig');
}

/* --- sanitizeStroke -------------------------------------------------------- */
{
  const now = 1700000000000;
  const pen = sanitizeStroke({
    tool: 'pen', color: '#FFAB2E', width: 99,
    pts: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }],
  }, now);
  ok(pen && pen.tool === 'pen', 'pen accepted');
  ok(pen.color === '#ffab2e', 'stroke color normalized');
  ok(pen.width === 40, 'stroke width clamped');
  ok(pen.pts.length === 3 && pen.pts[0].x === 1, 'pts preserved');
  ok(typeof pen.id === 'string' && pen.id.length >= 6, 'id assigned');
  ok(pen.born === now, 'born timestamp kept');

  const rect = sanitizeStroke({ tool: 'rect', color: '#40a9ff', width: 4, a: { x: -10.5, y: 0 }, b: { x: 100, y: 50 } }, now);
  ok(rect && rect.a.x === -10.5 && rect.b.x === 100, 'shape stroke accepted with negative coords');

  ok(sanitizeStroke(null, now) === null, 'null rejected');
  ok(sanitizeStroke({ tool: 'bomb', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }, now) === null, 'unknown tool rejected');
  ok(sanitizeStroke({ tool: 'pen', pts: [{ x: 0, y: 0 }] }, now) === null, 'single-point path rejected');
  ok(sanitizeStroke({ tool: 'pen', pts: [{ x: 'a', y: 0 }, { x: 1, y: 1 }] }, now) === null, 'non-finite coord rejected');
  ok(sanitizeStroke({ tool: 'arrow', a: { x: 0, y: 0 } }, now) === null, 'shape missing endpoint rejected');

  // bad color falls back to default, stroke still usable
  const noCol = sanitizeStroke({ tool: 'arrow', color: 'rainbow', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }, now);
  ok(noCol && noCol.color === DEFAULTS.ink.color, 'bad color falls back to default');

  // path cap: 30000 points truncated to 20000
  const long = [];
  for (let i = 0; i < 30000; i++) long.push({ x: i % 100, y: i % 80 });
  const cappedStroke = sanitizeStroke({ tool: 'pen', pts: long }, now);
  ok(cappedStroke && cappedStroke.pts.length === 20000, 'path capped at 20000 points');

  // INK_TOOLS stays the toolbar contract
  ok(INK_TOOLS.join(',') === 'pen,highlighter,rect,ellipse,arrow', 'tool list stable');
}

/* --- persisted visibility flags + renderer behavior ----------------------- */
{
  const defaults = normalizeSettings({});
  ok(defaults.ink.freezeScreen === false, 'live annotation is the default');
  ok(defaults.lens.showCrosshair && defaults.lens.showZoomBadge, 'legacy settings keep lens indicators');
  const disabled = normalizeSettings({ ink: { freezeScreen: true }, lens: { showCrosshair: false, showZoomBadge: false } });
  ok(disabled.ink.freezeScreen, 'explicit freeze is persisted');
  ok(!disabled.lens.showCrosshair && !disabled.lens.showZoomBadge, 'explicit false is preserved');
  const invalid = normalizeSettings({ ink: { freezeScreen: 'true' }, lens: { showCrosshair: 'false', showZoomBadge: 0 } });
  ok(!invalid.ink.freezeScreen && invalid.lens.showCrosshair && invalid.lens.showZoomBadge, 'invalid boolean types use defaults');
  ok(captureSig(disabled.lens) === captureSig(defaults.lens), 'display flags do not restart capture');

  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const handlers = {};
  let paint = null;
  let crossLines = 0;
  let labels = 0;
  const context = new Proxy({}, { get: (_target, key) => {
    if (key === 'lineTo') return () => { crossLines++; };
    if (key === 'fillText') return () => { labels++; };
    if (key === 'measureText') return () => ({ width: 25 });
    return () => {};
  } });
  const canvas = { width: 800, height: 600, getContext: () => context };
  const cue = { ready() {}, displayed() {} };
  for (const name of ['Init', 'LensSettings', 'Cursor', 'Frame']) cue[`on${name}`] = fn => { handlers[name] = fn; };
  const sandbox = {
    window: { cue, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1 },
    document: { getElementById: () => canvas },
    requestAnimationFrame: fn => { paint = fn; return 1; },
    Image: class {
      constructor() { this.complete = true; this.naturalWidth = 100; this.naturalHeight = 100; }
      set src(_value) { this.onload(); }
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/plugins/screen-cue/mag.js'), 'utf8'), sandbox);
  handlers.Init({ origin: { x: 0, y: 0 }, lens: defaults.lens });
  handlers.Cursor({ x: 300, y: 200 });
  handlers.Frame({ jpeg: 'data:image/jpeg;base64,AAAA', ox: 250, oy: 150, scale: 1 });
  function rendered(crosshair, badge) {
    crossLines = 0; labels = 0;
    handlers.LensSettings({ showCrosshair: crosshair, showZoomBadge: badge });
    paint();
    ok(crossLines === (crosshair ? 4 : 0), `crosshair drawing ${crosshair ? 'on' : 'off'}`);
    ok(labels === (badge ? 1 : 0), `zoom text drawing ${badge ? 'on' : 'off'}`);
  }
  rendered(true, true);
  rendered(false, false);
  rendered(true, false);
  rendered(false, true);
}

console.log(`SCREEN CUE PASS (${checks} checks)`);
