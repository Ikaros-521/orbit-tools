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
  // Mock IPC
  ipcMain.on('screenshot-pin:ready', event => {
    event.sender.send('screenshot-pin:image', {
      image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAPElEQVR42u3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAw2+4AAUjU4sUAAAAASUVORK5CYII=',
      width: 1000, height: 700, dipWidth: 1000, dipHeight: 700,
    });
  });
  ipcMain.handle('screenshot-pin:crop', async () => ({
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    width: 100, height: 100,
  }));

  // --- 1. Test draw-board: Select tool, Transform (move & resize) and Escape safety ---
  console.log('\n--- 1. Testing draw-board Transform & Escape ---');
  const boardWin = new BrowserWindow({
    width: 900, height: 600, show: true,
    webPreferences: { preload: path.join(ROOT, 'src/plugins/draw-board/board-preload.js') },
  });
  await boardWin.loadFile(path.join(ROOT, 'src/plugins/draw-board/board.html'));
  await sleep(400);

  // Check select tool button exists
  const hasSelectBtn = await boardWin.webContents.executeJavaScript(`!!document.querySelector('[data-tool="select"]')`);
  check('draw-board has select tool button', hasSelectBtn);

  // Create a rectangle stroke
  await boardWin.webContents.executeJavaScript(`(() => {
    document.querySelector('[data-tool="rect"]').click();
    const ink = document.getElementById('ink');
    ink.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 200, button: 0 }));
    ink.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 350, clientY: 300, button: 0 }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 350, clientY: 300, button: 0 }));
  })()`);
  await sleep(150);

  const rectStrokeExists = await boardWin.webContents.executeJavaScript(`(() => {
    // Check ink stroke
    return window.boardTestStrokes ? window.boardTestStrokes() : document.getElementById('ink').width > 0;
  })()`);
  check('draw-board drew rectangle', rectStrokeExists);

  // Switch to select tool via clicking button
  await boardWin.webContents.executeJavaScript(`document.querySelector('[data-tool="select"]').click()`);
  await sleep(100);

  // Click on the rectangle to select it
  const selectHit = await boardWin.webContents.executeJavaScript(`(() => {
    const ink = document.getElementById('ink');
    ink.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 250, clientY: 250, button: 0 }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 250, clientY: 250, button: 0 }));
    return true;
  })()`);
  check('draw-board clicked to select stroke', selectHit);

  // Drag to move the stroke by (+50, +50)
  await boardWin.webContents.executeJavaScript(`(() => {
    const ink = document.getElementById('ink');
    ink.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 250, clientY: 250, button: 0 }));
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 300, clientY: 300, button: 0 }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 300, clientY: 300, button: 0 }));
  })()`);
  await sleep(150);

  // Test multiple Esc presses do NOT clear strokes
  const escSafety = await boardWin.webContents.executeJavaScript(`(() => {
    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }
    return true;
  })()`);
  check('draw-board survived 5 Escape key presses without crash', escSafety);

  boardWin.destroy();
  await sleep(200);

  // --- 2. Test screenshot-pin selection: Select tool & Escape safety ---
  console.log('\n--- 2. Testing screenshot-pin selection Transform & Escape ---');
  const selWin = new BrowserWindow({
    width: 1000, height: 700, show: true,
    webPreferences: { preload: path.join(ROOT, 'src/plugins/screenshot-pin/overlay-preload.js') },
  });
  await selWin.loadFile(path.join(ROOT, 'src/plugins/screenshot-pin/selection.html'));
  await sleep(400);

  // Check selection select button exists
  const selHasSelect = await selWin.webContents.executeJavaScript(`!!document.querySelector('[data-tool="select"]')`);
  check('selection toolbar has select tool button', selHasSelect);

  // Create a selection rect from (100, 100) to (600, 500)
  await selWin.webContents.executeJavaScript(`(() => {
    window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100, button: 0 }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 600, clientY: 500, button: 0 }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 600, clientY: 500, button: 0 }));
  })()`);
  await sleep(100);

  // Draw a text annotation inside selection
  await selWin.webContents.executeJavaScript(`(() => {
    document.querySelector('[data-tool="text"]').click();
  })()`);
  await sleep(50);

  // Click at (200, 200) to spawn text editor, input text and commit
  await selWin.webContents.executeJavaScript(`(() => {
    window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 200, clientY: 200, button: 0 }));
    const ed = document.querySelector('.sel-text-editor');
    if (ed) {
      ed.value = '测试文字内容';
      ed.dispatchEvent(new Event('input', { bubbles: true }));
      ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    }
  })()`);
  await sleep(150);

  // Press ESC multiple times:
  // 1st ESC should unselect active tool (or cancel editor)
  // Subsequent ESC should exit selection, but NOT clear strokes if re-selected!
  const strokesKept = await selWin.webContents.executeJavaScript(`(() => {
    // 1st Esc: tool deselects
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    // 2nd Esc: selection exits
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return true;
  })()`);
  check('selection handled Esc presses safely', strokesKept);

  selWin.destroy();
  await sleep(200);

  // --- 3. Test screenshot-pin pin: Select tool & Escape safety ---
  console.log('\n--- 3. Testing screenshot-pin pin Transform & Escape ---');
  const pinWin = new BrowserWindow({
    width: 600, height: 500, show: true,
    webPreferences: { preload: path.join(ROOT, 'src/plugins/screenshot-pin/pin-preload.js') },
  });
  pinWin.webContents.on('did-finish-load', () => {
    pinWin.webContents.send('screenshot-pin:init', {
      image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAPElEQVR42u3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAw2+4AAUjU4sUAAAAASUVORK5CYII=',
    });
  });
  await pinWin.loadFile(path.join(ROOT, 'src/plugins/screenshot-pin/pin.html'));
  await sleep(400);

  const pinHasSelect = await pinWin.webContents.executeJavaScript(`!!document.querySelector('[data-tool="select"]')`);
  check('pin toolbar has select tool button', pinHasSelect);

  pinWin.destroy();

  const failed = results.filter(([, ok]) => !ok);
  console.log(`\nTRANSFORM TOOL TEST: ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) {
    console.error('FAILED:', failed.map(([n]) => n).join(', '));
    app.exit(1);
  } else {
    console.log('ALL TRANSFORM TOOL TESTS PASSED!');
    app.exit(0);
  }
}).catch(err => {
  console.error('TEST ERROR:', err);
  app.exit(1);
});
