/* Test Hotkey Clear / Disable Flow.
   Verifies that clearing or deleting an action hotkey completely unregisters it,
   prevents fallback to manifest default hotkeys, correctly serializes as null,
   and persists across app reloads.
   Run with: electron tools/test-hotkey-clear.js */
const { app } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

const Config = require('../src/core/config');
const PluginManager = require('../src/core/plugin-manager');
const createHotkeys = require('../src/core/hotkeys');

function assert(cond, msg) {
  if (!cond) {
    console.error(`[FAIL] ${msg}`);
    throw new Error(msg);
  }
}

app.whenReady().then(async () => {
  try {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-test-hk-'));
    const cfg = new Config(tmp);
    const manager = new PluginManager({ userDataDir: tmp, config: cfg, getHostWindow: () => null });
    manager.discover();
    const hotkeys = createHotkeys({ cfg, manager, onSummon: () => {}, onSummonActionPalette: () => {} });
    hotkeys.registerAll({ allowFallback: true });

    console.log('[1] Checking initial default hotkey for calculator:open...');
    const initPlugin = manager.serialize().find(p => p.id === 'calculator');
    assert(initPlugin.actions[0].hotkey === 'Ctrl+Shift+L', 'serialized initial hotkey should be Ctrl+Shift+L');

    console.log('[2] Clearing calculator:open hotkey (set to null)...');
    const clearRes = hotkeys.setPluginHotkey('calculator:open', null);
    assert(clearRes.ok, 'setPluginHotkey to null should return ok: true');
    assert(!clearRes.hotkey, 'clearRes should not return a hotkey');

    const afterClearStatus = hotkeys.status.find(r => r.key === 'calculator:open');
    assert(!afterClearStatus, 'calculator:open must be completely unregistered from hotkeys.status');
    assert(cfg.data.pluginHotkeys['calculator:open'] === null, 'config must store explicit null for cleared hotkey');

    const afterClearPlugin = manager.serialize().find(p => p.id === 'calculator');
    assert(afterClearPlugin.actions[0].hotkey === null, 'serialized action hotkey must be null after clearing');

    console.log('[3] Testing registerAll() does not resurrect default hotkey...');
    hotkeys.registerAll({ allowFallback: false });
    const reloadStatus = hotkeys.status.find(r => r.key === 'calculator:open');
    assert(!reloadStatus, 'registerAll must NOT resurrect cleared default hotkey');

    console.log('[4] Re-binding calculator:open to a new custom accelerator...');
    const bindRes = hotkeys.setPluginHotkey('calculator:open', 'Ctrl+Shift+9');
    assert(bindRes.ok, 'binding new custom hotkey should succeed');
    const rebindStatus = hotkeys.status.find(r => r.key === 'calculator:open');
    assert(rebindStatus && rebindStatus.accel === 'Ctrl+Shift+9', 'custom hotkey must be active in status');

    console.log('[5] Clearing custom hotkey again...');
    const clearAgainRes = hotkeys.setPluginHotkey('calculator:open', null);
    assert(clearAgainRes.ok && !clearAgainRes.hotkey, 'clearing custom hotkey should succeed');
    assert(!hotkeys.status.find(r => r.key === 'calculator:open'), 'custom hotkey must be removed from status');

    console.log('[6] Testing actionPaletteHotkey clearing...');
    assert(cfg.data.actionPaletteHotkey === 'Ctrl+K', 'actionPaletteHotkey should initially be Ctrl+K');
    const apClearRes = hotkeys.setActionPaletteHotkey(null);
    assert(apClearRes.ok && !apClearRes.hotkey, 'setActionPaletteHotkey(null) should succeed');
    assert(cfg.data.actionPaletteHotkey === null, 'actionPaletteHotkey in config must be null');
    assert(!hotkeys.status.find(r => r.key === 'action-palette'), 'action-palette must be unregistered from status');
    hotkeys.registerAll({ allowFallback: false });
    assert(!hotkeys.status.find(r => r.key === 'action-palette'), 'registerAll must not resurrect action-palette hotkey');

    console.log('[7] Testing config persistence across reload...');
    const cfg2 = new Config(tmp);
    assert(cfg2.data.pluginHotkeys['calculator:open'] === null, 'cleared plugin hotkey must persist as null in fresh config load');
    assert(cfg2.data.actionPaletteHotkey === null, 'cleared actionPaletteHotkey must persist as null in fresh config load');
    const manager2 = new PluginManager({ userDataDir: tmp, config: cfg2, getHostWindow: () => null });
    manager2.discover();
    const serialized2 = manager2.serialize().find(p => p.id === 'calculator');
    assert(serialized2.actions[0].hotkey === null, 'reloaded plugin serialization must keep hotkey as null');

    console.log('ALL HOTKEY CLEAR TESTS PASSED!');
    process.exit(0);
  } catch (err) {
    console.error('[TEST ERROR]', err);
    process.exit(1);
  } finally {
    app.quit();
  }
});
