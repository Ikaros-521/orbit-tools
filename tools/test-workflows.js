/* Data-driven workflow test harness.
   Boots the real engine stack (Config + PluginManager + WorkflowManager,
   no window) against throwaway user-data dirs and runs every scenario file
   in tools/workflow-scenarios/*.js.

   Adding coverage for a new plugin/workflow combo = dropping a new scenario
   file; the harness never changes. Two scenario styles are supported:

   1. Declarative — describe the workflow + input, assert on the result:

        {
          name: 'JSON 字段提取',
          plugins: [fakePlugin(...)],            // optional
          workflow: { id, name, nodes, edges },
          input: { type: 'text/plain', value: '...' },
          expect: {
            ok: true,                             // default true
            errorIncludes: '...',                 // when ok:false
            finalType: 'application/json',
            finalValue: 'exact',                  // or /regex/
            finalValueIncludes: 'substring',
            nodes: [                              // ordered per-node status
              { title: '条件判断', status: 'ok' | 'error' | 'skipped' },
            ],
          },
        }

   2. Imperative — full control for timing/event scenarios (auto-triggers,
      watcher loops, save/rename semantics):

        {
          name: '剪贴板自动触发',
          run: async ({ manager, wfManager, events, clipboard, waitFor, fail }) => { ... }
        }

   Fake plugins are written into a temp user-plugins dir; their backend.js
   bridges to handler functions registered in-process, so handlers can be
   plain closures and capture scenario state freely:

        plugins: [{
          id: 'shouty',
          capabilities: [{ id: 'shout', type: 'text/plain', method: 'shout' }],
          handlers: { shout: async ({ value }) => value.toUpperCase() },
        }]

   Run:  electron tools/test-workflows.js [--filter 子串]        */
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const Config = require(path.join(ROOT, 'src/core/config'));
const PluginManager = require(path.join(ROOT, 'src/core/plugin-manager'));

const SCENARIO_DIR = path.join(__dirname, 'workflow-scenarios');
const POLL_MS = 120;           // fast clipboard polling for watcher scenarios
const WAIT_MS = 4000;          // generous ceiling for async assertions

const sleep = ms => new Promise(r => setTimeout(r, ms));
const filter = (() => {
  const i = process.argv.indexOf('--filter');
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
})();

/* --- fake plugin materialization -------------------------------------------- */

function installFakePlugin(userRoot, spec) {
  const dir = path.join(userRoot, spec.id);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = {
    id: spec.id,
    name: spec.name || { zh: spec.id, en: spec.id },
    desc: { zh: `测试插件 ${spec.id}`, en: `test plugin ${spec.id}` },
    version: '0.0.1',
    category: 'dev',
    defaultEnabled: spec.defaultEnabled !== false,
    ...(spec.backend === false ? {} : { backend: 'backend.js' }),
    capabilities: (spec.capabilities || []).map(c => ({
      id: c.id, type: c.type, ...(c.method ? { method: c.method } : {}),
      title: c.title || { zh: c.id, en: c.id }
    })),
  };
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest, null, 2));
  if (manifest.backend) {
    // handlers live in this process (registered below) so closures survive
    const src = `module.exports = {
  activate(ctx) {
    const reg = (global.__orbitTestPluginHandlers || {})[${JSON.stringify(spec.id)}] || {};
    for (const [method, fn] of Object.entries(reg)) ctx.ipc.handle(method, (args) => fn(args, ctx));
  },
};`;
    fs.writeFileSync(path.join(dir, 'backend.js'), src);
  }
  global.__orbitTestPluginHandlers = global.__orbitTestPluginHandlers || {};
  global.__orbitTestPluginHandlers[spec.id] = spec.handlers || {};
}

/* --- assertion helpers -------------------------------------------------------- */

