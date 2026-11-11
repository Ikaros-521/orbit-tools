/* Real panel clicks through preload IPC and PluginManager — run with Electron. */
const assert = require('assert');
const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const PluginManager = require('../src/core/plugin-manager');
const Config = require('../src/core/config');
const { registerPluginProtocol } = require('../src/core/plugin-protocol');

protocol.registerSchemesAsPrivileged([
  { scheme: 'plugin', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);
app.on('window-all-closed', () => {});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label) {
  const end = Date.now() + 12000;
  while (Date.now() < end) {
    if (await fn()) return;
    await pause(50);
  }
  throw new Error(`Timed out: ${label}`);
}

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-cue-ui-'));
  let manager;
  let host;
  try {
    const cfg = new Config(tmp);
    host = new BrowserWindow({ width: 940, height: 900, show: false,
      webPreferences: { preload: path.resolve(__dirname, '../src/preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    manager = new PluginManager({ userDataDir: tmp, config: cfg, getHostWindow: () => host });
    manager.discover();
    registerPluginProtocol(manager);
    manager.activate('screen-cue');
    ipcMain.handle('plugin-call', async (event, { id, method, args }) => {
      try { return { ok: true, data: await manager.call(id, method, args, event) }; }
      catch (err) { return { ok: false, error: err.message }; }
    });
    const html = `<!doctype html><html><head><meta charset="utf-8">
      <link rel="stylesheet" href="${pathToFileURL(path.resolve(__dirname, '../src/renderer/style.css')).href}">
      <link rel="stylesheet" href="plugin://screen-cue/panel.css"></head>
      <body style="overflow:auto"><div id="panel"></div>
      <script>window.Toolbox={panel(def){window.panelDef=def;}};<\/script>
      <script src="plugin://screen-cue/panel.js"><\/script>
      <script>window.panelDef.mount(document.getElementById('panel'),{
        lang:'zh',call:async(method,args)=>{
          const r=await window.host.pluginCall('screen-cue',method,args);
          if(!r.ok)throw new Error(r.error);return r.data;
        },onEvent:(channel,fn)=>window.host.onPluginEvent('screen-cue',ev=>{
          if(ev.channel===channel)fn(ev.payload);
        })});<\/script></body></html>`;
    const harness = path.join(tmp, 'panel.html');
    fs.writeFileSync(harness, html);
    await host.loadFile(harness);
    const js = code => host.webContents.executeJavaScript(code);
    const state = () => manager.call('screen-cue', 'getState');
    const click = selector => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const checkBox = (id, checked) => js(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.checked=${checked};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const layers = role => BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().endsWith(`/${role}.html`));
    await until(async () => (await js(`document.getElementById('scBadgeDraw').textContent`)).includes('关'), 'panel ready');

    await click('[data-act=annotate]');
    await until(async () => (await state()).drawMode, 'annotation BUTTON starts backend');
    await until(() => layers('draw').some(w => w.isVisible()), 'annotation renderer visible');
    assert.strictEqual((await state()).settings.ink.freezeScreen, false, 'live is default');
    assert.strictEqual(await layers('draw')[0].webContents.executeJavaScript(`document.getElementById('scBackdrop').getAttribute('src')`), null);
    const liveDraw = layers('draw')[0];
    liveDraw.webContents.sendInputEvent({ type: 'mouseDown', x: 200, y: 220, button: 'left', clickCount: 1 });
    liveDraw.webContents.sendInputEvent({ type: 'mouseMove', x: 290, y: 270, button: 'left', modifiers: ['leftButtonDown'] });
    liveDraw.webContents.sendInputEvent({ type: 'mouseUp', x: 290, y: 270, button: 'left', clickCount: 1 });
    await until(async () => (await state()).strokeCount > 0, 'real pointer stroke committed');
    await click('[data-act=clearInk]');
    await until(async () => (await state()).strokeCount === 0, 'clear ink BUTTON works');
    await click('[data-act=stopAll]');
    await until(() => !layers('draw').length, 'stop button removes draw');

    await checkBox('scFreezeScreen', true);
    await until(async () => (await state()).settings.ink.freezeScreen, 'freeze persisted');
    await click('[data-act=annotate]');
    await until(() => layers('draw').some(w => w.isVisible()), 'frozen annotation visible');
    const draw = layers('draw')[0];
    const backdrop = await draw.webContents.executeJavaScript(`(()=>{const i=document.getElementById('scBackdrop');return {src:i.getAttribute('src'),loaded:i.complete&&i.naturalWidth>0};})()`);
    assert(backdrop.loaded && backdrop.src.startsWith('data:image/'), 'frozen backdrop actually decoded');
    await click('[data-act=stopAll]');
    await until(() => !layers('draw').length, 'frozen backdrop removed on exit');
    await checkBox('scFreezeScreen', false);

    if (process.platform === 'win32') {
      await click('[data-act=magnifier]');
      await until(async () => (await state()).magnifierOn, 'magnifier BUTTON starts backend');
      await until(() => layers('mag').some(w => w.isVisible()), 'magnifier renderer visible');
      await checkBox('scShowCrosshair', false);
      await checkBox('scShowZoomBadge', false);
      await until(async () => {
        const s = (await state()).settings.lens;
        return !s.showCrosshair && !s.showZoomBadge;
      }, 'independent display switches persisted');
      await checkBox('scShowCrosshair', true);
      await until(async () => {
        const s = (await state()).settings.lens;
        return s.showCrosshair && !s.showZoomBadge;
      }, 'crosshair independent of badge');
      await checkBox('scShowZoomBadge', true);
      await until(async () => (await state()).settings.lens.showZoomBadge, 'badge restored');
      await click('[data-act=magnifier]');
      await until(() => !layers('mag').length, 'magnifier BUTTON toggles off');
    }

    await click('[data-act=annotate]');
    await until(async () => (await state()).drawMode, 'annotation second start');
    await click('[data-act=annotate]');
    await until(async () => !(await state()).drawMode, 'annotation BUTTON toggles off');
    await manager.call('screen-cue', 'stopAll');
    manager.deactivate('screen-cue');
    assert.strictEqual(BrowserWindow.getAllWindows().length, 1, 'all effect windows reclaimed');
    console.log('SCREEN CUE UI PASS (real panel buttons, switches, live/frozen backdrop and teardown)');
  } finally {
    if (manager) manager.deactivateAll();
    if (host && !host.isDestroyed()) host.destroy();
    ipcMain.removeHandler('plugin-call');
  }
  app.exit(0);
}).catch(err => { console.error(err); app.exit(1); });
