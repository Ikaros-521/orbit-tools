/* Local assistant tools for the AI Chat agent: filesystem access + shell.
   Risk model: reads/search are low-risk (auto tier runs them), writes and
   commands are high-risk (ask in 'ask' and 'auto' tiers). Paths resolve
   against the session working directory unless absolute. */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const { processManager } = require('./services/process-manager');

const MAX_READ_CHARS = 64 * 1024;
const MAX_WRITE_CHARS = 1024 * 1024;
const MAX_CMD_OUT = 15 * 1024;
const DEFAULT_CMD_TIMEOUT = 25000;

const LOCAL_TOOL_NAMES = new Set(['list_dir', 'read_file', 'write_file', 'edit_file', 'search_files', 'grep_search', 'run_command', 'list_processes', 'stop_process']);

const LOCAL_TOOLS_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: '列出本地目录内容 (文件/子目录名)。相对路径基于当前工作目录。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径，默认为工作目录本身' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取本地文本文件内容 (代码、配置、笔记等)。相对路径基于当前工作目录。可选用 offset_line/max_lines 读取片段。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          offset_line: { type: 'number', description: '从第几行开始 (1 起，默认 1)' },
          max_lines: { type: 'number', description: '最多读取多少行' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入本地文件 (覆盖或追加)，父目录不存在时自动创建。用于生成代码、保存结果、修改配置等。高危操作，需用户审批。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目标文件路径' },
          content: { type: 'string', description: '要写入的完整内容' },
          mode: { type: 'string', enum: ['overwrite', 'append'], description: 'overwrite 覆盖 (默认) / append 追加' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: '在本地目录中递归搜索文件：按文件名通配符 (glob, 如 *.js、*.md) 匹配，可选内容包含匹配。自动跳过 node_modules/.git 等目录。',
      parameters: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: '搜索起始目录，默认工作目录' },
          glob: { type: 'string', description: '文件名通配符，如 "*.md"、"test-*.js"，默认 "*"' },
          contains: { type: 'string', description: '可选：文件内容需包含的文本' },
          max_results: { type: 'number', description: '最多返回条数 (默认 50，上限 200)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: '对本地文本文件做精确字符串替换（改代码首选，避免整文件重写）。old_text 必须与文件内容完全一致（含缩进）；默认要求在文件中唯一出现，多处替换需显式 replace_all。高危操作，需用户审批。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          old_text: { type: 'string', description: '要被替换的原文（逐字符精确匹配，含空白与缩进）' },
          new_text: { type: 'string', description: '替换后的新文本（删除内容则传空字符串）' },
          replace_all: { type: 'boolean', description: 'old_text 出现多次时是否全部替换（默认 false，多处且未开启时报错）' }
        },
        required: ['path', 'old_text', 'new_text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'grep_search',
      description: '在目录中按内容搜索文件（类似 grep）：正则或纯文本，返回 文件:行号:该行内容。自动跳过 node_modules/.git 等目录与二进制文件。定位代码/配置时优先使用。',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: '搜索模式：正则表达式或纯文本' },
          dir: { type: 'string', description: '搜索起始目录，默认工作目录' },
          glob: { type: 'string', description: '文件名通配符过滤，如 "*.js"、"*.md"，默认 "*"' },
          is_regex: { type: 'boolean', description: 'pattern 是否为正则（默认 false，纯文本匹配）' },
          ignore_case: { type: 'boolean', description: '忽略大小写（默认 false）' },
          max_results: { type: 'number', description: '最多返回匹配条数 (默认 50，上限 200)' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: '在当前工作目录执行一条 shell 命令 (Windows 为 cmd)。适合构建、测试、git、启动程序或后台游戏等。若程序在等待时间内未退出 (如 GUI 游戏、本地服务)，会自动转入后台持续运行并返回 PID 与初步输出，供模型分析情况，且程序退出时会被安全关闭。高危操作，需用户审批。',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令行' },
          timeout_ms: { type: 'number', description: '等待/超时毫秒数 (默认 25000，上限 120000)' },
          is_background: { type: 'boolean', description: '是否作为后台长驻服务/游戏运行。若为 true，等待启动初步输出后即转入后台管理并返回' },
          kill_on_timeout: { type: 'boolean', description: '超时时是否强制终止进程 (默认为 false，若未退出则转后台管理)' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_processes',
      description: '列出当前由 AI 助手在后台运行的子进程列表 (如 Python 游戏、开发服务器等)。包含 PID、命令、已运行时间。',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'stop_process',
      description: '终止/停止指定的后台子进程树 (如正在运行的 Python 游戏、服务等)。',
      parameters: {
        type: 'object',
        properties: {
          pid: { type: 'number', description: '要停止的子进程 PID' }
        },
        required: ['pid']
      }
    }
  }
];

