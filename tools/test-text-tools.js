/* Automated test for Text Controls in draw-board, screenshot-pin (selection & pin)
   Run with: electron tools/test-text-tools.js */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const results = [];
const check = (name, cond) => {
  results.push([name, !!cond]);
  if (!cond) console.log('  FAIL:', name);
  else console.log('  PASS:', name);
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  console.log('Testing text controls in draw-board...');
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    webPreferences: {
      preload: path.join(ROOT, 'src/plugins/draw-board/board-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await win.loadFile(path.join(ROOT, 'src/plugins/draw-board/board.html'));
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    console.log(`  renderer[${level}] ${message} (${source}:${line})`);
  });
  await sleep(400);

  // 1. Check draw-board DOM elements
  const dbCheck = await win.webContents.executeJavaScript(`(() => {
    const textBtn = document.querySelector('[data-tool="text"]');
    const textControls = document.getElementById('textControls');
    const sizes = document.getElementById('sizes');
    const sizeSliderWrap = document.getElementById('sizeSliderWrap');
    const textFont = document.getElementById('textFont');
    const textSize = document.getElementById('textSize');
    const textBold = document.getElementById('textBold');
    return {
      hasTextBtn: !!textBtn,
      hasTextControls: !!textControls,
      hasFont: !!textFont && textFont.options.length >= 5,
      hasSize: !!textSize && textSize.options.length >= 5,
      hasBold: !!textBold,
      textControlsHiddenInitially: getComputedStyle(textControls).display === 'none',
      sizesVisibleInitially: getComputedStyle(sizes).display !== 'none',
    };
  })()`);

  check('board-has-text-btn', dbCheck.hasTextBtn);
  check('board-has-text-controls', dbCheck.hasTextControls);
  check('board-has-font-options', dbCheck.hasFont);
  check('board-has-size-options', dbCheck.hasSize);
  check('board-has-bold-btn', dbCheck.hasBold);
  check('board-text-controls-hidden-initially', dbCheck.textControlsHiddenInitially);
  check('board-sizes-visible-initially', dbCheck.sizesVisibleInitially);

  // 2. Click text tool button and check controls toggle
  const toggleCheck = await win.webContents.executeJavaScript(`(() => {
    document.querySelector('[data-tool="text"]').click();
    const textControls = document.getElementById('textControls');
    const sizes = document.getElementById('sizes');
    const sizeSliderWrap = document.getElementById('sizeSliderWrap');
    return {
      textControlsVisibleNow: getComputedStyle(textControls).display !== 'none',
      sizesHiddenNow: getComputedStyle(sizes).display === 'none',
      sliderHiddenNow: getComputedStyle(sizeSliderWrap).display === 'none',
    };
  })()`);

  check('board-text-controls-visible-on-select', toggleCheck.textControlsVisibleNow);
  check('board-sizes-hidden-on-select', toggleCheck.sizesHiddenNow);
  check('board-slider-hidden-on-select', toggleCheck.sliderHiddenNow);

  // 3. Click canvas to spawn text editor, input text and commit with Ctrl+Enter
  const inputCheck = await win.webContents.executeJavaScript(`(() => {
    // Simulate pointerdown on ink
    document.getElementById('ink').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 200, button: 0 }));
    const editor = document.querySelector('.board-text-editor');
    if (!editor) return { spawned: false };

    editor.value = '测试文字\\n第二行';
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    // Commit via Ctrl+Enter
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));

    const editorGone = !document.querySelector('.board-text-editor');
    return {
      spawned: true,
      editorGone,
    };
  })()`);

  check('board-text-editor-spawned', inputCheck.spawned);
  check('board-text-editor-committed', inputCheck.editorGone);

  // 4. Test screenshot-pin selection DOM & text tool reusing win or separate win
  console.log('Testing text controls in screenshot-pin selection...');
  try {
    await win.loadFile(path.join(ROOT, 'src/plugins/screenshot-pin/selection.html'));
  } catch (err) {
    console.log('  win.loadFile selection error:', err);
  }
  await sleep(400);

  const selCheck = await win.webContents.executeJavaScript(`(() => {
    const textBtn = document.querySelector('[data-tool="text"]');
    const textGroup = document.getElementById('textGroup');
    const textFont = document.getElementById('textFont');
    const textSize = document.getElementById('textSize');
    const textBold = document.getElementById('textBold');
    return {
      hasTextBtn: !!textBtn,
      hasTextGroup: !!textGroup,
      hasFont: !!textFont && textFont.options.length >= 5,
      hasSize: !!textSize && textSize.options.length >= 5,
      hasBold: !!textBold,
    };
  })()`);

  check('selection-has-text-btn', selCheck.hasTextBtn);
  check('selection-has-text-group', selCheck.hasTextGroup);
  check('selection-has-font-options', selCheck.hasFont);
  check('selection-has-size-options', selCheck.hasSize);
  check('selection-has-bold-btn', selCheck.hasBold);

  // 5. Test screenshot-pin pin DOM
  console.log('Testing text controls in screenshot-pin pin...');
  try {
    await win.loadFile(path.join(ROOT, 'src/plugins/screenshot-pin/pin.html'));
  } catch (err) {
    console.log('  win.loadFile pin error:', err);
  }
  await sleep(400);

  const pinCheck = await win.webContents.executeJavaScript(`(() => {
    const textBtn = document.querySelector('[data-tool="text"]');
    const textGroup = document.getElementById('textGroup');
    const textFont = document.getElementById('textFont');
    const textSize = document.getElementById('textSize');
    const textBold = document.getElementById('textBold');
    return {
      hasTextBtn: !!textBtn,
      hasTextGroup: !!textGroup,
      hasFont: !!textFont && textFont.options.length >= 5,
      hasSize: !!textSize && textSize.options.length >= 5,
      hasBold: !!textBold,
    };
  })()`);

  check('pin-has-text-btn', pinCheck.hasTextBtn);
  check('pin-has-text-group', pinCheck.hasTextGroup);
  check('pin-has-font-options', pinCheck.hasFont);
  check('pin-has-size-options', pinCheck.hasSize);
  check('pin-has-bold-btn', pinCheck.hasBold);

  win.destroy();

  const failed = results.filter(([, ok]) => !ok);
  console.log(`\nTEXT CONTROLS TEST: ${results.length - failed.length}/${results.length} pass`);
  if (failed.length) {
    console.log('FAILED:', failed.map(([n]) => n).join(', '));
    app.exit(1);
  } else {
    console.log('ALL TEXT CONTROLS TESTS PASS');
    app.exit(0);
  }
}).catch(err => {
  console.error('TEST ERROR:', err);
  app.exit(1);
});
