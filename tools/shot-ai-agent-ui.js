/* Temporary visual check for the ai-chat agent-layer UI upgrade:
   task-plan card in the message list + memory library settings tab,
   captured under both themes. Seeds plugin data (session with taskList and
   messages, memory records) before activation so the panel renders real
   state. Saves dist/shot-ai-agent-*.png. Run: npx electron tools/shot-ai-agent-ui.js */
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
  // Seed the ai-chat data file: session with task plan + messages, memories
  const now = Date.now();
  const seed = {
    config: {},
    personas: [],
    sessions: [{
      id: 's_demo', title: '重构登录模块', personaId: 'general', workDir: 'E:\\Github_Pro\\orbit-tools',
      createdAt: now, updatedAt: now,
      totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      taskList: [
        { content: '定位登录路由与中间件', status: 'completed' },
        { content: '抽取 token 校验为独立模块', status: 'in_progress' },
        { content: '补充单测并运行', status: 'pending' }
      ],
      messages: [
        { id: 'm1', role: 'user', content: '帮我重构登录模块，按步骤来', timestamp: now },
        { id: 'm2', role: 'assistant', content: '已制定任务清单，先定位现有登录路由与中间件实现……\n\n`grep_search` 已找到 3 处引用，正在抽取校验逻辑。', reasoning: '', toolCalls: null, usage: null, timestamp: now }
      ]
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
  await sleep(900);

  const checks = [];
  checks.push(['task-card', await page(`!!document.querySelector('#aiTaskCard')`)]);
  checks.push(['task-progress', await page(`(document.querySelector('.ai-task-card-progress')||{}).textContent === '1/3'`)]);
  checks.push(['task-inprogress', await page(`!!document.querySelector('.ai-task-item.in_progress')`)]);

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
