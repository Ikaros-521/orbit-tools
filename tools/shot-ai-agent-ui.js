/* Visual check for the ai-chat agent-layer UI (v1.8.0 dsh alignment):
   floating task drawer, unified tool cards (params/result inspectable),
   round-group collapsing, turn footer, steering badge, code highlighting,
   and the memory settings tab — captured under both themes.
   Seeds plugin data (session with taskList, multi-round agent messages with
   toolCalls/toolStatus/toolResults, steered message, memories) before
   activation so the panel renders real state.
   Saves dist/shot-ai-agent-*.png. Run: npx electron tools/shot-ai-agent-ui.js */
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

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-shot-ai-'));
  // Seed the ai-chat data file: session with task plan + multi-round agent
  // turn (reasoning step, tool call with result, code content), a steered
  // user message, and turn footer metadata fields.
  const now = Date.now();
  const seed = {
    config: {},
    personas: [],
    sessions: [{
      id: 's_demo', title: '重构登录模块', personaId: 'general', workDir: 'E:\\Github_Pro\\orbit-tools',
      createdAt: now, updatedAt: now,
      totalTokens: { promptTokens: 4200, completionTokens: 860, totalTokens: 5060, cachedTokens: 3100 },
      taskList: [
        { content: '定位登录路由与中间件', status: 'completed' },
        { content: '抽取 token 校验为独立模块', status: 'in_progress' },
        { content: '补充单测并运行', status: 'pending' }
      ],
      messages: [
        { id: 'm1', role: 'user', content: '帮我重构登录模块，按步骤来', timestamp: now },
        {
          id: 'm2', role: 'assistant', content: '',
          contentSteps: [
            { round: 0, content: '已制定任务清单，先定位现有登录路由与中间件实现……' },
            { round: 1, content: '已定位到 `src/routes/login.js`，建议把校验抽取为独立中间件：\n\n```js\n// auth-guard.js\nexport function requireAuth(req, res, next) {\n  if (!req.session?.userId) return res.status(401).json({ error: "unauthorized" });\n  next();\n}\n```\n\n下一步运行单测确认行为不变。' }
          ],
          reasoningSteps: [
            { round: 0, reasoning: '用户要求分步重构。先 grep 定位登录路由，再读取中间件，最后抽取校验逻辑并补测试。' }
          ],
          toolCalls: [
            {
              id: 'tc_grep_1', round: 0, type: 'function',
              function: { name: 'grep_search', arguments: '{"pattern":"login","glob":"src/**"}' },
              result: { ok: true, matches: [{ file: 'src/routes/login.js', line: 12, text: 'router.post(\'/login\'…' }] }
            }
          ],
          toolStatus: { tc_grep_1: 'auto' },
          toolResults: {
            tc_grep_1: { ok: true, matches: [{ file: 'src/routes/login.js', line: 12, text: 'router.post(\'/login\'…' }] }
          },
          content_final: undefined,
          reasoning: '用户要求分步重构。先 grep 定位登录路由，再读取中间件，最后抽取校验逻辑并补测试。',
          content: '已定位到 `src/routes/login.js`，建议把校验抽取为独立中间件：\n\n```js\n// auth-guard.js\nexport function requireAuth(req, res, next) {\n  if (!req.session?.userId) return res.status(401).json({ error: "unauthorized" });\n  next();\n}\n```\n\n下一步运行单测确认行为不变。',
          usage: { promptTokens: 4200, completionTokens: 860, totalTokens: 5060, cachedTokens: 3100, contextTokens: 5060 },
          model: 'deepseek-chat', rounds: 2, compactedDuringTurn: true,
          timestamp: now - 60000, endedAt: now - 54000
        },
        { id: 'm3', role: 'tool', tool_call_id: 'tc_grep_1', name: 'grep_search', content: '{"ok":true,"matches":[{"file":"src/routes/login.js","line":12}]}', timestamp: now - 58000 },
        { id: 'm4', role: 'user', content: '顺便把错误码也统一成常量', steered: true, steerState: 'consumed', timestamp: now - 30000 }
      ],
      alwaysAllowTools: []
    }],
    activeSessionId: 's_demo',
    memories: [
      { id: 'mem_1', content: '用户偏好使用 pnpm 管理依赖，不用 npm', type: 'preference', scope: 'global', source: 'agent', createdAt: now, updatedAt: now },
      { id: 'mem_2', content: 'orbit-tools 构建命令是 npm run dist，主进程改动需重启应用', type: 'project', scope: 'E:\\Github_Pro\\orbit-tools', source: 'user', createdAt: now, updatedAt: now },
      { id: 'mem_3', content: '面板截图验证用 light-dark() 双主题', type: 'fact', scope: 'global', source: 'user', createdAt: now, updatedAt: now }
    ]
  };
  const dataDir = path.join(tmp, 'plugin-data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'ai-chat.json'), JSON.stringify(seed));

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
    width: 1180, height: 800, show: false,
    webPreferences: { contextIsolation: true, preload: path.join(ROOT, 'src/preload.js') }
  });
  await win.loadFile(path.join(ROOT, 'src/renderer/index.html'));
  await sleep(800);

  const page = async js => win.webContents.executeJavaScript(js);
  const shot = async (name, theme) => {
    await page(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
    await sleep(150);
    fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'dist', `shot-ai-agent-${name}-${theme}.png`), (await win.webContents.capturePage()).toPNG());
  };

  // open ai-chat panel via its deck card
  await page(`(() => { const c = Array.from(document.querySelectorAll('#deck .card')).find(x => x.textContent.includes('AI 对话')); if (c) c.click(); })()`);
  await sleep(1200);

  const checks = [];
  // Floating task drawer (current task UI since the drawer rework)
  checks.push(['task-drawer-badge', await page(`!!document.querySelector('#aiFloatingTaskWrap #aiTaskBadge')`)]);
  checks.push(['task-progress', await page(`(document.querySelector('#aiTaskBadge .ai-task-badge-progress')||{}).textContent === '1/3'`)]);

  // v1.8.0: unified tool card with inspectable params & result
  checks.push(['tool-card', await page(`!!document.querySelector('.ai-tool-card[data-tool="tc_grep_1"]')`)]);
  checks.push(['tool-card-args', await page(`!!document.querySelector('.ai-tool-card[data-tool="tc_grep_1"] .ai-tool-args-details')`)]);
  checks.push(['tool-card-result', await page(`!!document.querySelector('.ai-tool-card[data-tool="tc_grep_1"] .ai-tool-result-details')`)]);
  // turn footer metadata (model / rounds / tokens / compacted mark)
  checks.push(['turn-footer', await page(`(() => { const f = document.querySelector('.ai-turn-footer'); return !!f && f.textContent.includes('deepseek-chat') && f.textContent.includes('已压缩'); })()`)]);
  // steered message badge
  checks.push(['steer-tag', await page(`!!document.querySelector('.ai-msg[data-id="m4"] .ai-steer-tag.ok')`)]);
  // code highlight applied on the final content (vendor hljs lazy load)
  checks.push(['hljs-tokens', await page(`!!document.querySelector('.ai-md-block .hljs-keyword')`)]);

  // memory settings tab
  await page(`document.getElementById('btnOpenSettings').click()`);
  await sleep(200);
  await page(`document.getElementById('tabNavMemory').click()`);
  await sleep(300);
  checks.push(['memory-pane', await page(`!document.getElementById('paneMemorySettings').classList.contains('hidden')`)]);
  checks.push(['memory-cards', await page(`document.querySelectorAll('.ai-memory-card').length === 3`)]);
  checks.push(['memory-count', await page(`(document.getElementById('memoryCountBadge')||{}).textContent === '3 条'`)]);

  // close settings for the chat-area shot, then reopen for the memory tab shot
  await page(`document.getElementById('btnCloseSettings').click()`);
  await sleep(150);
  await shot('chat', 'dark');
  await shot('chat', 'light');
  await page(`document.getElementById('btnOpenSettings').click()`);
  await page(`document.getElementById('tabNavMemory').click()`);
  await sleep(250);
  await shot('memory', 'dark');
  await shot('memory', 'light');

  let fail = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? 'OK ' : 'FAIL'} ${name}`);
    if (!ok) fail++;
  }
  console.log(fail === 0 ? 'AI-AGENT UI SHOT PASS' : 'AI-AGENT UI SHOT FAIL');
  win.destroy();
  app.exit(fail === 0 ? 0 : 1);
});
