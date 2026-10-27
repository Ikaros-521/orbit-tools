/* Pinned screenshot window.
   Features:
   - Window drag uses anchored coordinates with locked width/height to avoid DPI expansion bugs
   - Right-click opens native context menu (Annotate, Copy, Save, Opacity, Reset Zoom, Close)
   - Annotation toolbar appears cleanly BELOW the screenshot without overlapping it
*/
(() => {
  const stage = document.getElementById('stage');
  const wrap = document.getElementById('wrap');
  const img = document.getElementById('img');
  const ink = document.getElementById('ink');
  const toolbar = document.getElementById('toolbar');
  const ctx2d = ink.getContext('2d');

  let dataUrl = '';
  let scale = 1;

  // --- window dragging state ---
  let isMoving = false;

  // --- annotation state ---
  let tool = null; // 'rect' | 'ellipse' | 'arrow' | 'pen' | null
  let color = '#ff5f52';
  const strokes = [];
  let isDrawing = false;
  let curStroke = null;

  // ensure toolbar is initially hidden
  toolbar.hidden = true;

  // --- initialize image & canvas ---
  window.pin.onInit(({ image }) => {
    dataUrl = image;
    img.src = image;
  });

  img.onload = () => {
    ink.width = img.naturalWidth;
    ink.height = img.naturalHeight;
  };

  // --- stroke rendering on ink canvas ---
  const applyStrokeStyle = s => {
    ctx2d.strokeStyle = s.color;
    ctx2d.fillStyle = s.color;
    ctx2d.lineWidth = s.tool === 'pen' ? 4 : 3;
    ctx2d.lineCap = 'round';
    ctx2d.lineJoin = 'round';
    ctx2d.globalAlpha = 1;
    ctx2d.globalCompositeOperation = 'source-over';
  };

  const drawStroke = s => {
    applyStrokeStyle(s);
    const pts = s.points;
    if (!pts || !pts.length) return;
    if (s.tool === 'pen') {
      if (pts.length < 2) {
        ctx2d.beginPath();
        ctx2d.arc(pts[0].x, pts[0].y, ctx2d.lineWidth / 2, 0, Math.PI * 2);
        ctx2d.fill();
        return;
      }
      ctx2d.beginPath();
      ctx2d.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx2d.lineTo(pts[i].x, pts[i].y);
      ctx2d.stroke();
    } else {
      const a = pts[0], b = pts[pts.length - 1];
      if (s.tool === 'arrow') {
        ctx2d.beginPath();
        ctx2d.moveTo(a.x, a.y);
        ctx2d.lineTo(b.x, b.y);
        ctx2d.stroke();
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const head = Math.max(14, ctx2d.lineWidth * 4);
        ctx2d.beginPath();
        ctx2d.moveTo(b.x, b.y);
        ctx2d.lineTo(b.x - head * Math.cos(ang - Math.PI / 7), b.y - head * Math.sin(ang - Math.PI / 7));
        ctx2d.moveTo(b.x, b.y);
        ctx2d.lineTo(b.x - head * Math.cos(ang + Math.PI / 7), b.y - head * Math.sin(ang + Math.PI / 7));
        ctx2d.stroke();
      } else if (s.tool === 'rect') {
        ctx2d.beginPath();
        ctx2d.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        ctx2d.stroke();
      } else if (s.tool === 'ellipse') {
        ctx2d.beginPath();
        ctx2d.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2,
          Math.abs(b.x - a.x) / 2 || 1, Math.abs(b.y - a.y) / 2 || 1, 0, 0, Math.PI * 2);
        ctx2d.stroke();
      }
    }
  };

  const repaintInk = () => {
    ctx2d.clearRect(0, 0, ink.width, ink.height);
    for (const s of strokes) drawStroke(s);
    if (curStroke) drawStroke(curStroke);
  };

  // --- compose final image (photo + annotations) ---
  const composeImage = () => {
    if (!img.naturalWidth || !img.naturalHeight) return dataUrl;
    const cw = img.naturalWidth;
    const ch = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const cx = c.getContext('2d', { colorSpace: 'srgb' });
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, 0, 0, cw, ch);
    if (strokes.length > 0) {
      cx.drawImage(ink, 0, 0, cw, ch);
    }
    return c.toDataURL('image/png');
  };

  // --- coordinate mapping from screen clientX/Y to natural canvas pixels ---
  const getCanvasCoords = e => {
    const rect = ink.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left) * (ink.width / rect.width),
      y: (e.clientY - rect.top) * (ink.height / rect.height),
    };
  };

  // --- tool state management ---
  const setTool = nextTool => {
    tool = nextTool;
    document.body.classList.toggle('annotating', !!tool);
    toolbar.querySelectorAll('[data-tool]').forEach(b => {
      b.classList.toggle('on', b.dataset.tool === tool);
    });
    toolbar.querySelectorAll('[data-color]').forEach(b => {
      b.classList.toggle('on', b.dataset.color === color);
    });
  };

  const toggleToolbar = (forceOpen) => {
    const willOpen = forceOpen !== undefined ? forceOpen : toolbar.hidden;
    toolbar.hidden = !willOpen;
    window.pin.setAnnotating(willOpen, 50);
    if (!willOpen) {
      setTool(null);
    } else if (!tool) {
      setTool('pen');
    }
  };

  // --- mouse events for moving window vs drawing ---
  stage.addEventListener('mousedown', e => {
    if (e.target.closest('#toolbar')) return;

    if (e.button === 0) {
      if (tool) {
        // Annotation mode: start drawing
        isDrawing = true;
        const pt = getCanvasCoords(e);
        curStroke = { tool, color, points: [pt] };
        repaintInk();
      } else {
        // Normal mode: start window dragging with fixed anchor
        isMoving = true;
        window.pin.startMove(e.screenX, e.screenY);
      }
    }
  });

  window.addEventListener('mousemove', e => {
    if (isDrawing && curStroke) {
      const pt = getCanvasCoords(e);
      curStroke.points.push(pt);
      repaintInk();
    } else if (isMoving) {
      window.pin.move(e.screenX, e.screenY);
    }
  });

  window.addEventListener('mouseup', e => {
    if (e.button === 0) {
      if (isDrawing) {
        isDrawing = false;
        if (curStroke && curStroke.points.length >= 1) {
          strokes.push(curStroke);
        }
        curStroke = null;
        repaintInk();
      }
      if (isMoving) {
        isMoving = false;
        window.pin.endMove();
      }
    }
  });

  // --- right-click: open native context menu list ---
  window.addEventListener('contextmenu', e => {
    e.preventDefault();
    window.pin.showMenu();
  });

  // --- context menu actions from main process ---
  window.pin.onToggleAnnotate(() => toggleToolbar());
  window.pin.onTriggerCopy(() => {
    const merged = composeImage();
    window.pin.copy(merged);
  });
  window.pin.onTriggerSave(async () => {
    const merged = composeImage();
    await window.pin.save(merged);
  });
  window.pin.onSetOpacity(val => {
    wrap.style.opacity = String(val);
  });
  window.pin.onResetZoom(() => {
    scale = 1;
    wrap.style.transform = 'scale(1)';
  });

  // --- zoom via wheel (only when not drawing) ---
  window.addEventListener('wheel', e => {
    if (tool) return;
    e.preventDefault();
    const next = Math.min(8, Math.max(0.2, scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    scale = next;
    wrap.style.transform = `scale(${scale})`;
  }, { passive: false });

  // --- double-click resets zoom ---
  window.addEventListener('dblclick', e => {
    if (e.target.closest('#toolbar')) return;
    scale = 1;
    wrap.style.transform = 'scale(1)';
  });

  // --- keyboard shortcuts ---
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (tool) {
        setTool(null);
        return;
      }
      if (!toolbar.hidden) {
        toggleToolbar(false);
        return;
      }
      window.pin.close();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (strokes.length > 0) {
        strokes.pop();
        repaintInk();
      }
    }
  });

  // --- toolbar button clicks ---
  toolbar.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;

    if (b.dataset.tool) {
      setTool(tool === b.dataset.tool ? null : b.dataset.tool);
      return;
    }

    if (b.dataset.color) {
      color = b.dataset.color;
      setTool(tool || 'pen');
      return;
    }

    const act = b.dataset.act;
    if (!act) return;

    if (act === 'undo') {
      if (strokes.length > 0) {
        strokes.pop();
        repaintInk();
      }
      return;
    }

    if (act === 'copy') {
      const merged = composeImage();
      window.pin.copy(merged);
      toolbar.classList.add('flash');
      setTimeout(() => toolbar.classList.remove('flash'), 700);
      return;
    }

    if (act === 'save') {
      const merged = composeImage();
      b.disabled = true;
      await window.pin.save(merged);
      b.disabled = false;
      return;
    }

    if (act === 'close-tool') {
      toggleToolbar(false);
    }
  });

  // prevent toolbar clicks from dragging or drawing
  toolbar.addEventListener('mousedown', e => { e.stopPropagation(); });
})();
