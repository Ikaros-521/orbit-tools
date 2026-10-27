/* draw-board renderer: canvas annotation engine + DOM toolbar.
   Model: strokes[] = {tool, color, size, points[{x,y}]}; eraser strokes are
   replayed with destination-out, so undo/redo is just stack surgery followed
   by a full repaint — cheap at annotation scale. Coordinates are CSS px. */
(() => {
  const canvas = document.getElementById('ink');
  const backdrop = document.getElementById('backdrop');
  const ctx2d = canvas.getContext('2d');

  const TOOLS = [
    { id: 'pen', title: '画笔', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>' },
    { id: 'highlighter', title: '荧光笔', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4z"/></svg>' },
    { id: 'line', title: '直线', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 19 19 5"/><circle cx="5" cy="19" r="1.6" fill="currentColor"/><circle cx="19" cy="5" r="1.6" fill="currentColor"/></svg>' },
    { id: 'arrow', title: '箭头', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5"/><path d="M13 5h6v6"/></svg>' },
    { id: 'rect', title: '矩形', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="6" width="16" height="12" rx="2"/></svg>' },
    { id: 'ellipse', title: '椭圆', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="12" rx="9" ry="6"/></svg>' },
    { id: 'eraser', title: '橡皮', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 18"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>' },
  ];
  const COLORS = ['#ffab2e', '#ff5f52', '#5fe3a1', '#59a7ff', '#ffffff', '#141d1a'];
  const SIZES = [3, 6, 12];

  const state = {
    tool: 'pen', color: COLORS[0], size: SIZES[1],
    strokes: [], redo: [],
    drawing: false, current: null,
    dpr: 1, w: 0, h: 0,
  };

  /* --- canvas sizing --------------------------------------------------------- */
  function resize() {
    state.dpr = window.devicePixelRatio || 1;
    state.w = window.innerWidth;
    state.h = window.innerHeight;
    canvas.width = Math.round(state.w * state.dpr);
    canvas.height = Math.round(state.h * state.dpr);
    canvas.style.width = `${state.w}px`;
    canvas.style.height = `${state.h}px`;
    ctx2d.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    repaint();
  }
  window.addEventListener('resize', resize);

  /* --- stroke rendering -------------------------------------------------------- */
  function strokeStyle(s) {
    if (s.tool === 'highlighter') {
      ctx2d.globalAlpha = 0.4;
      ctx2d.lineWidth = Math.max(14, s.size * 4);
      ctx2d.globalCompositeOperation = 'multiply';
    } else if (s.tool === 'eraser') {
      ctx2d.globalAlpha = 1;
      ctx2d.lineWidth = Math.max(20, s.size * 5);
      ctx2d.globalCompositeOperation = 'destination-out';
    } else {
      ctx2d.globalAlpha = 1;
      ctx2d.lineWidth = s.size;
      ctx2d.globalCompositeOperation = 'source-over';
    }
    ctx2d.strokeStyle = s.color;
    ctx2d.fillStyle = s.color;
    ctx2d.lineCap = 'round';
    ctx2d.lineJoin = 'round';
  }

  function drawStroke(s) {
    strokeStyle(s);
    const pts = s.points;
    ctx2d.beginPath();
    if (s.tool === 'pen' || s.tool === 'highlighter' || s.tool === 'eraser') {
      if (pts.length === 1) { // dot
        ctx2d.arc(pts[0].x, pts[0].y, Math.max(1, ctx2d.lineWidth / 2), 0, Math.PI * 2);
        ctx2d.fill();
        return;
      }
      ctx2d.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx2d.lineTo(pts[i].x, pts[i].y);
      ctx2d.stroke();
    } else {
      const a = pts[0], b = pts[pts.length - 1];
      if (s.tool === 'line' || s.tool === 'arrow') {
        ctx2d.moveTo(a.x, a.y);
        ctx2d.lineTo(b.x, b.y);
        ctx2d.stroke();
        if (s.tool === 'arrow') {
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          const head = Math.max(12, s.size * 4);
          ctx2d.beginPath();
          ctx2d.moveTo(b.x, b.y);
          ctx2d.lineTo(b.x - head * Math.cos(ang - Math.PI / 7), b.y - head * Math.sin(ang - Math.PI / 7));
          ctx2d.moveTo(b.x, b.y);
          ctx2d.lineTo(b.x - head * Math.cos(ang + Math.PI / 7), b.y - head * Math.sin(ang + Math.PI / 7));
          ctx2d.stroke();
        }
      } else if (s.tool === 'rect') {
        ctx2d.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        ctx2d.stroke();
      } else if (s.tool === 'ellipse') {
        ctx2d.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
        ctx2d.stroke();
      }
    }
    ctx2d.globalAlpha = 1;
    ctx2d.globalCompositeOperation = 'source-over';
  }

  function repaint() {
    ctx2d.clearRect(0, 0, state.w, state.h);
    for (const s of state.strokes) drawStroke(s);
    if (state.current) drawStroke(state.current);
  }

  /* --- pointer input -------------------------------------------------------------- */
  const pos = e => ({ x: e.clientX, y: e.clientY });
  const onBoard = e => !e.target.closest('#bar');

  window.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !onBoard(e)) return;
    state.drawing = true;
    state.current = { tool: state.tool, color: state.color, size: state.size, points: [pos(e)] };
    repaint();
  });
  window.addEventListener('pointermove', e => {
    if (!state.drawing) return;
    state.current.points.push(pos(e));
    repaint();
  });
  window.addEventListener('pointerup', () => {
    if (!state.drawing) return;
    state.drawing = false;
    state.strokes.push(state.current);
    state.redo = [];
    state.current = null;
    repaint();
  });

  /* --- toolbar ---------------------------------------------------------------------- */
  const bar = document.getElementById('bar');
  const toolsEl = document.getElementById('tools');
  const colorsEl = document.getElementById('colors');
  const sizesEl = document.getElementById('sizes');

  for (const tool of TOOLS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = tool.title;
    b.dataset.tool = tool.id;
    b.innerHTML = tool.svg;
    toolsEl.appendChild(b);
  }
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.title = c;
    b.dataset.color = c;
    b.style.background = c;
    colorsEl.appendChild(b);
  }
  for (const s of SIZES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'szdot';
    b.dataset.size = String(s);
    const i = document.createElement('i');
    i.style.width = i.style.height = `${Math.min(16, 4 + s)}px`;
    b.appendChild(i);
    sizesEl.appendChild(b);
  }

  function syncBar() {
    toolsEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tool === state.tool));
    colorsEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.color === state.color));
    sizesEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', Number(b.dataset.size) === state.size));
    document.body.style.cursor = state.tool === 'eraser' ? 'cell' : 'crosshair';
  }

  bar.addEventListener('click', async e => {
    const tb = e.target.closest('button[data-tool]');
    if (tb) { state.tool = tb.dataset.tool; syncBar(); return; }
    const cb = e.target.closest('button[data-color]');
    if (cb) { state.color = cb.dataset.color; if (state.tool === 'eraser') state.tool = 'pen'; syncBar(); return; }
    const sb = e.target.closest('button[data-size]');
    if (sb) { state.size = Number(sb.dataset.size); syncBar(); return; }
    const ab = e.target.closest('button[data-act]');
    if (!ab) return;
    const act = ab.dataset.act;
    if (act === 'undo') { const s = state.strokes.pop(); if (s) state.redo.push(s); repaint(); }
    else if (act === 'redo') { const s = state.redo.pop(); if (s) state.strokes.push(s); repaint(); }
    else if (act === 'clear') { state.strokes = []; state.redo = []; repaint(); }
    else if (act === 'exit') window.board.exit();
    else if (act === 'save') await save();
  });

  async function save() {
    // flatten backdrop + strokes at physical resolution
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const octx = out.getContext('2d');
    if (backdrop.src) {
      octx.drawImage(backdrop, 0, 0, out.width, out.height);
    }
    octx.drawImage(canvas, 0, 0);
    await window.board.save(out.toDataURL('image/png'));
  }

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') { window.board.exit(); return; }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); const s = e.shiftKey ? state.redo.pop() : state.strokes.pop(); if (s) (e.shiftKey ? state.strokes : state.redo).push(s); repaint(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); const s = state.redo.pop(); if (s) state.strokes.push(s); repaint(); }
    else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  });

  /* --- boot ---------------------------------------------------------------------------- */
  window.board.onInit(({ image, dpr }) => {
    if (image) backdrop.src = image;
    void dpr; // devicePixelRatio is already correct inside the renderer
    resize();
  });
  resize(); // paint an empty board immediately in case init is late
  window.board.ready();
  syncBar();
})();
