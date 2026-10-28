/* Verification script for clipboard link extraction, dual classification & display */
const { app, clipboard } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const assert = require('assert');
const PluginManager = require('../src/core/plugin-manager');
const Config = require('../src/core/config');

app.whenReady().then(async () => {
  try {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-clip-test-'));
    const cfg = new Config(tmp);
    const manager = new PluginManager({ userDataDir: tmp, config: cfg, getHostWindow: () => null });
    const found = manager.discover();
    for (const p of found) {
      manager.activate(p.id);
    }

    const backend = manager.active.get('clip-history');
    assert(backend, 'clip-history backend should be active');

    // 1. Test clearAll
    await manager.call('clip-history', 'clearAll', { keepPinned: false });
    let list = await manager.call('clip-history', 'getHistory');
    assert.strictEqual(list.length, 0, 'History should be empty');

    // 2. Test pure URL copy
    clipboard.writeText('https://example.com');
    await new Promise(r => setTimeout(r, 1200));
    list = await manager.call('clip-history', 'getHistory');
    assert.strictEqual(list.length, 1, 'Should have 1 item');
    assert.strictEqual(list[0].type, 'link', 'Item should be link type');
    assert.strictEqual(list[0].content, 'https://example.com');
    assert.strictEqual(list[0].links.length, 1);
    assert.strictEqual(list[0].links[0].url, 'https://example.com');

    // 3. Test text with embedded links and Chinese punctuation
    clipboard.writeText('欢迎体验工具箱：https://github.com/Ikaros-521/orbit-tools，官方文档在 www.orbit.dev/doc。敬请期待！');
    await new Promise(r => setTimeout(r, 1200));
    list = await manager.call('clip-history', 'getHistory');
    assert.strictEqual(list.length, 2, 'Should have 2 items');

    const mixedItem = list[0];
    assert.strictEqual(mixedItem.type, 'text', 'Embedded link text should be text type');
    assert(Array.isArray(mixedItem.links), 'links should be array');
    assert.strictEqual(mixedItem.links.length, 2, 'Should extract 2 URLs');
    assert.strictEqual(mixedItem.links[0].url, 'https://github.com/Ikaros-521/orbit-tools');
    assert.strictEqual(mixedItem.links[1].url, 'https://www.orbit.dev/doc');

    // 4. Test pure text without any links
    clipboard.writeText('纯普通文本没有任何网址 123456');
    await new Promise(r => setTimeout(r, 1200));
    list = await manager.call('clip-history', 'getHistory');
    assert.strictEqual(list.length, 3, 'Should have 3 items');
    const pureTextItem = list[0];
    assert.strictEqual(pureTextItem.type, 'text');
    assert.strictEqual(pureTextItem.links.length, 0);

    // 5. Test Wikipedia link with parenthesized path: (https://en.wikipedia.org/wiki/URL_(disambiguation))
    clipboard.writeText('(https://en.wikipedia.org/wiki/URL_(disambiguation))');
    await new Promise(r => setTimeout(r, 1200));
    list = await manager.call('clip-history', 'getHistory');
    assert.strictEqual(list.length, 4, 'Should have 4 items');
    const wikiItem = list[0];
    assert.strictEqual(wikiItem.links.length, 1);
    assert.strictEqual(wikiItem.links[0].url, 'https://en.wikipedia.org/wiki/URL_(disambiguation)');

    // 6. Test writeClipboardText IPC (anti-echo protection)
    const writeRes = await manager.call('clip-history', 'writeClipboardText', { text: 'https://test-extracted-copy.com' });
    assert(writeRes.ok, 'writeClipboardText should succeed');
    assert.strictEqual(clipboard.readText(), 'https://test-extracted-copy.com');
    // Verify anti-echo: history length should remain 4, not increased to 5
    await new Promise(r => setTimeout(r, 1200));
    list = await manager.call('clip-history', 'getHistory');
    assert.strictEqual(list.length, 4, 'Self-written text should not duplicate in history');

    // 7. Test openExternal security check
    const extRefuse = await manager.call('clip-history', 'openExternal', { url: 'javascript:alert(1)' });
    assert.strictEqual(extRefuse.ok, false, 'Should refuse javascript: pseudo-protocols');

    console.log('ALL CLIPBOARD LINK UNIT TESTS PASSED!');
    app.quit();
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
});
