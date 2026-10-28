const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, cond) => {
  results.push([name, !!cond]);
  console.log(cond ? '  PASS:' : '  FAIL:', name);
};

app.on('window-all-closed', e => e.preventDefault());

app.whenReady().then(async () => {
  console.log('\n--- Testing draw-board pin & background mode differentiation ---');

  let lastPinPayload = null;
  ipcMain.handle('draw-board:pin', async (e, payload) => {
    lastPinPayload = payload;
    return { ok: true };
  });

  const boardWin = new BrowserWindow({
    width: 900,
    height: 600,
    useContentSize: true,
    frame: false,
    show: false,
    webPreferences: { preload: path.join(ROOT, 'src/plugins/draw-board/board-preload.js') },
  });
  await boardWin.loadFile(path.join(ROOT, 'src/plugins/draw-board/board.html'));
  await sleep(400);

  // 1. Verify toolbar buttons
  const hasPinBgBtn = await boardWin.webContents.executeJavaScript(`!!document.querySelector('[data-act="pin"]')`);
  const hasPinTransBtn = await boardWin.webContents.executeJavaScript(`!!document.querySelector('[data-act="pin-transparent"]')`);
  check('draw-board has with-background pin button', hasPinBgBtn);
  check('draw-board has transparent pin button', hasPinTransBtn);

  // 2. Test pin with NO strokes -> should be FULL SCREEN, NOT 65%
  await boardWin.webContents.executeJavaScript(`document.querySelector('[data-act="pin"]').click()`);
  await sleep(150);
  const actualW = await boardWin.webContents.executeJavaScript(`window.innerWidth`);
  const actualH = await boardWin.webContents.executeJavaScript(`window.innerHeight`);
  console.log('board actual inner dimensions:', actualW, actualH, 'lastPinPayload bounds:', lastPinPayload && lastPinPayload.bounds);
  check('empty board pins full width (not 65%)', lastPinPayload && lastPinPayload.bounds && lastPinPayload.bounds.width === actualW);
  check('empty board pins full height (not 65%)', lastPinPayload && lastPinPayload.bounds && lastPinPayload.bounds.height === actualH);
  check('pin with background has withBg=true', lastPinPayload && lastPinPayload.withBg === true);
  check('pin payload provides both fullImage and inkImage', lastPinPayload && !!lastPinPayload.fullImage && !!lastPinPayload.inkImage);

  // 3. Draw a stroke and test transparent pin button
  await boardWin.webContents.executeJavaScript(`(() => {
    document.querySelector('[data-tool="rect"]').click();
    const ink = document.getElementById('ink');
    ink.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 150, button: 0 }));
    ink.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 400, clientY: 350, button: 0 }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 400, clientY: 350, button: 0 }));
  })()`);
  await sleep(150);

  lastPinPayload = null;
  await boardWin.webContents.executeJavaScript(`document.querySelector('[data-act="pin-transparent"]').click()`);
  await sleep(150);
  check('transparent pin button triggers withBg=false', lastPinPayload && lastPinPayload.withBg === false);
  check('cropped bounds tightly cover the stroke', lastPinPayload && lastPinPayload.bounds && lastPinPayload.bounds.width < 900 && lastPinPayload.bounds.width > 200);

  // 4. Test stroke near the right & bottom edge does NOT overflow bounds
  await boardWin.webContents.executeJavaScript(`(() => {
    document.querySelector('[data-tool="pen"]').click();
    const ink = document.getElementById('ink');
    ink.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 880, clientY: 580, button: 0 }));
    ink.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 895, clientY: 595, button: 0 }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 895, clientY: 595, button: 0 }));
  })()`);
  await sleep(150);

  lastPinPayload = null;
  await boardWin.webContents.executeJavaScript(`document.querySelector('[data-act="pin"]').click()`);
  await sleep(150);
  const b = lastPinPayload && lastPinPayload.bounds;
  console.log('edge stroke lastPinPayload bounds:', b, 'actualW:', actualW);
  check('edge stroke crop does not exceed screen width', b && (b.x + b.width <= actualW));
  check('edge stroke crop does not exceed screen height', b && (b.y + b.height <= actualH));

  // 5. Test pin.html window container & DPR adaptivity
  console.log('\n--- Testing pin.html window adaptivity and background switching ---');
  const pinWin = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    webPreferences: { preload: path.join(ROOT, 'src/plugins/draw-board/pin-preload.js') },
  });
  await pinWin.loadFile(path.join(ROOT, 'src/plugins/draw-board/pin.html'));
  await sleep(300);

  // Send init with high-res image (simulating 1.5x DPR: 600x450 in 400x300 window)
  const dummyInk = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const dummyFull = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEUlEQVR42mNk+M8ABowMDAwAFwgB/6P7Tf8AAAAASUVORK5CYII=';

  // Initialize as transparent pin (withBg: false)
  await pinWin.webContents.send('draw-board:pin-init', {
    image: dummyInk,
    inkImage: dummyInk,
    fullImage: dummyFull,
    withBg: false,
  });
  await sleep(200);

  const isWrapNoBg = await pinWin.webContents.executeJavaScript(`document.getElementById('wrap').classList.contains('no-bg')`);
  check('transparent pin adds no-bg class to wrap', isWrapNoBg);

  const wrapStyleWidth = await pinWin.webContents.executeJavaScript(`document.getElementById('wrap').style.width`);
  check('wrap does not hardcode naturalWidth pixel (avoids DPR truncation)', wrapStyleWidth === '' || wrapStyleWidth === '100%');

  // Switch to with-background mode via IPC action
  await pinWin.webContents.send('draw-board:set-bg-mode', true);
  await sleep(100);
  const hasBgClassNow = await pinWin.webContents.executeJavaScript(`!document.getElementById('wrap').classList.contains('no-bg')`);
  check('switching bg mode removes no-bg class', hasBgClassNow);

  // Switch back to transparent
  await pinWin.webContents.send('draw-board:set-bg-mode', false);
  await sleep(100);
  const backToNoBg = await pinWin.webContents.executeJavaScript(`document.getElementById('wrap').classList.contains('no-bg')`);
  check('switching back restores no-bg class', backToNoBg);

  boardWin.destroy();
  pinWin.destroy();

  const failed = results.filter(r => !r[1]);
  console.log(`\n========================================`);
  console.log(`TEST SUMMARY: ${results.length - failed.length}/${results.length} PASSED`);
  if (failed.length > 0) {
    console.error(`FAILED TESTS (${failed.length}):`, failed.map(f => f[0]));
    app.exit(1);
  } else {
    console.log('ALL DRAW-BOARD PIN TESTS PASSED!');
    app.exit(0);
  }
});
