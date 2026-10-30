/* Headless plugin-system smoke test, run with: electron tools/smoke-plugins.js
   Exercises discovery → manifest validation → serialize → activate/deactivate
   for every plugin, plus a live port-scope refresh, without opening windows. */
const { app } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PluginManager = require('../src/core/plugin-manager');
const Config = require('../src/core/config');
const { registerPluginProtocol } = require('../src/core/plugin-protocol');
const createHotkeys = require('../src/core/hotkeys');

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-smoke-'));
  const cfg = new Config(tmp);
  const manager = new PluginManager({ userDataDir: tmp, config: cfg, getHostWindow: () => null });
  const hotkeys = createHotkeys({ cfg, manager, onSummon: () => {}, onSummonActionPalette: () => {} });
  hotkeys.registerAll({ allowFallback: true });

  const found = manager.discover();
  const info = manager.serialize();
  console.log('discovered:', found.map(p => `${p.id}(${p.source})`).join(', '));

  const expect = ['ai-chat', 'antigravity-launcher', 'calculator', 'clip-history', 'codec-lab', 'color-lab', 'draw-board', 'json-editor', 'memo', 'mirror-hub', 'port-scope', 'screenshot-pin'];
  const missing = expect.filter(id => !info.find(p => p.id === id));
  if (missing.length) throw new Error(`missing plugins: ${missing}`);
  if (!info.find(p => p.id === 'ai-chat').hasBackend) throw new Error('ai-chat should have a backend');
  if (!info.find(p => p.id === 'codec-lab').hasBackend) throw new Error('codec-lab should have a backend');
  if (!info.find(p => p.id === 'color-lab').hasBackend) throw new Error('color-lab should have a backend');
  if (info.find(p => p.id === 'json-editor').hasBackend) throw new Error('json-editor should have no backend');
  if (!info.find(p => p.id === 'clip-history').hasBackend) throw new Error('clip-history should have a backend');
  if (!info.find(p => p.id === 'mirror-hub').hasBackend) throw new Error('mirror-hub should have a backend');
  if (!info.find(p => p.id === 'calculator').hasBackend) throw new Error('calculator should have a backend');
  if (!info.find(p => p.id === 'memo').hasBackend) throw new Error('memo should have a backend');
  for (const p of info) {
    if (!p.name.zh || !p.panel) throw new Error(`bad manifest for ${p.id}`);
    if (!Array.isArray(p.actions) || p.actions.length === 0) {
      throw new Error(`plugin ${p.id} must support actions/hotkeys`);
    }
  }
  console.log('all plugins action/hotkey support OK');

  /* --- plugin:// protocol -------------------------------------------------- */
  registerPluginProtocol(manager);
  const { net } = require('electron');
  const fetchStatus = async url => (await net.fetch(url)).status;
  if (await fetchStatus('plugin://ai-chat/panel.js') !== 200) throw new Error('plugin:// ai-chat panel.js not served');
  if (await fetchStatus('plugin://ai-chat/panel.css') !== 200) throw new Error('plugin:// ai-chat panel.css not served');
  if (await fetchStatus('plugin://ai-chat/icon.svg') !== 200) throw new Error('plugin:// ai-chat icon.svg not served');
  if (await fetchStatus('plugin://codec-lab/panel.js') !== 200) throw new Error('plugin:// panel.js not served');
  if (await fetchStatus('plugin://codec-lab/icon.svg') !== 200) throw new Error('plugin:// icon.svg not served');
  if (await fetchStatus('plugin://json-editor/panel.js') !== 200) throw new Error('plugin:// json-editor panel.js not served');
  if (await fetchStatus('plugin://json-editor/panel.css') !== 200) throw new Error('plugin:// json-editor panel.css not served');
  if (await fetchStatus('plugin://json-editor/icon.svg') !== 200) throw new Error('plugin:// json-editor icon.svg not served');
  if (await fetchStatus('plugin://calculator/panel.js') !== 200) throw new Error('plugin:// calculator panel.js not served');
  if (await fetchStatus('plugin://calculator/eval.js') !== 200) throw new Error('plugin:// calculator eval.js not served');
  if (await fetchStatus('plugin://memo/panel.js') !== 200) throw new Error('plugin:// memo panel.js not served');
  if (await fetchStatus('plugin://memo/panel.css') !== 200) throw new Error('plugin:// memo panel.css not served');
  if (await fetchStatus('plugin://color-lab/panel.js') !== 200) throw new Error('plugin:// color-lab panel.js not served');
  if (await fetchStatus('plugin://color-lab/color-math.js') !== 200) throw new Error('plugin:// color-lab color-math.js not served');
  if (await fetchStatus('plugin://color-lab/picker.html') !== 200) throw new Error('plugin:// color-lab picker.html not served');
  if (await fetchStatus('plugin://color-lab/picker-preload.js') !== 200) throw new Error('plugin:// color-lab picker-preload.js not served');
  if (await fetchStatus('plugin://color-lab/icon.svg') !== 200) throw new Error('plugin:// color-lab icon.svg not served');
  // The WHATWG URL parser collapses encoded ../ segments during normalization,
  // so traversal dies as 404; the handler's containment check would 403 anything
  // that still slips through. Either way the file must NOT be served.
  const blocked = s => s === 403 || s === 404;
  if (!blocked(await fetchStatus('plugin://codec-lab/%2e%2e/%2e%2e/main.js'))) throw new Error('path traversal not blocked');
  if (!blocked(await fetchStatus('plugin://codec-lab/%2e%2e%5c%2e%2e%5cmain.js'))) throw new Error('backslash traversal not blocked');
  if (await fetchStatus('plugin://nope/panel.js') !== 404) throw new Error('unknown plugin should 404');
  // external asset roots (@alias) must 404 unless the plugin registered them
  if (await fetchStatus('plugin://codec-lab/@models/x.moc3') !== 404) throw new Error('unregistered asset root should 404');
  console.log('plugin:// protocol OK');

  for (const p of found) {
    const ok = manager.activate(p.id);
    if (!ok) throw new Error(`activate failed for ${p.id}: ${manager.loadErrors.get(p.id)}`);
  }
  console.log('activated all backends OK');

  // live IPC round-trip through the router
  const r = await manager.call('port-scope', 'refresh');
  if (!Array.isArray(r.rows)) throw new Error('port-scope refresh returned no rows');
  console.log(`port-scope refresh OK (${r.rows.length} rows)`);

  // calculator: engine sanity + workflow capability envelope round-trip
  const calc = await manager.call('calculator', 'calc', { value: '1+2*3' });
  if (calc !== '7') throw new Error(`calculator calc returned "${calc}", expected "7"`);
  const peek = manager.detectSmartPeek('(1200-200)*15%');
  if (!peek || peek.pluginId !== 'calculator' || peek.copyValue !== '150') {
    throw new Error(`smart-peek math detection failed: ${JSON.stringify(peek)}`);
  }
  if (manager.detectSmartPeek('2026-10-29')) throw new Error('date-like string must not be detected as math');
  console.log('calculator calc + math smart-peek OK');

  // memo: seeded welcome note + create/save/remove round-trip
  const memoList = await manager.call('memo', 'list');
  const memoSeeded = memoList.notes.length; // snapshot: backend returns a live array
  if (!Array.isArray(memoList.notes) || memoSeeded < 1) throw new Error('memo should seed a welcome note');
  const created = await manager.call('memo', 'create', { content: '# 测试笔记\n正文 **加粗**' });
  if (!created.ok || created.note.title !== '测试笔记') throw new Error(`memo create/auto-title failed: ${JSON.stringify(created.note || {})}`);
  const saved = await manager.call('memo', 'save', { id: created.note.id, content: '# 改过啦' });
  if (!saved.ok || saved.note.title !== '改过啦') throw new Error('memo save/auto-title failed');
  const removed = await manager.call('memo', 'remove', { id: created.note.id });
  if (!removed.ok || removed.notes.some(n => n.id === created.note.id)) throw new Error('memo remove failed');
  console.log(`memo round-trip OK (${memoSeeded} seeded note${memoSeeded === 1 ? '' : 's'})`);

  // ai-chat: session & persona initialization
  const aiInit = await manager.call('ai-chat', 'getInitData');
  if (!aiInit || !aiInit.config || !Array.isArray(aiInit.personas)) throw new Error('ai-chat getInitData failed');
  const aiNewSess = await manager.call('ai-chat', 'createSession', { title: '冒烟测试会话' });
  if (!aiNewSess.ok || aiNewSess.session.title !== '冒烟测试会话') throw new Error('ai-chat createSession failed');
  const pCreated = await manager.call('ai-chat', 'savePersona', { title: '测试人设', icon: '🧪', prompt: '你是一个测试者' });
  if (!pCreated || !pCreated.ok) throw new Error(`ai-chat savePersona failed: ${JSON.stringify(pCreated)}`);
  if (!pCreated.persona || pCreated.persona.title !== '测试人设') throw new Error(`ai-chat savePersona title mismatch: ${JSON.stringify(pCreated)}`);
  const pDel = await manager.call('ai-chat', 'deletePersona', { id: pCreated.persona.id });
  if (!pDel.ok) throw new Error('ai-chat deletePersona failed');
  console.log('ai-chat session & persona IPC OK');

  // kill guard through the router
  try {
    await manager.call('port-scope', 'kill', { pid: 1 });
    throw new Error('kill pid 1 should have been refused');
  } catch (err) {
    if (!/refusing/.test(err.message)) throw err;
  }
  console.log('kill guard OK');

  // enable/disable round-trip persists and tears down
  manager.setEnabled('port-scope', false);
  if (manager.active.has('port-scope')) throw new Error('disable did not tear down');
  manager.setEnabled('port-scope', true);
  if (!manager.active.has('port-scope')) throw new Error('re-enable failed');
  console.log('enable/disable OK');

  // clip-history live IPC verification
  const clipList = await manager.call('clip-history', 'getHistory');
  if (!Array.isArray(clipList)) throw new Error('clip-history getHistory did not return array');
  const clipCfg = await manager.call('clip-history', 'getConfig');
  if (clipCfg.maxItems !== 80) throw new Error(`expected default maxItems 80, got ${clipCfg.maxItems}`);
  const setCapRes = await manager.call('clip-history', 'setMaxItems', { maxItems: 50 });
  if (!setCapRes.ok || setCapRes.maxItems !== 50) throw new Error('setMaxItems failed');
  const clearRes = await manager.call('clip-history', 'clearAll', { keepPinned: true });
  if (!clearRes.ok) throw new Error('clip-history clearAll failed');
  const extRes = await manager.call('clip-history', 'openExternal', { url: 'not-a-url' });
  if (extRes.ok) throw new Error('openExternal should refuse non-http url');
  const writeRes = await manager.call('clip-history', 'writeClipboardText', { text: 'https://test-clip.org' });
  if (!writeRes.ok) throw new Error('writeClipboardText failed');
  console.log('clip-history IPC OK');

  // codec-lab crypto/gzip IPC verification
  const algos = await manager.call('codec-lab', 'digestAlgos');
  if (!algos.includes('md5') || !algos.includes('sha256')) throw new Error('codec-lab digestAlgos missing md5/sha256');
  const hashRes = await manager.call('codec-lab', 'hash', { input: 'admin', algos: ['md5', 'sha256'] });
  if (hashRes.md5 !== '21232f297a57a5a743894a0e4a801fc3') throw new Error('codec-lab md5 vector mismatch');
  const ciphers = await manager.call('codec-lab', 'ciphers');
  if (!ciphers.includes('aes-256-cbc') || !ciphers.includes('rc4')) throw new Error('codec-lab ciphers missing aes/rc4');
  const cipEnc = await manager.call('codec-lab', 'cipher', { op: 'encrypt', algo: 'aes-256-cbc', password: 'pw', input: '轨道 🚀' });
  if (!cipEnc.startsWith('U2FsdGVkX1')) throw new Error('codec-lab password cipher is not a Salted__ blob');
  const cipDec = await manager.call('codec-lab', 'cipher', { op: 'decrypt', algo: 'aes-256-cbc', password: 'pw', input: cipEnc, inputFormat: 'base64' });
  if (cipDec !== '轨道 🚀') throw new Error('codec-lab password cipher round-trip failed');
  const rc4Hex = await manager.call('codec-lab', 'cipher', { op: 'encrypt', algo: 'rc4', key: 'Key', input: 'Plaintext', outputFormat: 'hex' });
  if (rc4Hex.toUpperCase() !== 'BBF316E8D940AF0AD3') throw new Error('codec-lab rc4 known vector mismatch');
  const gz = await manager.call('codec-lab', 'gzip', { op: 'compress', input: 'aaaa compress me 轨道', inputFormat: 'text', outputFormat: 'base64' });
  const gun = await manager.call('codec-lab', 'gzip', { op: 'decompress', input: gz, inputFormat: 'base64' });
  if (gun !== 'aaaa compress me 轨道') throw new Error('codec-lab gzip round-trip failed');
  console.log('codec-lab crypto/gzip IPC OK');

  // color-lab: palette state + conversion capability
  const colorState = await manager.call('color-lab', 'getState');
  if (!colorState || !colorState.color || colorState.settings.hideHost !== true || colorState.settings.freeze !== true) {
    throw new Error('color-lab getState failed');
  }
  const colorCfg = await manager.call('color-lab', 'setConfig', { hideHost: false, freeze: false, copyFormat: 'rgba' });
  if (colorCfg.settings.hideHost !== false || colorCfg.settings.freeze !== false || colorCfg.settings.copyFormat !== 'rgba') {
    throw new Error('color-lab setConfig failed');
  }
  const colorSet = await manager.call('color-lab', 'setColor', { color: { r: 255, g: 171, b: 46, a: 255 } });
  if (!colorSet.color || colorSet.color.r !== 255) throw new Error('color-lab setColor failed');
  const colorText = await manager.call('color-lab', 'convert', { value: 'rgba(255, 171, 46, 0.5)' });
  if (!colorText.includes('HEX') || !colorText.includes('#FFAB2E')) {
    throw new Error(`color-lab convert output unexpected: ${colorText}`);
  }
  const colorHex = await manager.call('color-lab', 'convert', { value: 'hsl(0, 100%, 50%)', config: { format: 'hex' } });
  if (colorHex !== '#FF0000') throw new Error(`color-lab hsl→hex failed: ${colorHex}`);
  await manager.call('color-lab', 'setConfig', { hideHost: true, freeze: true, copyFormat: 'hex' });
  console.log('color-lab palette IPC OK');

  // test plugin data dir custom switch
  const customDataDir = path.join(tmp, 'custom-data');
  const dataDirInfo = manager.setPluginDataDir(customDataDir);
  if (!dataDirInfo.isCustom || dataDirInfo.pluginDataDir !== customDataDir) throw new Error('setPluginDataDir failed');
  manager.setPluginDataDir(null);
  if (manager.dataRoot !== manager.defaultDataRoot) throw new Error('reset defaultDataRoot failed');
  console.log('plugin data dir custom switch OK');

  // mirror-hub live IPC verification
  const mSettings = await manager.call('mirror-hub', 'getSettings');
  if (!mSettings || !mSettings.proxyUrl) throw new Error('mirror-hub getSettings failed');
  const detectRes = await manager.call('mirror-hub', 'detectProxy');
  if (!detectRes.ok || !detectRes.url) throw new Error('mirror-hub detectProxy failed');
  const saveCustomProxyRes = await manager.call('mirror-hub', 'saveSettings', { proxyUrl: 'http://127.0.0.1:19999' });
  if (!saveCustomProxyRes.ok || saveCustomProxyRes.settings.proxyUrl !== 'http://127.0.0.1:19999') throw new Error('mirror-hub saveSettings custom proxy failed');
  const copyRes = await manager.call('mirror-hub', 'copyCommand', { command: 'npm install test' });
  if (!copyRes.ok) throw new Error('mirror-hub copyCommand failed');
  const addMirrorRes = await manager.call('mirror-hub', 'addCustomMirror', {
    envId: 'git',
    mirror: { name: '测试自定义加速', url: 'https://test.mirror.com/https://github.com/' }
  });
  if (!addMirrorRes.ok || !addMirrorRes.item) throw new Error('mirror-hub addCustomMirror failed');
  const customList = await manager.call('mirror-hub', 'getCustomMirrors');
  if (!customList.git || customList.git.length !== 1) throw new Error('customMirrors persistence failed');
  const delMirrorRes = await manager.call('mirror-hub', 'removeCustomMirror', { envId: 'git', id: addMirrorRes.item.id });
  if (!delMirrorRes.ok) throw new Error('mirror-hub removeCustomMirror failed');
  const pingRes = await manager.call('mirror-hub', 'pingMirror', { url: 'https://hk.gh-proxy.org/https://github.com/' });
  if (typeof pingRes.ms !== 'number') throw new Error('mirror-hub pingMirror failed');
  console.log('mirror-hub IPC OK');

  // verify openPanel routing for no-backend plugin (codec-lab) and host event delivery
  let mockReceivedChannel = null, mockReceivedPayload = null;
  const mockHost = {
    isDestroyed: () => false,
    isMinimized: () => false,
    restore: () => {},
    show: () => {},
    focus: () => {},
    setAlwaysOnTop: () => {},
    moveTop: () => {},
    webContents: {
      isDestroyed: () => false,
      send: (channel, payload) => {
        mockReceivedChannel = channel;
        mockReceivedPayload = payload;
      }
    }
  };
  manager.getHostWindow = () => mockHost;
  const openRes = await manager.call('codec-lab', 'openPanel');
  if (!openRes.ok) throw new Error('codec-lab openPanel failed');
  if (mockReceivedChannel !== 'open-plugin' || mockReceivedPayload !== 'codec-lab') {
    throw new Error('openPanel did not dispatch open-plugin event to host window');
  }
  console.log('codec-lab openPanel host routing OK');

  // verify cross-plugin openPluginPanel routing with view: 'panel'
  const memoP = manager.plugins.get('memo');
  const memoState = manager.active.get('memo');
  if (memoP && memoState) {
    const ctx = manager.makeContext(memoP, memoState);
    const opened = ctx.openPluginPanel('json-editor', { type: 'application/json', value: '{"test":1}' });
    if (!opened) throw new Error('openPluginPanel failed');
    if (mockReceivedChannel !== 'navigate-to' || !mockReceivedPayload || mockReceivedPayload.view !== 'panel' || mockReceivedPayload.pluginId !== 'json-editor') {
      throw new Error('openPluginPanel did not dispatch correct navigate-to payload: ' + JSON.stringify(mockReceivedPayload));
    }
    console.log('cross-plugin openPluginPanel routing OK');
  }

  // verify capabilities detection & smart peek
  const tsRes = manager.detectSmartPeek('1710000000');
  if (!tsRes || tsRes.pluginId !== 'codec-lab' || tsRes.type !== 'text/timestamp') {
    throw new Error('smart peek timestamp detection failed');
  }
  const portRes = manager.detectSmartPeek('8080');
  if (!portRes || portRes.pluginId !== 'port-scope' || portRes.type !== 'system/port') {
    throw new Error('smart peek port detection failed');
  }
  const inspectRes = await manager.call('port-scope', 'inspectPort', { port: 8080 });
  if (!inspectRes || !inspectRes.ok || inspectRes.port !== 8080) {
    throw new Error('port-scope inspectPort failed');
  }
  const jsonRes = manager.detectSmartPeek('{"name":"orbit","tool":true}');
  if (!jsonRes || jsonRes.pluginId !== 'json-editor' || jsonRes.type !== 'application/json') {
    throw new Error('smart peek json detection failed');
  }
  const colorRes = manager.detectSmartPeek('#FFAB2E');
  if (!colorRes || colorRes.pluginId !== 'color-lab' || colorRes.type !== 'color/css') {
    throw new Error(`smart peek color detection failed: ${JSON.stringify(colorRes)}`);
  }
  if (!colorRes.payload || colorRes.payload.color !== '#FFAB2E' || colorRes.copyValue !== '#FFAB2E') {
    throw new Error('smart peek color payload/copyValue mismatch');
  }
  const rgbaRes = manager.detectSmartPeek('rgba(0, 128, 255, 0.5)');
  if (!rgbaRes || rgbaRes.type !== 'color/css' || rgbaRes.payload.color !== '#0080FF') {
    throw new Error('smart peek rgba detection failed');
  }
  if (manager.detectSmartPeek('2026-10-29') !== null) {
    throw new Error('date-like string must not be detected as a color');
  }

  // test dynamic self-healing: disable codec-lab -> capability detection must NOT match
  manager.setEnabled('codec-lab', false);
  const disabledTsRes = manager.detectSmartPeek('1710000000');
  if (disabledTsRes !== null) {
    throw new Error('disabled plugin capability should not be detected');
  }
  manager.setEnabled('codec-lab', true);
  const reenabledTsRes = manager.detectSmartPeek('1710000000');
  if (!reenabledTsRes || reenabledTsRes.pluginId !== 'codec-lab') {
    throw new Error('re-enabled plugin capability should be detected again');
  }
  console.log('smart peek capabilities & self-healing OK');

  // verify pipeline transit actions & custom actionPaletteHotkey
  const jsonPipeline = manager.getPipelineActions({ type: 'application/json', value: '{"test":1}' });
  if (!jsonPipeline.find(a => a.pluginId === 'json-editor')) {
    throw new Error('pipeline should resolve json-editor for application/json');
  }
  const base64Pipeline = manager.getPipelineActions({ type: 'text/base64', value: 'SGVsbG8=' });
  if (!base64Pipeline.find(a => a.pluginId === 'codec-lab')) {
    throw new Error('pipeline should resolve codec-lab for text/base64');
  }
  const colorPipeline = manager.getPipelineActions({ type: 'color/css', value: '#FFAB2E' });
  if (!colorPipeline.find(a => a.pluginId === 'color-lab')) {
    throw new Error('pipeline should resolve color-lab for color/css');
  }

  // test pipeline self-healing: disable json-editor -> pipeline must exclude it
  manager.setEnabled('json-editor', false);
  const disabledJsonPipe = manager.getPipelineActions({ type: 'application/json', value: '{"test":1}' });
  if (disabledJsonPipe.find(a => a.pluginId === 'json-editor')) {
    throw new Error('disabled json-editor must be excluded from pipeline');
  }
  manager.setEnabled('json-editor', true);

  // test actionPaletteHotkey config persistence & hotkey manager integration
  if (cfg.data.actionPaletteHotkey !== 'Ctrl+K') {
    throw new Error(`expected default actionPaletteHotkey Ctrl+K, got ${cfg.data.actionPaletteHotkey}`);
  }
  const apHotkeyRes = hotkeys.setActionPaletteHotkey('Alt+K');
  if (!apHotkeyRes.ok || cfg.data.actionPaletteHotkey !== 'Alt+K') {
    throw new Error('actionPaletteHotkey update via hotkeys failed');
  }
  const statusRow = hotkeys.status.find(r => r.key === 'action-palette');
  if (!statusRow || statusRow.accel !== 'Alt+K') {
    throw new Error('action-palette not found in hotkeys status');
  }
  hotkeys.setActionPaletteHotkey('Ctrl+K');
  console.log('pipeline transit actions & custom actionPaletteHotkey OK');

  // verify workflow engine DAG execution & self-healing
  const { WorkflowManager } = require('../src/core/workflows');
  const wfManager = new WorkflowManager(cfg, manager);
  const wfs = wfManager.list();
  if (!Array.isArray(wfs) || wfs.length === 0) throw new Error('workflow manager should provide default workflows');

  // run json format workflow
  const jsonWfRes = await wfManager.run('wf-json-quick-format', { type: 'text/plain', value: '{"a":1,"b":[2,3]}' });
  if (!jsonWfRes.ok || !jsonWfRes.finalOutput || !jsonWfRes.finalOutput.value.includes('\n')) {
    throw new Error('json format workflow execution failed');
  }

  // test workflow self-healing when dependent plugin is disabled
  manager.setEnabled('json-editor', false);
  const disabledWfRes = await wfManager.run('wf-json-quick-format', { type: 'text/plain', value: '{"a":1}' });
  if (disabledWfRes.ok || !disabledWfRes.error.includes('禁用')) {
    throw new Error('workflow must safely guard against disabled plugin');
  }
  manager.setEnabled('json-editor', true);
  console.log('workflow DAG execution & disabled plugin guard OK');

  manager.deactivateAll();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('SMOKE PASS');
  app.exit(0);
}).catch(err => {
  console.error('SMOKE FAIL:', err);
  app.exit(1);
});
