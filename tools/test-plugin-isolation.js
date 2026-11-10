/**
 * Orbit Toolbox - Plugin Worker Host & Fault Isolation Tests
 * Validates that isolated plugins run safely inside Worker Threads,
 * handlers time out gracefully without freezing the host, and plugin
 * exceptions never crash the main process.
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const PluginManager = require('../src/core/plugin-manager');

async function run() {
  console.log('--- 1. Setting up mock environment & temporary plugin dirs ---');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-isolation-test-'));
  const userPluginsDir = path.join(tempDir, 'user-plugins');
  const pluginDataDir = path.join(tempDir, 'data');
  fs.mkdirSync(userPluginsDir, { recursive: true });
  fs.mkdirSync(pluginDataDir, { recursive: true });

  const mockConfig = {
    data: {
      enabled: { 'test-isolated': true },
      pluginHotkeys: {},
      userPluginsDir,
      pluginDataDir,
    },
    set(patch) { Object.assign(this.data, patch); },
  };

  // Create mock isolated user plugin
  const testPluginDir = path.join(userPluginsDir, 'test-isolated');
  fs.mkdirSync(testPluginDir, { recursive: true });

  const manifest = {
    id: 'test-isolated',
    name: 'Test Isolated Plugin',
    version: '1.0.0',
    backend: 'backend.js',
    isolated: true,
  };
  fs.writeFileSync(path.join(testPluginDir, 'plugin.json'), JSON.stringify(manifest, null, 2));

  // Backend implementation with standard, faulty, and hanging handlers
  const backendCode = `
module.exports = {
  activate(ctx) {
    ctx.ipc.handle('ping', async args => {
      return { pong: true, echoed: args.msg, timestamp: Date.now() };
    });

    ctx.ipc.handle('mutateData', async args => {
      const cur = ctx.data.get();
      return ctx.data.set({ count: (cur.count || 0) + (args.delta || 1) });
    });

    ctx.ipc.handle('broadcastEvent', async args => {
      ctx.send('custom-event', { detail: args.detail });
      return { sent: true };
    });

    ctx.ipc.handle('throwSync', () => {
      throw new Error('Fatal simulated worker sync crash');
    });

    ctx.ipc.handle('hangForever', () => {
      return new Promise(() => {}); // never resolves
    });
  },
};
`;
  fs.writeFileSync(path.join(testPluginDir, 'backend.js'), backendCode);

  const manager = new PluginManager({
    userDataDir: tempDir,
    config: mockConfig,
    getHostWindow: () => null,
  });

  manager.discover();
  const plugins = manager.plugins;
  assert(plugins.has('test-isolated'), 'Plugin discovered');
  assert.strictEqual(plugins.get('test-isolated').source, 'user');

  console.log('--- 2. Testing isolated worker activation & RPC round-trip ---');
  const activated = manager.activate('test-isolated');
  assert.strictEqual(activated, true, 'Activation succeeded');

  const pingRes = await manager.call('test-isolated', 'ping', { msg: 'hello sandbox' });
  assert.strictEqual(pingRes.pong, true);
  assert.strictEqual(pingRes.echoed, 'hello sandbox');
  console.log('Worker RPC ping/pong OK');

  console.log('--- 3. Testing worker data persistence ---');
  const d1 = await manager.call('test-isolated', 'mutateData', { delta: 5 });
  assert.strictEqual(d1.count, 5);
  const d2 = await manager.call('test-isolated', 'mutateData', { delta: 10 });
  assert.strictEqual(d2.count, 15);

  const persistedFile = path.join(pluginDataDir, 'test-isolated.json');
  assert(fs.existsSync(persistedFile), 'Data persisted to disk');
  const persistedContent = JSON.parse(fs.readFileSync(persistedFile, 'utf8'));
  assert.strictEqual(persistedContent.count, 15);
  console.log('Worker data persistence OK');

  console.log('--- 4. Testing worker event broadcasting ---');
  let eventReceived = null;
  manager.on('plugin-event', ev => {
    if (ev.id === 'test-isolated' && ev.channel === 'custom-event') {
      eventReceived = ev.payload;
    }
  });

  await manager.call('test-isolated', 'broadcastEvent', { detail: 'event-ok' });
  assert(eventReceived !== null);
  assert.strictEqual(eventReceived.detail, 'event-ok');
  console.log('Worker event broadcast OK');

  console.log('--- 5. Testing error boundary & fault containment ---');
  let threwSync = false;
  try {
    await manager.call('test-isolated', 'throwSync', {});
  } catch (err) {
    threwSync = true;
    assert(err.message.includes('Fatal simulated worker sync crash'));
  }
  assert(threwSync, 'Plugin exception caught cleanly without crashing host');
  console.log('Plugin sync error contained OK');

  console.log('--- 6. Testing call timeout guard ---');
  let timedOut = false;
  try {
    await manager.call('test-isolated', 'hangForever', {}, null, { timeoutMs: 300 });
  } catch (err) {
    timedOut = true;
    assert(err.message.includes('timed out'));
  }
  assert(timedOut, 'Hanging handler timed out via timeout guard');
  console.log('Timeout guard protection OK');

  console.log('--- 7. Testing quarantine mechanism on repeated errors ---');
  let quarantinedEvent = false;
  manager.on('plugin-quarantined', ({ id }) => {
    if (id === 'test-isolated') quarantinedEvent = true;
  });

  for (let i = 0; i < 5; i++) {
    try { await manager.call('test-isolated', 'throwSync', {}); } catch {}
  }
  assert.strictEqual(quarantinedEvent, true, 'Quarantine event emitted');

  let blockedByQuarantine = false;
  try {
    await manager.call('test-isolated', 'ping', { msg: 'should be blocked' });
  } catch (err) {
    blockedByQuarantine = true;
    assert(err.message.includes('quarantined'));
  }
  assert(blockedByQuarantine, 'Calls to quarantined plugin rejected');
  console.log('Quarantine circuit-breaker OK');

  console.log('--- 8. Testing deactivation & teardown ---');
  manager.deactivate('test-isolated');
  assert(!manager.active.has('test-isolated'), 'Plugin deactivated cleanly');

  // Cleanup temp files
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  console.log('Teardown OK');

  console.log('\nALL PLUGIN ISOLATION & FAULT TOLERANCE TESTS PASSED!');
  process.exit(0);
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
