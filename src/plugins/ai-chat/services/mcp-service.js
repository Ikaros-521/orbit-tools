/* AI Chat - MCP Runtime & Service
   Manages pooled MCP server subprocesses, tool discovery, format transformation to OpenAI schema,
   MCP market installation, and connectivity tests. */

const { McpServerConnection, toOpenAiTool, formatToolResult, resetMcpToolNames } = require('../mcp-client');
const { DEFAULT_MCP_SERVERS, MARKET_CATEGORIES, MCP_MARKET_CATALOG, searchMcpMarket } = require('../mcp-market');

class McpService {
  constructor() {
    this.mcpConns = new Map(); // serverId -> { conn, tools, error, initPromise }
  }

  async getMcpRuntime(mcpServers = []) {
    const defs = [];
    const routes = new Map(); // openai tool name -> { conn, origName, serverName }
    const statuses = [];
    // 每轮全量重建：已用名集合清零，保证同名逻辑工具跨重连拿到稳定名
    resetMcpToolNames();

    for (const srv of mcpServers) {
      if (!srv || srv.enabled === false) continue;
      let entry = this.mcpConns.get(srv.id);
      if (entry && entry.conn.exited) {
        this.disposeMcpConn(srv.id);
      }
      entry = this.mcpConns.get(srv.id);
      if (!entry) {
        entry = { conn: new McpServerConnection(srv), tools: [], error: null, initPromise: null };
        this.mcpConns.set(srv.id, entry);
        entry.initPromise = (async () => {
          await entry.conn.start();
          entry.tools = await entry.conn.listTools();
        })().catch(err => {
          try { entry.conn.dispose(); } catch {}
          this.mcpConns.delete(srv.id);
          return { error: err.message || String(err) };
        });
      }

      const initResult = entry.initPromise ? await entry.initPromise : null;
      if (!this.mcpConns.has(srv.id)) {
        statuses.push({ id: srv.id, name: srv.name, error: (initResult && initResult.error) || 'MCP 服务器初始化失败' });
        continue;
      }

      for (const t of entry.tools) {
        const def = toOpenAiTool(srv.name, t);
        if (defs.some(d => d.function.name === def.function.name)) continue;
        defs.push(def);
        routes.set(def.function.name, { conn: entry.conn, origName: t.name, serverName: srv.name });
      }
    }

    return { defs, routes, statuses };
  }

  disposeMcpConn(id, sync = false) {
    const entry = this.mcpConns.get(id);
    if (entry) {
      try { entry.conn.dispose(!!sync); } catch {}
      this.mcpConns.delete(id);
    }
  }

  disposeAll(sync = false) {
    for (const id of [...this.mcpConns.keys()]) {
      this.disposeMcpConn(id, sync);
    }
  }

  saveMcpServer(s, mcpServers, genId) {
    if (!String(s.name || '').trim()) return { ok: false, error: '服务器名称不能为空' };
    const id = s.id ? String(s.id) : genId('mcp');
    const idx = mcpServers.findIndex(x => x.id === id);
    const rec = {
      id,
      name: String(s.name).trim(),
      transport: s.transport === 'http' ? 'http' : 'stdio',
      command: String(s.command || '').trim(),
      args: Array.isArray(s.args) ? s.args.map(String) : [],
      env: s.env && typeof s.env === 'object' && !Array.isArray(s.env) ? s.env : {},
      url: String(s.url || '').trim(),
      apiKey: String(s.apiKey || ''),
      enabled: s.enabled !== false,
      desc: String(s.desc || '').trim(),
      isPreset: !!s.isPreset
    };
    if (rec.transport === 'stdio' && !rec.command) return { ok: false, error: 'stdio 服务器需要填写启动命令' };
    if (rec.transport === 'http' && !rec.url) return { ok: false, error: 'HTTP 服务器需要填写 URL' };
    if (mcpServers.some(x => x.name === rec.name && x.id !== id)) return { ok: false, error: `已存在同名服务器「${rec.name}」，请更换名称` };

    if (idx >= 0) mcpServers[idx] = rec; else mcpServers.push(rec);
    this.disposeMcpConn(id);
    return { ok: true, server: rec, mcpServers };
  }

  deleteMcpServer(id, mcpServers) {
    if (!id) return { ok: false, error: '缺少服务器 ID' };
    const filtered = mcpServers.filter(s => s.id !== id);
    this.disposeMcpConn(id);
    return { ok: true, mcpServers: filtered };
  }

  getMcpMarket(query, category, mcpServers = []) {
    const items = searchMcpMarket(query, category);
    const installedSet = new Set(mcpServers.map(s => s.id));
    const installedNames = new Set(mcpServers.map(s => (s.name || '').toLowerCase()));
    const enriched = items.map(it => ({
      ...it,
      installed: installedSet.has(it.id) || installedNames.has(it.name.toLowerCase())
    }));
    return { ok: true, items: enriched, categories: MARKET_CATEGORIES };
  }

  installMarketMcp(marketId, mcpServers) {
    const target = MCP_MARKET_CATALOG.find(x => x.id === marketId);
    if (!target) return { ok: false, error: '未找到指定市场 MCP 服务' };
    const existing = mcpServers.find(s => s.id === target.id || (s.name && s.name.toLowerCase() === target.name.toLowerCase()));
    if (existing) {
      existing.enabled = true;
      return { ok: true, server: existing, mcpServers, message: `MCP 服务「${existing.name}」已存在并设为启用` };
    }
    const newServer = {
      id: target.id,
      name: target.name,
      transport: 'stdio',
      command: target.command,
      args: [...target.args],
      env: { ...(target.env || {}) },
      enabled: true,
      desc: target.desc,
      isPreset: !!target.official
    };
    mcpServers.push(newServer);
    return { ok: true, server: newServer, mcpServers, message: `MCP 服务「${newServer.name}」已成功添加！` };
  }

  async testMcpServer(serverConfig) {
    const conn = new McpServerConnection(serverConfig);
    try {
      await conn.start();
      const tools = await conn.listTools();
      return { ok: true, toolCount: tools.length, tools: tools.map(t => t.name) };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    } finally {
      try { conn.dispose(); } catch {}
    }
  }

  resetMcpServers() {
    this.disposeAll();
    return DEFAULT_MCP_SERVERS.map(s => ({ ...s }));
  }
}

module.exports = McpService;
