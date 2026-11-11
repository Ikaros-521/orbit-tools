/* Passive ink layer: renders committed strokes and the exit fade. The
   window is click-through and never focusable, so this renderer stays
   completely inert outside paint work. */
(function () {
  const B = window.cue;
  const canvas = document.getElementById('ink');
  const c = canvas.getContext('2d');

  let origin = { x: 0, y: 0 };
  let strokes = [];
  let fadeStart = 0;
  let fadeMs = 0;
  let raf = 0;

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

  function alphaAt(now) {
    if (!fadeStart || !fadeMs) return 1;
    return Math.max(0, 1 - (now - fadeStart) / fadeMs);
  }

  function render() {
    raf = 0;
    setupCanvas();
    c.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const now = Date.now();
    let animating = false;
    for (const s of strokes) {
      const a = alphaAt(now);
      if (a <= 0) continue;
      if (fadeStart && a > 0) animating = true;
      window.CueStrokes.drawStroke(c, s, origin, a);
    }
    if (animating) raf = requestAnimationFrame(render);
  }

  function request() {
    if (!raf) raf = requestAnimationFrame(render);
  }

  B.onInit(p => {
    origin = p.origin || origin;
    strokes = Array.isArray(p.strokes) ? p.strokes : [];
    fadeStart = p.fadeStart || 0;
    fadeMs = p.fadeMs || 0;
    request();
    B.displayed();
  });

  B.onStrokes(p => {
    strokes = Array.isArray(p.strokes) ? p.strokes : strokes;
    fadeStart = p.fadeStart || 0;
    fadeMs = p.fadeMs || 0;
    request();
  });

  B.ready();
})();
