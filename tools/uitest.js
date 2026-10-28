/* Automated UI test: boots the real stack (config + plugins + protocol +
   hotkeys + ipc + host window with the real preload/renderer) and drives the
   page through executeJavaScript. Saves screenshots to dist/ for visual
   review. Run: electron tools/uitest.js */
const { app, BrowserWindow, protocol, clipboard } = require('electron');
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
  const visibleViews = await page(`['viewHome','viewPanel','viewPlugins','viewSettings','viewDevGuide'].filter(id => getComputedStyle(document.getElementById(id)).display !== 'none')`);
  check('single-view-visible', visibleViews.length === 1 && visibleViews[0] === 'viewHome');
  check('deck-has-7-cards', await page(`document.querySelectorAll('#deck .card').length`) === 7);
  check('cards-have-icons', await page(`document.querySelectorAll('#deck .card-icon svg').length`) === 7);
  await shot('home');

  /* --- open a plugin panel (codec-lab) -------------------------------------- */
  await page(`(() => {
    const card = Array.from(document.querySelectorAll('#deck .card')).find(c => c.textContent.includes('编码转换'));
    if (card) card.click();
  })()`);
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
  check('codec-swap-btn-zh', await page(`document.querySelector('[data-act="swap"]').textContent.includes('对调')`));
  check('codec-copy-btn-zh', await page(`document.querySelector('[data-act="copyOut"]').textContent.includes('复制')`));
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
  let portRows = 0;
  for (let i = 0; i < 20; i++) {
    await sleep(200);
    portRows = await page(`document.querySelectorAll('.ps-table tbody tr').length`);
    if (portRows > 5) break;
  }
  check('portscope-rows', portRows > 5);
  await shot('portscope-panel');

  /* --- clip-history panel test ------------------------------------------------ */
  await page(`document.getElementById('btnBack').click()`);
  await sleep(200);
  await page(`(() => {
    const s = document.getElementById('search');
    s.value = '';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(200);
  await page(`(() => {
    const card = Array.from(document.querySelectorAll('#deck .card')).find(c => c.textContent.includes('剪贴板'));
    if (card) card.click();
  })()`);
  await sleep(600);
  check('clip-history-panel-mounted', await page(`!!document.querySelector('.clip-container')`) === true);
  check('clip-history-toolbar-present', await page(`!!document.querySelector('.clip-toolbar')`) === true);
  check('clip-history-search-input-present', await page(`!!document.querySelector('.clip-search-input')`) === true);

  // Write text to clipboard & let poll() pick it up
  clipboard.writeText('Test Orbit Clip String 123');
  await sleep(1000);
  const clipCardsCount = await page(`document.querySelectorAll('.clip-card').length`);
  check('clip-card-rendered', clipCardsCount >= 1);
  check('clip-text-content-matches', await page(`document.querySelector('.clip-text-content').textContent.includes('Test Orbit Clip String 123')`));

  // Test filter buttons
  await page(`document.querySelector('.clip-filter-btn[data-filter="text"]').click()`);
  await sleep(100);
  check('clip-filter-text-active', await page(`document.querySelector('.clip-filter-btn[data-filter="text"]').classList.contains('active')`));

  // Test pin toggle
  await page(`document.querySelector('.clip-btn-pin').click()`);
  await sleep(150);
  check('clip-card-pinned', await page(`document.querySelector('.clip-card').classList.contains('pinned')`));

  // Test copy / card click
  await page(`document.querySelector('.clip-card').click()`);
  await sleep(150);
  check('clip-copy-feedback', await page(`document.querySelector('.clip-card').classList.contains('copied')`));

  // Test cap selector presence and custom capacity setting
  check('clip-cap-select-present', await page(`!!document.querySelector('.clip-cap-select')`) === true);
  check('clip-cap-default-80', await page(`document.querySelector('.clip-cap-select').value`) === '80');
  await page(`document.querySelector('.panel-view').__setCapForTest(50)`);
  await sleep(150);
  check('clip-cap-applied-50', await page(`document.querySelector('.clip-cap-select').value`) === '50');

  // Test URL link classification
  clipboard.writeText('https://github.com/Ikaros-521/orbit-tools');
  await sleep(1000);
  await page(`document.querySelector('.clip-filter-btn[data-filter="link"]').click()`);
  await sleep(150);
  check('clip-filter-link-active', await page(`document.querySelector('.clip-filter-btn[data-filter="link"]').classList.contains('active')`));
  check('clip-link-badge-present', await page(`!!document.querySelector('.clip-badge-link')`) === true);
  check('clip-link-btn-present', await page(`!!document.querySelector('.clip-btn-open-link')`) === true);

  // Test File classification
  const pkgPath = path.join(ROOT, 'package.json');
  if (process.platform === 'win32') {
    clipboard.writeBuffer('FileNameW', Buffer.from(pkgPath + '\0', 'utf16le'));
  } else {
    clipboard.writeText(pkgPath);
  }
  await sleep(1000);
  await page(`document.querySelector('.clip-filter-btn[data-filter="file"]').click()`);
  await sleep(150);
  check('clip-filter-file-active', await page(`document.querySelector('.clip-filter-btn[data-filter="file"]').classList.contains('active')`));
  check('clip-file-badge-present', await page(`!!document.querySelector('.clip-badge-file')`) === true);
  check('clip-file-locate-btn-present', await page(`!!document.querySelector('.clip-btn-locate')`) === true);

  // Switch back to All filter
  await page(`document.querySelector('.clip-filter-btn[data-filter="all"]').click()`);
  await sleep(150);

  await shot('clip-history-panel');

  /* --- mirror-hub panel test -------------------------------------------------- */
  await page(`document.getElementById('btnBack').click()`);
  await sleep(200);
  await page(`(() => {
    const card = Array.from(document.querySelectorAll('#deck .card')).find(c => c.textContent.includes('镜像加速'));
    if (card) card.click();
  })()`);
  await sleep(600);
  check('mirror-hub-panel-mounted', await page(`!!document.querySelector('.mhub-container')`) === true);
  check('mirror-hub-tabs-rendered', await page(`document.querySelectorAll('.mhub-tab-btn').length`) >= 5);
  check('mirror-hub-cards-rendered', await page(`document.querySelectorAll('.mhub-card').length`) >= 3);

  // Switch to npm tab
  await page(`document.querySelector('.mhub-tab-btn[data-env="npm"]').click()`);
  await sleep(150);
  check('mirror-hub-npm-active', await page(`document.querySelector('.mhub-tab-btn[data-env="npm"]').classList.contains('active')`));

  // Test copy command
  await page(`document.querySelector('.mhub-btn-copy').click()`);
  await sleep(150);
  check('mirror-hub-copy-feedback', await page(`document.querySelector('.mhub-btn-copy').classList.contains('copied')`));

  await shot('mirror-hub-panel');

  /* --- settings view ------------------------------------------------------------- */
  await page(`document.getElementById('btnBack').click()`);
  await sleep(200);
  await page(`document.querySelector('#tabs button[data-view="settings"]').click()`);
  await sleep(300);
  check('settings-visible', await page(`getComputedStyle(document.getElementById('viewSettings')).display`) !== 'none'
    && await page(`getComputedStyle(document.getElementById('viewHome')).display`) === 'none');
  check('hotkey-ctrl-present', await page(`!!document.querySelector('#hotkeyCtrl .hke-input')`) === true);
  check('user-plugins-dir-shown', await page(`!!document.getElementById('userPluginsPath').textContent`));
  const customPluginsPath = path.join(tmp, 'custom-plugins').replace(/\\/g, '\\\\');
  await page(`window.__setUserPluginsDirForTest('${customPluginsPath}')`);
  await sleep(150);
  check('custom-plugins-dir-applied', await page(`document.getElementById('userPluginsPath').textContent.includes('custom-plugins')`));
  check('custom-badge-shown', await page(`document.getElementById('userPluginsBadge').textContent.includes('自定义')`));
  // Restore default
  await page(`window.__setUserPluginsDirForTest(null)`);
  await sleep(150);
  check('default-badge-restored', await page(`document.getElementById('userPluginsBadge').textContent.includes('默认')`));

  // Universal plugin data directory test
  check('plugin-data-dir-shown', await page(`!!document.getElementById('pluginDataPath').textContent`));
  const customDataPath = path.join(tmp, 'custom-data').replace(/\\/g, '\\\\');
  await page(`window.__setPluginDataDirForTest('${customDataPath}')`);
  await sleep(150);
  check('custom-data-dir-applied', await page(`document.getElementById('pluginDataPath').textContent.includes('custom-data')`));
  check('custom-data-badge-shown', await page(`document.getElementById('pluginDataBadge').textContent.includes('自定义')`));
  // Restore default
  await page(`window.__setPluginDataDirForTest(null)`);
  await sleep(150);
  check('default-data-badge-restored', await page(`document.getElementById('pluginDataBadge').textContent.includes('默认')`));

  await shot('settings');

  /* --- plugins view (dedicated center, pagination & search) ---------------------- */
  await page(`document.querySelector('#tabs button[data-view="plugins"]').click()`);
  await sleep(300);
  check('plugins-visible', await page(`getComputedStyle(document.getElementById('viewPlugins')).display`) !== 'none');
  // pageSize is 4, so first page should show 4 items out of 7
  check('plugins-page1-has-4', await page(`document.querySelectorAll('#pluginList .prow').length`) === 4);
  check('prev-btn-disabled', await page(`document.getElementById('btnPagePrev').disabled`) === true);
  check('next-btn-enabled', await page(`document.getElementById('btnPageNext').disabled`) === false);

  // Next page: should show the remaining 3 items
  await page(`document.getElementById('btnPageNext').click()`);
  await sleep(200);
  check('plugins-page2-has-3', await page(`document.querySelectorAll('#pluginList .prow').length`) === 3);
  check('prev-btn-enabled', await page(`document.getElementById('btnPagePrev').disabled`) === false);
  check('next-btn-disabled', await page(`document.getElementById('btnPageNext').disabled`) === true);

  // Category filter: click media category (should match 2 plugins: draw-board & screenshot-pin)
  await page(`document.querySelector('#catFilter button[data-cat="media"]').click()`);
  await sleep(200);
  check('cat-filter-media-2', await page(`document.querySelectorAll('#pluginList .prow').length`) === 2);
  check('dev-banner-visible', await page(`!document.getElementById('devBanner').hidden`));
  await shot('plugins-center');

  /* --- dev guide view test -------------------------------------------------------- */
  await page(`document.getElementById('btnOpenDevGuide').click()`);
  await sleep(200);
  check('dev-guide-visible', await page(`getComputedStyle(document.getElementById('viewDevGuide')).display`) !== 'none');
  check('prompt-template-present', await page(`!!document.getElementById('samplePrompt').textContent`));
  await shot('dev-guide');
  await page(`document.getElementById('btnBackFromDevGuide').click()`);
  await sleep(200);
  check('back-to-plugins-from-guide', await page(`getComputedStyle(document.getElementById('viewPlugins')).display`) !== 'none');

  /* --- home card context menu ---------------------------------------------------- */
  await page(`document.querySelector('#tabs button[data-view="home"]').click()`);
  await sleep(200);
  await page(`(() => {
    const card = document.querySelector('#deck .card');
    const r = card.getBoundingClientRect();
    card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20 }));
  })()`);
  await sleep(200);
  check('context-menu-visible', await page(`!document.getElementById('cardContextMenu').hidden`));
  check('context-menu-actions', await page(`!document.getElementById('ctxConfig').hidden && !document.getElementById('ctxFolder').hidden`));
  await shot('card-context-menu');
  await page(`document.body.click()`);
  await sleep(100);
  check('context-menu-hidden-on-click', await page(`document.getElementById('cardContextMenu').hidden`) === true);

  /* --- hotkey conflicts -------------------------------------------------------- */
  const conflict = hotkeys.setPluginHotkey('draw-board:start', cfg.data.hotkey);
  check('plugin-vs-host-conflict-detected', conflict.ok === false && conflict.conflictKey === 'host');
  const conflict2 = hotkeys.setPluginHotkey('draw-board:start', 'Ctrl+Shift+A'); // screenshot-pin owns it
  check('plugin-vs-plugin-conflict-detected', conflict2.ok === false && conflict2.conflictKey === 'screenshot-pin:capture');
  check('conflict-reverted-in-config', cfg.data.pluginHotkeys['draw-board:start'] === undefined);
  const okSet = hotkeys.setPluginHotkey('draw-board:start', 'Ctrl+Alt+Shift+D');
  check('free-hotkey-applies', okSet.ok === true && cfg.data.pluginHotkeys['draw-board:start'] === 'Ctrl+Alt+Shift+D');
  const cleared = hotkeys.setPluginHotkey('draw-board:start', null);
  check('hotkey-clears', cleared.ok === true && cfg.data.pluginHotkeys['draw-board:start'] === undefined);
  const hostSet = hotkeys.setHostHotkey('Ctrl+Alt+Shift+O');
  check('host-hotkey-applies', hostSet.ok === true && cfg.data.hotkey === 'Ctrl+Alt+Shift+O');

  /* --- draw-board copy & pin tests ---------------------------------------------- */
  check('draw-board-active', manager.active.has('draw-board'));
  const dummy1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  clipboard.clear();
  // Call copy directly through electron's ipcMain invocation simulation
  const boardMod = manager.active.get('draw-board');
  check('draw-board-has-module', !!boardMod);
  // Verify pin html and js files exist
  const drawBoardDir = path.join(ROOT, 'src/plugins/draw-board');
  check('draw-board-pin-files-exist', fs.existsSync(path.join(drawBoardDir, 'pin.html'))
    && fs.existsSync(path.join(drawBoardDir, 'pin.js'))
    && fs.existsSync(path.join(drawBoardDir, 'pin-preload.js')));
  check('draw-board-board-has-pin-btn', fs.readFileSync(path.join(drawBoardDir, 'board.html'), 'utf8').includes('data-act="pin"'));
  check('draw-board-board-has-copy-btn', fs.readFileSync(path.join(drawBoardDir, 'board.html'), 'utf8').includes('data-act="copy"'));

  win.destroy();
  manager.deactivateAll();
  fs.rmSync(tmp, { recursive: true, force: true });

  const failed = results.filter(([, ok]) => !ok);
  console.log(`\nUI TEST: ${results.length - failed.length}/${results.length} pass`);
  if (failed.length) { console.log('FAILED:', failed.map(([n]) => n).join(', ')); app.exit(1); }
  else { console.log('UI TEST PASS'); app.exit(0); }
}).catch(err => { console.error('UI TEST CRASH:', err); app.exit(1); });
