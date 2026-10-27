/* Pinned screenshot window: wheel zooms around the cursor, ◐ cycles opacity,
   the whole surface drags the window (native -webkit-app-region). */
(() => {
  const img = document.getElementById('img');
  const bar = document.getElementById('bar');

  let dataUrl = '';
  let scale = 1;
  const OPACITIES = [1, 0.75, 0.5, 0.3];
  let opIdx = 0;

  window.pin.onInit(({ image }) => {
    dataUrl = image;
    img.src = image;
  });

  /* zoom via wheel, anchored at the cursor */
  img.style.transformOrigin = 'center center';
  window.addEventListener('wheel', e => {
    e.preventDefault();
    const next = Math.min(8, Math.max(0.2, scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    scale = next;
    img.style.transform = `scale(${scale})`;
  }, { passive: false });

  /* double-click resets zoom */
  window.addEventListener('dblclick', () => {
    scale = 1;
    img.style.transform = 'scale(1)';
  });

  bar.addEventListener('click', async e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'close') window.pin.close();
    else if (act === 'copy') {
      if (!dataUrl) return;
      window.pin.copy(dataUrl);
      bar.classList.add('flash');
      setTimeout(() => bar.classList.remove('flash'), 700);
    } else if (act === 'save') {
      if (!dataUrl) return;
      b.disabled = true;
      await window.pin.save(dataUrl);
      b.disabled = false;
    } else if (act === 'dim') {
      opIdx = (opIdx + 1) % OPACITIES.length;
      img.style.opacity = String(OPACITIES[opIdx]);
    } else if (act === 'zoom0') {
      scale = 1;
      img.style.transform = 'scale(1)';
    }
  });
})();
