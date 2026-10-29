/* Local assistant tools for the AI Chat agent: filesystem access + shell.
   Risk model: reads/search are low-risk (auto tier runs them), writes and
   commands are high-risk (ask in 'ask' and 'auto' tiers). Paths resolve
   against the session working directory unless absolute. */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const MAX_READ_CHARS = 200 * 1024;
const MAX_WRITE_CHARS = 1024 * 1024;
const MAX_CMD_OUT = 15 * 1024;
const DEFAULT_CMD_TIMEOUT = 30000;

const LOCAL_TOOL_NAMES = new Set(['list_dir', 'read_file', 'write_file', 'search_files', 'run_command']);

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
      name: 'run_command',
      description: '在当前工作目录执行一条 shell 命令 (Windows 为 cmd)，并返回 stdout/stderr 与退出码。适合构建、测试、git、系统信息查询等。高危操作，需用户审批。',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令行' },
          timeout_ms: { type: 'number', description: '超时毫秒数 (默认 30000，上限 120000)' }
        },
        required: ['command']
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
        if (results.length >= maxResults || depth > 8 || scanned > 5000) { truncated = truncated || results.length >= maxResults; return; }
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

    if (name === 'run_command') {
      const command = String(args.command || '').trim();
      if (!command) return { ok: false, error: 'command 不能为空' };
      const timeout = Math.min(120000, Math.max(3000, Number(args.timeout_ms) || DEFAULT_CMD_TIMEOUT));
      return await new Promise(resolve => {
        exec(command, { cwd: workDir, timeout, maxBuffer: 2 * 1024 * 1024, windowsHide: true, encoding: 'utf8' }, (err, stdout, stderr) => {
          if (err) {
            resolve({
              ok: false,
              exitCode: err.code ?? null,
              timedOut: !!err.killed,
              stdout: truncate(stdout, MAX_CMD_OUT),
              stderr: truncate(stderr || err.message || '', MAX_CMD_OUT)
            });
          } else {
            resolve({ ok: true, exitCode: 0, stdout: truncate(stdout, MAX_CMD_OUT), stderr: truncate(stderr, MAX_CMD_OUT) });
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
  executeLocalTool
};
