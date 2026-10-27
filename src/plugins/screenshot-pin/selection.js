/* Region selection with annotation toolbar & drawing.
   States: idle → dragging → selected (toolbar visible, can annotate) → done.
   Right-click toggles toolbar visibility when a selection exists.
   All coordinates are CSS px == DIP for this display. */
(() => {
  const shot = document.getElementById('shot');
  const box = document.getElementById('box');
  const hole = document.getElementById('hole');
  const sizeEl = document.getElementById('size');
  const inkCanvas = document.getElementById('ink');
  const toolbar = document.getElementById('toolbar');
  const inkCtx = inkCanvas.getContext('2d');

  // --- state machine ---
  let phase = 'idle';   // idle | dragging | selected
  let start = null;
  let now = null;
  let selRect = null;    // locked selection {x, y, width, height}
  let tbVisible = true;  // toolbar visibility toggle

  // --- annotation state ---
  let tool = null;       // null = no tool, 'pen' | 'rect' | 'ellipse' | 'arrow'
  let color = '#ff5f52';
  const strokes = [];
  let drawing = false;
  let curStroke = null;

  window.overlay.onImage(({ image }) => { shot.src = image; });
  window.overlay.ready();

  // --- geometry helpers ---
  const norm = () => ({
    x: Math.min(start.x, now.x), y: Math.min(start.y, now.y),
    width: Math.abs(now.x - start.x), height: Math.abs(now.y - start.y),
  });

  const paintSelection = r => {
    hole.style.left = `${r.x}px`;
    hole.style.top = `${r.y}px`;
    hole.style.width = `${r.width}px`;
    hole.style.height = `${r.height}px`;
    sizeEl.style.left = `${r.x + r.width / 2}px`;
    sizeEl.style.top = `${r.y}px`;
    sizeEl.textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
  };

  // --- toolbar positioning ---
  const positionToolbar = () => {
    if (!selRect) return;
    toolbar.hidden = false;
    // measure toolbar
    const tbW = toolbar.offsetWidth;
    const tbH = toolbar.offsetHeight;
    const gap = 8;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // prefer below selection, centered
    let tx = selRect.x + (selRect.width - tbW) / 2;
    let ty = selRect.y + selRect.height + gap;

    // if toolbar goes below screen, put above selection
    if (ty + tbH > screenH - 10) {
      ty = selRect.y - tbH - gap;
    }
    // clamp horizontal
    tx = Math.max(8, Math.min(tx, screenW - tbW - 8));
    // clamp vertical
    ty = Math.max(8, Math.min(ty, screenH - tbH - 8));

    toolbar.style.left = `${tx}px`;
    toolbar.style.top = `${ty}px`;
  };

  // --- ink canvas setup ---
  const setupInk = () => {
    if (!selRect) return;
    const dpr = window.devicePixelRatio || 1;
    inkCanvas.style.left = `${selRect.x}px`;
    inkCanvas.style.top = `${selRect.y}px`;
    inkCanvas.style.width = `${selRect.width}px`;
    inkCanvas.style.height = `${selRect.height}px`;
    inkCanvas.width = Math.round(selRect.width * dpr);
    inkCanvas.height = Math.round(selRect.height * dpr);
    inkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  // --- stroke rendering ---
  const applyStyle = s => {
    inkCtx.strokeStyle = s.color;
    inkCtx.fillStyle = s.color;
    inkCtx.lineWidth = s.tool === 'pen' ? 3 : 2;
    inkCtx.lineCap = 'round';
    inkCtx.lineJoin = 'round';
    inkCtx.globalAlpha = 1;
    inkCtx.globalCompositeOperation = 'source-over';
  };

  const drawStroke = s => {
    applyStyle(s);
    const pts = s.points;
    if (pts.length < 2 && (s.tool === 'pen')) {
      // dot
      inkCtx.beginPath();
      inkCtx.arc(pts[0].x, pts[0].y, inkCtx.lineWidth / 2, 0, Math.PI * 2);
      inkCtx.fill();
      return;
    }
    if (s.tool === 'pen') {
      inkCtx.beginPath();
      inkCtx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) inkCtx.lineTo(pts[i].x, pts[i].y);
      inkCtx.stroke();
    } else {
      const a = pts[0], b = pts[pts.length - 1];
      if (s.tool === 'arrow') {
        inkCtx.beginPath();
        inkCtx.moveTo(a.x, a.y);
        inkCtx.lineTo(b.x, b.y);
        inkCtx.stroke();
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const head = 14;
        inkCtx.beginPath();
        inkCtx.moveTo(b.x, b.y);
        inkCtx.lineTo(b.x - head * Math.cos(ang - Math.PI / 7), b.y - head * Math.sin(ang - Math.PI / 7));
        inkCtx.moveTo(b.x, b.y);
        inkCtx.lineTo(b.x - head * Math.cos(ang + Math.PI / 7), b.y - head * Math.sin(ang + Math.PI / 7));
        inkCtx.stroke();
      } else if (s.tool === 'rect') {
        inkCtx.beginPath();
        inkCtx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        inkCtx.stroke();
      } else if (s.tool === 'ellipse') {
        inkCtx.beginPath();
        inkCtx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2,
          Math.abs(b.x - a.x) / 2 || 1, Math.abs(b.y - a.y) / 2 || 1, 0, 0, Math.PI * 2);
        inkCtx.stroke();
      }
    }
  };

  const repaintInk = () => {
    inkCtx.clearRect(0, 0, selRect.width, selRect.height);
    for (const s of strokes) drawStroke(s);
    if (curStroke) drawStroke(curStroke);
  };

  // --- compose final image ---
  const compose = () => {
    if (!selRect) return null;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(selRect.width * dpr);
    const ch = Math.round(selRect.height * dpr);
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const cx = c.getContext('2d');
    // draw cropped screenshot
    cx.drawImage(shot,
      selRect.x * dpr, selRect.y * dpr, cw, ch,
      0, 0, cw, ch);
    // draw annotation layer on top
    if (strokes.length > 0) {
      cx.drawImage(inkCanvas, 0, 0, cw, ch);
    }
    return c.toDataURL('image/png');
  };

  // --- toolbar button state ---
  const syncToolButtons = () => {
    toolbar.querySelectorAll('[data-tool]').forEach(b => {
      b.classList.toggle('on', b.dataset.tool === tool);
    });
    toolbar.querySelectorAll('[data-color]').forEach(b => {
      b.classList.toggle('on', b.dataset.color === color);
    });
    document.body.classList.toggle('annotating', !!tool);
  };

  // --- enter selected state ---
  const enterSelected = r => {
    phase = 'selected';
    selRect = r;
    document.body.classList.add('selected');
    setupInk();
    positionToolbar();
    syncToolButtons();
  };

  // --- mouse events for region selection ---
  window.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (phase === 'selected') {
      // if clicking inside selection area with a tool, start drawing
      if (tool && selRect) {
        const lx = e.clientX - selRect.x;
        const ly = e.clientY - selRect.y;
        if (lx >= 0 && ly >= 0 && lx <= selRect.width && ly <= selRect.height) {
          drawing = true;
          curStroke = { tool, color, points: [{ x: lx, y: ly }] };
          repaintInk();
          return;
        }
      }
      // clicking outside toolbar & selection with no tool → re-select
      if (!e.target.closest('#toolbar')) {
        // reset and start new selection
        phase = 'idle';
        document.body.classList.remove('selected', 'annotating');
        toolbar.hidden = true;
        box.hidden = true;
        strokes.length = 0;
        tool = null;
        inkCtx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
        selRect = null;
        // fall through to start new drag
      } else {
        return; // toolbar click handled by toolbar handler
      }
    }
    if (phase !== 'idle') return;
    start = { x: e.clientX, y: e.clientY };
    now = { ...start };
    box.hidden = false;
    phase = 'dragging';
    document.body.classList.add('dragging');
    paintSelection(norm());
  });

  window.addEventListener('mousemove', e => {
    if (phase === 'dragging' && start) {
      now = { x: e.clientX, y: e.clientY };
      paintSelection(norm());
    } else if (drawing && curStroke && selRect) {
      curStroke.points.push({ x: e.clientX - selRect.x, y: e.clientY - selRect.y });
      repaintInk();
    }
  });

  window.addEventListener('mouseup', e => {
    if (e.button !== 0) return;
    if (phase === 'dragging') {
      const r = norm();
      start = null;
      document.body.classList.remove('dragging');
      if (r.width < 6 || r.height < 6) {
        box.hidden = true;
        phase = 'idle';
        return;
      }
      enterSelected(r);
      return;
    }
    if (drawing && curStroke) {
      if (curStroke.points.length >= 1) {
        strokes.push(curStroke);
      }
      curStroke = null;
      drawing = false;
      repaintInk();
    }
  });

  // --- right-click: toggle toolbar (or cancel if no selection) ---
  window.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (phase === 'selected') {
      tbVisible = !tbVisible;
      toolbar.hidden = !tbVisible;
    } else {
      window.overlay.cancel();
    }
  });

  // --- keyboard ---
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (phase === 'selected') {
        // If we have annotations, first clear them. Otherwise cancel.
        if (strokes.length > 0) {
          strokes.length = 0;
          tool = null;
          syncToolButtons();
          repaintInk();
          return;
        }
        // exit selection back to idle
        phase = 'idle';
        document.body.classList.remove('selected', 'annotating');
        toolbar.hidden = true;
        box.hidden = true;
        selRect = null;
        return;
      }
      window.overlay.cancel();
    }
    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && phase === 'selected') {
      e.preventDefault();
      if (strokes.length > 0) {
        strokes.pop();
        repaintInk();
      }
    }
  });

  // --- toolbar click handler ---
  toolbar.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn) return;

    // tool selection
    if (btn.dataset.tool) {
      tool = (tool === btn.dataset.tool) ? null : btn.dataset.tool;
      syncToolButtons();
      return;
    }

    // color selection
    if (btn.dataset.color) {
      color = btn.dataset.color;
      syncToolButtons();
      return;
    }

    // actions
    const act = btn.dataset.act;
    if (!act || !selRect) return;

    if (act === 'undo') {
      if (strokes.length > 0) {
        strokes.pop();
        repaintInk();
      }
      return;
    }

    if (act === 'pin') {
      const dataUrl = compose();
      if (dataUrl) {
        window.overlay.selectComposed(dataUrl, selRect);
      }
      return;
    }

    if (act === 'copy') {
      const dataUrl = compose();
      if (dataUrl) window.overlay.copy(dataUrl);
      return;
    }

    if (act === 'save') {
      const dataUrl = compose();
      if (dataUrl) await window.overlay.save(dataUrl);
      return;
    }

    if (act === 'cancel') {
      window.overlay.cancel();
    }
  });

  // prevent toolbar from starting a new selection drag
  toolbar.addEventListener('mousedown', e => { e.stopPropagation(); });
})();
