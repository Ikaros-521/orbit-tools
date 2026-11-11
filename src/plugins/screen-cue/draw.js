/* Active draw layer: exists only while annotation mode is on. This window
   takes mouse + keyboard focus (so keystrokes never leak to the app below),
   previews the in-progress stroke locally, and commits finished strokes to
   the backend, which fans them out to the passive ink layers. */
(function () {
  const B = window.cue;
  const canvas = document.getElementById('draw');
  const c = canvas.getContext('2d');
  const backdrop = document.getElementById('scBackdrop');
  let frozen = false;
  let committed = [];
  let initGeneration = 0;

  function clearBackdrop() {
    ++initGeneration;
    backdrop.onload = null;
    backdrop.onerror = null;
    backdrop.hidden = true;
    backdrop.removeAttribute('src');
    frozen = false;
    committed = [];
  }

  function exitDraw() {
    clearBackdrop();
    B.exitDraw();
  }
  window.addEventListener('pagehide', clearBackdrop);

  let origin = { x: 0, y: 0 };
  let ink = { tool: 'pen', color: '#ffb400', width: 4 };
  let current = null;
  let pointerId = null;
  let toolbar = null;

  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(window.innerWidth * dpr));
    const h = Math.max(1, Math.round(window.innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function renderPreview() {
    setupCanvas();
    c.clearRect(0, 0, window.innerWidth, window.innerHeight);
    // The opaque frozen image covers the passive ink window underneath.
    if (frozen) {
      for (const stroke of committed) window.CueStrokes.drawStroke(c, stroke, origin, 1);
    }
    if (current) window.CueStrokes.drawStroke(c, current, origin, 1);
  }

  /* pointer events are in this window's DIP space; strokes are stored in
     global DIP screen coordinates so every layer (and any other display's
     ink window) can render them with its own origin. */
  const toGlobal = e => ({ x: e.clientX + origin.x, y: e.clientY + origin.y });

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || current) return;
    pointerId = e.pointerId;
    /* pointer capture keeps the drag alive when the cursor races outside
       this window (pin.js lesson: without it events cut off mid-drag) */
    try { canvas.setPointerCapture(pointerId); } catch { /* ignore */ }
    const g = toGlobal(e);
    current = { tool: ink.tool, color: ink.color, width: ink.width };
    if (ink.tool === 'pen' || ink.tool === 'highlighter') current.pts = [g, g];
    else { current.a = g; current.b = g; }
    renderPreview();
  });

  canvas.addEventListener('pointermove', e => {
    if (!current || e.pointerId !== pointerId) return;
    const g = toGlobal(e);
    if (current.pts) {
      const last = current.pts[current.pts.length - 1];
      if (Math.abs(g.x - last.x) + Math.abs(g.y - last.y) < 1.2) return;
      current.pts.push(g);
    } else {
      current.b = g;
    }
    renderPreview();
  });

  function finish(e) {
    if (!current) return;
    if (e && e.pointerId !== undefined && e.pointerId !== pointerId) return;
    const canceled = e && e.type === 'pointercancel';
    const s = current;
    current = null;
    pointerId = null;
    renderPreview();
    if (canceled) return;
    const moved = s.pts
      ? s.pts.length >= 2
      : (s.a.x !== s.b.x || s.a.y !== s.b.y);
    if (moved) B.commit(s); // shapes need a real drag; pen taps commit a dot
  }

  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      exitDraw();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      B.undo();
      return;
    }
    const map = { 1: 'pen', 2: 'highlighter', 3: 'rect', 4: 'ellipse', 5: 'arrow' };
    const tool = map[e.key];
    if (tool && !e.ctrlKey && !e.metaKey && !e.altKey) {
      ink.tool = tool;
      if (toolbar) toolbar.setState(ink);
      B.toolState({ ...ink });
    }
  });

  window.addEventListener('contextmenu', e => e.preventDefault());

  toolbar = window.createDrawToolbar(document.getElementById('scBar'), {
    initial: ink,
    onToolState: st => { ink = { ...ink, ...st }; B.toolState({ ...ink }); },
    onUndo: () => B.undo(),
    onClear: () => B.clearInk(),
    onExit: exitDraw,
  });

  B.onInit(p => {
    origin = p.origin || origin;
    if (p.ink) {
      ink = { ...ink, ...p.ink };
      toolbar.setState(ink);
    }
    document.getElementById('scBar').style.display = p.showToolbar === false ? 'none' : 'flex';
    document.getElementById('scHint').style.display = p.showToolbar === false ? 'none' : 'block';
    clearBackdrop();
    frozen = typeof p.backdrop === 'string' && p.backdrop.startsWith('data:image/jpeg;base64,');
    committed = Array.isArray(p.strokes) ? p.strokes : [];
    renderPreview();
    if (!frozen) {
      B.displayed();
      return;
    }
    const generation = initGeneration;
    backdrop.onload = () => {
      if (generation !== initGeneration) return;
      backdrop.onload = null;
      backdrop.onerror = null;
      backdrop.hidden = false;
      B.displayed();
    };
    backdrop.onerror = () => {
      if (generation === initGeneration) exitDraw();
    };
    backdrop.src = p.backdrop;
  });

  B.onStrokes(p => {
    if (!frozen) return;
    committed = Array.isArray(p.strokes) ? p.strokes : committed;
    renderPreview();
  });

  B.onInkSettings(st => {
    if (st) {
      ink = { ...ink, ...st };
      toolbar.setState(ink);
    }
  });

  B.ready();
})();
