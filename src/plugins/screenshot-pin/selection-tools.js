/* screenshot-pin - stroke geometry & transform handles (extracted from
   selection.js). Registered on window.SelectionTools; selection.js calls the
   factory at init with the shared ink canvas context and strokes array. */
(() => {
  function createSelectionTools({ inkCtx, strokes }) {
    if (!inkCtx || !strokes) return null;

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

    return { CURSOR_MAP, cloneStroke, getStrokeAABB, hitTestHandle, hitTestStroke, drawTransformOverlay };
  }

  const exportsObj = { createSelectionTools };
  if (typeof window !== 'undefined') window.SelectionTools = exportsObj;
  if (typeof module !== 'undefined' && module.exports) module.exports = exportsObj;
})();