function resolveWorkPath(p, workDir) {
  const raw = String(p || '').trim();
  const isAbs = /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(raw);
  return path.resolve(isAbs ? raw : path.join(workDir || os.homedir(), raw));
}

function truncate(s, n) {
  const str = String(s ?? '');
  return str.length > n ? str.slice(0, n) + `\n…[已截断，完整长度 ${str.length} 字符]` : str;
}

/* --- run_command: process-tree lifecycle & console codepage decoding ------ */

const runningCommands = new Map(); // streamId -> Set<child process>

const unregisterCommand = (streamId, child) => {
  const set = runningCommands.get(streamId);
  if (!set) return;
  set.delete(child);
  if (set.size === 0) runningCommands.delete(streamId);
};

// Kill every in-flight command belonging to a stream.
// sync=true is REQUIRED when the caller is an app-shutdown path: a
// fire-and-forget taskkill loses the race with the parent exiting — the
// cmd.exe wrapper dies before taskkill enumerates it, orphaning command
// grandchildren. User-abort callers can stay async.
const killRunningCommands = (streamId, sync = false) => {
  const set = runningCommands.get(streamId);
  if (!set) return;
  for (const child of set) {
    try {
      if (process.platform === 'win32' && child.pid) {
        if (sync) {
          spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        } else {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
        }
      } else {
        child.kill('SIGKILL');
      }
    } catch {}
  }
  runningCommands.delete(streamId);
};

