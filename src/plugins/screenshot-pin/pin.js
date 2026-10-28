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
  let tool = null; // 'rect' | 'ellipse' | 'arrow' | 'pen' | 'text' | null
  let color = '#ff4d4f';
  let size = 4;
  let fontSize = 20;
  let fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  let bold = true;
  let editingText = null;

  const PRESET_COLORS = ['#ff4d4f', '#ff7a45', '#ffc53d', '#52c41a', '#1677ff', '#ffffff', '#141414'];
  const strokes = [];
  let isDrawing = false;
  let curStroke = null;

  const customColorInput = document.getElementById('customColor');
  const customColorBtn = document.getElementById('customColorBtn');
  const sizeSlider = document.getElementById('sizeSlider');
  const sizeVal = document.getElementById('sizeVal');
  const sizeGroup = document.getElementById('sizeGroup');
  const textGroup = document.getElementById('textGroup');
  const textFont = document.getElementById('textFont');
  const textSize = document.getElementById('textSize');
  const textBold = document.getElementById('textBold');

  // ensure toolbar is initially hidden
  toolbar.hidden = true;

  if (!window.pin) {
    console.warn('pin bridge not available');
    return;
  }

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
    const rect = ink.getBoundingClientRect();
    const ratio = (rect && rect.width) ? (ink.width / rect.width) : 1;
    ctx2d.lineWidth = (s.size || (s.tool === 'pen' ? 4 : 3)) * ratio;
    ctx2d.lineCap = 'round';
    ctx2d.lineJoin = 'round';
    ctx2d.globalAlpha = 1;
    ctx2d.globalCompositeOperation = 'source-over';
  };

  const drawStroke = s => {
    if (s.tool === 'text') {
      ctx2d.globalAlpha = 1;
      ctx2d.globalCompositeOperation = 'source-over';
      const rect = ink.getBoundingClientRect();
      const ratio = (rect && rect.width) ? (ink.width / rect.width) : 1;
      const actualSize = (s.fontSize || 20) * ratio;
      ctx2d.font = `${s.bold ? 'bold ' : ''}${actualSize}px ${s.fontFamily || 'sans-serif'}`;
      ctx2d.fillStyle = s.color;
      ctx2d.textBaseline = 'top';
      const lines = String(s.text || '').split('\n');
      const lh = actualSize * 1.35;
      for (let i = 0; i < lines.length; i++) {
        ctx2d.shadowColor = s.color === '#ffffff' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.4)';
        ctx2d.shadowBlur = 3 * ratio;
        ctx2d.fillText(lines[i], s.x, s.y + i * lh);
      }
      ctx2d.shadowColor = 'transparent';
      ctx2d.shadowBlur = 0;
      return;
    }

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

  const commitTextEditor = () => {
    if (!editingText) return;
    const { textarea, canvasX, canvasY } = editingText;
    const val = textarea.value.trim();
    if (val) {
      strokes.push({
        tool: 'text',
        x: canvasX,
        y: canvasY,
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
    const coords = getCanvasCoords({ clientX, clientY });

    const textarea = document.createElement('textarea');
    textarea.className = 'pin-text-editor';
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

    // Prevent clicks/typing inside textarea from bubbling to stage/toolbar
    textarea.addEventListener('pointerdown', e => e.stopPropagation());
    textarea.addEventListener('mousedown', e => e.stopPropagation());
    textarea.addEventListener('click', e => e.stopPropagation());
    textarea.addEventListener('dblclick', e => e.stopPropagation());

    document.body.appendChild(textarea);
    textarea.focus();
    editingText = { textarea, canvasX: coords.x, canvasY: coords.y };
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
    commitTextEditor();
    tool = nextTool;
    document.body.classList.toggle('annotating', !!tool);
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
    if (textGroup) textGroup.style.display = isText ? 'flex' : 'none';
    if (sizeGroup) sizeGroup.style.display = isText ? 'none' : 'flex';
    if (textFont) textFont.value = fontFamily;
    if (textSize) textSize.value = String(fontSize);
    if (textBold) textBold.classList.toggle('on', bold);

    toolbar.querySelectorAll('[data-size]').forEach(b => {
      b.classList.toggle('on', Number(b.dataset.size) === size);
    });
    if (sizeSlider) sizeSlider.value = String(size);
    if (sizeVal) sizeVal.textContent = `${size}px`;
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
      if (!tool) setTool('pen');
      else setTool(tool);
      updateActiveTextEditor();
    };
    customColorInput.addEventListener('input', onCustomColor);
    customColorInput.addEventListener('change', onCustomColor);
  }

  // Wire size slider & wheel
  if (sizeSlider) {
    sizeSlider.addEventListener('input', e => {
      size = Math.max(1, Math.min(32, Number(e.target.value) || 1));
      setTool(tool);
    });
  }
  if (sizeGroup) {
    sizeGroup.addEventListener('wheel', e => {
      e.preventDefault();
      size = Math.max(1, Math.min(32, size + (e.deltaY < 0 ? 1 : -1)));
      setTool(tool);
    }, { passive: false });
  }

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
    if (e.target && typeof e.target.closest === 'function' && (e.target.closest('#toolbar') || e.target.closest('.pin-text-editor'))) return;

    if (e.button === 0) {
      if (tool === 'text') {
        e.preventDefault();
        spawnTextEditor(e.clientX, e.clientY);
        return;
      }
      commitTextEditor();
      if (tool) {
        // Annotation mode: start drawing
        isDrawing = true;
        const pt = getCanvasCoords(e);
        curStroke = { tool, color, size, points: [pt] };
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
    commitTextEditor();
    const merged = composeImage();
    window.pin.copy(merged);
  });
  window.pin.onTriggerSave(async () => {
    commitTextEditor();
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
    if (editingText) return;
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
      commitTextEditor();
      e.preventDefault();
      if (strokes.length > 0) {
        strokes.pop();
        repaintInk();
      }
      return;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key.toLowerCase() === 't') {
        if (toolbar.hidden) toggleToolbar(true);
        setTool('text');
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

    if (b.dataset.size) {
      size = Number(b.dataset.size);
      setTool(tool);
      return;
    }

    const act = b.dataset.act;
    if (!act) return;

    if (act === 'undo') {
      commitTextEditor();
      if (strokes.length > 0) {
        strokes.pop();
        repaintInk();
      }
      return;
    }

    if (act === 'copy') {
      commitTextEditor();
      const merged = composeImage();
      window.pin.copy(merged);
      toolbar.classList.add('flash');
      setTimeout(() => toolbar.classList.remove('flash'), 700);
      return;
    }

    if (act === 'save') {
      commitTextEditor();
      const merged = composeImage();
      b.disabled = true;
      await window.pin.save(merged);
      b.disabled = false;
      return;
    }

    if (act === 'close-tool') {
      commitTextEditor();
      toggleToolbar(false);
    }
  });

  // prevent toolbar clicks from dragging or drawing
  toolbar.addEventListener('mousedown', e => { e.stopPropagation(); });
})();
