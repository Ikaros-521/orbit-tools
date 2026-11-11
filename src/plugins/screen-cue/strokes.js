/* Shared stroke renderer for the ink (passive) and draw (active) layers.
   Strokes live in global DIP screen coordinates; each layer subtracts its
   own display origin to land in local canvas space. Loaded via <script>
   before ink.js / draw.js — no module system inside plugin windows. */
(function () {
  function drawStroke(c, s, origin, alpha) {
    const ox = (origin && origin.x) || 0;
    const oy = (origin && origin.y) || 0;
    const tool = s.tool;
    c.save();
    c.globalAlpha = Math.max(0, Math.min(1, alpha)) * (tool === 'highlighter' ? 0.35 : 1);
    c.strokeStyle = s.color;
    c.lineWidth = tool === 'highlighter' ? Math.max(10, s.width * 3) : s.width;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    if (tool === 'pen' || tool === 'highlighter') {
      c.beginPath();
      c.moveTo(s.pts[0].x - ox, s.pts[0].y - oy);
      for (let i = 1; i < s.pts.length; i++) c.lineTo(s.pts[i].x - ox, s.pts[i].y - oy);
      c.stroke();
    } else if (tool === 'rect') {
      c.strokeRect(
        Math.min(s.a.x, s.b.x) - ox, Math.min(s.a.y, s.b.y) - oy,
        Math.abs(s.b.x - s.a.x), Math.abs(s.b.y - s.a.y)
      );
    } else if (tool === 'ellipse') {
      c.beginPath();
      c.ellipse(
        (s.a.x + s.b.x) / 2 - ox, (s.a.y + s.b.y) / 2 - oy,
        Math.abs(s.b.x - s.a.x) / 2, Math.abs(s.b.y - s.a.y) / 2,
        0, 0, Math.PI * 2
      );
      c.stroke();
    } else if (tool === 'arrow') {
      const ax = s.a.x - ox, ay = s.a.y - oy;
      const bx = s.b.x - ox, by = s.b.y - oy;
      const ang = Math.atan2(by - ay, bx - ax);
      const head = Math.max(10, s.width * 2.5);
      c.beginPath();
      c.moveTo(ax, ay);
      c.lineTo(bx, by);
      c.moveTo(bx - head * Math.cos(ang - Math.PI / 6), by - head * Math.sin(ang - Math.PI / 6));
      c.lineTo(bx, by);
      c.lineTo(bx - head * Math.cos(ang + Math.PI / 6), by - head * Math.sin(ang + Math.PI / 6));
      c.stroke();
    }
    c.restore();
  }

  window.CueStrokes = { drawStroke };
})();