function assertDeclarative(sc, res) {
  const errors = [];
  const expect = sc.expect || {};
  const wantOk = expect.ok !== false;
  if (!!res.ok !== wantOk) {
    errors.push(`期望 ok=${wantOk}，实际 ok=${res.ok}${res.error ? ` (${res.error})` : ''}`);
    return errors; // deeper assertions are meaningless on mismatch
  }
  if (expect.errorIncludes && !String(res.error || '').includes(expect.errorIncludes)) {
    errors.push(`期望错误包含 "${expect.errorIncludes}"，实际: ${res.error}`);
  }
  const final = res.finalOutput;
  if (expect.finalType && (!final || final.type !== expect.finalType)) {
    errors.push(`期望最终类型 ${expect.finalType}，实际: ${final && final.type}`);
  }
  if (expect.finalValue !== undefined) {
    const actual = final ? String(final.value) : '';
    if (expect.finalValue instanceof RegExp ? !expect.finalValue.test(actual) : actual !== String(expect.finalValue)) {
      errors.push(`期望最终值 ${expect.finalValue}，实际: ${JSON.stringify(actual.slice(0, 120))}`);
    }
  }
  if (expect.finalValueIncludes && (!final || !String(final.value).includes(expect.finalValueIncludes))) {
    errors.push(`期望最终值包含 "${expect.finalValueIncludes}"，实际: ${final ? JSON.stringify(String(final.value).slice(0, 120)) : null}`);
  }
  for (const n of (expect.nodes || [])) {
    const entry = (res.logs || []).find(l => l.title === n.title);
    if (!entry) { errors.push(`执行日志中找不到节点 [${n.title}]`); continue; }
    const status = !entry.ok ? 'error' : (entry.skipped ? 'skipped' : 'ok');
    if (status !== n.status) {
      errors.push(`节点 [${n.title}] 期望 ${n.status}，实际 ${status}${entry.error ? ` (${entry.error})` : ''}`);
    }
  }
  return errors;
}

/* --- scenario runner ----------------------------------------------------------- */

async function runScenario(sc) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `orbit-wf-${sc.name.replace(/\W+/g, '-')}-`));
  const cfg = new Config(tmp);
  const userRoot = path.join(tmp, 'plugins');
  fs.mkdirSync(userRoot, { recursive: true });
  for (const spec of (sc.plugins || [])) installFakePlugin(userRoot, spec);

  let hostWin = null;
  const manager = new PluginManager({ userDataDir: tmp, config: cfg, getHostWindow: () => hostWin });
  manager.discover();
  for (const p of manager.plugins.values()) if (p.enabled) manager.activate(p.id);

  const { WorkflowManager } = require(path.join(ROOT, 'src/core/workflows'));
  const events = [];
  const wfManager = new WorkflowManager(cfg, manager, {
    seedDefaults: false,
    clipboardPollMs: POLL_MS,
    onEvent: e => events.push(e),
  });

  const { clipboard } = require('electron');
  const waitFor = async (desc, predicate) => {
    const deadline = Date.now() + WAIT_MS;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await sleep(POLL_MS / 2);
    }
    throw new Error(`等待超时: ${desc}`);
  };

  try {
    if (typeof sc.run === 'function') {
      await sc.run({
        manager, wfManager, cfg, events, clipboard, waitFor, sleep, tmp,
        fail: msg => { throw new Error(msg); },
      });
      return [];
    }
    wfManager.save(sc.workflow);
    const input = typeof sc.input === 'string' ? { type: 'text/plain', value: sc.input } : (sc.input || { type: 'text/plain', value: '' });
    const res = await wfManager.run(sc.workflow.id, input);
    return assertDeclarative(sc, res);
  } finally {
    wfManager.stopClipboardWatch();
    manager.deactivateAll();
  }
}

/* --- entry ------------------------------------------------------------------------ */

app.whenReady().then(async () => {
  const files = fs.readdirSync(SCENARIO_DIR).filter(f => f.endsWith('.js')).sort();
  const scenarios = [];
  for (const f of files) {
    const mod = require(path.join(SCENARIO_DIR, f));
    const list = Array.isArray(mod) ? mod : (mod.scenarios || []);
    for (const sc of list) scenarios.push({ ...sc, _file: f });
  }
  const selected = filter ? scenarios.filter(sc => sc.name.includes(filter) || sc._file.includes(filter)) : scenarios;
  if (selected.length === 0) {
    console.log(filter ? `没有匹配 "--filter ${filter}" 的场景` : 'workflow-scenarios 目录为空');
    app.exit(1);
    return;
  }

  let pass = 0, fail = 0;
  for (const sc of selected) {
    let errors;
    try {
      errors = await runScenario(sc);
    } catch (err) {
      errors = [String(err && err.message || err)];
    }
    if (errors.length === 0) {
      pass++;
      console.log(`  PASS  ${sc.name}  (${sc._file})`);
    } else {
      fail++;
      console.log(`  FAIL  ${sc.name}  (${sc._file})`);
      for (const e of errors) console.log(`        - ${e}`);
    }
  }

  console.log(`\n工作流场景测试: ${pass} 通过, ${fail} 失败 / 共 ${selected.length} 个场景 (来自 ${files.length} 个场景文件)`);
  app.exit(fail > 0 ? 1 : 0);
});
