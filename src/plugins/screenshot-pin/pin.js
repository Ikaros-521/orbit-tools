/* Pinned screenshot window with right-click toolbar for secondary annotation.
   Features:
   - Default: window drags natively (-webkit-app-region: drag), wheel zooms, double-click resets
   - Right-click: toggles toolbar visibility
   - Annotation: rect, ellipse, arrow, pen, color palette, undo (Ctrl+Z)
   - When tool is active: drag is temporarily disabled to allow drawing
   - Actions: copy, save, dim (opacity), zoom reset, close
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
  const OPACITIES = [1, 0.75, 0.5, 0.3];
  let opIdx = 0;

  // --- annotation state ---
  let tool = null; // 'rect' | 'ellipse' | 'arrow' | 'pen' | null
  let color = '#ff5f52';
  const strokes = [];
  let drawing = false;
  let curStroke = null;

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
    const cx = c.getContext('2d');
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

  const toggleToolbar = () => {
    toolbar.hidden = !toolbar.hidden;
    if (toolbar.hidden) {
      setTool(null);
    }
  };

  // --- mouse drawing events ---
  stage.addEventListener('mousedown', e => {
    if (e.button !== 0 || !tool) return;
    drawing = true;
    const pt = getCanvasCoords(e);
    curStroke = { tool, color, points: [pt] };
    repaintInk();
  });

  window.addEventListener('mousemove', e => {
    if (!drawing || !curStroke) return;
    const pt = getCanvasCoords(e);
    curStroke.points.push(pt);
    repaintInk();
  });

  window.addEventListener('mouseup', e => {
    if (e.button !== 0 || !drawing) return;
    drawing = false;
    if (curStroke && curStroke.points.length >= 1) {
      strokes.push(curStroke);
    }
    curStroke = null;
    repaintInk();
  });

  // --- right-click: toggle toolbar ---
  window.addEventListener('contextmenu', e => {
    e.preventDefault();
    toggleToolbar();
  });

  // --- zoom via wheel (only when not drawing) ---
  window.addEventListener('wheel', e => {
    if (tool) return; // do not zoom while in annotation mode
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
        toolbar.hidden = true;
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

    if (act === 'dim') {
      opIdx = (opIdx + 1) % OPACITIES.length;
      wrap.style.opacity = String(OPACITIES[opIdx]);
      return;
    }

    if (act === 'close') {
      window.pin.close();
    }
  });

  // prevent toolbar clicks from dragging or drawing
  toolbar.addEventListener('mousedown', e => { e.stopPropagation(); });
})();
