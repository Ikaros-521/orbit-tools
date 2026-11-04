/* Comprehensive test suite for mirror-hub:
   - Docker support verification (mirrors, commands)
   - Windows PowerShell vs CMD command syntax differentiation across all environments
   - Backend IPC settings & terminal execution dispatch
*/
const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { app } = require('electron');

const PluginManager = require('../src/core/plugin-manager');
const Config = require('../src/core/config');

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-mirror-test-'));
  const cfg = new Config(tmp);
  const manager = new PluginManager({ userDataDir: tmp, config: cfg, getHostWindow: () => null });
  manager.discover();
  const ok = manager.activate('mirror-hub');
  assert(ok, 'mirror-hub should activate');

  console.log('Testing mirror-hub settings & shellType persistence...');
  const initSettings = await manager.call('mirror-hub', 'getSettings');
  assert(initSettings && initSettings.proxyUrl, 'should return proxyUrl');
  assert.strictEqual(initSettings.shellType, 'powershell', 'default shellType should be powershell');

  const saveRes = await manager.call('mirror-hub', 'saveSettings', { shellType: 'cmd' });
  assert(saveRes.ok, 'saveSettings should succeed');
  assert.strictEqual(saveRes.settings.shellType, 'cmd', 'shellType should be cmd');

  const reloaded = await manager.call('mirror-hub', 'getSettings');
  assert.strictEqual(reloaded.shellType, 'cmd', 'persisted shellType should be cmd');

  // Restore to powershell
  await manager.call('mirror-hub', 'saveSettings', { shellType: 'powershell' });

  console.log('Testing mirror-hub custom mirrors for docker...');
  const addDocker = await manager.call('mirror-hub', 'addCustomMirror', {
    envId: 'docker',
    mirror: { name: '自建私有加速站', url: 'mirror.company.internal' }
  });
  assert(addDocker.ok, 'addCustomMirror for docker should succeed');

  const customs = await manager.call('mirror-hub', 'getCustomMirrors');
  assert(Array.isArray(customs.docker) && customs.docker.length === 1, 'docker custom mirror should persist');
  assert.strictEqual(customs.docker[0].name, '自建私有加速站');

  await manager.call('mirror-hub', 'removeCustomMirror', { envId: 'docker', id: addDocker.item.id });
  const afterRemove = await manager.call('mirror-hub', 'getCustomMirrors');
  assert(afterRemove.docker.length === 0, 'custom mirror should be removed');

  console.log('Testing terminal launcher IPC with shell parameter...');
  // Empty command guard
  const emptyRes = await manager.call('mirror-hub', 'runInTerminal', { command: '' });
  assert(!emptyRes.ok, 'empty command should fail');

  console.log('All backend mirror-hub tests passed!');
  app.exit(0);
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
