/* 工具页排序方式回归测试：默认 / 常用优先 / 最近使用 / 名称。
   跑真实主进程栈（config + manager + ipc）与真实卡片 DOM，检查
   1) 四种排序的卡片顺序；2) 用量按插件聚合（action:/ctx:/pipeline: 归并、workflow: 排除）；
   3) 卡片点击补记 usage；4) deckSort 落盘与重启恢复。
   运行：electron tools/test-deck-sort.js */
const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

const Config = require('../src/core/config');
const PluginManager = require('../src/core/plugin-manager');
const { registerPluginProtocol } = require('../src/core/plugin-protocol');
const createHotkeys = require('../src/core/hotkeys');
const registerIpc = require('../src/core/ipc');

protocol.registerSchemesAsPrivileged([
  { scheme: 'plugin', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, cond, extra) => {
  results.push([name, !!cond]);
  console.log(cond ? '  PASS:' : '  FAIL:', name, extra === undefined ? '' : JSON.stringify(extra));
};

const READ_DECK = `(() => Array.from(document.querySelectorAll('#deck .card'))
  .map(c => ({ id: c.dataset.id, name: c.querySelector('.card-name').textContent })))()`;

app.on('window-all-closed', e => e.preventDefault());

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-deck-sort-'));
  const cfg = new Config(tmp);
  let win = null;
  const manager = new PluginManager({ userDataDir: tmp, config: cfg, getHostWindow: () => win });
  const hotkeys = createHotkeys({ cfg, manager, onSummon: () => {} });
  registerPluginProtocol(manager);
  registerIpc({ app, cfg, manager, hotkeys, getHostWindow: () => win });
  manager.discover();
  for (const p of manager.plugins.values()) if (p.enabled) manager.activate(p.id);

  const featureErrors = [];
  const watch = w => w.webContents.on('console-message', (e, level, msg) => {
    if (level >= 3 && /deckSort|sortDeck|pluginUsageIndex|useDeckTool|DECK_SORTS|deck-bar|deckToolName/.test(msg)) {
      featureErrors.push(msg);
    }
  });

  const openWindow = async () => {
    const w = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'src', 'preload.js'),
        contextIsolation: true, nodeIntegration: false, sandbox: true,
      },
    });
    watch(w);
    await w.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
    await sleep(1200);
    return w;
  };
  const js = code => win.webContents.executeJavaScript(code);
  const clickPill = async mode => {
    await js(`document.querySelector('#deckSort button[data-sort="${mode}"]').click()`);
    await sleep(120);
    return js(READ_DECK);
  };
  const onPill = () => js(`document.querySelector('#deckSort button.on')?.dataset.sort || null`);
  const meta = () => js(`document.getElementById('deckMeta').textContent`);
  const ids = rows => rows.map(r => r.id);
  const byId = (a, b) => a.localeCompare(b);

  win = await openWindow();
  console.log('\n--- 1. 默认顺序与空记录提示 ---');
  const defaultRows = await js(READ_DECK);
  const defaultIds = ids(defaultRows);
  check('卡片渲染出 data-id 且数量可用', defaultIds.length > 3, defaultIds.length);
  check('默认顺序即 ID 顺序', JSON.stringify(defaultIds) === JSON.stringify([...defaultIds].sort(byId)), defaultIds);
  check('启动时选中「默认」', await onPill() === 'default');
  await clickPill('frequent');
  check('无使用记录时提示补在计数行', (await meta()).includes('暂无使用记录'), await meta());

  console.log('\n--- 2. 名称排序与偏好落盘 ---');
  const nameRows = await clickPill('name');
  const expectedName = [...nameRows].sort((a, b) =>
    a.name.localeCompare(b.name, 'zh') || byId(a.id, b.id));
  check('名称顺序与当前语言工具名一致', JSON.stringify(ids(nameRows)) === JSON.stringify(ids(expectedName)), ids(nameRows));
  check('名称顺序确实重排过（非默认顺序）', JSON.stringify(ids(nameRows)) !== JSON.stringify(defaultIds), ids(nameRows));
  check('deckSort 写入 config.json', JSON.parse(fs.readFileSync(path.join(tmp, 'config.json'), 'utf8')).deckSort === 'name');

  console.log('\n--- 3. 用量按插件聚合后排序 ---');
  // memo 走两条 action 记录（验证归并），workflow 记录必须被忽略
  await js(`(() => { bumpUsageId('action:memo:memo:a'); bumpUsageId('action:memo:memo:a');
    bumpUsageId('action:memo:memo:b'); bumpUsageId('action:memo:memo:b'); })()`);
  await sleep(10);
  await js(`(() => { bumpUsageId('plugin:json-editor'); bumpUsageId('plugin:json-editor');
    bumpUsageId('plugin:json-editor'); bumpUsageId('plugin:json-editor'); bumpUsageId('plugin:json-editor'); })()`);
  await sleep(10);
  await js(`bumpUsageId('plugin:screenshot-pin'); bumpUsageId('plugin:screenshot-pin')`);
  await sleep(10);
  await js(`for (let i = 0; i < 99; i++) bumpUsageId('workflow:demo-flow')`);
  await sleep(250);

  const freq = ids(await clickPill('frequent'));
  check('常用优先：两条 action 记录归并为 memo(4)', freq.slice(0, 3).join() === 'json-editor,memo,screenshot-pin', freq.slice(0, 3));
  check('常用优先：次数多的排在前面', freq.indexOf('json-editor') < freq.indexOf('screenshot-pin'), freq.slice(0, 4));
  const rec = ids(await clickPill('recent'));
  check('最近使用：按最后时间倒序', rec.slice(0, 3).join() === 'screenshot-pin,json-editor,memo', rec.slice(0, 3));
  check('最近使用：无记录工具排在已用之后', rec.indexOf('memo') < rec.indexOf(defaultIds.find(id => !['memo', 'json-editor', 'screenshot-pin'].includes(id))));
  check('workflow 用量不参与工具排序', rec[0] !== undefined && rec.slice(0, 3).join() === 'screenshot-pin,json-editor,memo');
  check('有记录后不再显示提示', !(await meta()).includes('暂无使用记录'), await meta());

  console.log('\n--- 4. 卡片点击补记用量 ---');
  const lastId = rec[rec.length - 1];
  await js(`document.querySelector('#deck .card[data-id="${lastId}"]').click()`);
  await sleep(400);
  const used = JSON.parse(fs.readFileSync(path.join(tmp, 'config.json'), 'utf8')).usage;
  check('点击卡片写入 plugin:<id>', used[`plugin:${lastId}`] && used[`plugin:${lastId}`].n === 1, used[`plugin:${lastId}`]);
  check('点击后切到面板视图', await js(`document.getElementById('viewPanel').hidden === false`));
  await js(`document.getElementById('btnBack').click()`);
  await sleep(150);
  const afterBack = ids(await js(READ_DECK));
  check('返回工具页时刚用过的工具上浮到首位', afterBack[0] === lastId, { expected: lastId, actual: afterBack[0] });

  console.log('\n--- 5. 重启恢复排序方式 ---');
  await win.close();
  win = await openWindow();
  check('重启后选中的仍是「最近使用」', await onPill() === 'recent');
  const restored = ids(await js(READ_DECK));
  check('重启后顺序沿用最近使用', restored[0] === lastId, { first: restored[0], want: lastId });

  manager.deactivateAll();
  fs.rmSync(tmp, { recursive: true, force: true });

  check('无排序相关控制台报错', featureErrors.length === 0, featureErrors);
  const failed = results.filter(([, ok]) => !ok);
  console.log(`\n${failed.length === 0 ? 'SUCCESS' : 'FAIL'}: ${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) console.log('未通过项:', failed.map(([n]) => n).join(' | '));
  app.exit(failed.length === 0 ? 0 : 1);
}).catch(err => {
  console.error('Deck sort test exception:', err);
  app.exit(1);
});
