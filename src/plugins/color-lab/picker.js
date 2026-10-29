/* color-lab picker overlay renderer.
   Two sampling paths share one HUD:
   - freeze: backend probe over the untouched nativeImage (pixel-exact)
   - live:   a getUserMedia desktop stream, sampled from a canvas every ~33ms
             (for videos / animations); the overlay window is content-protected
             so it never captures itself.
   Mouse position → sample → magnifier canvas + live values. Arrow keys nudge
   one physical pixel, [ ] changes the magnification, the wheel scrolls the
   page in live mode, click picks, Esc / right click cancels. */
(function () {
  'use strict';
  const CM = window.ColorMath;
  const img = document.getElementById('shot');
  const video = document.getElementById('live');
  const body = document.body;
  const cross = document.getElementById('cross');
  const hud = document.getElementById('hud');
  const hintEl = document.getElementById('hintText');
  const zoomCanvas = document.getElementById('zoom');
  const zctx = zoomCanvas.getContext('2d');
  const small = document.createElement('canvas');
  const sctx = small.getContext('2d', { willReadFrequently: true });
  const hexEl = document.getElementById('hex');
  const alphaEl = document.getElementById('alpha');
  const rgbEl = document.getElementById('rgb');
  const rgbaEl = document.getElementById('rgba');
  const hslEl = document.getElementById('hsl');
  const coordEl = document.getElementById('coord');
  const swatchEl = document.getElementById('swatch');

  const HINTS = {
    freeze: '单击取色 · 方向键微调 · [ ] 缩放 · Esc / 右键取消',
    live: '动态取色 · 滚轮翻页 · Ctrl+Shift+↑↓ 缩放 · 单击取色 · 右键取消',
  };

  const vTop = document.createElement('i');
  vTop.className = 'v';
  const vBottom = document.createElement('i');
  vBottom.className = 'v';
  const hLeft = document.createElement('i');
  hLeft.className = 'h';
  const hRight = document.createElement('i');
  hRight.className = 'h';
  cross.append(vTop, vBottom, hLeft, hRight);

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const GRID = 19;
  const GAP = 12; // crosshair gap around the sampled pixel
  const ZOOMS = [6, 8, 10, 12, 14, 16, 20];

  let pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let virtual = null;      // set by arrow keys, cleared by the mouse
  let scale = { x: 1, y: 1 };
  let zoom = 10;
  let seq = 0;
  let rafId = 0;
  let ready = false;
  let done = false;
  let shown = false;
  let placeAfterDraw = false;
  let lastColor = null;

  let mode = 'freeze';
  let initPayload = null;
  let liveReady = false;
  let liveRaf = 0;
  let liveStream = null;
  let liveGdi = false;
  let playPending = false;
  let lastClock = -1;
  let lastClockAt = 0;

  const zoomOutBtn = document.getElementById('zoomOut');
  const zoomInBtn = document.getElementById('zoomIn');
  for (const [btn, delta] of [[zoomOutBtn, -1], [zoomInBtn, 1]]) {
    if (!btn) continue;
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      changeZoom(delta);
    });
  }

  function moveCross(x, y) {
    const topH = Math.max(0, y - GAP);
    const bottomY = Math.min(window.innerHeight, y + GAP);
    const leftW = Math.max(0, x - GAP);
    const rightX = Math.min(window.innerWidth, x + GAP);
    vTop.style.cssText = `left:${x}px;top:0;height:${topH}px`;
    vBottom.style.cssText = `left:${x}px;top:${bottomY}px;bottom:0`;
    hLeft.style.cssText = `top:${y}px;left:0;width:${leftW}px`;
    hRight.style.cssText = `top:${y}px;left:${rightX}px;right:0`;
  }

  function placeHud() {
    if (hud.hidden) return;
    const w = hud.offsetWidth || 220;
    const h = hud.offsetHeight || 300;
    const gap = 22;
    let x = pos.x + gap;
    let y = pos.y + gap;
    if (x + w > window.innerWidth - 10) x = pos.x - gap - w;
    if (y + h > window.innerHeight - 10) y = pos.y - gap - h;
    x = clamp(x, 10, Math.max(10, window.innerWidth - w - 10));
    y = clamp(y, 10, Math.max(10, window.innerHeight - h - 10));
    hud.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  }

  function requestProbe() {
    if (!ready || done) return;
    if (mode === 'live') {
      if (!liveGdi) sampleLive();
      return;
    }
    const mine = ++seq;
    window.picker.probe(pos.x, pos.y).then(res => {
      if (!res || mine !== seq || done) return;
      draw(res);
    }).catch(() => { /* window is closing */ });
  }

  function scheduleProbe() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      requestProbe();
    });
  }

  function draw(res) {
    const g = res.grid;
    if (!g || !g.width || !g.height) return;
    const src = g.data instanceof Uint8Array || g.data instanceof Uint8ClampedArray
      ? g.data : new Uint8Array(g.data);
    let pixels;
    if (g.bgra === false) {
      pixels = src instanceof Uint8ClampedArray ? src : new Uint8ClampedArray(src);
    } else {
      // backend nativeImage bitmaps are BGRA
      pixels = new Uint8ClampedArray(g.width * g.height * 4);
      for (let i = 0, o = 0; i < g.width * g.height; i++, o += 4) {
        pixels[o] = src[o + 2];
        pixels[o + 1] = src[o + 1];
        pixels[o + 2] = src[o];
        pixels[o + 3] = 255;
      }
    }
    small.width = g.width;
    small.height = g.height;
    sctx.putImageData(new ImageData(pixels, g.width, g.height), 0, 0);

    const size = g.width * zoom;
    const height = g.height * zoom;
    zoomCanvas.width = size;
    zoomCanvas.height = height;
    zoomCanvas.style.width = `${size}px`;
    zoomCanvas.style.height = `${height}px`;
    zctx.imageSmoothingEnabled = false;
    zctx.clearRect(0, 0, size, height);
    zctx.drawImage(small, 0, 0, size, height);

    // one hairline per physical pixel boundary
    zctx.lineWidth = 1;
    zctx.strokeStyle = 'rgba(255, 255, 255, .16)';
    for (let i = 1; i < g.width; i++) {
      zctx.beginPath();
      zctx.moveTo(i * zoom + 0.5, 0);
      zctx.lineTo(i * zoom + 0.5, height);
      zctx.stroke();
    }
    for (let j = 1; j < g.height; j++) {
      zctx.beginPath();
      zctx.moveTo(0, j * zoom + 0.5);
      zctx.lineTo(size, j * zoom + 0.5);
      zctx.stroke();
    }

    // the sampled pixel: dark outer ring + white inner ring reads on any color
    const cx = g.cx * zoom;
    const cy = g.cy * zoom;
    zctx.lineWidth = 3;
    zctx.strokeStyle = 'rgba(0, 0, 0, .65)';
    zctx.strokeRect(cx - 1.5, cy - 1.5, zoom + 3, zoom + 3);
    zctx.lineWidth = 1.5;
    zctx.strokeStyle = '#fff';
    zctx.strokeRect(cx + 0.5, cy + 0.5, zoom - 1, zoom - 1);

    const c = res.color;
    const col = { r: c.r, g: c.g, b: c.b, a: c.a };
    lastColor = col;
    hexEl.textContent = CM.format(col, 'hex');
    alphaEl.textContent = `A ${col.a}`;
    rgbEl.textContent = `R ${col.r}  G ${col.g}  B ${col.b}`;
    rgbaEl.textContent = CM.format(col, 'rgba');
    hslEl.textContent = CM.format(col, 'hsl');
    coordEl.textContent = `X ${res.screen.x}  Y ${res.screen.y}`;
    swatchEl.style.setProperty('--sw', CM.format({ ...col, a: 255 }, 'rgba'));
    if (res.scale && res.scale.x) scale = res.scale;

    if (hud.hidden || placeAfterDraw) {
      hud.hidden = false;
      placeAfterDraw = false;
      placeHud();
    }
  }

  /* --- live sampling -------------------------------------------------------- */

  function stopLiveLoop() {
    if (liveRaf) {
      cancelAnimationFrame(liveRaf);
      liveRaf = 0;
    }
  }

  // A video element started while the window is hidden may stay paused after
  // show() — the first frame renders, so the screen LOOKS frozen. Re-play it
  // whenever the window becomes visible and on every loop tick while paused.
  function ensurePlaying() {
    if (mode !== 'live' || done || !video.srcObject || playPending || !video.paused) return;
    playPending = true;
    const p = video.play();
    if (p && typeof p.finally === 'function') p.catch(() => {}).finally(() => { playPending = false; });
    else playPending = false;
  }

  // Desktop video can stall (paused=false but currentTime frozen) after the
  // window was hidden/occluded. Kick pause/play when the clock stops moving.
  function watchClock() {
    const t = video.currentTime;
    const now = performance.now();
    if (t !== lastClock) {
      lastClock = t;
      lastClockAt = now;
      return;
    }
    if (now - lastClockAt > 1200 && !video.paused) {
      lastClockAt = now;
      try { video.pause(); } catch { /* ignore */ }
      playPending = false;
      ensurePlaying();
    }
  }

  function changeZoom(delta) {
    const i = ZOOMS.indexOf(zoom);
    const next = clamp((i < 0 ? ZOOMS.indexOf(10) : i) + delta, 0, ZOOMS.length - 1);
    if (ZOOMS[next] !== zoom) {
      zoom = ZOOMS[next];
      placeAfterDraw = true;
      scheduleProbe();
    }
  }

  function stopLive() {
    stopLiveLoop();
    liveReady = false;
    liveGdi = false;
    body.classList.remove('gdi');
    if (liveStream) {
      for (const track of liveStream.getTracks()) track.stop();
      liveStream = null;
    }
    video.srcObject = null;
    body.classList.remove('live');
  }

  function sampleLive() {
    if (!liveReady || done) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    const dipW = (initPayload && initPayload.dipWidth) || window.innerWidth;
    const dipH = (initPayload && initPayload.dipHeight) || window.innerHeight;
    const sx = vw / dipW;
    const sy = vh / dipH;
    const px = clamp(Math.round(pos.x * sx), 0, vw - 1);
    const py = clamp(Math.round(pos.y * sy), 0, vh - 1);
    const gw = Math.min(GRID, vw);
    const gh = Math.min(GRID, vh);
    const gx = clamp(px - Math.floor(gw / 2), 0, Math.max(0, vw - gw));
    const gy = clamp(py - Math.floor(gh / 2), 0, Math.max(0, vh - gh));
    small.width = gw;
    small.height = gh;
    try {
      sctx.drawImage(video, gx, gy, gw, gh, 0, 0, gw, gh);
    } catch {
      return;
    }
    let data;
    try {
      data = sctx.getImageData(0, 0, gw, gh).data;
    } catch {
      return;
    }
    const cx = px - gx;
    const cy = py - gy;
    const o = (cy * gw + cx) * 4;
    const color = { r: data[o], g: data[o + 1], b: data[o + 2], a: data[o + 3] };
    const origin = (initPayload && initPayload.origin) || { x: 0, y: 0 };
    draw({
      color,
      grid: { width: gw, height: gh, cx, cy, data, bgra: false },
      physical: { x: px, y: py },
      scale: { x: sx, y: sy },
      screen: { x: Math.round(origin.x + pos.x), y: Math.round(origin.y + pos.y) },
    });
  }

  function startLiveLoop() {
    stopLiveLoop();
    let last = 0;
    const tick = ts => {
      if (done || mode !== 'live' || !liveReady) return;
      if (video.paused) ensurePlaying();
      watchClock();
      if (ts - last >= 33) {
        last = ts;
        sampleLive();
      }
      liveRaf = requestAnimationFrame(tick);
    };
    liveRaf = requestAnimationFrame(tick);
  }

  function waitVisible() {
    if (document.visibilityState === 'visible') return Promise.resolve();
    return new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        document.removeEventListener('visibilitychange', onChange);
        resolve();
      };
      const onChange = () => { if (document.visibilityState === 'visible') finish(); };
      document.addEventListener('visibilitychange', onChange);
      setTimeout(finish, 600);
    });
  }

  async function startLive(payload) {
    stopLive();
    mode = 'live';
    // Show the still-transparent overlay BEFORE opening the stream: a video
    // started in a hidden window can freeze its playback clock on Windows,
    // which looks exactly like the old frozen-frame mode.
    if (!shown) { shown = true; window.picker.displayed(); }
    hintEl.textContent = '正在连接屏幕…';
    await waitVisible();
    await new Promise(r => setTimeout(r, 80));
    if (done) return;
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      window.picker.liveFailed();
      return;
    }
    const baseVideo = {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: payload.sourceId,
        maxWidth: Math.round(payload.width || 3840),
        maxHeight: Math.round(payload.height || 2160),
        maxFrameRate: 30,
      },
    };
    try {
      try {
        // skips the browser's color-space conversion, which otherwise washes
        // saturated colors out through the desktop video pipeline
        liveStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { ...baseVideo, colorSpaceConversion: 'none' },
        });
      } catch {
        // some platforms reject the optional constraint outright
        liveStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: baseVideo });
      }
      video.srcObject = liveStream;
      await video.play();
      await new Promise(resolve => {
        if (video.readyState >= 2) { resolve(); return; }
        video.addEventListener('loadeddata', resolve, { once: true });
        setTimeout(resolve, 600);
      });
      if (done) return;
      body.classList.add('live');
      hintEl.textContent = HINTS.live;
      liveReady = true;
      ready = true;
      if (payload.cursor && payload.cursor.inside) {
        pos.x = clamp(payload.cursor.x, 0, window.innerWidth - 1);
        pos.y = clamp(payload.cursor.y, 0, window.innerHeight - 1);
        moveCross(pos.x, pos.y);
      }
      ensurePlaying();
      startLiveLoop();
      // the window is shown asynchronously by the backend; a second nudge after
      // it is definitely visible covers builds where visibilitychange is late
      setTimeout(() => {
        if (!done && mode === 'live') {
          ensurePlaying();
          startLiveLoop();
        }
      }, 150);
    } catch {
      window.picker.liveFailed();
    }
  }

  function loadFreeze(payload) {
    stopLive();
    mode = 'freeze';
    body.classList.remove('live');
    hintEl.textContent = HINTS.freeze;
    ready = false;
    const reveal = () => {
      if (done) return;
      ready = true;
      if (!shown) { shown = true; window.picker.displayed(); }
      if (payload.cursor && payload.cursor.inside) {
        pos.x = clamp(payload.cursor.x, 0, window.innerWidth - 1);
        pos.y = clamp(payload.cursor.y, 0, window.innerHeight - 1);
        moveCross(pos.x, pos.y);
      }
      scheduleProbe();
    };
    img.onload = reveal;
    img.onerror = () => {
      if (done) return;
      ready = true;
      if (!shown) { shown = true; window.picker.displayed(); }
    };
    img.src = payload.image;
  }

  function startGdiLive(payload) {
    stopLive();
    mode = 'live';
    liveGdi = true;
    body.classList.remove('live');
    body.classList.add('gdi');
    hintEl.textContent = HINTS.live;
    ready = true;
    liveReady = true;
    if (!shown) { shown = true; window.picker.displayed(); }
    if (payload.cursor && payload.cursor.inside) {
      pos.x = clamp(payload.cursor.x, 0, window.innerWidth - 1);
      pos.y = clamp(payload.cursor.y, 0, window.innerHeight - 1);
      moveCross(pos.x, pos.y);
    }
    if (payload.scaleFactor) scale = { x: payload.scaleFactor, y: payload.scaleFactor };
  }

  function onLiveFrame(payload) {
    if (done || mode !== 'live' || !liveGdi || !payload) return;
    const b = initPayload && initPayload.bounds;
    const d = payload.dip;
    if (b && d && (d.x < b.x || d.x >= b.x + b.width || d.y < b.y || d.y >= b.y + b.height)) return;
    const data = payload.data instanceof Uint8Array ? payload.data : new Uint8Array(payload.data);
    if (data.length !== GRID * GRID * 4) return;
    const cx = clamp(payload.cursor.x - payload.x0, 0, GRID - 1);
    const cy = clamp(payload.cursor.y - payload.y0, 0, GRID - 1);
    const o = (cy * GRID + cx) * 4;
    const color = { r: data[o + 2], g: data[o + 1], b: data[o], a: data[o + 3] };
    const origin = (initPayload && initPayload.origin) || { x: 0, y: 0 };
    const sf = (initPayload && initPayload.scaleFactor) || 1;
    draw({
      color,
      grid: { width: GRID, height: GRID, cx, cy, data, bgra: true },
      physical: { x: payload.cursor.x, y: payload.cursor.y },
      scale: { x: sf, y: sf },
      screen: { x: Math.round(origin.x + pos.x), y: Math.round(origin.y + pos.y) },
    });
  }

  function applyInit(payload) {
    initPayload = payload;
    if (payload.mode === 'live-gdi') startGdiLive(payload);
    else if (payload.mode === 'live') startLive(payload);
    else loadFreeze(payload);
  }

  /* --- picking / cancelling -------------------------------------------------- */

  function pick() {
    if (done || !ready) return;
    if (mode === 'live' && !liveReady) return;
    // refresh the live sample at the exact click position before sending it
    if (mode === 'live' && !liveGdi) sampleLive();
    done = true;
    hud.hidden = true;
    window.picker.pick(pos.x, pos.y, mode === 'live' ? lastColor : null);
  }

  function cancel() {
    if (done) return;
    done = true;
    window.picker.cancel();
  }

  /* --- input ---------------------------------------------------------------- */

  window.addEventListener('mousemove', e => {
    if (done) return;
    virtual = null;
    pos.x = clamp(e.clientX, 0, window.innerWidth - 1);
    pos.y = clamp(e.clientY, 0, window.innerHeight - 1);
    moveCross(pos.x, pos.y);
    placeHud();
    scheduleProbe();
  });

  window.addEventListener('mousedown', e => {
    if (done) return;
    e.preventDefault();
    if (e.button === 0) pick();
    else if (e.button === 2) cancel();
  });

  window.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('mouseenter', () => {
    // live mode deliberately never takes focus (the page keeps it so the wheel
    // scrolls); only the freeze overlay wants keyboard focus
    if (!done && mode === 'freeze') window.picker.focus();
  });

  window.addEventListener('wheel', e => {
    if (done) return;
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if (done) return;
    if (e.key === 'Escape') { e.preventDefault(); cancel(); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); return; }
    if (e.key === '[' || e.key === '-' || e.key === '_') { e.preventDefault(); changeZoom(-1); return; }
    if (e.key === ']' || e.key === '=' || e.key === '+') { e.preventDefault(); changeZoom(1); return; }
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    if (liveGdi) return; // live frames are centred on the OS cursor
    const step = e.shiftKey ? 10 : 1; // physical pixels
    if (!virtual) virtual = { x: pos.x, y: pos.y };
    virtual.x = clamp(virtual.x + (d[0] * step) / (scale.x || 1), 0, window.innerWidth - 1);
    virtual.y = clamp(virtual.y + (d[1] * step) / (scale.y || 1), 0, window.innerHeight - 1);
    pos.x = virtual.x;
    pos.y = virtual.y;
    moveCross(pos.x, pos.y);
    placeHud();
    scheduleProbe();
  });

  /* --- boot ------------------------------------------------------------------ */

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || done || mode !== 'live') return;
    ensurePlaying();
    startLiveLoop();
  });

  window.picker.onInit(applyInit);
  window.picker.onLiveFrame(onLiveFrame);
  window.picker.onZoom(payload => {
    if (!done && payload) changeZoom(payload.delta > 0 ? 1 : -1);
  });
  window.picker.ready();
})();
