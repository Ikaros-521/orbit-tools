/* Region selection inside a fullscreen transparent overlay.
   All coordinates are CSS px == DIP for this display, which is exactly what
   the backend needs to crop (×scaleFactor) and place the pin (+display). */
(() => {
  const shot = document.getElementById('shot');
  const box = document.getElementById('box');
  const hole = document.getElementById('hole');
  const sizeEl = document.getElementById('size');

  let start = null;
  let now = null;

  window.overlay.onImage(({ image }) => { shot.src = image; });
  window.overlay.ready();

  const norm = () => ({
    x: Math.min(start.x, now.x), y: Math.min(start.y, now.y),
    width: Math.abs(now.x - start.x), height: Math.abs(now.y - start.y),
  });

  const paint = () => {
    const r = norm();
    hole.style.left = `${r.x}px`;
    hole.style.top = `${r.y}px`;
    hole.style.width = `${r.width}px`;
    hole.style.height = `${r.height}px`;
    sizeEl.style.left = `${r.x + r.width / 2}px`;
    sizeEl.style.top = `${r.y}px`;
    sizeEl.textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
  };

  window.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY };
    now = { ...start };
    box.hidden = false;
    document.body.classList.add('dragging');
    paint();
  });
  window.addEventListener('mousemove', e => {
    if (!start) return;
    now = { x: e.clientX, y: e.clientY };
    paint();
  });
  window.addEventListener('mouseup', e => {
    if (e.button !== 0 || !start) return;
    const r = norm();
    start = null;
    document.body.classList.remove('dragging');
    if (r.width < 6 || r.height < 6) { box.hidden = true; return; } // treat as a click
    window.overlay.select({ x: r.x, y: r.y, width: r.width, height: r.height });
  });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') window.overlay.cancel();
  });
  window.addEventListener('contextmenu', e => { e.preventDefault(); window.overlay.cancel(); });
})();
