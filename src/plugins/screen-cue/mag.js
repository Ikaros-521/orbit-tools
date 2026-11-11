/* Magnifier layer: click-through, never focusable. Frames come from the
   backend's GDI region helper (JPEG data URLs); cursor positions come from
   the backend's poll because a click-through window receives no mouse
   events of its own.

   Lens placement keeps a gap of (lensRadius + sourceRadius + margin)
   between cursor and lens so the feed never contains the lens itself —
   GDI BitBlt DOES capture layered windows on this stack (a fullscreen-fill
   magnifier collapses into a black recursion tunnel; verified), so the
   offset is the recursion defense. The "fullscreen" shape is therefore a
   big lens that shrinks until it fits without overlapping its source. */
(function () {
  const B = window.cue;
  const canvas = document.getElementById('mag');
  const c = canvas.getContext('2d');

  const MARGIN = 24;

  let origin = { x: 0, y: 0 };
  let lens = { shape: 'circle', circleD: 280, rectW: 360, rectH: 260, zoom: 3 };
  let cursor = null;                 // global DIP
  const frame = { img: null, meta: null, pending: null };
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

  function roundRect(cc, x, y, w, h, r) {
    cc.beginPath();
    cc.moveTo(x + r, y);
    cc.arcTo(x + w, y, x + w, y + h, r);
    cc.arcTo(x + w, y + h, x, y + h, r);
    cc.arcTo(x, y + h, x, y, r);
    cc.arcTo(x, y, x + w, y, r);
    cc.closePath();
  }

  function cross(cc, x, y, half) {
    cc.beginPath();
    cc.moveTo(x - half, y);
    cc.lineTo(x + half, y);
    cc.moveTo(x, y - half);
    cc.lineTo(x, y + half);
    cc.stroke();
  }

  function tick() {
    if (!raf) raf = requestAnimationFrame(render);
  }

  function render() {
    raf = 0;
    setupCanvas();
    const W = window.innerWidth;
    const H = window.innerHeight;
    c.clearRect(0, 0, W, H);

    const img = frame.img;
    const meta = frame.meta;
    if (!img || !meta || !img.complete || !img.naturalWidth || !cursor) return;

    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    /* the frame covers meta.ox..ox+dipW in global DIP; scale = px per DIP */
    const dipW = nw / meta.scale;
    const dipH = nh / meta.scale;
    const cx = cursor.x - origin.x;
    const cy = cursor.y - origin.y;

    /* shape + size + no-overlap placement. The lens must never cover its
       own source square (cursor-centered dipW×dipH ± margin). The circle /
       rect lens keeps a radial gap; the "fullscreen" big lens instead claims
       the largest free strip around that square (above / below / left /
       right), so with a centered cursor it becomes a full-width zoom band. */
    let dst;
    if (lens.shape === 'fullscreen') {
      const M = MARGIN + 8;
      const sx0 = cx - dipW / 2;
      const sx1 = cx + dipW / 2;
      const sy0 = cy - dipH / 2;
      const sy1 = cy + dipH / 2;
      const strips = [
        { x: 8, y: 8, w: W - 16, h: sy0 - M - 8 },
        { x: 8, y: sy1 + M, w: W - 16, h: H - sy1 - M - 8 },
        { x: 8, y: 8, w: sx0 - M - 8, h: H - 16 },
        { x: sx1 + M, y: 8, w: W - sx1 - M - 8, h: H - 16 },
      ].filter(r => r.w >= 240 && r.h >= 160 && r.w <= W && r.h <= H);
      if (strips.length) {
        strips.sort((a, b) => b.w * b.h - a.w * a.h);
        dst = strips[0];
      } else {
        /* source covers nearly everything (very low zoom) — degraded mode */
        dst = { x: W * 0.25, y: H * 0.25, w: W * 0.5, h: H * 0.5 };
      }
    } else {
      const sz = lens.shape === 'rect'
        ? { w: lens.rectW, h: lens.rectH }
        : { w: lens.circleD, h: lens.circleD };
      const halfW = sz.w / 2;
      const halfH = sz.h / 2;
      const needX = halfW + dipW / 2 + MARGIN;
      const needY = halfH + dipH / 2 + MARGIN;
      let lx = cx + needX - halfW; // default: right of the cursor
      let ly = cy + needY - halfH; // and below it
      if (lx + halfW * 2 + MARGIN > W) lx = cx - needX - halfW;
      if (ly + halfH * 2 + MARGIN > H) ly = cy - needY - halfH;
      lx = Math.max(0, Math.min(W - sz.w, lx));
      ly = Math.max(0, Math.min(H - sz.h, ly));
      dst = { x: lx, y: ly, w: sz.w, h: sz.h };
    }

    /* cursor's pixel position inside the frame — accounts for the helper
       clamping the capture rect at virtual-screen edges */
    const px = (cursor.x - meta.ox) * meta.scale;
    const py = (cursor.y - meta.oy) * meta.scale;
    const markX = dst.x + (px / nw) * dst.w;
    const markY = dst.y + (py / nh) * dst.h;

    c.save();
    if (lens.shape === 'circle') {
      c.beginPath();
      c.arc(dst.x + dst.w / 2, dst.y + dst.h / 2, dst.w / 2, 0, Math.PI * 2);
      c.clip();
    } else {
      roundRect(c, dst.x, dst.y, dst.w, dst.h, Math.min(16, dst.w / 4, dst.h / 4));
      c.clip();
    }
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(img, 0, 0, nw, nh, dst.x, dst.y, dst.w, dst.h);
    if (lens.showCrosshair !== false) {
      const crossHalf = dst.w > 800 || dst.h > 800 ? 18 : 9;
      c.lineWidth = crossHalf > 9 ? 2.2 : 1.6;
      c.strokeStyle = 'rgba(255,255,255,0.95)';
      cross(c, markX, markY, crossHalf);
      c.lineWidth = crossHalf > 9 ? 1.1 : 0.8;
      c.strokeStyle = 'rgba(0,0,0,0.8)';
      cross(c, markX, markY, crossHalf);
    }
    c.restore();

    c.lineWidth = 3;
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    strokeLens(dst);
    c.lineWidth = 1.4;
    c.strokeStyle = 'rgba(255,255,255,0.95)';
    strokeLens(dst);

    if (lens.showZoomBadge !== false) drawZoomBadge(dst, dst.w / dipW);
  }

  function strokeLens(dst) {
    if (lens.shape === 'circle') {
      c.beginPath();
      c.arc(dst.x + dst.w / 2, dst.y + dst.h / 2, dst.w / 2, 0, Math.PI * 2);
      c.stroke();
    } else {
      roundRect(c, dst.x, dst.y, dst.w, dst.h, Math.min(16, dst.w / 4, dst.h / 4));
      c.stroke();
    }
  }

  function drawZoomBadge(dst, zoom) {
    const text = `${zoom.toFixed(1)}×`;
    c.save();
    c.font = '12px "Segoe UI", sans-serif';
    const tw = c.measureText(text).width;
    const pad = 6;
    const bw = tw + pad * 2;
    const bh = 20;
    /* circles: sit the badge on the rim (bottom-right diagonal) instead of
       hanging below the bounding box */
    const bx = lens.shape === 'circle'
      ? dst.x + dst.w * 0.72 - bw / 2
      : Math.min(dst.x + dst.w - bw - 2, window.innerWidth - bw - 4) || 8;
    const by = lens.shape === 'circle'
      ? dst.y + dst.h * 0.72 - bh / 2
      : dst.y + dst.h + 6;
    const bY = by + bh + 4 > window.innerHeight ? Math.max(4, dst.y - bh - 6) : by;
    c.globalAlpha = 0.85;
    c.fillStyle = '#16181b';
    roundRect(c, Math.max(4, bx), Math.max(4, bY), bw, bh, 6);
    c.fill();
    c.globalAlpha = 1;
    c.fillStyle = '#f2f3f5';
    c.textBaseline = 'middle';
    c.fillText(text, Math.max(4, bx) + pad, Math.max(4, bY) + bh / 2 + 1);
    c.restore();
  }

  B.onInit(p => {
    origin = p.origin || origin;
    if (p.lens) lens = { ...lens, ...p.lens };
    B.displayed();
  });

  B.onLensSettings(next => {
    if (next) lens = { ...lens, ...next };
    tick();
  });

  B.onCursor(pt => {
    if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
      cursor = pt;
      tick();
    }
  });

  B.onFrame(p => {
    if (!p || typeof p.jpeg !== 'string') return;
    if (!frame.img) {
      frame.img = new Image();
      frame.img.onload = () => {
        /* meta flips only when the pixels it describes are actually shown */
        frame.meta = frame.pending;
        tick();
      };
    }
    frame.pending = p;
    frame.img.src = p.jpeg;
  });

  B.ready();
})();
