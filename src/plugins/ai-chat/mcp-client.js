/* Minimal MCP (Model Context Protocol) client for the AI Chat agent.
   Transports:
   - stdio: JSON-RPC over a spawned subprocess's stdin/stdout (newline-delimited)
   - http:  streamable HTTP — JSON-RPC via POST, JSON or SSE-encoded responses
   Zero external dependencies. */

const { spawn } = require('child_process');

const PROTOCOL_VERSION = '2024-11-05';
const START_TIMEOUT = 20000;
const RPC_TIMEOUT = 30000;

/* Windows cannot exec .cmd shims (npx/npm/...) directly since Node 18.20,
   so route them through cmd.exe with conservative quoting. */
function buildSpawnArgs(cfg) {
  const command = String(cfg.command || '').trim();
  const args = Array.isArray(cfg.args) ? cfg.args.map(String) : [];
  const wrapCmd = process.platform === 'win32' &&
    (/\.(cmd|bat)$/i.test(command) || ['npx', 'npm', 'pnpm', 'yarn', 'bunx'].includes(command));
  if (wrapCmd) {
    const q = a => (/\s/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);
    return { file: 'cmd.exe', argv: ['/c', q(command), ...args.map(q)] };
  }
  return { file: command, argv: args };
}

function sanitizeToolSegment(s) {
  const cleaned = String(s || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return cleaned || 'srv';
}

/* MCP tool definition (name/description/inputSchema) -> OpenAI function tool */
function toOpenAiTool(serverName, tool) {
  return {
    type: 'function',
    function: {
      name: `mcp__${sanitizeToolSegment(serverName)}__${sanitizeToolSegment(tool.name)}`,
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
  if (res.isError) return { ok: false, error: text };
  return { ok: true, result: text };
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
    const { file, argv } = buildSpawnArgs(this.cfg);
    if (!file) throw new Error('MCP stdio 服务器缺少启动命令');

    const env = { ...process.env };
    for (const [k, v] of Object.entries(this.cfg.env || {})) {
      if (k) env[k] = String(v);
    }

    this.proc = spawn(file, argv, { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
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
    if (this.proc) {
      try { this.proc.kill(); } catch {}
      this.proc = null;
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

  async _sendHttp(payload) {
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
      const text = await res.text();
      if (ctype.includes('text/event-stream')) {
        // streamable HTTP may answer SSE-style: use the last data: line holding this id
        const lines = text.split(/\r?\n/).filter(l => l.startsWith('data:'));
        const found = lines.map(l => { try { return JSON.parse(l.slice(5).trim()); } catch { return null; } })
          .filter(m => m && m.id === payload.id);
        const msg = found.length ? found[found.length - 1] : null;
        if (!msg) throw new Error('MCP HTTP SSE 响应中未找到对应结果');
        if (msg.error) throw new Error(msg.error.message || JSON.stringify(msg.error));
        return msg.result;
      }
      const msg = JSON.parse(text);
      if (msg.error) throw new Error(msg.error.message || JSON.stringify(msg.error));
      return msg.result;
    } finally {
      clearTimeout(timer);
    }
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
