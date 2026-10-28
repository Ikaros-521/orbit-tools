/* draw-board renderer: canvas annotation engine + DOM toolbar.
   Model: strokes[] = {tool, color, size, points[{x,y}]}; eraser strokes are
   replayed with destination-out, so undo/redo is just stack surgery followed
   by a full repaint — cheap at annotation scale. Coordinates are CSS px. */
(() => {
  const inkCanvas = document.getElementById('ink');
  const backdropCanvas = document.getElementById('backdrop');
  const inkCtx = inkCanvas.getContext('2d');
  const backdropCtx = backdropCanvas.getContext('2d', { colorSpace: 'srgb', alpha: true });

  const bar = document.getElementById('bar');
  const dragHandle = document.getElementById('drag-handle');
  const toolsEl = document.getElementById('tools');
  const colorsEl = document.getElementById('colors');
  const customColorInput = document.getElementById('customColor');
  const customColorBtn = document.getElementById('customColorBtn');
  const sizesEl = document.getElementById('sizes');
  const sizeSlider = document.getElementById('sizeSlider');
  const sizeVal = document.getElementById('sizeVal');
  const sizeSliderWrap = document.getElementById('sizeSliderWrap');
  const textControls = document.getElementById('textControls');
  const textFont = document.getElementById('textFont');
  const textSize = document.getElementById('textSize');
  const textBold = document.getElementById('textBold');
  const sizeSep = document.getElementById('sizeSep');

  let backdropImage = null;

  const TOOLS = [
    { id: 'pen', title: '画笔', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>' },
    { id: 'highlighter', title: '荧光笔', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6-4.6a2 2 0 0 0-2.8 0l-5.2 5.2a2 2 0 0 0 0 2.8l4.6 4.6a2 2 0 0 0 2.8 0l5.2-5.2a2 2 0 0 0 0-2.8z"/></svg>' },
    { id: 'line', title: '直线', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 19 19 5"/><circle cx="5" cy="19" r="1.6" fill="currentColor"/><circle cx="19" cy="5" r="1.6" fill="currentColor"/></svg>' },
    { id: 'arrow', title: '箭头', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5"/><path d="M13 5h6v6"/></svg>' },
    { id: 'rect', title: '矩形', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="6" width="16" height="12" rx="2"/></svg>' },
    { id: 'ellipse', title: '椭圆', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="12" rx="9" ry="6"/></svg>' },
    { id: 'text', title: '文字 (T)', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>' },
    { id: 'eraser', title: '橡皮', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 18"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>' },
  ];
  const COLORS = ['#ff4d4f', '#ff7a45', '#ffc53d', '#52c41a', '#13c2c2', '#1677ff', '#ffffff', '#141414'];
  const SIZES = [2, 4, 8, 14];

  const state = {
    tool: 'pen', color: COLORS[0], size: 4,
    fontSize: 20,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    bold: true,
    editingText: null,
    bgMode: 'screen', // 'screen' | 'white' | 'black'
    strokes: [], redo: [],
    drawing: false, current: null,
    dpr: window.devicePixelRatio || 1, w: 0, h: 0,
    screenOriginX: 0, screenOriginY: 0,
  };

  /* --- canvas sizing & backdrop render ---------------------------------------- */
  function renderBackdrop() {
    backdropCtx.imageSmoothingEnabled = false;
    backdropCtx.clearRect(0, 0, backdropCanvas.width, backdropCanvas.height);
    const w = backdropCanvas.width;
    const h = backdropCanvas.height;

    if (state.bgMode === 'screen') {
      if (backdropImage) {
        backdropCtx.drawImage(backdropImage, 0, 0, w, h);
      }
    } else if (state.bgMode === 'white') {
      backdropCtx.fillStyle = '#ffffff';
      backdropCtx.fillRect(0, 0, w, h);
      backdropCtx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
      backdropCtx.lineWidth = 1;
      const step = 32 * state.dpr;
      backdropCtx.beginPath();
      for (let x = 0; x < w; x += step) {
        backdropCtx.moveTo(x, 0); backdropCtx.lineTo(x, h);
      }
      for (let y = 0; y < h; y += step) {
        backdropCtx.moveTo(0, y); backdropCtx.lineTo(w, y);
      }
      backdropCtx.stroke();
    } else if (state.bgMode === 'black') {
      backdropCtx.fillStyle = '#1a1f22';
      backdropCtx.fillRect(0, 0, w, h);
      backdropCtx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      backdropCtx.lineWidth = 1;
      const step = 32 * state.dpr;
      backdropCtx.beginPath();
      for (let x = 0; x < w; x += step) {
        backdropCtx.moveTo(x, 0); backdropCtx.lineTo(x, h);
      }
      for (let y = 0; y < h; y += step) {
        backdropCtx.moveTo(0, y); backdropCtx.lineTo(w, y);
      }
      backdropCtx.stroke();
    }
  }

  function resize() {
    state.dpr = window.devicePixelRatio || 1;
    state.w = window.innerWidth;
    state.h = window.innerHeight;

    const pw = Math.round(state.w * state.dpr);
    const ph = Math.round(state.h * state.dpr);

    backdropCanvas.width = pw;
    backdropCanvas.height = ph;
    backdropCanvas.style.width = `${state.w}px`;
    backdropCanvas.style.height = `${state.h}px`;
    renderBackdrop();

    inkCanvas.width = pw;
    inkCanvas.height = ph;
    inkCanvas.style.width = `${state.w}px`;
    inkCanvas.style.height = `${state.h}px`;
    inkCtx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    repaint();
  }
  window.addEventListener('resize', resize);

  /* --- stroke rendering -------------------------------------------------------- */
  function strokeStyle(s) {
    if (s.tool === 'highlighter') {
      inkCtx.globalAlpha = 0.4;
      inkCtx.lineWidth = Math.max(14, s.size * 4);
      inkCtx.globalCompositeOperation = 'multiply';
    } else if (s.tool === 'eraser') {
      inkCtx.globalAlpha = 1;
      inkCtx.lineWidth = Math.max(20, s.size * 5);
      inkCtx.globalCompositeOperation = 'destination-out';
    } else {
      inkCtx.globalAlpha = 1;
      inkCtx.lineWidth = s.size;
      inkCtx.globalCompositeOperation = 'source-over';
    }
    inkCtx.strokeStyle = s.color;
    inkCtx.fillStyle = s.color;
    inkCtx.lineCap = 'round';
    inkCtx.lineJoin = 'round';
  }

  function drawStroke(s) {
    if (s.tool === 'text') {
      inkCtx.globalAlpha = 1;
      inkCtx.globalCompositeOperation = 'source-over';
      inkCtx.font = `${s.bold ? 'bold ' : ''}${s.fontSize || 20}px ${s.fontFamily || 'sans-serif'}`;
      inkCtx.fillStyle = s.color;
      inkCtx.textBaseline = 'top';
      const lines = String(s.text || '').split('\n');
      const lh = (s.fontSize || 20) * 1.35;
      for (let i = 0; i < lines.length; i++) {
        inkCtx.shadowColor = s.color === '#ffffff' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.4)';
        inkCtx.shadowBlur = 3;
        inkCtx.fillText(lines[i], s.x, s.y + i * lh);
      }
      inkCtx.shadowColor = 'transparent';
      inkCtx.shadowBlur = 0;
      return;
    }

    strokeStyle(s);
    const pts = s.points;
    if (!pts || pts.length === 0) return;
    inkCtx.beginPath();
    if (s.tool === 'pen' || s.tool === 'highlighter' || s.tool === 'eraser') {
      if (pts.length === 1) { // dot
        inkCtx.arc(pts[0].x, pts[0].y, Math.max(1, inkCtx.lineWidth / 2), 0, Math.PI * 2);
        inkCtx.fill();
        return;
      }
      inkCtx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) inkCtx.lineTo(pts[i].x, pts[i].y);
      inkCtx.stroke();
    } else {
      const a = pts[0], b = pts[pts.length - 1];
      if (s.tool === 'line' || s.tool === 'arrow') {
        inkCtx.moveTo(a.x, a.y);
        inkCtx.lineTo(b.x, b.y);
        inkCtx.stroke();
        if (s.tool === 'arrow') {
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          const head = Math.max(12, s.size * 4);
          inkCtx.beginPath();
          inkCtx.moveTo(b.x, b.y);
          inkCtx.lineTo(b.x - head * Math.cos(ang - Math.PI / 7), b.y - head * Math.sin(ang - Math.PI / 7));
          inkCtx.moveTo(b.x, b.y);
          inkCtx.lineTo(b.x - head * Math.cos(ang + Math.PI / 7), b.y - head * Math.sin(ang + Math.PI / 7));
          inkCtx.stroke();
        }
      } else if (s.tool === 'rect') {
        inkCtx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        inkCtx.stroke();
      } else if (s.tool === 'ellipse') {
        inkCtx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(1, Math.abs(b.x - a.x) / 2), Math.max(1, Math.abs(b.y - a.y) / 2), 0, 0, Math.PI * 2);
        inkCtx.stroke();
      }
    }
    inkCtx.globalAlpha = 1;
    inkCtx.globalCompositeOperation = 'source-over';
  }

  function repaint() {
    inkCtx.clearRect(0, 0, state.w, state.h);
    for (const s of state.strokes) drawStroke(s);
    if (state.current) drawStroke(state.current);
  }

  /* --- floating text editor ----------------------------------------------------- */
  function commitTextEditor() {
    if (!state.editingText) return;
    const { textarea, x, y } = state.editingText;
    const val = textarea.value.trim();
    if (val) {
      state.strokes.push({
        tool: 'text',
        x,
        y,
        text: val,
        color: state.color,
        fontSize: state.fontSize,
        fontFamily: state.fontFamily,
        bold: state.bold,
      });
      state.redo = [];
    }
    textarea.remove();
    state.editingText = null;
    repaint();
  }

  function updateActiveTextEditor() {
    if (!state.editingText) return;
    const { textarea } = state.editingText;
    textarea.style.color = state.color;
    textarea.style.fontSize = `${state.fontSize}px`;
    textarea.style.fontFamily = state.fontFamily;
    textarea.style.fontWeight = state.bold ? 'bold' : 'normal';
  }

  function spawnTextEditor(clientX, clientY) {
    commitTextEditor();

    const textarea = document.createElement('textarea');
    textarea.className = 'board-text-editor';
    textarea.placeholder = '输入文字 (Ctrl+Enter 确定, Esc 取消)';
    textarea.style.left = `${clientX}px`;
    textarea.style.top = `${clientY}px`;
    textarea.style.color = state.color;
    textarea.style.fontSize = `${state.fontSize}px`;
    textarea.style.fontFamily = state.fontFamily;
    textarea.style.fontWeight = state.bold ? 'bold' : 'normal';
    textarea.style.minWidth = '120px';
    textarea.style.minHeight = `${state.fontSize * 1.8}px`;

    const autoSize = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(state.fontSize * 1.8, textarea.scrollHeight)}px`;
      textarea.style.width = 'auto';
      textarea.style.width = `${Math.max(120, textarea.scrollWidth + 12)}px`;
    };
    textarea.addEventListener('input', autoSize);

    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        commitTextEditor();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        textarea.remove();
        state.editingText = null;
      }
    });

    // Stop pointer/mouse events inside textarea from bubbling to canvas
    textarea.addEventListener('pointerdown', e => e.stopPropagation());
    textarea.addEventListener('mousedown', e => e.stopPropagation());

    document.body.appendChild(textarea);
    textarea.focus();
    state.editingText = { textarea, x: clientX, y: clientY };
  }

  /* --- pointer input -------------------------------------------------------------- */
  const pos = e => ({ x: e.clientX, y: e.clientY });
  const onBoard = e => !(e.target && typeof e.target.closest === 'function' && (e.target.closest('#bar') || e.target.closest('.board-text-editor')));

  window.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !onBoard(e)) return;
    if (state.tool === 'text') {
      e.preventDefault();
      spawnTextEditor(e.clientX, e.clientY);
      return;
    }
    commitTextEditor();
    state.drawing = true;
    state.current = { tool: state.tool, color: state.color, size: state.size, points: [pos(e)] };
    repaint();
  });

  window.addEventListener('pointermove', e => {
    if (!state.drawing || !state.current) return;
    state.current.points.push(pos(e));
    repaint();
  });

  window.addEventListener('pointerup', () => {
    if (!state.drawing || !state.current) return;
    state.drawing = false;
    state.strokes.push(state.current);
    state.redo = [];
    state.current = null;
    repaint();
  });

  /* --- toolbar DOM setup ------------------------------------------------------------- */
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
    b.title = `${s}px`;
    b.dataset.size = String(s);
    const i = document.createElement('i');
    i.style.width = i.style.height = `${Math.min(16, 3 + s)}px`;
    b.appendChild(i);
    sizesEl.appendChild(b);
  }

  const bgModesEl = document.getElementById('bgModes');

  function syncBar() {
    if (bgModesEl) {
      bgModesEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.bg === state.bgMode));
    }
    toolsEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tool === state.tool));
    const isPresetColor = COLORS.includes(state.color);
    colorsEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.color === state.color));
    if (customColorBtn) {
      customColorBtn.classList.toggle('on', !isPresetColor);
      customColorBtn.style.backgroundColor = !isPresetColor ? state.color : 'transparent';
      customColorBtn.textContent = !isPresetColor ? '' : '🎨';
    }
    if (customColorInput) customColorInput.value = state.color;

    const isText = state.tool === 'text';
    if (textControls) textControls.style.display = isText ? 'flex' : 'none';
    if (sizesEl) sizesEl.style.display = isText ? 'none' : 'flex';
    if (sizeSliderWrap) sizeSliderWrap.style.display = isText ? 'none' : 'inline-flex';

    if (textFont) textFont.value = state.fontFamily;
    if (textSize) textSize.value = String(state.fontSize);
    if (textBold) textBold.classList.toggle('on', state.bold);

    sizesEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', Number(b.dataset.size) === state.size));
    if (sizeSlider) sizeSlider.value = String(state.size);
    if (sizeVal) sizeVal.textContent = `${state.size}px`;
    document.body.style.cursor = isText ? 'text' : (state.tool === 'eraser' ? 'cell' : 'crosshair');
  }

  // Text tool control events
  if (textFont) {
    textFont.addEventListener('change', () => {
      state.fontFamily = textFont.value;
      updateActiveTextEditor();
    });
  }
  if (textSize) {
    textSize.addEventListener('change', () => {
      state.fontSize = Number(textSize.value) || 20;
      updateActiveTextEditor();
    });
  }
  if (textBold) {
    textBold.addEventListener('click', () => {
      state.bold = !state.bold;
      textBold.classList.toggle('on', state.bold);
      updateActiveTextEditor();
    });
  }

  // Custom color picker input events
  if (customColorInput) {
    const updateCustomColor = e => {
      state.color = e.target.value;
      if (state.tool === 'eraser') state.tool = 'pen';
      syncBar();
      if (state.current) { state.current.color = state.color; repaint(); }
    };
    customColorInput.addEventListener('input', updateCustomColor);
    customColorInput.addEventListener('change', updateCustomColor);
  }

  // Size slider input event
  if (sizeSlider) {
    sizeSlider.addEventListener('input', e => {
      state.size = Math.max(1, Math.min(40, Number(e.target.value) || 1));
      syncBar();
      if (state.current) { state.current.size = state.size; repaint(); }
    });
  }

  // Mouse wheel over size controls to adjust size smoothly
  const handleSizeWheel = e => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1 : -1;
    state.size = Math.max(1, Math.min(40, state.size + delta));
    syncBar();
    if (state.current) { state.current.size = state.size; repaint(); }
  };
  if (sizeSliderWrap) sizeSliderWrap.addEventListener('wheel', handleSizeWheel, { passive: false });
  if (sizesEl) sizesEl.addEventListener('wheel', handleSizeWheel, { passive: false });

  bar.addEventListener('click', async e => {
    const bgBtn = e.target.closest('button[data-bg]');
    if (bgBtn) {
      const mode = bgBtn.dataset.bg;
      if (state.bgMode !== mode) {
        state.bgMode = mode;
        if (mode === 'white' && (state.color === '#ffffff' || state.color.toLowerCase() === '#fff')) {
          state.color = '#ff4d4f';
        } else if (mode === 'black' && (state.color === '#141414' || state.color === '#000000')) {
          state.color = '#ffffff';
        }
        syncBar();
        renderBackdrop();
      }
      return;
    }
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
    else if (act === 'pin') await pin();
    else if (act === 'copy') await copy();
    else if (act === 'save') await save();
    else if (act === 'exit') window.board.exit();
  });

  /* --- toolbar dragging ------------------------------------------------------------- */
  let isDraggingBar = false;
  let dragOffset = { x: 0, y: 0 };

  const canDragFrom = target => target === dragHandle || target === bar || target.classList.contains('sep') || target.classList.contains('grp');

  bar.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !canDragFrom(e.target)) return;
    isDraggingBar = true;
    const rect = bar.getBoundingClientRect();
    dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    bar.style.transform = 'none';
    bar.style.left = `${rect.left}px`;
    bar.style.top = `${rect.top}px`;
    bar.setPointerCapture(e.pointerId);
  });

  bar.addEventListener('pointermove', e => {
    if (!isDraggingBar) return;
    const bw = bar.offsetWidth;
    const bh = bar.offsetHeight;
    const nx = Math.max(10, Math.min(window.innerWidth - bw - 10, e.clientX - dragOffset.x));
    const ny = Math.max(10, Math.min(window.innerHeight - bh - 10, e.clientY - dragOffset.y));
    bar.style.left = `${nx}px`;
    bar.style.top = `${ny}px`;
  });

  const stopBarDrag = e => {
    if (!isDraggingBar) return;
    isDraggingBar = false;
    try { bar.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  bar.addEventListener('pointerup', stopBarDrag);
  bar.addEventListener('pointercancel', stopBarDrag);

  /* --- composite, save, copy & pin logic --------------------------------------------- */
  function compositeFullCanvas() {
    const out = document.createElement('canvas');
    out.width = inkCanvas.width;
    out.height = inkCanvas.height;
    const octx = out.getContext('2d', { colorSpace: 'srgb' });
    octx.imageSmoothingEnabled = false;

    if (backdropCanvas.width > 0 && backdropCanvas.height > 0) {
      octx.drawImage(backdropCanvas, 0, 0, out.width, out.height);
    }
    octx.drawImage(inkCanvas, 0, 0);
    return out;
  }

  async function save() {
    const out = compositeFullCanvas();
    const dataUrl = out.toDataURL('image/png');
    await window.board.save(dataUrl);
  }

  let copyTimer = null;
  async function copy() {
    const out = compositeFullCanvas();
    const dataUrl = out.toDataURL('image/png');
    await window.board.copy(dataUrl);

    const btn = document.getElementById('btnCopy');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓';
      btn.style.color = '#52c41a';
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        btn.textContent = orig;
        btn.style.color = '';
      }, 1200);
    }
  }

  function getStrokesBounds() {
    if (!state.strokes.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of state.strokes) {
      if (s.tool === 'text') {
        const lines = String(s.text || '').split('\n');
        const approxW = Math.max(...lines.map(l => l.length), 1) * (s.fontSize || 20);
        const approxH = lines.length * (s.fontSize || 20) * 1.35;
        if (s.x < minX) minX = s.x;
        if (s.y < minY) minY = s.y;
        if (s.x + approxW > maxX) maxX = s.x + approxW;
        if (s.y + approxH > maxY) maxY = s.y + approxH;
        continue;
      }
      if (!s.points || !s.points.length) continue;
      for (const p of s.points) {
        const r = Math.max(8, (s.size || 4) * 3);
        if (p.x - r < minX) minX = p.x - r;
        if (p.y - r < minY) minY = p.y - r;
        if (p.x + r > maxX) maxX = p.x + r;
        if (p.y + r > maxY) maxY = p.y + r;
      }
    }
    if (minX >= maxX || minY >= maxY) return null;
    const pad = 24;
    return {
      x: Math.max(0, Math.floor(minX - pad)),
      y: Math.max(0, Math.floor(minY - pad)),
      width: Math.min(state.w, Math.ceil(maxX - minX + pad * 2)),
      height: Math.min(state.h, Math.ceil(maxY - minY + pad * 2)),
    };
  }

  async function pin() {
    let cropRect = getStrokesBounds();
    if (!cropRect || cropRect.width < 40 || cropRect.height < 40) {
      const defW = Math.min(state.w - 40, Math.max(400, Math.round(state.w * 0.65)));
      const defH = Math.min(state.h - 40, Math.max(300, Math.round(state.h * 0.65)));
      cropRect = {
        x: Math.round((state.w - defW) / 2),
        y: Math.round((state.h - defH) / 2),
        width: defW,
        height: defH,
      };
    }

    const crop = document.createElement('canvas');
    crop.width = Math.round(cropRect.width * state.dpr);
    crop.height = Math.round(cropRect.height * state.dpr);
    const cctx = crop.getContext('2d', { colorSpace: 'srgb' });
    cctx.imageSmoothingEnabled = false;

    const sx = Math.round(cropRect.x * state.dpr);
    const sy = Math.round(cropRect.y * state.dpr);
    const sw = crop.width;
    const sh = crop.height;

    if (backdropCanvas.width > 0 && backdropCanvas.height > 0) {
      cctx.drawImage(backdropCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
    }
    cctx.drawImage(inkCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    const dataUrl = crop.toDataURL('image/png');
    const bounds = {
      x: (state.screenOriginX || 0) + cropRect.x,
      y: (state.screenOriginY || 0) + cropRect.y,
      width: cropRect.width,
      height: cropRect.height,
    };

    await window.board.pin({ dataUrl, bounds });
  }

  /* --- keyboard shortcuts ----------------------------------------------------------- */
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (state.editingText) {
        state.editingText.textarea.remove();
        state.editingText = null;
        return;
      }
      window.board.exit();
      return;
    }
    // 't' or 'T' shortcuts when not in an input
    if ((e.key === 't' || e.key === 'T') && !e.target.closest('input, textarea, select')) {
      state.tool = 'text';
      syncBar();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'F3' || (mod && e.key.toLowerCase() === 'p')) {
      e.preventDefault();
      pin();
    } else if (mod && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      copy();
    } else if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      const s = e.shiftKey ? state.redo.pop() : state.strokes.pop();
      if (s) (e.shiftKey ? state.strokes : state.redo).push(s);
      repaint();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      const s = state.redo.pop();
      if (s) state.strokes.push(s);
      repaint();
    } else if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  });

  /* --- boot & IPC handshake --------------------------------------------------------- */
  window.board.onInit(({ image, dpr, bounds }) => {
    if (dpr) state.dpr = dpr;
    if (bounds) {
      state.screenOriginX = bounds.x || 0;
      state.screenOriginY = bounds.y || 0;
    }
    if (image) {
      const img = new Image();
      img.onload = () => {
        backdropImage = img;
        resize();
      };
      img.src = image;
    } else {
      resize();
    }
  });

  resize(); // initialize immediately with empty canvas
  syncBar();
  window.board.ready(); // announce readiness to backend
})();