// cmd.exe emits output in the OEM codepage (CP936 on zh-CN), not UTF-8.
let oemCodepagePromise = null;
const detectOemCodepage = () => {
  if (process.platform !== 'win32') return Promise.resolve(65001);
  if (!oemCodepagePromise) {
    oemCodepagePromise = new Promise(resolve => {
      const probe = spawn('cmd.exe', ['/d', '/c', 'chcp'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      probe.stdout.on('data', d => { out += d; });
      probe.on('error', () => resolve(65001));
      probe.on('close', () => {
        const m = out.match(/(\d+)\s*\.?\s*$/m);
        resolve(m ? Number(m[1]) : 65001);
      });
    });
  }
  return oemCodepagePromise;
};

const CP_DECODER_LABELS = {
  936: 'gbk', 950: 'big5', 932: 'shift-jis', 949: 'euc-kr', 874: 'windows-874', 866: 'ibm866',
  1250: 'windows-1250', 1251: 'windows-1251', 1252: 'windows-1252', 1253: 'windows-1253',
  1254: 'windows-1254', 1255: 'windows-1255', 1256: 'windows-1256', 1257: 'windows-1257',
  1258: 'windows-1258'
};

const decodeCommandOutput = (buf, codepage) => {
  if (!buf || !buf.length) return '';
  if (codepage && codepage !== 65001) {
    const label = CP_DECODER_LABELS[codepage];
    if (label) {
      try { return new TextDecoder(label).decode(buf); } catch { /* fall through to utf8 */ }
    }
  }
  return buf.toString('utf8');
};

async function executeLocalTool(name, args, runtime) {
  const workDir = (runtime && runtime.workDir) || os.homedir();
  args = args || {};
  try {
    if (name === 'list_dir') {
      const target = resolveWorkPath(args.path || '.', workDir);
      const st = fs.statSync(target);
      if (!st.isDirectory()) return { ok: false, error: '目标不是目录' };
      const entries = fs.readdirSync(target, { withFileTypes: true }).slice(0, 500).map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'dir' : (e.isFile() ? 'file' : 'other')
      }));
      return { ok: true, path: target, entries };
    }

    if (name === 'read_file') {
      const target = resolveWorkPath(args.path, workDir);
      const st = fs.statSync(target);
      if (st.isDirectory()) return { ok: false, error: '目标是目录，请使用 list_dir' };
      if (st.size > 2 * 1024 * 1024) return { ok: false, error: `文件过大 (${st.size} bytes，上限 2MB)` };
      const buf = fs.readFileSync(target);
      if (buf.subarray(0, 4096).includes(0)) {
        return { ok: false, error: '二进制文件，无法作为文本读取', size: st.size };
      }
      let text = buf.toString('utf8');
      const offsetLine = Math.max(1, Number(args.offset_line) || 1);
      const maxLines = Number(args.max_lines);
      if (offsetLine > 1 || maxLines) {
        const lines = text.split(/\r?\n/);
        text = lines.slice(offsetLine - 1, maxLines ? offsetLine - 1 + maxLines : undefined).join('\n');
      }
      return { ok: true, path: target, size: st.size, content: truncate(text, MAX_READ_CHARS) };
    }

    if (name === 'write_file') {
      const content = String(args.content ?? '');
      if (!content && args.mode !== 'append') return { ok: false, error: 'content 不能为空' };
      if (content.length > MAX_WRITE_CHARS) return { ok: false, error: '内容超过 1MB 限制' };
      const target = resolveWorkPath(args.path, workDir);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (args.mode === 'append') fs.appendFileSync(target, content, 'utf8');
      else fs.writeFileSync(target, content, 'utf8');
      return { ok: true, path: target, bytes: Buffer.byteLength(content), mode: args.mode === 'append' ? 'append' : 'overwrite' };
    }

    if (name === 'edit_file') {
      const target = resolveWorkPath(args.path, workDir);
      const oldText = String(args.old_text ?? '');
      const newText = String(args.new_text ?? '');
      if (!oldText) return { ok: false, error: 'old_text 不能为空' };
      if (oldText === newText) return { ok: false, error: 'old_text 与 new_text 相同，无需修改' };
      let st;
      try { st = fs.statSync(target); } catch { return { ok: false, error: `文件不存在: ${target}` }; }
      if (st.isDirectory()) return { ok: false, error: '目标是目录' };
      if (st.size > 2 * 1024 * 1024) return { ok: false, error: `文件过大 (${st.size} bytes，上限 2MB)` };
      const text = fs.readFileSync(target, 'utf8');
      if (text.includes('\u0000')) return { ok: false, error: '疑似二进制文件，无法作为文本编辑' };

      // Count non-overlapping occurrences of old_text
      const occurrences = [];
      let pos = text.indexOf(oldText);
      while (pos !== -1) {
        occurrences.push(pos);
        pos = text.indexOf(oldText, pos + oldText.length);
      }
      if (occurrences.length === 0) {
        return { ok: false, error: 'old_text 在文件中未找到（需逐字符精确匹配，注意缩进与空白；可先用 read_file 核对原文）' };
      }
      if (occurrences.length > 1 && !args.replace_all) {
        return { ok: false, error: `old_text 出现 ${occurrences.length} 处，为避免误改请扩大上下文使其唯一，或设置 replace_all: true` };
      }

      const updated = args.replace_all
        ? text.split(oldText).join(newText)
        : text.slice(0, occurrences[0]) + newText + text.slice(occurrences[0] + oldText.length);
      fs.writeFileSync(target, updated, 'utf8');

      // Preview: a few lines around the first replacement site
      const head = updated.slice(0, occurrences[0] + newText.length);
      const startLine = Math.max(0, head.split(/\r?\n/).length - 4);
      const allLines = updated.split(/\r?\n/);
      const previewLines = allLines.slice(startLine, startLine + 7);
      const preview = previewLines.map((l, i) => `${startLine + i + 1}| ${l}`).join('\n');
      return {
        ok: true,
        path: target,
        replacements: args.replace_all ? occurrences.length : 1,
        preview
      };
    }

    if (name === 'search_files') {
      const root = resolveWorkPath(args.dir || '.', workDir);
      const glob = String(args.glob || '*');
      const contains = args.contains ? String(args.contains) : '';
      const maxResults = Math.min(200, Math.max(1, Number(args.max_results) || 50));
      const re = new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      const SKIP = new Set(['node_modules', '.git', '__pycache__', 'dist', 'build', '.cache', 'target']);
      const results = [];
      let scanned = 0;
      let truncated = false;

      const walk = (dir, depth) => {
        if (results.length >= maxResults) return;
        if (depth > 8 || scanned > 5000) { truncated = true; return; }
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          if (results.length >= maxResults || scanned > 5000) { truncated = true; break; }
          scanned++;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            if (!SKIP.has(e.name) && !e.name.startsWith('.')) walk(full, depth + 1);
          } else if (e.isFile() && re.test(e.name)) {
            if (contains) {
              try {
                const st = fs.statSync(full);
                if (st.size > 512 * 1024) continue;
                if (!fs.readFileSync(full, 'utf8').includes(contains)) continue;
              } catch { continue; }
            }
            results.push(path.relative(root, full));
          }
        }
      };
      walk(root, 0);
      return { ok: true, root, matched: results.length, truncated, files: results };
    }

    if (name === 'grep_search') {
      const pattern = String(args.pattern || '');
      if (!pattern) return { ok: false, error: 'pattern 不能为空' };
      const root = resolveWorkPath(args.dir || '.', workDir);
      const glob = String(args.glob || '*');
      const maxResults = Math.min(200, Math.max(1, Number(args.max_results) || 50));
      const flags = args.ignore_case ? 'gi' : 'g';
      let re;
      try {
        re = new RegExp(args.is_regex ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      } catch (err) {
        return { ok: false, error: `正则无效: ${err.message}` };
      }
      const globRe = new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      const SKIP = new Set(['node_modules', '.git', '__pycache__', 'dist', 'build', '.cache', 'target']);
      const matches = [];
      const filesWithHits = new Set();
      let scannedFiles = 0;
      let truncated = false;

      const walk = dir => {
        if (matches.length >= maxResults) { truncated = true; return; }
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          if (matches.length >= maxResults) { truncated = true; break; }
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            if (!SKIP.has(e.name) && !e.name.startsWith('.')) walk(full);
            continue;
          }
          if (!e.isFile() || !globRe.test(e.name)) continue;
          scannedFiles++;
          let text;
          try {
            const st = fs.statSync(full);
            if (st.size > 1024 * 1024) continue; // 1MB content cap per file
            const buf = fs.readFileSync(full);
            if (buf.subarray(0, 4096).includes(0)) continue; // binary
            text = buf.toString('utf8');
          } catch { continue; }
          const lines = text.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            re.lastIndex = 0;
            if (!re.test(lines[i])) continue;
            matches.push({ file: path.relative(root, full), line: i + 1, text: lines[i].length > 200 ? lines[i].slice(0, 200) + '…' : lines[i] });
            filesWithHits.add(full);
            if (matches.length >= maxResults) { truncated = true; break; }
          }
        }
      };
      walk(root);
      return { ok: true, root, pattern, matched: matches.length, filesMatched: filesWithHits.size, scannedFiles, truncated, matches };
    }

    if (name === 'list_processes') {
      const sessionId = (runtime && runtime.sessionId) || null;
      const list = processManager.listProcesses(sessionId);
      return {
        ok: true,
        count: list.length,
        processes: list
      };
    }

    if (name === 'stop_process') {
      const pid = Number(args.pid);
      if (!pid) return { ok: false, error: '必须提供有效的 pid 参数' };
      return processManager.killProcess(pid, false);
    }

    if (name === 'run_command') {
      const command = String(args.command || '').trim();
      if (!command) return { ok: false, error: 'command 不能为空' };
      const isBackgroundRequested = Boolean(args.is_background);
      const killOnTimeout = Boolean(args.kill_on_timeout);
      const timeout = isBackgroundRequested
        ? Math.min(15000, Math.max(1000, Number(args.timeout_ms) || 3000))
        : Math.min(120000, Math.max(1000, Number(args.timeout_ms) || DEFAULT_CMD_TIMEOUT));

      const streamId = (runtime && runtime.streamId) || null;
      const sessionId = (runtime && runtime.sessionId) || null;
      const codepage = await detectOemCodepage();
      const isWin = process.platform === 'win32';

      return await new Promise(resolve => {
        let isResolved = false;
        let didTimeout = false;
        let hardKillFallbackTimer = null;
        let orphanPipeFallbackTimer = null;

        const safeResolve = (res) => {
          if (isResolved) return;
          isResolved = true;
          clearTimeout(timer);
          clearTimeout(hardKillFallbackTimer);
          clearTimeout(orphanPipeFallbackTimer);
          resolve(res);
        };

        const child = isWin
          ? spawn('cmd.exe', ['/d', '/s', '/c', command], { cwd: workDir, windowsHide: true, windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'pipe'] })
          : spawn('/bin/sh', ['-c', command], { cwd: workDir, stdio: ['ignore', 'pipe', 'pipe'] });

        if (streamId) {
          if (!runningCommands.has(streamId)) runningCommands.set(streamId, new Set());
          runningCommands.get(streamId).add(child);
        }

        const procRecord = processManager.register(child, {
          command,
          workDir,
          streamId,
          sessionId,
          isBackground: isBackgroundRequested
        });

        const CAP = 2 * 1024 * 1024;
        const out = [];
        const errBuf = [];
        let outLen = 0;
        let errLen = 0;
        child.stdout.on('data', d => { if (outLen < CAP) { out.push(d); outLen += d.length; } });
        child.stderr.on('data', d => { if (errLen < CAP) { errBuf.push(d); errLen += d.length; } });

        const timer = setTimeout(() => {
          const stdout = decodeCommandOutput(Buffer.concat(out), codepage);
          const stderr = decodeCommandOutput(Buffer.concat(errBuf), codepage);

          let isAlive = false;
          try {
            isAlive = child.pid && process.kill(child.pid, 0);
          } catch {
            isAlive = false;
          }

          if (isAlive) {
            if (killOnTimeout) {
              didTimeout = true;
              processManager.killProcess(child.pid, false);
              hardKillFallbackTimer = setTimeout(() => {
                if (streamId) unregisterCommand(streamId, child);
                safeResolve({
                  ok: false,
                  exitCode: null,
                  timedOut: true,
                  stdout: truncate(stdout, MAX_CMD_OUT),
                  stderr: truncate(stderr || `命令执行超时 (${Math.round(timeout / 1000)}s)，已强制结束进程树`, MAX_CMD_OUT)
                });
              }, 600);
              if (hardKillFallbackTimer.unref) hardKillFallbackTimer.unref();
            } else {
              if (procRecord) procRecord.isBackground = true;
              safeResolve({
                ok: true,
                background: true,
                pid: child.pid,
                timeoutMs: timeout,
                stdout: truncate(stdout, MAX_CMD_OUT),
                stderr: truncate(stderr, MAX_CMD_OUT),
                message: `命令已运行 ${Math.round(timeout / 1000)} 秒，检测到程序仍在持续活跃运行 (PID: ${child.pid})。如果是 Python 游戏、GUI 应用或本地服务，已自动转入后台持续运行。你可以据此分析情况向用户汇报启动结果；如需关闭可调用 stop_process(pid: ${child.pid})，程序退出时也会全量自动清理保证安全。`
              });
            }
          } else {
            // 直接子进程已退出但孙进程仍持有继承的 stdio 管道：close 要等
            // 全部管道关闭才触发，可能永远不来——短宽限后按已退出收尾，
            // 否则该工具调用无限期挂起、Agent 轮次卡死
            orphanPipeFallbackTimer = setTimeout(() => {
              if (streamId) unregisterCommand(streamId, child);
              safeResolve({
                ok: true,
                exitCode: null,
                stdout: truncate(stdout, MAX_CMD_OUT),
                stderr: truncate(stderr || '命令主进程已退出（输出管道仍被后台子进程持有，已提前收尾）', MAX_CMD_OUT)
              });
            }, 2000);
            if (orphanPipeFallbackTimer.unref) orphanPipeFallbackTimer.unref();
          }
        }, timeout);

        if (timer.unref) timer.unref();

        child.on('error', err => {
          if (streamId) unregisterCommand(streamId, child);
          safeResolve({ ok: false, error: `命令启动失败: ${err.message}` });
        });

        child.on('close', code => {
          if (streamId) unregisterCommand(streamId, child);
          const stdout = decodeCommandOutput(Buffer.concat(out), codepage);
          const stderr = decodeCommandOutput(Buffer.concat(errBuf), codepage);

          if (didTimeout) {
            safeResolve({
              ok: false,
              exitCode: code,
              timedOut: true,
              stdout: truncate(stdout, MAX_CMD_OUT),
              stderr: truncate(stderr || `命令执行超时 (${Math.round(timeout / 1000)}s)，已强制结束进程树`, MAX_CMD_OUT)
            });
            return;
          }

          if (code !== 0 && code !== null) {
            safeResolve({
              ok: false,
              exitCode: code,
              timedOut: false,
              stdout: truncate(stdout, MAX_CMD_OUT),
              stderr: truncate(stderr || `命令退出码 ${code}`, MAX_CMD_OUT)
            });
          } else {
            safeResolve({
              ok: true,
              exitCode: code ?? 0,
              stdout: truncate(stdout, MAX_CMD_OUT),
              stderr: truncate(stderr, MAX_CMD_OUT)
            });
          }
        });
      });
    }
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
  return { ok: false, error: `未知本地工具 "${name}"` };
}

module.exports = {
  LOCAL_TOOL_NAMES,
  LOCAL_TOOLS_DEFINITIONS,
  executeLocalTool,
  killRunningCommands
};
