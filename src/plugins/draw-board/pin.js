(() => {
  const stage = document.getElementById('stage');
  const wrap = document.getElementById('wrap');
  const img = document.getElementById('img');
  const badge = document.getElementById('badge');

  let dataUrl = '';
  let scale = 1;
  let isMoving = false;
  let badgeTimer = null;

  function showBadge(text) {
    if (!badge) return;
    badge.textContent = text;
    badge.hidden = false;
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => { badge.hidden = true; }, 1000);
  }

  window.pin.onInit(({ image }) => {
    dataUrl = image;
    img.src = image;
  });

  img.onload = () => {
    wrap.style.width = `${img.naturalWidth}px`;
    wrap.style.height = `${img.naturalHeight}px`;
  };

  // --- window dragging ---
  stage.addEventListener('pointerdown', e => {
    if (e.button === 0) {
      isMoving = true;
      stage.classList.add('moving');
      stage.setPointerCapture(e.pointerId);
      window.pin.startMove(e.screenX, e.screenY);
    }
  });

  stage.addEventListener('pointermove', e => {
    if (isMoving) {
      window.pin.move(e.screenX, e.screenY);
    }
  });

  const stopMove = e => {
    if (isMoving) {
      isMoving = false;
      stage.classList.remove('moving');
      try { stage.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      window.pin.endMove();
    }
  };

  stage.addEventListener('pointerup', stopMove);
  stage.addEventListener('pointercancel', stopMove);

  // Double click to close
  stage.addEventListener('dblclick', () => {
    window.pin.close();
  });

  // Right click native context menu
  stage.addEventListener('contextmenu', e => {
    e.preventDefault();
    window.pin.showMenu();
  });

  // --- zoom with wheel ---
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.2, Math.min(5.0, scale * factor));
    if (newScale !== scale) {
      scale = newScale;
      wrap.style.transform = `scale(${scale})`;
      showBadge(`${Math.round(scale * 100)}%`);
    }
  }, { passive: false });

  // --- menu actions from backend ---
  window.pin.onAction('trigger-copy', () => {
    if (dataUrl) {
      window.pin.copy(dataUrl);
      showBadge('✓ 已复制到剪贴板');
    }
  });

  window.pin.onAction('trigger-save', () => {
    if (dataUrl) window.pin.save(dataUrl);
  });

  window.pin.onAction('reset-zoom', () => {
    scale = 1;
    wrap.style.transform = 'scale(1)';
    showBadge('100%');
  });

  window.pin.onAction('set-opacity', opacity => {
    wrap.style.opacity = String(opacity);
    showBadge(`透明度 ${Math.round(opacity * 100)}%`);
  });

  // --- keyboard shortcuts ---
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      window.pin.close();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      if (dataUrl) {
        window.pin.copy(dataUrl);
        showBadge('✓ 已复制');
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (dataUrl) window.pin.save(dataUrl);
    }
  });

  window.pin.ready();
})();
