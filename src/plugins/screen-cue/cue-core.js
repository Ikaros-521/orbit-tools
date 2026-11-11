/* screen-cue pure logic — shared by backend.js and tools/test-screen-cue.js.
   No electron imports here so the suite stays runnable under plain node. */

const DEFAULTS = Object.freeze({
  ink: { tool: 'pen', color: '#ffb400', width: 4, exitAction: 'keep', fadeSeconds: 8, freezeScreen: false },
  lens: { shape: 'circle', circleD: 280, rectW: 360, rectH: 260, zoom: 3, showCrosshair: true, showZoomBadge: true },
});

const INK_TOOLS = ['pen', 'highlighter', 'rect', 'ellipse', 'arrow'];
const EXIT_ACTIONS = ['keep', 'fade', 'clear'];
const LENS_SHAPES = ['circle', 'rect', 'fullscreen'];

function clampNum(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

/* Anything stored or patched passes through here — renderer input is
   untrusted, and a corrupt plugin-data file must never break the plugin. */
function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const i = s.ink || {};
  const l = s.lens || {};
  return {
    ink: {
      tool: INK_TOOLS.includes(i.tool) ? i.tool : DEFAULTS.ink.tool,
      color: /^#[0-9a-fA-F]{6}$/.test(String(i.color || '')) ? String(i.color).toLowerCase() : DEFAULTS.ink.color,
      width: Math.round(clampNum(i.width, 1, 40, DEFAULTS.ink.width)),
      exitAction: EXIT_ACTIONS.includes(i.exitAction) ? i.exitAction : 'keep',
      fadeSeconds: Math.round(clampNum(i.fadeSeconds, 2, 120, DEFAULTS.ink.fadeSeconds)),
      freezeScreen: i.freezeScreen === true,
    },
    lens: {
      shape: LENS_SHAPES.includes(l.shape) ? l.shape : 'circle',
      circleD: Math.round(clampNum(l.circleD, 120, 1000, DEFAULTS.lens.circleD)),
      rectW: Math.round(clampNum(l.rectW, 120, 1400, DEFAULTS.lens.rectW)),
      rectH: Math.round(clampNum(l.rectH, 80, 1000, DEFAULTS.lens.rectH)),
      zoom: clampNum(l.zoom, 1.5, 8, DEFAULTS.lens.zoom),
      showCrosshair: typeof l.showCrosshair === 'boolean' ? l.showCrosshair : DEFAULTS.lens.showCrosshair,
      showZoomBadge: typeof l.showZoomBadge === 'boolean' ? l.showZoomBadge : DEFAULTS.lens.showZoomBadge,
    },
  };
}

/* "cursorX,cursorY,originX,originY,base64" — the same line protocol as
   color-lab's gdi-cap.ps1, except the payload is a JPEG body. */
function parseGdiLine(raw) {
  const m = /^(-?\d+),(-?\d+),(-?\d+),(-?\d+),([A-Za-z0-9+/=]+)$/.exec(String(raw || '').trim());
  if (!m) return null;
  return {
    cursor: { x: Number(m[1]), y: Number(m[2]) },
    origin: { x: Number(m[3]), y: Number(m[4]) },
    b64: m[5],
  };
}

/* Physical capture size handed to the GDI helper. The lens renders at the
   resulting *effective* zoom, so the cap below only means "max zoom depends
   on screen size", never a broken picture. */
const CAP_MAX_W = 1600;
const CAP_MAX_H = 1200;

function captureRegion(lens, dispW, dispH, scaleFactor) {
  let dipW;
  let dipH;
  if (lens.shape === 'fullscreen') { dipW = dispW / lens.zoom; dipH = dispH / lens.zoom; }
  else if (lens.shape === 'rect') { dipW = lens.rectW / lens.zoom; dipH = lens.rectH / lens.zoom; }
  else { dipW = lens.circleD / lens.zoom; dipH = lens.circleD / lens.zoom; }
  const k = Math.min(1, CAP_MAX_W / dipW, CAP_MAX_H / dipH);
  const px = v => Math.max(64, Math.round(v * k * scaleFactor));
  return { w: px(dipW), h: px(dipH) };
}

/* Frame budget: bigger regions get fewer fps so the PowerShell JPEG encode
   stays inside the sleep interval. */
function fpsForRegion(w, h) {
  const area = w * h;
  if (area > 1200 * 1000) return 12;
  if (area > 600 * 1000) return 16;
  return 24;
}

/* Which settings the helper's capture geometry depends on — a change while
   the magnifier is engaged requires a respawn. */
function captureSig(lens) {
  return [lens.shape, lens.circleD, lens.rectW, lens.rectH, lens.zoom].join('|');
}

/* Validate + clamp a stroke committed by the draw layer before it enters
   the shared stroke list (coords finite, path length bounded). */
function sanitizeStroke(input, now) {
  if (!input || typeof input !== 'object') return null;
  if (!INK_TOOLS.includes(input.tool)) return null;
  const color = /^#[0-9a-fA-F]{6}$/.test(String(input.color || ''))
    ? String(input.color).toLowerCase() : DEFAULTS.ink.color;
  const width = Math.round(clampNum(input.width, 1, 40, DEFAULTS.ink.width));
  const pt = p => (p && Number.isFinite(+p.x) && Number.isFinite(+p.y))
    ? { x: +p.x, y: +p.y } : null;
  const stroke = {
    id: `s${(now || 0).toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    tool: input.tool, color, width, born: now || 0,
  };
  if (input.tool === 'pen' || input.tool === 'highlighter') {
    if (!Array.isArray(input.pts) || input.pts.length < 2) return null;
    const pts = input.pts.slice(0, 20000).map(pt).filter(Boolean);
    if (pts.length < 2) return null;
    stroke.pts = pts;
  } else {
    const a = pt(input.a);
    const b = pt(input.b);
    if (!a || !b) return null;
    stroke.a = a;
    stroke.b = b;
  }
  return stroke;
}

module.exports = {
  DEFAULTS,
  INK_TOOLS,
  EXIT_ACTIONS,
  LENS_SHAPES,
  normalizeSettings,
  parseGdiLine,
  captureRegion,
  fpsForRegion,
  captureSig,
  sanitizeStroke,
};
