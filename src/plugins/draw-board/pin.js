(() => {
  const stage = document.getElementById('stage');
  const wrap = document.getElementById('wrap');
  const img = document.getElementById('img');
  const badge = document.getElementById('badge');

  let dataUrl = '';
  let fullDataUrl = '';
  let inkDataUrl = '';
  let withBg = true;
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

  function applyBgMode(hasBg) {
    withBg = !!hasBg;
    if (withBg) {
      wrap.classList.remove('no-bg');
      dataUrl = fullDataUrl || dataUrl;
    } else {
      wrap.classList.add('no-bg');
      dataUrl = inkDataUrl || dataUrl;
    }
    if (dataUrl && img.src !== dataUrl) {
      img.src = dataUrl;
    }
  }

  window.pin.onInit(payload => {
    if (typeof payload === 'string') {
      dataUrl = payload;
      fullDataUrl = payload;
      inkDataUrl = payload;
      withBg = true;
    } else if (payload && typeof payload === 'object') {
      fullDataUrl = payload.fullImage || payload.image || payload.dataUrl || '';
      inkDataUrl = payload.inkImage || payload.image || payload.dataUrl || '';
      dataUrl = payload.image || payload.dataUrl || fullDataUrl || inkDataUrl;
      withBg = payload.withBg !== false;
    }
    applyBgMode(withBg);
  });

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

  window.pin.onAction('set-bg-mode', hasBg => {
    applyBgMode(hasBg);
    showBadge(hasBg ? '已开启：带背景卡片' : '已开启：透明底标注');
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
