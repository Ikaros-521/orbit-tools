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

  // Test Workflows Canvas View & Infinite Canvas Controls & Linking
  const wfState = await win.webContents.executeJavaScript(`
    (async () => {
      // Close Action Palette first
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      // Switch to Workflows view
      const wfTab = document.querySelector('button[data-view="workflows"]');
      if (!wfTab) return { error: 'workflows tab missing' };
      wfTab.click();
      await new Promise(r => setTimeout(r, 400));

      const initialEdges = document.querySelectorAll('.wf-svg-layer path').length;

      // Test Zoom controls
      const btnZoomIn = document.getElementById('btnWfZoomIn');
      if (btnZoomIn) btnZoomIn.click();
      const scaleText = document.getElementById('wfZoomScale')?.textContent;

      // Test Fit View
      const btnFitView = document.getElementById('btnWfFitView');
      if (btnFitView) btnFitView.click();

      // Test Linking
      const nodes = Array.from(document.querySelectorAll('.wf-node'));
      let linkSucceeded = false;
      if (nodes.length >= 2) {
        const outPort = nodes[0].querySelector('.wf-port.out');
        const inPort = nodes[1].querySelector('.wf-port.in');
        if (outPort && inPort) {
          // Trigger connecting
          outPort.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          // Simulate drop onto inPort
          inPort.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          await new Promise(r => setTimeout(r, 100));
          linkSucceeded = true;
        }
      }

      // Test Edge stroke visibility
      const firstPath = document.querySelector('.wf-svg-layer path');
      const edgeStroke = firstPath ? window.getComputedStyle(firstPath).stroke : '';

      // Test Sidebar & Console Resizer
      const sidebarResizer = document.getElementById('wfSidebarResizer');
      const consoleResizer = document.getElementById('wfConsoleResizer');
      let resizeTested = false;
      if (sidebarResizer && consoleResizer) {
        sidebarResizer.dispatchEvent(new MouseEvent('mousedown', { clientX: 200, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 250, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        consoleResizer.dispatchEvent(new MouseEvent('mousedown', { clientY: 500, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mousemove', { clientY: 450, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        resizeTested = true;
      }

      return {
        viewHidden: document.getElementById('viewWorkflows').hidden,
        nodeCount: document.querySelectorAll('.wf-node').length,
        edgeCount: document.querySelectorAll('.wf-svg-layer path').length,
        libItems: document.querySelectorAll('.wf-lib-item').length,
        scaleText,
        linkSucceeded,
        edgeStroke,
        resizeTested
      };
    })()
  `);
  console.log('Workflows Canvas test output:', wfState);
  if (wfState.error || wfState.viewHidden || wfState.nodeCount === 0 || wfState.edgeCount === 0) {
    throw new Error('Workflows canvas rendering failed!');
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
