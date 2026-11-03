/* AI IDE & CLI Task Dispatcher for Orbit Toolbox.
   Dispatches development tasks to local AI IDEs and CLI agents:
   - CLI Agents: Claude Code, OpenAI Codex CLI, Qoder CLI
   - Desktop IDEs: Google Antigravity, Qoder IDE, Tencent WorkBuddy/CodeBuddy, ZCode ADE, Cursor
   Supports headless background batch execution, interactive terminal dispatch, and
   GUI IDE handoff (brief file opened as editor tab + paste-ready prompt on clipboard). */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const MAX_OUTPUT_CHARS = 64 * 1024; // 64 KB stdout/stderr limit
const DEFAULT_TIMEOUT_MS = 120 * 1000; // 2 minutes

/* Injected by backend.js with Electron clipboard; stays null in standalone CLI usage. */
let clipboardWriter = null;

function setClipboardWriter(fn) {
  clipboardWriter = typeof fn === 'function' ? fn : null;
}

/**
 * Stable paste-ready prompt for GUI IDE handoff: task details live in TASK_BRIEF.md,
 * so the human only pastes this one fixed sentence into the IDE's AI chat panel.
 */
function buildHandoffPrompt(workspaceDir) {
  return [
    '请先阅读工作区根目录的任务简报 TASK_BRIEF.md，并严格按照简报要求在当前工作区内执行任务。',
    `简报位置：${path.join(workspaceDir, 'TASK_BRIEF.md')}`,
    '完成后请说明：改动文件清单、实现方式、如何验证。'
  ].join('\n');
}

