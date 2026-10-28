/* One-off E2E verification of the new workflow UI features:
   rename/desc/enabled editor, node inspector, library search, run-without-save.
   Run: electron tools/test-workflow-ui.js */
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
const check = (name, cond, extra) => {
  results.push([name, !!cond]);
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  => ${JSON.stringify(extra)}`}`);
};

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-wfui-'));
  const cfg = new Config(tmp);
  let win = null;
  const manager = new PluginManager({ userDataDir: tmp, config: cfg, getHostWindow: () => win });
  const hotkeys = createHotkeys({ cfg, manager, onSummon: () => {} });
  registerPluginProtocol(manager);
  registerIpc({ app, cfg, manager, hotkeys, getHostWindow: () => win });
  manager.discover();
  for (const p of manager.plugins.values()) if (p.enabled) manager.activate(p.id);

  win = new BrowserWindow({
    width: 1180, height: 760, show: false,
    webPreferences: {
      preload: path.join(ROOT, 'src/preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log(`  renderer[${level}] ${message}`);
  });
  await win.loadFile(path.join(ROOT, 'src/renderer/index.html'));
  await sleep(900);

  const page = js => win.webContents.executeJavaScript(js);

  // 进入工作流视图
  await page(`document.querySelector('#tabs button[data-view="workflows"]').click()`);
  await sleep(600);

  // 1. 元信息编辑器：改名 + 自动保存
  const meta = await page(`(async () => {
    document.getElementById('btnWfNew').click();
    await new Promise(r => setTimeout(r, 700));
    const nameInput = document.getElementById('wfNameInput');
    const focused = document.activeElement === nameInput;
    nameInput.value = '我的自动化流程';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 900)); // 等待防抖自动保存
    const saved = await window.host.listWorkflows();
    const opt = [...document.querySelectorAll('#wfSelect option')].map(o => o.textContent);
    return {
      focused,
      nameBound: nameInput.value,
      savedName: (saved.find(w => w.name === '我的自动化流程') || {}).name || null,
      selectorShows: opt.some(t => t.includes('我的自动化流程')),
      savedCount: saved.length,
    };
  })()`);
  check('新建后名称输入框自动聚焦', meta.focused);
  check('改名自动保存到主进程', meta.savedName === '我的自动化流程', meta);
  check('下拉选择器同步显示新名称', meta.selectorShows);

  // 2. 节点检查器：选中新节点并修改配置
  const insp = await page(`(async () => {
    const api = window.__wfTestApi;
    api.addNodeToCanvas('util/regex-extract', '提取版本', { config: { pattern: 'v(\\\\d+)', group: 1 } });
    await new Promise(r => setTimeout(r, 100));
    const nodeEl = document.querySelector('.wf-node[data-id="' + api.getCurrentWorkflow().nodes[api.getCurrentWorkflow().nodes.length-1].id + '"]');
    nodeEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const panel = document.getElementById('wfInspector');
    const visibleAfterSelect = !panel.hidden;
    const inputs = panel.querySelectorAll('.wf-insp-input');
    // 修改正则配置
    const patternInput = [...inputs].find(i => i.value === 'v(\\\\d+)');
    if (patternInput) {
      patternInput.value = 'x(\\\\d+)';
      patternInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 100));
    const node = api.getCurrentWorkflow().nodes.find(n => n.type === 'util/regex-extract');
    // 画布重渲染后需重新查询节点卡 (旧引用已脱离 DOM)
    const freshEl = document.querySelector('.wf-node[data-id="' + node.id + '"]');
    const cfgSummary = freshEl && freshEl.querySelector('.wf-node-cfg') ? freshEl.querySelector('.wf-node-cfg').textContent : '';
    return {
      visibleAfterSelect,
      fieldCount: inputs.length,
      configUpdated: node && node.config.pattern === 'x(\\\\d+)',
      typeShown: document.getElementById('wfInspType').textContent,
      cfgSummary,
    };
  })()`);
  check('选中节点后检查器出现', insp.visibleAfterSelect);
  check('检查器字段渲染 (标题+3个配置)', insp.fieldCount >= 4, insp);
  check('检查器修改写入节点配置', insp.configUpdated);
  check('节点卡显示配置摘要', insp.cfgSummary.includes('x('), insp);

  // 2b. 唤起面板节点：检查器提供目标插件下拉并写入节点
  const panelSel = await page(`(async () => {
    const api = window.__wfTestApi;
    api.addNodeToCanvas('output/panel', '唤起插件');
    await new Promise(r => setTimeout(r, 100));
    const node = api.getCurrentWorkflow().nodes.find(n => n.type === 'output/panel' && !n.pluginId);
    const el = document.querySelector('.wf-node[data-id="' + node.id + '"]');
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const sel = document.getElementById('wfInspBody').querySelector('select');
    const optionCount = sel ? sel.querySelectorAll('option').length : 0;
    const jsonOpt = sel ? [...sel.querySelectorAll('option')].find(o => o.value === 'json-editor') : null;
    if (jsonOpt) {
      sel.value = 'json-editor';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 150));
    const fresh = document.querySelector('.wf-node[data-id="' + node.id + '"]');
    return {
      optionCount,
      hasJsonOption: !!jsonOpt,
      pluginIdWritten: node.pluginId === 'json-editor',
      summary: fresh && fresh.querySelector('.wf-node-cfg') ? fresh.querySelector('.wf-node-cfg').textContent : '',
    };
  })()`);
  check('唤起面板节点检查器提供插件下拉', panelSel.optionCount >= 2 && panelSel.hasJsonOption, panelSel);
  check('选择插件写入节点并更新摘要', panelSel.pluginIdWritten && (panelSel.summary.includes('json-editor') || panelSel.summary.includes('JSON')), panelSel);

  // 3. 节点库搜索过滤
  const lib = await page(`(async () => {
    const search = document.getElementById('wfLibSearch');
    search.value = '正则';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 100));
    const items = [...document.querySelectorAll('.wf-lib-item .wf-lib-item-title')].map(e => e.textContent);
    const groups = [...document.querySelectorAll('.wf-lib-group-title')].map(e => e.textContent);
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 100));
    const total = document.querySelectorAll('.wf-lib-item').length;
    return { filtered: items, filteredGroups: groups, total };
  })()`);
  check('搜索"正则"命中正则提取且仅在内置工具组', lib.filtered.includes('正则提取') && lib.filteredGroups.length === 1 && lib.filteredGroups[0].includes('内置工具'), lib);
  check('清空搜索后恢复完整节点库', lib.total >= 12, lib);

  // 4. 未保存修改直接运行测试 (run 前自动同步画布)
  const run = await page(`(async () => {
    const api = window.__wfTestApi;
    const wf = api.getCurrentWorkflow();
    // 手动触发 → 静态文本 → 正则提取 (全部未保存)
    api.addNodeToCanvas('source/text', '固定文本', { config: { text: 'build x42 done', type: 'text/plain' } });
    await new Promise(r => setTimeout(r, 50));
    const nodes = api.getCurrentWorkflow().nodes;
    const trig = nodes.find(n => n.type === 'trigger/manual');
    const src = nodes.find(n => n.type === 'source/text');
    const re = nodes.find(n => n.type === 'util/regex-extract');
    wf.edges.push({ id: 'te-1', from: trig.id, to: src.id }, { id: 'te-2', from: src.id, to: re.id });
    document.getElementById('wfTestInput').value = '';
    document.getElementById('btnWfRun').click();
    await new Promise(r => setTimeout(r, 800));
    const log = document.getElementById('wfConsoleBody').textContent;
    return { logIncludes42: log.includes('42'), logHasRun: log.includes('▶') };
  })()`);
  check('未保存的画布修改直接参与运行测试 (提取出 42)', run.logIncludes42, run);

  // 5. 启用开关写回
  const toggle = await page(`(async () => {
    const t = document.getElementById('wfEnabledToggle');
    const curId = document.getElementById('wfSelect').value;
    t.checked = false;
    t.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 900));
    const wf = (await window.host.listWorkflows()).find(w => w.id === curId);
    t.checked = true;
    t.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 900));
    const saved2 = (await window.host.listWorkflows()).find(w => w.id === curId);
    return { afterOff: wf.enabled, afterOn: saved2.enabled };
  })()`);
  check('启用开关持久化 (off→on)', toggle.afterOff === false && toggle.afterOn === true, toggle);

  const fails = results.filter(r => !r[1]).length;
  console.log(`\nWF-UI: ${results.length - fails}/${results.length} pass`);
  app.exit(fails > 0 ? 1 : 0);
});
