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

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-smoke-'));
  const cfg = new Config(tmp);
  const manager = new PluginManager({ userDataDir: tmp, config: cfg, getHostWindow: () => null });

  const found = manager.discover();
  const info = manager.serialize();
  console.log('discovered:', found.map(p => `${p.id}(${p.source})`).join(', '));

  const expect = ['antigravity-launcher', 'clip-history', 'codec-lab', 'draw-board', 'port-scope', 'screenshot-pin'];
  const missing = expect.filter(id => !info.find(p => p.id === id));
  if (missing.length) throw new Error(`missing plugins: ${missing}`);
  if (info.find(p => p.id === 'codec-lab').hasBackend) throw new Error('codec-lab should have no backend');
  if (!info.find(p => p.id === 'clip-history').hasBackend) throw new Error('clip-history should have a backend');
  for (const p of info) {
    if (!p.name.zh || !p.panel) throw new Error(`bad manifest for ${p.id}`);
  }

  /* --- plugin:// protocol -------------------------------------------------- */
  registerPluginProtocol(manager);
  const { net } = require('electron');
  const fetchStatus = async url => (await net.fetch(url)).status;
  if (await fetchStatus('plugin://codec-lab/panel.js') !== 200) throw new Error('plugin:// panel.js not served');
  if (await fetchStatus('plugin://codec-lab/icon.svg') !== 200) throw new Error('plugin:// icon.svg not served');
  // The WHATWG URL parser collapses encoded ../ segments during normalization,
  // so traversal dies as 404; the handler's containment check would 403 anything
  // that still slips through. Either way the file must NOT be served.
  const blocked = s => s === 403 || s === 404;
  if (!blocked(await fetchStatus('plugin://codec-lab/%2e%2e/%2e%2e/main.js'))) throw new Error('path traversal not blocked');
  if (!blocked(await fetchStatus('plugin://codec-lab/%2e%2e%5c%2e%2e%5cmain.js'))) throw new Error('backslash traversal not blocked');
  if (await fetchStatus('plugin://nope/panel.js') !== 404) throw new Error('unknown plugin should 404');
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
  console.log('clip-history IPC OK');

  manager.deactivateAll();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('SMOKE PASS');
  app.exit(0);
}).catch(err => {
  console.error('SMOKE FAIL:', err);
  app.exit(1);
});
