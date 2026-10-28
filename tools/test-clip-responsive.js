const { app, BrowserWindow, protocol, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const Config = require(path.join(ROOT, 'src/core/config'));
const PluginManager = require(path.join(ROOT, 'src/core/plugin-manager'));
const { registerPluginProtocol } = require(path.join(ROOT, 'src/core/plugin-protocol'));
const createHotkeys = require(path.join(ROOT, 'src/core/hotkeys'));
const registerIpc = require(path.join(ROOT, 'src/core/ipc'));

protocol.registerSchemesAsPrivileged([
  { scheme: 'plugin', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-longtext-'));
  const cfg = new Config(tmp);
  let win = null;
  const manager = new PluginManager({ userDataDir: tmp, config: cfg, getHostWindow: () => win });
  const hotkeys = createHotkeys({ cfg, manager, onSummon: () => {} });
  registerPluginProtocol(manager);
  registerIpc({ app, cfg, manager, hotkeys, getHostWindow: () => win });

  manager.discover();
  for (const p of manager.plugins.values()) if (p.enabled) manager.activate(p.id);

  win = new BrowserWindow({
    width: 600, height: 480, show: false,
    webPreferences: {
      preload: path.join(ROOT, 'src/preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  await win.loadFile(path.join(ROOT, 'src/renderer/index.html'));
  await new Promise(r => setTimeout(r, 600));

  const page = expr => win.webContents.executeJavaScript(expr);
  await page(`(() => {
    const card = Array.from(document.querySelectorAll('#deck .card')).find(c => c.textContent.includes('剪贴板'));
    if (card) card.click();
  })()`);
  await new Promise(r => setTimeout(r, 500));

  // Write very long link and long text
  const longUrl = 'https://example.com/api/v1/resource/query?longparam=' + 'a'.repeat(250) + '&other=' + 'b'.repeat(250);
  clipboard.writeText(longUrl);
  await new Promise(r => setTimeout(r, 600));

  const longText = 'NON_BREAKING_SUPER_LONG_STRING_' + 'x'.repeat(400);
  clipboard.writeText(longText);
  await new Promise(r => setTimeout(r, 600));

  const result = await page(`(() => {
    const list = document.querySelector('.clip-list');
    const cards = Array.from(document.querySelectorAll('.clip-card'));
    const container = document.querySelector('.clip-container');
    const toolbar = document.querySelector('.clip-toolbar');
    return {
      containerW: container.clientWidth,
      containerScrollW: container.scrollWidth,
      toolbarW: toolbar.clientWidth,
      toolbarScrollW: toolbar.scrollWidth,
      listW: list.clientWidth,
      listScrollW: list.scrollWidth,
      cardWidths: cards.map(c => ({ clientW: c.clientWidth, scrollW: c.scrollWidth }))
    };
  })()`);

  console.log('Result for ultra-long content in 600x480 window:');
  console.log(JSON.stringify(result, null, 2));

  const pass = result.containerW === result.containerScrollW &&
               result.toolbarW === result.toolbarScrollW &&
               result.listW === result.listScrollW &&
               result.cardWidths.length > 0 &&
               result.cardWidths.every(c => c.clientW === c.scrollW);

  console.log('ALL PASSED (NO HORIZONTAL OVERFLOW):', pass);
  if (!pass) {
    process.exitCode = 1;
  }
  app.quit();
});