function fileExists(p) {
  if (!p) return false;
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function dirExists(p) {
  if (!p) return false;
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function findInPath(cmd) {
  if (!cmd) return null;
  try {
    const isWin = process.platform === 'win32';
    const tool = isWin ? 'where.exe' : 'which';
    const r = spawnSync(tool, [cmd], { encoding: 'utf8', shell: true });
    if (r.status === 0 && r.stdout) {
      const lines = r.stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (isWin) {
        const preferred = lines.find(l => /\.(exe|cmd|bat)$/i.test(l) && fileExists(l));
        if (preferred) return preferred;
      }
      for (const line of lines) {
        if (fileExists(line)) return line;
      }
    }
  } catch {}
  return null;
}

function scanFirstFile(candidates) {
  for (const c of candidates) {
    if (fileExists(c)) return c;
  }
  return null;
}

/* --- Detectors for Local AI IDEs and CLI Agents ---------------------------- */

function detectAntigravity() {
  const inPath = findInPath('Antigravity') || findInPath('antigravity');
  if (inPath) return inPath;
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  if (isWin) {
    const la = process.env.LOCALAPPDATA || '';
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const cands = [
      path.join(la, 'Programs', 'antigravity', 'Antigravity.exe'),
      path.join(la, 'Programs', 'Antigravity', 'Antigravity.exe'),
      path.join(pf, 'Antigravity', 'Antigravity.exe'),
      path.join(pf86, 'Antigravity', 'Antigravity.exe'),
      'E:\\Antigravity IDE\\Antigravity.exe'
    ];
    return scanFirstFile(cands);
  }
  if (isMac) {
    const cands = ['/Applications/Antigravity.app/Contents/MacOS/Antigravity', path.join(os.homedir(), 'Applications/Antigravity.app/Contents/MacOS/Antigravity')];
    return scanFirstFile(cands);
  }
  return scanFirstFile(['/usr/bin/antigravity', '/usr/local/bin/antigravity', '/opt/Antigravity/antigravity']);
}

function detectClaude() {
  const inPath = findInPath('claude');
  if (inPath) return inPath;
  const appData = process.env.APPDATA || '';
  const cands = [
    path.join(appData, 'npm', 'claude.cmd'),
    path.join(appData, 'npm', 'claude.ps1'),
    path.join(appData, 'npm', 'claude'),
    path.join(os.homedir(), '.local', 'bin', 'claude')
  ];
  return scanFirstFile(cands);
}

function detectCodex() {
  const inPath = findInPath('codex');
  if (inPath) return inPath;
  const appData = process.env.APPDATA || '';
  const cands = [
    path.join(appData, 'npm', 'codex.cmd'),
    path.join(appData, 'npm', 'codex.ps1'),
    path.join(appData, 'npm', 'codex'),
    path.join(os.homedir(), '.local', 'bin', 'codex')
  ];
  return scanFirstFile(cands);
}

function detectQoder() {
  const inPath = findInPath('qoder');
  const drives = ['E:', 'D:', 'C:'];
  const cands = [];
  if (inPath) cands.push(inPath);
  for (const d of drives) {
    cands.push(path.join(d, 'Qoder IDE', 'bin', 'code.cmd'));
    cands.push(path.join(d, 'Qoder IDE', 'bin', 'qoder.cmd'));
    cands.push(path.join(d, 'Qoder IDE', 'Qoder IDE.exe'));
    cands.push(path.join(d, 'Qoder', 'Qoder.exe'));
  }
  const la = process.env.LOCALAPPDATA || '';
  cands.push(path.join(la, 'Programs', 'Qoder IDE', 'Qoder IDE.exe'));
  return scanFirstFile(cands);
}

function detectWorkBuddy() {
  const inPath = findInPath('buddycn') || findInPath('workbuddy') || findInPath('codebuddy');
  const drives = ['D:', 'E:', 'C:'];
  const cands = [];
  if (inPath) cands.push(inPath);
  for (const d of drives) {
    cands.push(path.join(d, 'CodeBuddy CN', 'bin', 'buddycn.cmd'));
    cands.push(path.join(d, 'CodeBuddy CN', 'CodeBuddy CN.exe'));
    cands.push(path.join(d, 'WorkBuddy', 'WorkBuddy.exe'));
  }
  const la = process.env.LOCALAPPDATA || '';
  cands.push(path.join(la, 'Programs', 'WorkBuddy', 'WorkBuddy.exe'));
  return scanFirstFile(cands);
}

function detectZCode() {
  const inPath = findInPath('zcode') || findInPath('ZCode');
  const drives = ['D:', 'E:', 'C:'];
  const cands = [];
  if (inPath) cands.push(inPath);
  for (const d of drives) {
    cands.push(path.join(d, 'ZCode', 'ZCode.exe'));
  }
  const la = process.env.LOCALAPPDATA || '';
  cands.push(path.join(la, 'Programs', 'ZCode', 'ZCode.exe'));
  return scanFirstFile(cands);
}

function detectCursor() {
  const inPath = findInPath('cursor');
  const cands = [];
  if (inPath) cands.push(inPath);
  const drives = ['D:', 'C:', 'E:'];
  for (const d of drives) {
    cands.push(path.join(d, 'cursor', 'resources', 'app', 'bin', 'cursor.cmd'));
    cands.push(path.join(d, 'cursor', 'Cursor.exe'));
    cands.push(path.join(d, 'Program Files', 'Cursor', 'Cursor.exe'));
  }
  const la = process.env.LOCALAPPDATA || '';
  cands.push(path.join(la, 'Programs', 'cursor', 'Cursor.exe'));
  return scanFirstFile(cands);
}

/* --- Metadata Catalog ------------------------------------------------------ */

const TARGET_CATALOG = {
  antigravity: {
    id: 'antigravity',
    name: { zh: '反重力 (Google Antigravity)', en: 'Google Antigravity' },
    type: 'ide',
    desc: { zh: 'Google 智能 IDE，擅长复杂工程架构、多文件理解与深度协同', en: 'Google intelligent IDE' },
    defaultMode: 'open_ide',
    supportedModes: ['open_ide'],
    detectFn: detectAntigravity
  },
  claude: {
    id: 'claude',
    name: { zh: 'Claude Code', en: 'Claude Code' },
    type: 'cli',
    desc: { zh: 'Anthropic 终端 Agent，具备高阶推理、测试驱动与多文件自修复能力', en: 'Anthropic terminal agent' },
    defaultMode: 'headless',
    supportedModes: ['headless', 'terminal'],
    detectFn: detectClaude
  },
  codex: {
    id: 'codex',
    name: { zh: 'OpenAI Codex CLI', en: 'OpenAI Codex CLI' },
    type: 'cli',
    desc: { zh: 'OpenAI 终端代码 Agent，原生支持沙箱非交互批处理与代码审查', en: 'OpenAI terminal coding agent' },
    defaultMode: 'headless',
    supportedModes: ['headless', 'terminal'],
    detectFn: detectCodex
  },
  qoder: {
    id: 'qoder',
    name: { zh: 'Qoder (CLI / IDE)', en: 'Qoder' },
    type: 'hybrid',
    desc: { zh: '智能工程化代码平台与终端 Agent，支持毫秒级启动与多文件重构', en: 'Qoder AI IDE & CLI' },
    defaultMode: 'open_ide',
    supportedModes: ['open_ide', 'headless', 'terminal'],
    detectFn: detectQoder
  },
  workbuddy: {
    id: 'workbuddy',
    name: { zh: 'WorkBuddy / CodeBuddy', en: 'WorkBuddy / CodeBuddy' },
    type: 'ide',
    desc: { zh: '腾讯 AI 编程助手与 IDE，深度支持团队规范协同与本土生态', en: 'Tencent AI IDE' },
    defaultMode: 'open_ide',
    supportedModes: ['open_ide'],
    detectFn: detectWorkBuddy
  },
  zcode: {
    id: 'zcode',
    name: { zh: 'ZCode ADE', en: 'ZCode' },
    type: 'ide',
    desc: { zh: '智谱 Agentic 开发环境，以目标为核心的计划制定与编码工作台', en: 'Z.ai Agentic Development Environment' },
    defaultMode: 'open_ide',
    supportedModes: ['open_ide'],
    detectFn: detectZCode
  },
  cursor: {
    id: 'cursor',
    name: { zh: 'Cursor', en: 'Cursor' },
    type: 'ide',
    desc: { zh: '基于 VS Code 深度定制的 AI 辅助编程 IDE', en: 'Cursor AI IDE' },
    defaultMode: 'open_ide',
    supportedModes: ['open_ide'],
    detectFn: detectCursor
  }
};

/**
 * List all supported AI IDEs/CLIs with live detection status.
 */
function listAvailableIDEs() {
  const result = [];
  for (const [key, meta] of Object.entries(TARGET_CATALOG)) {
    const execPath = meta.detectFn();
    result.push({
      id: meta.id,
      name: meta.name.zh,
      type: meta.type,
      installed: !!execPath,
      path: execPath || null,
      defaultMode: meta.defaultMode,
      supportedModes: meta.supportedModes,
      desc: meta.desc.zh
    });
  }
  return { ok: true, count: result.filter(r => r.installed).length, total: result.length, ides: result };
}

/**
 * Generate standard task context files in the target workspace.
 */
function injectTaskProtocol(workspaceDir, task, targetMeta) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const timestamp = Date.now().toString(36);

  // 1. Universal TASK_BRIEF.md at the workspace root
  const taskBriefPath = path.join(workspaceDir, 'TASK_BRIEF.md');
  const briefContent = [
    `# 🚀 Orbit AI 任务调度交接简报`,
    ``,
    `- **派发时间**: ${timeStr}`,
    `- **目标系统**: ${targetMeta.name.zh}`,
    `- **目标工作区**: \`${workspaceDir}\``,
    ``,
    `## 📋 任务描述与指令`,
    task.trim(),
    ``,
    `---`,
    `*由 Orbit Toolbox 智能中枢自动生成并分派。请在当前开发环境中继续执行、审查或调试。*`
  ].join('\n');

  try {
    fs.writeFileSync(taskBriefPath, briefContent, 'utf8');
  } catch (err) {
    console.warn('[ide-dispatcher] Failed to write TASK_BRIEF.md:', err.message);
  }

  // 2. Specific IDE protocols
  if (targetMeta.id === 'zcode') {
    // ZCode Plan protocol: .zcode/plans/plan-session_<id>.md
    try {
      const zcodePlanDir = path.join(workspaceDir, '.zcode', 'plans');
      if (!fs.existsSync(zcodePlanDir)) fs.mkdirSync(zcodePlanDir, { recursive: true });
      const planFile = path.join(zcodePlanDir, `plan-orbit_${timestamp}.md`);
      const planContent = [
        `# Orbit 调度任务计划`,
        ``,
        `> 创建于 ${timeStr} · 由 Orbit AI 助手下发`,
        ``,
        `## 任务目标`,
        task.trim(),
        ``,
        `## 待执行清单`,
        `- [ ] 理解并审查任务要求`,
        `- [ ] 在工作区内实施具体改动`,
        `- [ ] 运行测试验证结果`
      ].join('\n');
      fs.writeFileSync(planFile, planContent, 'utf8');
    } catch {}
  }

  return taskBriefPath;
}

/**
 * Dispatch a development task to the selected AI IDE or CLI.
 */
async function dispatchTask(options) {
  const { target, task, workspace, mode = 'auto', timeout = DEFAULT_TIMEOUT_MS } = options || {};
  if (!target || typeof target !== 'string') {
    return { ok: false, error: '未指定目标 AI 工具标识 (target)' };
  }
  const meta = TARGET_CATALOG[target.toLowerCase()];
  if (!meta) {
    return { ok: false, error: `不支持的 AI 工具标识: ${target}。支持的工具有: ${Object.keys(TARGET_CATALOG).join(', ')}` };
  }

  const execPath = meta.detectFn();
  if (!execPath) {
    return { ok: false, error: `未在本地检测到 ${meta.name.zh} 的安装程序，请确认已安装并在系统 PATH 或默认目录下。` };
  }

  const targetWorkDir = (workspace && typeof workspace === 'string' && dirExists(workspace))
    ? path.resolve(workspace)
    : process.cwd();

  // Resolve dispatch mode
  let actualMode = mode === 'auto' ? meta.defaultMode : mode;
  if (!meta.supportedModes.includes(actualMode)) {
    actualMode = meta.defaultMode;
  }

  // Inject task context files
  const taskFile = injectTaskProtocol(targetWorkDir, task, meta);

  // 1. Mode: open_ide (Launch GUI IDE: workspace + brief tab + clipboard prompt)
  if (actualMode === 'open_ide') {
    try {
      const isWin = process.platform === 'win32';
      const isCmd = /\.(cmd|bat)$/i.test(execPath) || !path.extname(execPath);
      const useShell = isWin ? true : isCmd;
      // Paths containing spaces must be quoted when going through a shell
      const q = useShell ? (s => /\s/.test(s) ? `"${s}"` : s) : (s => s);
      // VS Code family: folder arg opens the workspace, file arg opens the brief as a tab
      const child = spawn(q(execPath), [q(targetWorkDir), q(taskFile)], {
        cwd: targetWorkDir,
        detached: true,
        stdio: 'ignore',
        shell: useShell
      });
      child.unref();

      const handoffPrompt = buildHandoffPrompt(targetWorkDir);
      let clipboardCopied = false;
      if (clipboardWriter) {
        try { clipboardWriter(handoffPrompt); clipboardCopied = true; } catch {}
      }

      return {
        ok: true,
        target: meta.id,
        targetName: meta.name.zh,
        mode: 'open_ide',
        status: 'launched',
        workspace: targetWorkDir,
        taskFile,
        handoffPrompt,
        clipboardCopied,
        pid: child.pid,
        message: clipboardCopied
          ? `已为 ${meta.name.zh} 生成任务简报并拉起工作区：简报已在编辑器中打开，交接提示词已复制到剪贴板，切到 IDE 的 AI 对话框直接粘贴即可。`
          : `已为 ${meta.name.zh} 生成任务简报并拉起工作区：简报已在编辑器中打开，请将 handoffPrompt 内容粘贴到 IDE 的 AI 对话框执行。`
      };
    } catch (err) {
      return { ok: false, error: `唤起 ${meta.name.zh} 失败: ${err.message}` };
    }
  }

  // 2. Mode: terminal (Launch interactive terminal window)
  if (actualMode === 'terminal') {
    try {
      const isWin = process.platform === 'win32';
      if (isWin) {
        let launchScript = '';
        if (meta.id === 'claude') {
          launchScript = `claude "${task.replace(/"/g, '`"')}"`;
        } else if (meta.id === 'codex') {
          launchScript = `codex "${task.replace(/"/g, '`"')}"`;
        } else if (meta.id === 'qoder') {
          launchScript = `qoder "${task.replace(/"/g, '`"')}"`;
        } else {
          launchScript = `echo "任务已就绪: ${task.replace(/"/g, '`"')}"`;
        }

        const child = spawn('cmd.exe', [
          '/c',
          'start',
          `AI Agent - ${meta.name.zh}`,
          'powershell.exe',
          '-NoExit',
          '-Command',
          `Set-Location -LiteralPath '${targetWorkDir}'; ${launchScript}`
        ], {
          detached: true,
          stdio: 'ignore',
          windowsHide: false
        });
        child.unref();

        return {
          ok: true,
          target: meta.id,
          targetName: meta.name.zh,
          mode: 'terminal',
          status: 'launched',
          workspace: targetWorkDir,
          taskFile,
          pid: child.pid,
          message: `已在独立终端窗口中启动 ${meta.name.zh}，可直接在终端中进行交互。`
        };
      }
    } catch (err) {
      return { ok: false, error: `打开终端窗口失败: ${err.message}` };
    }
  }

  // 3. Mode: headless (Execute CLI non-interactively in background and capture output)
  if (actualMode === 'headless') {
    return new Promise(resolve => {
      let command = execPath;
      let args = [];

      if (meta.id === 'claude') {
        // Claude Code headless print mode
        args = ['-p', task, '--dangerously-skip-permissions'];
      } else if (meta.id === 'codex') {
        // OpenAI Codex CLI exec mode
        args = ['exec', task, '-C', targetWorkDir, '-s', 'workspace-write', '--ask-for-approval', 'never'];
      } else if (meta.id === 'qoder') {
        // Qoder CLI print mode
        args = ['-p', task, '--yolo'];
      } else {
        return resolve({ ok: false, error: `${meta.name.zh} 不支持 headless 批处理模式` });
      }

      const isWin = process.platform === 'win32';
      const isCmd = /\.(cmd|bat)$/i.test(command) || !path.extname(command);
      let stdoutBuf = '';
      let stderrBuf = '';
      let timer = null;

      const child = spawn(command, args, {
        cwd: targetWorkDir,
        shell: isWin ? true : isCmd,
        env: { ...process.env, CI: '1', NONINTERACTIVE: '1' }
      });

      child.stdout?.on('data', data => {
        if (stdoutBuf.length < MAX_OUTPUT_CHARS) {
          stdoutBuf += data.toString();
        }
      });

      child.stderr?.on('data', data => {
        if (stderrBuf.length < MAX_OUTPUT_CHARS) {
          stderrBuf += data.toString();
        }
      });

      timer = setTimeout(() => {
        try { child.kill('SIGTERM'); } catch {}
        resolve({
          ok: false,
          target: meta.id,
          targetName: meta.name.zh,
          mode: 'headless',
          status: 'timeout',
          workspace: targetWorkDir,
          taskFile,
          output: stdoutBuf.trim() || stderrBuf.trim() || '执行超时',
          error: `任务执行超过限制时长 (${Math.round(timeout / 1000)}s)，已中止。`
        });
      }, timeout);

      child.on('error', err => {
        clearTimeout(timer);
        resolve({
          ok: false,
          target: meta.id,
          targetName: meta.name.zh,
          mode: 'headless',
          status: 'error',
          workspace: targetWorkDir,
          taskFile,
          error: `子进程启动失败: ${err.message}`
        });
      });

      child.on('close', code => {
        clearTimeout(timer);
        const combined = (stdoutBuf + '\n' + stderrBuf).trim();
        resolve({
          ok: code === 0,
          target: meta.id,
          targetName: meta.name.zh,
          mode: 'headless',
          status: code === 0 ? 'completed' : 'error',
          exitCode: code,
          workspace: targetWorkDir,
          taskFile,
          output: combined || (code === 0 ? '任务执行完毕（无标准输出）' : `执行异常退出 (Exit code ${code})`)
        });
      });
    });
  }

  return { ok: false, error: `未知执行模式: ${actualMode}` };
}

module.exports = {
  TARGET_CATALOG,
  listAvailableIDEs,
  dispatchTask,
  injectTaskProtocol,
  setClipboardWriter,
  buildHandoffPrompt
};
