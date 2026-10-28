const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

const Config = require('../src/core/config');
const PluginManager = require('../src/core/plugin-manager');
const { registerPluginProtocol } = require('../src/core/plugin-protocol');
const createHotkeys = require('../src/core/hotkeys');
const registerIpc = require('../src/core/ipc');

protocol.registerSchemesAsPrivileged([
  { scheme: 'plugin', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-boot-test-'));
  const cfg = new Config(tmp);
  let win = null;
  const manager = new PluginManager({ userDataDir: tmp, config: cfg, getHostWindow: () => win });
  const hotkeys = createHotkeys({ cfg, manager, onSummon: () => {} });

  registerPluginProtocol(manager);
  registerIpc({ app, cfg, manager, hotkeys, getHostWindow: () => win });

  manager.discover();
  for (const p of manager.plugins.values()) if (p.enabled) manager.activate(p.id);

  win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    }
  });

  let errorLogs = [];
  win.webContents.on('console-message', (e, level, msg, line, sourceId) => {
    console.log(`[RENDERER LOG l=${level}]:`, msg);
    if (level >= 3) {
      errorLogs.push(msg);
    }
  });

  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise(r => setTimeout(r, 1500));

  const stateInfo = await win.webContents.executeJavaScript(`
    ({
      cardCount: document.querySelectorAll('.card').length,
      deckMeta: document.getElementById('deckMeta') ? document.getElementById('deckMeta').textContent : null,
      searchVal: document.getElementById('search') ? document.getElementById('search').value : null,
      smartPeekHidden: document.getElementById('smartPeek') ? document.getElementById('smartPeek').hidden : null,
      actionPaletteHidden: document.getElementById('actionPaletteMask') ? document.getElementById('actionPaletteMask').hidden : null,
      apHintText: document.getElementById('apHint') ? document.getElementById('apHint').textContent : null,
    })
  `);

  console.log('Renderer state output:', stateInfo);

  // Test Smart Peek appearance with timestamp
  const peekState = await win.webContents.executeJavaScript(`
    (async () => {
      document.getElementById('search').value = '1710000000';
      document.getElementById('search').dispatchEvent(new Event('input'));
      await new Promise(r => setTimeout(r, 400));
      return {
        hidden: document.getElementById('smartPeek').hidden,
        badge: document.querySelector('.peek-badge') ? document.querySelector('.peek-badge').textContent : null,
        preview: document.querySelector('.peek-preview') ? document.querySelector('.peek-preview').textContent : null,
      };
    })()
  `);
  console.log('Smart Peek test output:', peekState);
  if (peekState.hidden || !peekState.badge) {
    throw new Error('Smart Peek failed to show for timestamp!');
  }

  // Test Action Palette opening
  const apState = await win.webContents.executeJavaScript(`
    (async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      return {
        hidden: document.getElementById('actionPaletteMask').hidden,
        itemCount: document.querySelectorAll('.ap-item').length,
      };
    })()
  `);
  console.log('Action Palette test output:', apState);
  if (apState.hidden || apState.itemCount === 0) {
    throw new Error('Action Palette failed to open with Ctrl+K!');
  }

  manager.deactivateAll();
  fs.rmSync(tmp, { recursive: true, force: true });

  if (errorLogs.length > 0) {
    console.error('FAIL: Renderer threw console errors:', errorLogs);
    app.exit(1);
  } else if (stateInfo.cardCount === 0) {
    console.error('FAIL: Card count is 0, cards were not rendered!');
    app.exit(1);
  } else {
    console.log(`SUCCESS: Booted cleanly with ${stateInfo.cardCount} tool cards rendered!`);
    app.exit(0);
  }
}).catch(err => {
  console.error('Boot test exception:', err);
  app.exit(1);
});
