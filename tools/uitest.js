/* Automated UI test: boots the real stack (config + plugins + protocol +
   hotkeys + ipc + host window with the real preload/renderer) and drives the
   page through executeJavaScript. Saves screenshots to dist/ for visual
   review. Run: electron tools/uitest.js */
const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const Config = require(path.join(ROOT, 'src/core/config'));
const PluginManager = require(path.join(ROOT, 'src/core/plugin-manager'));
const { registerPluginProtocol } = require(path.join(ROOT, 'src/core/plugin-protocol'));
const createHotkeys = require(path.join(ROOT, 'src/core/hotkeys'));
const registerIpc = require(path.join(ROOT, 'src/core/ipc'));

protocol.registerSchemesAsPrivileged([
  { scheme: 'plugin', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, cond) => { results.push([name, !!cond]); if (!cond) console.log('  FAIL:', name); };

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-uitest-'));
  const cfg = new Config(tmp);
  let win = null;
  const manager = new PluginManager({ userDataDir: tmp, config: cfg, getHostWindow: () => win });
  const hotkeys = createHotkeys({ cfg, manager, onSummon: () => {} });

  registerPluginProtocol(manager);
  registerIpc({ app, cfg, manager, hotkeys, getHostWindow: () => win });

  manager.discover();
  for (const p of manager.plugins.values()) if (p.enabled) manager.activate(p.id);
  hotkeys.registerAll();

  win = new BrowserWindow({
    width: 1180, height: 760, show: false,
    webPreferences: {
      preload: path.join(ROOT, 'src/preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  await win.loadFile(path.join(ROOT, 'src/renderer/index.html'));
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) console.log(`  renderer[${level}] ${message} (${source}:${line})`);
  });
  win.webContents.on('render-process-gone', (_e, details) => console.log('  RENDER GONE:', details.reason));
  await new Promise(r => win.once('ready-to-show', r));
  win.show();
  await sleep(900); // let init() + deck render settle

  const page = async js => {
    try {
      return await win.webContents.executeJavaScript(js);
    } catch (err) {
      console.log('  SCRIPT FAILED:', err.message, '\n  script:', js.slice(0, 160));
      throw err;
    }
  };
  const shot = async name => {
    fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'dist', `uitest-${name}.png`), (await win.webContents.capturePage()).toPNG());
  };

  /* --- layout: CSS applied & views mutually exclusive ---------------------- */
  check('css-applied', await page(`getComputedStyle(document.querySelector('.chassis')).display`) === 'flex');
  const visibleViews = await page(`['viewHome','viewPanel','viewSettings'].filter(id => getComputedStyle(document.getElementById(id)).display !== 'none')`);
  check('single-view-visible', visibleViews.length === 1 && visibleViews[0] === 'viewHome');
  check('deck-has-4-cards', await page(`document.querySelectorAll('#deck .card').length`) === 4);
  check('cards-have-icons', await page(`document.querySelectorAll('#deck .card-icon svg').length`) === 4);
  await shot('home');

  /* --- open a plugin panel (codec-lab sorts first) -------------------------- */
  await page(`document.querySelectorAll('.card')[0].click()`);
  await sleep(700);
  check('panel-view-visible', await page(`getComputedStyle(document.getElementById('viewPanel')).display`) !== 'none');
  check('codec-panel-mounted', await page(`!!document.querySelector('.cdc-ta')`) === true);
  await page(`(() => { const i = document.getElementById('cdcIn'); i.value = 'orbit'; i.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
  await sleep(150);
  check('codec-base64-encodes', await page(`document.getElementById('cdcOut').value`) === btoa('orbit'));
  await page(`document.querySelector('.cdc-seg [data-mode="decode"]').click()`);
  await sleep(100);
  const helloB64 = Buffer.from('你好', 'utf8').toString('base64');
  await page(`(() => { const i = document.getElementById('cdcIn'); i.value = '${helloB64}'; i.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
  await sleep(150);
  check('codec-base64-decodes-utf8', await page(`document.getElementById('cdcOut').value`) === '你好');
  await shot('codec-panel');

  /* --- back + search filter --------------------------------------------------- */
  await page(`document.getElementById('btnBack').click()`);
  await sleep(250);
  check('back-to-home', await page(`getComputedStyle(document.getElementById('viewHome')).display`) !== 'none');
  await page(`(() => { const s = document.getElementById('search'); s.value = 'zzz-nomatch'; s.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
  await sleep(200);
  check('search-filters-to-empty', await page(`document.querySelectorAll('.card').length`) === 0
    && await page(`!document.getElementById('empty').hidden`));
  await page(`(() => { const s = document.getElementById('search'); s.value = '端口'; s.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
  await sleep(200);
  check('search-matches-one', await page(`document.querySelectorAll('.card').length`) === 1);

  /* --- port-scope panel actually lists rows ------------------------------------ */
  await page(`document.querySelectorAll('.card')[0].click()`);
  await sleep(1600); // netstat+tasklist round trip
  check('portscope-rows', (await page(`document.querySelectorAll('.ps-table tbody tr').length`)) > 5);
  await shot('portscope-panel');

  /* --- settings view ------------------------------------------------------------- */
  await page(`document.getElementById('btnBack').click()`);
  await sleep(200);
  await page(`document.querySelector('#tabs button[data-view="settings"]').click()`);
  await sleep(300);
  check('settings-visible', await page(`getComputedStyle(document.getElementById('viewSettings')).display`) !== 'none'
    && await page(`getComputedStyle(document.getElementById('viewHome')).display`) === 'none');
  check('plugin-rows-4', await page(`document.querySelectorAll('.prow').length`) === 4);
  check('switches-4', await page(`document.querySelectorAll('.switch').length`) === 4);
  await shot('settings');

  /* --- hotkey conflicts -------------------------------------------------------- */
  const conflict = hotkeys.setPluginHotkey('draw-board:start', cfg.data.hotkey);
  check('plugin-vs-host-conflict-detected', conflict.ok === false && conflict.conflictKey === 'host');
  const conflict2 = hotkeys.setPluginHotkey('draw-board:start', 'Ctrl+Alt+A'); // screenshot-pin owns it
  check('plugin-vs-plugin-conflict-detected', conflict2.ok === false && conflict2.conflictKey === 'screenshot-pin:capture');
  check('conflict-reverted-in-config', cfg.data.pluginHotkeys['draw-board:start'] === undefined);
  const okSet = hotkeys.setPluginHotkey('draw-board:start', 'Ctrl+Alt+Shift+D');
  check('free-hotkey-applies', okSet.ok === true && cfg.data.pluginHotkeys['draw-board:start'] === 'Ctrl+Alt+Shift+D');
  const cleared = hotkeys.setPluginHotkey('draw-board:start', null);
  check('hotkey-clears', cleared.ok === true && cfg.data.pluginHotkeys['draw-board:start'] === undefined);
  const hostSet = hotkeys.setHostHotkey('Ctrl+Alt+Shift+O');
  check('host-hotkey-applies', hostSet.ok === true && cfg.data.hotkey === 'Ctrl+Alt+Shift+O');

  win.destroy();
  manager.deactivateAll();
  fs.rmSync(tmp, { recursive: true, force: true });

  const failed = results.filter(([, ok]) => !ok);
  console.log(`\nUI TEST: ${results.length - failed.length}/${results.length} pass`);
  if (failed.length) { console.log('FAILED:', failed.map(([n]) => n).join(', ')); app.exit(1); }
  else { console.log('UI TEST PASS'); app.exit(0); }
}).catch(err => { console.error('UI TEST CRASH:', err); app.exit(1); });
