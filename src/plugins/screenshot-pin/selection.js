/* Region selection with annotation toolbar & drawing.
   States: idle → dragging → selected (toolbar visible, can annotate) → done.
   Right-click toggles toolbar visibility when a selection exists.
   All coordinates are CSS px == DIP for this display. */
(() => {
  const shotCanvas = document.getElementById('shot');
  const shotCtx = shotCanvas.getContext('2d', { colorSpace: 'srgb', alpha: false });
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
  let shotW = 0;         // physical px of the captured frame (authoritative)
  let shotH = 0;
  let dipW = 0;          // DIP extent the main process mapped the frame onto
  let dipH = 0;
  let base = null;       // lossless crop of the current selection, decoded

  // --- annotation state ---
  let tool = null;       // null = no tool, 'pen' | 'rect' | 'ellipse' | 'arrow' | 'text'
  let color = '#ff4d4f';
  let size = 4;
  let fontSize = 20;
  let fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  let bold = true;
  let editingText = null;

  const PRESET_COLORS = ['#ff4d4f', '#ff7a45', '#ffc53d', '#52c41a', '#1677ff', '#ffffff', '#141414'];
  const strokes = [];
  let drawing = false;
  let curStroke = null;
  let selectedStroke = null;
  let transformMode = null;
  let transformStart = null;

  const customColorInput = document.getElementById('customColor');
  const customColorBtn = document.getElementById('customColorBtn');
  const sizeSlider = document.getElementById('sizeSlider');
  const sizeVal = document.getElementById('sizeVal');
  const sizeGroup = document.getElementById('sizeGroup');
  const textGroup = document.getElementById('textGroup');
  const textFont = document.getElementById('textFont');
  const textSize = document.getElementById('textSize');
  const textBold = document.getElementById('textBold');

  if (!window.overlay) {
    console.warn('overlay bridge not available');
    return;
  }

  window.overlay.onImage(({ image, width, height, dipWidth, dipHeight }) => {
    const img = new Image();
    img.onload = () => {
      // Back the canvas with the frame's own pixel size so the freeze-frame maps
      // 1:1 onto the window; sizing it from the decoded image instead would let a
      // fractional devicePixelRatio silently rescale the picture.
      shotW = width || img.naturalWidth;
      shotH = height || img.naturalHeight;
      dipW = dipWidth || window.innerWidth;
      dipH = dipHeight || window.innerHeight;
      shotCanvas.width = shotW;
      shotCanvas.height = shotH;
      shotCtx.imageSmoothingEnabled = false;
      shotCtx.drawImage(img, 0, 0, shotW, shotH);

      if (typeof window.overlay.displayed === 'function') {
        window.overlay.displayed();
      }
    };
    img.src = image;
  });
  window.overlay.ready();

  // --- lossless base for the current selection -------------------------------
  // The visible backdrop is a JPEG preview (cheap to encode, so opening the
  // capture never stalls the screen); exports must not inherit that, so the
  // region is re-cropped from the untouched frame in the main process.
  const loadBase = (rect) => {
    base = null;
    return window.overlay.crop(rect).then(res => {
      if (!res || !res.image) return null;
      return new Promise(resolve => {
        const im = new Image();
        im.onload = () => { base = { img: im, width: res.width, height: res.height, dataUrl: res.image }; resolve(base); };
        im.onerror = () => resolve(null);
        im.src = res.image;
      });
    }).catch(() => null);
  };

  // --- geometry helpers ---
  const norm = () => ({
    x: Math.min(start.x, now.x), y: Math.min(start.y, now.y),
    width: Math.abs(now.x - start.x), height: Math.abs(now.y - start.y),
  });

  const getScale = () => ({
    rx: shotW && dipW ? shotW / dipW : (window.devicePixelRatio || 1),
    ry: shotH && dipH ? shotH / dipH : (window.devicePixelRatio || 1),
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
    const { rx, ry } = getScale();
    inkCanvas.style.left = `${selRect.x}px`;
    inkCanvas.style.top = `${selRect.y}px`;
    inkCanvas.style.width = `${selRect.width}px`;
    inkCanvas.style.height = `${selRect.height}px`;
    inkCanvas.width = Math.round(selRect.width * rx);
    inkCanvas.height = Math.round(selRect.height * ry);
    inkCtx.setTransform(rx, 0, 0, ry, 0, 0);
  };

  // --- stroke rendering ---
  const applyStyle = s => {
    inkCtx.strokeStyle = s.color;
    inkCtx.fillStyle = s.color;
    inkCtx.lineWidth = s.size || (s.tool === 'pen' ? 4 : 3);
    inkCtx.lineCap = 'round';
    inkCtx.lineJoin = 'round';
    inkCtx.globalAlpha = 1;
    inkCtx.globalCompositeOperation = 'source-over';
  };

  const drawStroke = s => {
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

    applyStyle(s);
    const pts = s.points;
    if (pts.length < 2 && (s.tool === 'pen')) {
      // dot
      inkCtx.beginPath();
      inkCtx.arc(pts[0].x, pts[0].y, Math.max(1, inkCtx.lineWidth / 2), 0, Math.PI * 2);
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
        const head = Math.max(12, (s.size || 3) * 3.5);
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

  const commitTextEditor = () => {
    if (!editingText) return;
    const { textarea, lx, ly } = editingText;
    const val = textarea.value.trim();
    if (val) {
      strokes.push({
        tool: 'text',
        x: lx,
        y: ly,
        text: val,
        color,
        fontSize,
        fontFamily,
        bold,
      });
    }
    textarea.remove();
    editingText = null;
    repaintInk();
  };

  const updateActiveTextEditor = () => {
    if (!editingText) return;
    const { textarea } = editingText;
    textarea.style.color = color;
    textarea.style.fontSize = `${fontSize}px`;
    textarea.style.fontFamily = fontFamily;
    textarea.style.fontWeight = bold ? 'bold' : 'normal';
  };

  const spawnTextEditor = (clientX, clientY) => {
    commitTextEditor();
    if (!selRect) return;

    const lx = clientX - selRect.x;
    const ly = clientY - selRect.y;

    const textarea = document.createElement('textarea');
    textarea.className = 'sel-text-editor';
    textarea.placeholder = '输入文字 (Ctrl+Enter 确定, Esc 取消)';
    textarea.style.left = `${clientX}px`;
    textarea.style.top = `${clientY}px`;
    textarea.style.color = color;
    textarea.style.fontSize = `${fontSize}px`;
    textarea.style.fontFamily = fontFamily;
    textarea.style.fontWeight = bold ? 'bold' : 'normal';
    textarea.style.minWidth = '110px';
    textarea.style.minHeight = `${fontSize * 1.8}px`;

    const autoSize = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(fontSize * 1.8, textarea.scrollHeight)}px`;
      textarea.style.width = 'auto';
      textarea.style.width = `${Math.max(110, textarea.scrollWidth + 12)}px`;
    };
    textarea.addEventListener('input', autoSize);

    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        commitTextEditor();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        textarea.remove();
        editingText = null;
      }
    });

    // Prevent clicks/typing inside textarea from bubbling to selection canvas
    textarea.addEventListener('pointerdown', e => e.stopPropagation());
    textarea.addEventListener('mousedown', e => e.stopPropagation());
    textarea.addEventListener('click', e => e.stopPropagation());
    textarea.addEventListener('dblclick', e => e.stopPropagation());

    document.body.appendChild(textarea);
    textarea.focus();
    editingText = { textarea, lx, ly };
  };

  const repaintInk = () => {
    inkCtx.clearRect(0, 0, selRect.width, selRect.height);
    for (const s of strokes) drawStroke(s);
    if (curStroke) drawStroke(curStroke);
    if (selectedStroke && strokes.includes(selectedStroke)) {
      drawTransformOverlay(selectedStroke, inkCtx);
    }
  };

  /* --- stroke geometry & transform handles ------------------------------------- */
  const cloneStroke = s => {
    if (!s) return null;
    const c = { ...s };
    if (s.points) c.points = s.points.map(p => ({ x: p.x, y: p.y }));
    return c;
  };

  const getStrokeAABB = (s, ctx) => {
    if (!s) return null;
    if (s.tool === 'text') {
      const lines = (s.text || '').split('\n');
      const fs = s.fontSize || 20;
      const lh = fs * 1.35;
      let maxW = 0;
      if (ctx) {
        ctx.save();
        ctx.font = `${s.bold ? 'bold ' : ''}${fs}px ${s.fontFamily || 'sans-serif'}`;
        for (const line of lines) {
          const w = ctx.measureText(line).width;
          if (w > maxW) maxW = w;
        }
        ctx.restore();
      } else {
        for (const line of lines) {
          let w = 0;
          for (const ch of line) w += ch.charCodeAt(0) > 255 ? fs : fs * 0.55;
          if (w > maxW) maxW = w;
        }
      }
      return {
        x: s.x,
        y: s.y,
        width: Math.max(24, maxW + 4),
        height: Math.max(fs, lines.length * lh),
      };
    }
    if (s.points && s.points.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of s.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const pad = Math.max(4, (s.size || 4) / 2);
      return {
        x: minX - pad,
        y: minY - pad,
        width: Math.max(12, maxX - minX + pad * 2),
        height: Math.max(12, maxY - minY + pad * 2),
      };
    }
    return null;
  };

  const getHandlePoints = box => {
    const bx = box.x;
    const by = box.y;
    const bw = box.width;
    const bh = box.height;
    return {
      nw: { x: bx, y: by },
      n:  { x: bx + bw / 2, y: by },
      ne: { x: bx + bw, y: by },
      e:  { x: bx + bw, y: by + bh / 2 },
      se: { x: bx + bw, y: by + bh },
      s:  { x: bx + bw / 2, y: by + bh },
      sw: { x: bx, y: by + bh },
      w:  { x: bx, y: by + bh / 2 },
    };
  };

  const hitTestHandle = (box, x, y) => {
    if (!box) return null;
    const handles = getHandlePoints(box);
    const r = 8;
    for (const [dir, pt] of Object.entries(handles)) {
      if (Math.abs(x - pt.x) <= r && Math.abs(y - pt.y) <= r) {
        return dir;
      }
    }
    if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
      return 'move';
    }
    return null;
  };

  const hitTestStroke = (x, y) => {
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i];
      const box = getStrokeAABB(s, inkCtx);
      if (!box) continue;
      if (x >= box.x - 6 && x <= box.x + box.width + 6 && y >= box.y - 6 && y <= box.y + box.height + 6) {
        return s;
      }
    }
    return null;
  };

  const CURSOR_MAP = {
    nw: 'nwse-resize',
    se: 'nwse-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    n:  'ns-resize',
    s:  'ns-resize',
    e:  'ew-resize',
    w:  'ew-resize',
    move: 'move',
  };

  const drawTransformOverlay = (s, ctx) => {
    const box = getStrokeAABB(s, ctx);
    if (!box) return;
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffab2e';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(box.x - 1, box.y - 1, box.width + 2, box.height + 2);
    ctx.setLineDash([]);

    const handles = getHandlePoints(box);
    for (const pt of Object.values(handles)) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ffab2e';
      ctx.lineWidth = 1.5;
      ctx.fillRect(pt.x - 4, pt.y - 4, 8, 8);
      ctx.strokeRect(pt.x - 4, pt.y - 4, 8, 8);
    }
    ctx.restore();
  };

  // --- compose final image ---
  const compose = async () => {
    selectedStroke = null;
    repaintInk();
    if (!selRect || !shotW) return null;
    const { rx, ry } = getScale();
    const sx = Math.max(0, Math.round(selRect.x * rx));
    const sy = Math.max(0, Math.round(selRect.y * ry));
    const sw = Math.min(shotW - sx, Math.max(1, Math.round(selRect.width * rx)));
    const sh = Math.min(shotH - sy, Math.max(1, Math.round(selRect.height * ry)));

    // Use the lossless crop of this exact region; the preview frame is only a
    // fallback if that request failed.
    let b = base;
    if (!b || b.width !== sw || b.height !== sh) b = await loadBase(selRect);
    const lossless = b && b.width === sw && b.height === sh;
    // Nothing drawn: the main process already produced the exact lossless PNG.
    if (lossless && strokes.length === 0) return b.dataUrl;

    const c = document.createElement('canvas');
    c.width = sw;
    c.height = sh;
    const cx = c.getContext('2d', { colorSpace: 'srgb' });
    cx.imageSmoothingEnabled = false; // 1:1 直通，避免重采样模糊或颜色漂移
    if (lossless) cx.drawImage(b.img, 0, 0, sw, sh);
    else cx.drawImage(shotCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
    if (strokes.length > 0) {
      cx.drawImage(inkCanvas, 0, 0, sw, sh);
    }
    return c.toDataURL('image/png');
  };

  // --- toolbar button state ---
  const syncToolButtons = () => {
    toolbar.querySelectorAll('[data-tool]').forEach(b => {
      b.classList.toggle('on', b.dataset.tool === tool);
    });
    const isPreset = PRESET_COLORS.includes(color);
    toolbar.querySelectorAll('[data-color]').forEach(b => {
      b.classList.toggle('on', b.dataset.color === color);
    });
    if (customColorBtn) {
      customColorBtn.classList.toggle('on', !isPreset);
      customColorBtn.style.backgroundColor = !isPreset ? color : 'transparent';
      customColorBtn.textContent = !isPreset ? '' : '🎨';
    }
    if (customColorInput) customColorInput.value = color;

    const isText = tool === 'text';
    const isSelect = tool === 'select';
    if (textGroup) textGroup.style.display = isText ? 'flex' : 'none';
    if (sizeGroup) sizeGroup.style.display = (isText || isSelect) ? 'none' : 'flex';
    if (textFont) textFont.value = fontFamily;
    if (textSize) textSize.value = String(fontSize);
    if (textBold) textBold.classList.toggle('on', bold);

    toolbar.querySelectorAll('[data-size]').forEach(b => {
      b.classList.toggle('on', Number(b.dataset.size) === size);
    });
    if (sizeSlider) sizeSlider.value = String(size);
    if (sizeVal) sizeVal.textContent = `${size}px`;

    document.body.classList.toggle('annotating', !!tool);
    if (isSelect) {
      inkCanvas.style.cursor = 'default';
    } else {
      selectedStroke = null;
      repaintInk();
    }
  };

  // Wire text tool controls
  if (textFont) {
    textFont.addEventListener('change', () => {
      fontFamily = textFont.value;
      updateActiveTextEditor();
    });
  }
  if (textSize) {
    textSize.addEventListener('change', () => {
      fontSize = Number(textSize.value) || 20;
      updateActiveTextEditor();
    });
  }
  if (textBold) {
    textBold.addEventListener('click', () => {
      bold = !bold;
      textBold.classList.toggle('on', bold);
      updateActiveTextEditor();
    });
  }

  // Wire custom color picker
  if (customColorInput) {
    const onCustomColor = e => {
      color = e.target.value;
      if (!tool) tool = 'pen';
      syncToolButtons();
      updateActiveTextEditor();
    };
    customColorInput.addEventListener('input', onCustomColor);
    customColorInput.addEventListener('change', onCustomColor);
  }

  // Wire size slider & wheel
  if (sizeSlider) {
    sizeSlider.addEventListener('input', e => {
      size = Math.max(1, Math.min(32, Number(e.target.value) || 1));
      syncToolButtons();
    });
  }
  if (sizeGroup) {
    sizeGroup.addEventListener('wheel', e => {
      e.preventDefault();
      size = Math.max(1, Math.min(32, size + (e.deltaY < 0 ? 1 : -1)));
      syncToolButtons();
    }, { passive: false });
  }

  // --- enter selected state ---
  const enterSelected = r => {
    phase = 'selected';
    selRect = r;
    document.body.classList.add('selected');
    setupInk();
    positionToolbar();
    syncToolButtons();
    loadBase(r); // overlaps the lossless round-trip with the user's annotation time
  };

  // --- mouse events for region selection ---
  window.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (e.target && typeof e.target.closest === 'function' && e.target.closest('.sel-text-editor')) return; // inside text editor
    if (phase === 'selected') {
      if (tool === 'select' && selRect) {
        commitTextEditor();
        const lx = e.clientX - selRect.x;
        const ly = e.clientY - selRect.y;
        if (lx >= 0 && ly >= 0 && lx <= selRect.width && ly <= selRect.height) {
          // 1. If we have a selected stroke, test handles first
          if (selectedStroke && strokes.includes(selectedStroke)) {
            const box = getStrokeAABB(selectedStroke, inkCtx);
            const hit = hitTestHandle(box, lx, ly);
            if (hit) {
              transformMode = hit;
              transformStart = {
                mouseX: lx,
                mouseY: ly,
                initialStroke: cloneStroke(selectedStroke),
                initialBox: { ...box },
              };
              return;
            }
          }
          // 2. Otherwise test if any stroke is hit
          const targetStroke = hitTestStroke(lx, ly);
          if (targetStroke) {
            selectedStroke = targetStroke;
            const box = getStrokeAABB(selectedStroke, inkCtx);
            transformMode = 'move';
            transformStart = {
              mouseX: lx,
              mouseY: ly,
              initialStroke: cloneStroke(selectedStroke),
              initialBox: { ...box },
            };
          } else {
            selectedStroke = null;
            transformMode = null;
            transformStart = null;
          }
          repaintInk();
          return;
        }
      }

      if (tool === 'text' && selRect) {
        const lx = e.clientX - selRect.x;
        const ly = e.clientY - selRect.y;
        if (lx >= 0 && ly >= 0 && lx <= selRect.width && ly <= selRect.height) {
          e.preventDefault();
          spawnTextEditor(e.clientX, e.clientY);
          return;
        }
      }
      commitTextEditor();
      selectedStroke = null;
      // if clicking inside selection area with a tool, start drawing
      if (tool && tool !== 'select' && selRect) {
        const lx = e.clientX - selRect.x;
        const ly = e.clientY - selRect.y;
        if (lx >= 0 && ly >= 0 && lx <= selRect.width && ly <= selRect.height) {
          drawing = true;
          curStroke = { tool, color, size, points: [{ x: lx, y: ly }] };
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
        selectedStroke = null;
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
      return;
    }

    if (phase === 'selected' && selRect) {
      const lx = e.clientX - selRect.x;
      const ly = e.clientY - selRect.y;

      // Transform drag in progress
      if (tool === 'select' && transformMode && transformStart && selectedStroke) {
        const { mouseX, mouseY, initialStroke, initialBox } = transformStart;
        const dx = lx - mouseX;
        const dy = ly - mouseY;
        const s = selectedStroke;

        if (transformMode === 'move') {
          if (s.tool === 'text') {
            s.x = initialStroke.x + dx;
            s.y = initialStroke.y + dy;
          } else if (s.points) {
            s.points = initialStroke.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
          }
        } else {
          let nx = initialBox.x;
          let ny = initialBox.y;
          let nw = initialBox.width;
          let nh = initialBox.height;
          const mode = transformMode;

          if (mode.includes('e')) nw += dx;
          if (mode.includes('s')) nh += dy;
          if (mode.includes('w')) { nx += dx; nw -= dx; }
          if (mode.includes('n')) { ny += dy; nh -= dy; }

          if (nw < 12) nw = 12;
          if (nh < 12) nh = 12;

          if (s.tool === 'text') {
            s.x = nx;
            s.y = ny;
            const ratio = nh / initialBox.height;
            s.fontSize = Math.max(12, Math.min(128, Math.round(initialStroke.fontSize * ratio)));
          } else if (s.tool === 'rect' || s.tool === 'ellipse') {
            s.points = [
              { x: nx, y: ny },
              { x: nx + nw, y: ny + nh }
            ];
          } else if (s.points) {
            const sx = nw / Math.max(1, initialBox.width);
            const sy = nh / Math.max(1, initialBox.height);
            s.points = initialStroke.points.map(pt => ({
              x: nx + (pt.x - initialBox.x) * sx,
              y: ny + (pt.y - initialBox.y) * sy,
            }));
          }
        }
        repaintInk();
        return;
      }

      // Cursor hover updates in select mode
      if (tool === 'select') {
        if (selectedStroke && strokes.includes(selectedStroke)) {
          const box = getStrokeAABB(selectedStroke, inkCtx);
          const hit = hitTestHandle(box, lx, ly);
          if (hit && CURSOR_MAP[hit]) {
            inkCanvas.style.cursor = CURSOR_MAP[hit];
            return;
          }
        }
        const hoverStroke = hitTestStroke(lx, ly);
        inkCanvas.style.cursor = hoverStroke ? 'pointer' : 'default';
        return;
      }
    }

    if (drawing && curStroke && selRect) {
      curStroke.points.push({ x: e.clientX - selRect.x, y: e.clientY - selRect.y });
      repaintInk();
    }
  });

  window.addEventListener('mouseup', e => {
    if (e.button !== 0) return;
    if (tool === 'select' && transformMode) {
      transformMode = null;
      transformStart = null;
      return;
    }
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

  // --- double-click inside selection: finish and copy to clipboard (QQ screenshot style) ---
  window.addEventListener('dblclick', async e => {
    if (phase !== 'selected' || !selRect) return;
    if (e.target.closest('#toolbar')) return;
    const lx = e.clientX - selRect.x;
    const ly = e.clientY - selRect.y;
    if (lx >= 0 && ly >= 0 && lx <= selRect.width && ly <= selRect.height) {
      const dataUrl = await compose();
      if (dataUrl) window.overlay.copy(dataUrl);
    }
  });

  // --- keyboard ---
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (editingText) {
        editingText.textarea.remove();
        editingText = null;
        return;
      }
      if (selectedStroke) {
        selectedStroke = null;
        repaintInk();
        return;
      }
      if (tool) {
        tool = null;
        document.body.classList.remove('annotating');
        syncToolButtons();
        repaintInk();
        return;
      }
      if (phase === 'selected') {
        phase = 'idle';
        document.body.classList.remove('selected', 'annotating');
        toolbar.hidden = true;
        box.hidden = true;
        selRect = null;
        return;
      }
      window.overlay.cancel();
    }
    // Delete or Backspace to delete selected stroke
    if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.closest('input, textarea, select') && phase === 'selected') {
      if (selectedStroke) {
        const idx = strokes.indexOf(selectedStroke);
        if (idx !== -1) {
          strokes.splice(idx, 1);
          selectedStroke = null;
          repaintInk();
        }
        return;
      }
    }
    if ((e.key === 'v' || e.key === 'V') && !e.target.closest('input, textarea, select') && phase === 'selected') {
      tool = 'select';
      syncToolButtons();
      return;
    }
    if ((e.key === 't' || e.key === 'T') && !e.target.closest('input, textarea, select') && phase === 'selected') {
      tool = 'text';
      syncToolButtons();
      return;
    }
    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && phase === 'selected') {
      e.preventDefault();
      commitTextEditor();
      if (strokes.length > 0) {
        strokes.pop();
        selectedStroke = null;
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
      commitTextEditor();
      tool = (tool === btn.dataset.tool) ? null : btn.dataset.tool;
      syncToolButtons();
      return;
    }

    // color selection
    if (btn.dataset.color) {
      color = btn.dataset.color;
      if (!tool) tool = 'pen';
      syncToolButtons();
      updateActiveTextEditor();
      return;
    }

    // size selection
    if (btn.dataset.size) {
      size = Number(btn.dataset.size);
      syncToolButtons();
      return;
    }

    // actions
    const act = btn.dataset.act;
    if (!act || !selRect) return;

    commitTextEditor();

    if (act === 'undo') {
      if (strokes.length > 0) {
        strokes.pop();
        repaintInk();
      }
      return;
    }

    if (act === 'pin') {
      if (strokes.length === 0) {
        window.overlay.select(selRect);
      } else {
        const dataUrl = await compose();
        if (dataUrl) {
          window.overlay.selectComposed(dataUrl, selRect);
        }
      }
      return;
    }

    if (act === 'copy') {
      const dataUrl = await compose();
      if (dataUrl) window.overlay.copy(dataUrl);
      return;
    }

    if (act === 'save') {
      const dataUrl = await compose();
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
