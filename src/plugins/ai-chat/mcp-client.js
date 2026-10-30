/* Minimal MCP (Model Context Protocol) client for the AI Chat agent.
   Transports:
   - stdio: JSON-RPC over a spawned subprocess's stdin/stdout (newline-delimited)
   - http:  streamable HTTP — JSON-RPC via POST, JSON or SSE-encoded responses
   Zero external dependencies. */

const { spawn } = require('child_process');

const PROTOCOL_VERSION = '2024-11-05';
const START_TIMEOUT = 20000;
const RPC_TIMEOUT = 30000;
const MAX_TOOL_RESULT_CHARS = 64000;
const MCP_SERVER_SEG_MAX = 18;
const MCP_TOOL_SEG_MAX = 30;

/* Quote one token for a cmd.exe command line: wrap in double quotes when it
   contains whitespace, a quote, or a cmd metacharacter (& | < > ^ parentheses),
   escaping inner quotes as "" (cmd-style). */
function cmdQuote(a) {
  a = String(a);
  if (a === '') return '""';
  if (/[\s"&|<>^()]/.test(a)) return `"${a.replace(/"/g, '""')}"`;
  return a;
}

/* Windows cannot exec .cmd shims (npx/npm/...) directly since Node 18.20,
   so route them through cmd.exe. With windowsVerbatimArguments the argv is
   passed verbatim, and with /S cmd.exe strips exactly the outer quote pair
   of the command string, leaving per-token quoting intact:
     cmd.exe /d /s /c ""C:\my tool\run.cmd" "arg one" "a&b""
   (verified empirically: without the outer wrap cmd strips the first/last
   token quotes instead and splits args at spaces; unquoted & is parsed as
   a command separator by cmd). */
function buildSpawnArgs(cfg) {
  const command = String(cfg.command || '').trim();
  const args = Array.isArray(cfg.args) ? cfg.args.map(String) : [];
  const wrapCmd = process.platform === 'win32' &&
    (/\.(cmd|bat)$/i.test(command) || ['npx', 'npm', 'pnpm', 'yarn', 'bunx'].includes(command));
  if (wrapCmd) {
    const cmdline = [command, ...args].map(cmdQuote).join(' ');
    return {
      file: process.env.COMSPEC || 'cmd.exe',
      argv: ['/d', '/s', '/c', `"${cmdline}"`],
      spawnOpts: { windowsVerbatimArguments: true }
    };
  }
  return { file: command, argv: args, spawnOpts: {} };
}

function sanitizeToolSegment(s) {
  const cleaned = String(s || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return cleaned || 'srv';
}

/* MCP tool definition (name/description/inputSchema) -> OpenAI function tool.
   OpenAI caps function names at 64 chars, so keep mcp__<server>__<tool> within
   55: server segment <= 18, tool segment <= 30 (after sanitization). Two
   distinct tools whose segments collide after truncation get deterministic
   _2/_3 suffixes in first-seen (tools/list) order; the same tool object always
   maps to the same name (pooled connections rebuild the table every turn). */
const MCP_TOOL_NAME_BY_OBJ = new WeakMap(); // tool def object -> final name
const MCP_TOOL_USED_NAMES = new Set();      // every issued final name

function buildMcpToolName(serverName, toolName, toolObj) {
  const cached = toolObj ? MCP_TOOL_NAME_BY_OBJ.get(toolObj) : undefined;
  if (cached) return cached;
  const srvSeg = sanitizeToolSegment(serverName).slice(0, MCP_SERVER_SEG_MAX);
  const base = sanitizeToolSegment(toolName).slice(0, MCP_TOOL_SEG_MAX);
  let name = `mcp__${srvSeg}__${base}`;
  let n = 1;
  while (MCP_TOOL_USED_NAMES.has(name)) {
    n += 1;
    const suffix = `_${n}`;
    name = `mcp__${srvSeg}__${base.slice(0, Math.max(1, MCP_TOOL_SEG_MAX - suffix.length))}${suffix}`;
  }
  MCP_TOOL_USED_NAMES.add(name);
  if (toolObj) MCP_TOOL_NAME_BY_OBJ.set(toolObj, name);
  return name;
}

function toOpenAiTool(serverName, tool) {
  const toolObj = (tool && typeof tool === 'object') ? tool : null;
  return {
    type: 'function',
    function: {
      name: buildMcpToolName(serverName, tool && tool.name, toolObj),
      description: `[MCP:${serverName}] ${tool.description || tool.name || ''}`.trim(),
      parameters: (tool.inputSchema && typeof tool.inputSchema === 'object')
        ? tool.inputSchema
        : { type: 'object', properties: {} }
    }
  };
}

/* tools/call result -> plain agent result object */
function formatToolResult(res) {
  if (!res || typeof res !== 'object') return { ok: true, result: JSON.stringify(res) };
  const parts = [];
  for (const item of (res.content || [])) {
    if (item && item.type === 'text' && typeof item.text === 'string') parts.push(item.text);
    else if (item && item.text !== undefined) parts.push(String(item.text));
    else parts.push(JSON.stringify(item));
  }
  const text = parts.join('\n') || JSON.stringify(res);
  const capped = text.length > MAX_TOOL_RESULT_CHARS
    ? text.slice(0, MAX_TOOL_RESULT_CHARS) + '…[截断]'
    : text;
  if (res.isError) return { ok: false, error: capped };
  return { ok: true, result: capped };
}

class McpServerConnection {
  constructor(cfg) {
    this.cfg = cfg || {};
    this.proc = null;
    this.seq = 0;
    this.pending = new Map(); // id -> {resolve, reject, timer}
    this.buffer = '';
    this.stderrTail = '';
    this.sessionId = null;
    this.exited = false;
    this.exitError = null;
  }

  /* ---- lifecycle ------------------------------------------------------- */

  async start() {
    if (this.cfg.transport === 'http') return this._rpcHttpInit();
    return this._startStdio();
  }

  async _startStdio() {
    const { file, argv, spawnOpts } = buildSpawnArgs(this.cfg);
    if (!file) throw new Error('MCP stdio 服务器缺少启动命令');

    const env = { ...process.env };
    for (const [k, v] of Object.entries(this.cfg.env || {})) {
      if (k) env[k] = String(v);
    }

    this.proc = spawn(file, argv, { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, ...spawnOpts });
    this.proc.stdout.on('data', d => this._feed(d.toString('utf-8')));
    this.proc.stderr.on('data', d => {
      this.stderrTail = (this.stderrTail + d.toString('utf-8')).slice(-600);
    });
    this.proc.on('error', err => { this.exitError = `进程启动失败: ${err.message}`; this._failAll(this.exitError); });
    this.proc.on('exit', code => {
      this.exited = true;
      this._failAll(`MCP 服务器进程已退出 (code ${code})${this.stderrTail ? '\n' + this.stderrTail : ''}`);
    });

    await this._initialize();
  }

  async _rpcHttpInit() {
    if (!this.cfg.url) throw new Error('MCP HTTP 服务器缺少 URL');
    await this._initialize();
  }

  async _initialize() {
    const res = await this._rpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'orbit-toolbox-ai-chat', version: '1.0.0' }
    }, START_TIMEOUT);
    if (!res || !res.protocolVersion) throw new Error('initialize 握手响应异常');
    await this._notify('notifications/initialized');
  }

  dispose() {
    this._failAll('连接已关闭');
    const proc = this.proc;
    this.proc = null;
    this.exited = true;
    if (!proc) return;
    if (process.platform === 'win32') {
      // On Windows the server usually runs as cmd.exe -> node grandchild;
      // killing only cmd.exe orphans the grandchildren, so take down the
      // whole process tree. taskkill is fire-and-forget here.
      if (!proc.pid) { try { proc.kill(); } catch {} return; }
      try {
        const killer = spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'],
          { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => { try { proc.kill(); } catch {} });
      } catch {
        try { proc.kill(); } catch {}
      }
    } else {
      // POSIX: polite SIGTERM first, SIGKILL after a short grace period.
      try { proc.kill('SIGTERM'); } catch {}
      const t = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 2000);
      t.unref?.();
      proc.once('exit', () => clearTimeout(t));
    }
  }

  /* ---- JSON-RPC core ---------------------------------------------------- */

  _feed(text) {
    this.buffer += text;
    let idx;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      }
      // notifications (logs etc.) are ignored
    }
  }

  _failAll(reason) {
    for (const [, p] of [...this.pending]) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }

  _rpc(method, params, timeout = RPC_TIMEOUT) {
    return new Promise((resolve, reject) => {
      if (this.exited || this.exitError) {
        reject(new Error(this.exitError || 'MCP 服务器已退出'));
        return;
      }
      const id = ++this.seq;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP 调用超时: ${method}`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this._send({ jsonrpc: '2.0', id, method, params: params || {} })
        .then(out => {
          // HTTP transport resolves the RPC inline; stdio resolves later via _feed.
          if (out !== undefined && this.pending.has(id)) {
            const p = this.pending.get(id);
            this.pending.delete(id);
            clearTimeout(p.timer);
            p.resolve(out);
          }
        })
        .catch(err => {
          if (this.pending.has(id)) {
            const p = this.pending.get(id);
            this.pending.delete(id);
            clearTimeout(p.timer);
            p.reject(err);
          } else {
            reject(err);
          }
        });
    });
  }

  async _notify(method) {
    await this._send({ jsonrpc: '2.0', method, params: {} });
  }

  async _send(payload) {
    if (this.cfg.transport === 'http') return this._sendHttp(payload);
    if (!this.proc || this.exited) throw new Error(this.exitError || 'MCP 进程未运行');
    return new Promise((resolve, reject) => {
      this.proc.stdin.write(JSON.stringify(payload) + '\n', err => err ? reject(err) : resolve());
    });
  }

  async _sendHttp(payload, opts) {
    const { sessionRetry = false } = opts || {};
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      ...(this.cfg.apiKey ? { 'Authorization': `Bearer ${this.cfg.apiKey}` } : {})
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), RPC_TIMEOUT);
    try {
      const res = await fetch(this.cfg.url, { method: 'POST', headers, body: JSON.stringify(payload), signal: ctrl.signal });
      const sid = res.headers.get('mcp-session-id');
      if (sid) this.sessionId = sid;
      if (!res.ok) {
        // Server-side session state was lost (restart/expire): drop the stale
        // id, redo the initialize handshake, and retry the request exactly once.
        if (res.status === 404 && this.sessionId && !sessionRetry) {
          this.sessionId = null;
          await this._initialize();
          return this._sendHttp(payload, { sessionRetry: true });
        }
        let t = '';
        try { t = await res.text(); } catch {}
        throw new Error(`MCP HTTP ${res.status}: ${t.slice(0, 300) || res.statusText}`);
      }
      // Notifications (no id) get a 202 with empty body per streamable-HTTP spec
      if (payload.id === undefined) {
        try { await res.text(); } catch {}
        return undefined;
      }
      const ctype = res.headers.get('content-type') || '';
      if (ctype.includes('text/event-stream')) {
        return this._readSseResponse(res, ctrl, payload.id);
      }
      const text = await res.text();
      const msg = JSON.parse(text);
      if (msg.error) throw new Error(msg.error.message || JSON.stringify(msg.error));
      return msg.result;
    } finally {
      clearTimeout(timer);
    }
  }

  /* Consume an SSE response incrementally: resolve as soon as the JSON-RPC
     response whose id matches reqId arrives (spec-compliant servers keep the
     stream open, so buffering res.text() would block until the 30s timeout).
     Messages without the matching id (notifications) are ignored. After the
     response is delivered the stream keeps draining in the background until
     it ends or the request deadline passes, then it is released. */
  async _readSseResponse(res, ctrl, reqId) {
    const fallback = async () => {
      // No streaming body available: buffered parse (last matching data line).
      const text = await res.text();
      const lines = text.split(/\r?\n/).filter(l => l.startsWith('data:'));
      const found = lines.map(l => { try { return JSON.parse(l.slice(5).trim()); } catch { return null; } })
        .filter(m => m && m.id === reqId);
      const msg = found.length ? found[found.length - 1] : null;
      if (!msg) throw new Error('MCP HTTP SSE 响应中未找到对应结果');
      if (msg.error) throw new Error(msg.error.message || JSON.stringify(msg.error));
      return msg.result;
    };
    if (!res.body || typeof res.body.getReader !== 'function') return fallback();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const deadline = Date.now() + RPC_TIMEOUT;
    let buf = '';
    let dataLines = [];
    let result;
    let failure = null;
    let done = false;

    const dispatchEvent = () => {
      if (!dataLines.length) return;
      const raw = dataLines.join('\n');
      dataLines = [];
      let msg;
      try { msg = JSON.parse(raw); } catch { return; } // malformed/keepalive data
      if (msg.id !== reqId) return;                    // notification -> ignore
      if (msg.error) failure = new Error(msg.error.message || JSON.stringify(msg.error));
      else result = msg.result;
      done = true;
    };

    const handleChunk = chunk => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, '');
        buf = buf.slice(idx + 1);
        if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
        else if (line === '') dispatchEvent();
        // event:/id:/retry: fields and SSE comments carry no JSON-RPC payload
      }
    };

    // Returns 'resolved' (got the matching response), 'end' (stream closed)
    // or 'deadline'/'error'. Never rejects.
    const pump = async () => {
      try {
        while (Date.now() < deadline) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) { dispatchEvent(); return done ? 'resolved' : 'end'; }
          handleChunk(decoder.decode(value, { stream: true }));
          if (done) return 'resolved';
        }
        return done ? 'resolved' : 'deadline';
      } catch {
        return done ? 'resolved' : 'error';
      }
    };

    const release = () => {
      try { reader.cancel(); } catch {}
      try { ctrl.abort(); } catch {}
    };

    let outcome = 'error';
    try {
      outcome = await pump();
    } catch {}
    if (!done) {
      release();
      throw failure || new Error('MCP HTTP SSE 响应中未找到对应结果');
    }
    if (outcome !== 'end') {
      // Keep draining in the background (trailing notifications etc.) without
      // blocking the caller; hard-stop at the request deadline.
      const bail = setTimeout(release, Math.max(0, deadline - Date.now()));
      bail.unref?.();
      pump().catch(() => {}).finally(() => clearTimeout(bail));
    }
    return result;
  }

  /* ---- MCP API ------------------------------------------------------------ */

  async listTools() {
    const res = await this._rpc('tools/list', {});
    return (res && Array.isArray(res.tools)) ? res.tools : [];
  }

  async callTool(name, args) {
    const params = { name, arguments: args || {} };
    return this._rpc('tools/call', params);
  }
}

module.exports = {
  McpServerConnection,
  toOpenAiTool,
  formatToolResult,
  sanitizeToolSegment
};
