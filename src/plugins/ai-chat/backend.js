/* AI Chat Backend
   Handles session & message persistence, multi-protocol model requests,
   streaming SSE via IPC events, reasoning CoT, Agent tool execution,
   and capability exposure for workflows. */

const { streamCompletion, syncCompletion, fetchRemoteModels } = require('./protocols');
const { AGENT_TOOLS_DEFINITIONS, resolveToolPermission, executeAgentTool } = require('./agent-tools');
const { McpServerConnection, toOpenAiTool, formatToolResult } = require('./mcp-client');
const { parseSkillMarkdown, resolveSkillSourceUrl } = require('./skills-util');

const DEFAULT_CONFIG = {
  channel: 'openai',
  protocol: 'openai-chat', // 'openai-chat' | 'openai-responses' | 'claude-messages'
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  fallbackModel: '', // 异常自动降级模型 (留空表示不开启)
  temperature: 0.7,
  maxTokens: 4096,
  enableReasoning: true,
  thinkingBudget: 2048,
  maxContextMessages: 16,
  enableAgent: true,
  // Agent approval tiers: 'ask' (每次确认) | 'auto' (自动审核，低风险直跑) | 'full' (完全访问)
  agentApprovalMode: 'ask',
  // Thinking level when reasoning is on: 'auto' (不传参，跟随模型默认) | 'low' | 'medium' | 'high'
  thinkingLevel: 'auto'
};

const DEFAULT_PERSONAS = [
  {
    id: 'general',
    title: '通用助手',
    icon: '✨',
    prompt: '你是由 Orbit Toolbox 驱动的智能 AI 助手。回答精准、专业、简洁，遵循第一性原理与 KISS 原则。',
    temperature: 0.7
  },
  {
    id: 'developer',
    title: '架构与全栈工程师',
    icon: '💻',
    prompt: '你是一位资深全栈架构师，精通 JavaScript, TypeScript, Node.js, Python, Electron 及系统设计。提供整洁高效、遵循 KISS 原则的生产级代码与方案。',
    temperature: 0.3
  },
  {
    id: 'translator',
    title: '科技与学术翻译',
    icon: '🌐',
    prompt: '你是一位专业的科技与学术翻译家，精通中英文双向互译。翻译地道流畅、保留专业术语，准确无歧义。',
    temperature: 0.3
  },
  {
    id: 'writer',
    title: '文案与文字润色',
    icon: '✍️',
    prompt: '你是一位专业的文案架构师与编辑，擅长润色文字、梳理逻辑、提炼核心价值并提升可读性。',
    temperature: 0.8
  },
  {
    id: 'workflow-architect',
    title: '工作流架构师',
    icon: '⚡',
    prompt: '你是 Orbit Toolbox 的自动化工作流架构专家。当用户提出自动化流程需求时，你可以调用 create_workflow 工具为用户直接生成并保存完整的可视化 DAG 工作流！节点支持：trigger/clipboard, trigger/manual, source/text, util/text-template, util/regex-extract, util/replace, util/condition, util/code-run, output/clipboard, output/notification 等。',
    temperature: 0.3
  }
];

const genId = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const DEFAULT_SKILLS = [
  {
    id: 'skill-workflow-design',
    name: '工作流设计规范',
    desc: '设计 Orbit 工作流时的节点编排、命名与连线约束',
    content: `# 工作流设计规范\n\n为 Orbit Toolbox 设计工作流时遵循：\n\n1. **入口用触发器**：clipboard 监听或 manual 手动触发，二选一；不要用触发器连触发器。\n2. **节点命名**：title 使用「动词+对象」中文短语，如「正则提取 SKU」「格式化 JSON」。\n3. **布局**：x 每列间隔 280，y 同层对齐 120，避免交叉连线。\n4. **数据处理**：优先使用 util/regex-extract、util/replace、util/text-template 等专用节点；仅当无法表达时才用 util/code-run 写 JS。\n5. **出口**：结果用 output/clipboard 写回剪贴板，必要时加 output/notification 提示。\n6. **条件分支**：util/condition 只连真/假两条边，不要留悬空出口。\n\n创建完成后，用一句话告诉用户节点数量与执行路径。`
  },
  {
    id: 'skill-code-review',
    name: '代码评审清单',
    desc: '逐维度审查代码的结构、边界与可维护性',
    content: `# 代码评审清单\n\n按以下维度逐项检查并给出结论（通过/风险/建议）：\n\n- **正确性**：边界条件、空值、类型、并发/时序问题。\n- **安全性**：注入、越权、敏感信息泄漏、不可信输入。\n- **可读性**：命名达意、函数单一职责、注释只写约束不写流水账。\n- **性能**：明显冗余计算、O(n²) 可优化点、不必要的同步 IO。\n- **一致性**：与周边代码的风格、错误处理、日志约定是否一致。\n\n输出格式：每维度一行结论，最后给「阻塞项 / 建议项」两个列表。`
  }
];

let disposeAll = null;

module.exports = {
  activate(ctx) {
    const rawData = ctx.data.get() || {};
    let config = { ...DEFAULT_CONFIG, ...(rawData.config || {}) };
    let personas = Array.isArray(rawData.personas) && rawData.personas.length > 0 ? rawData.personas : [...DEFAULT_PERSONAS];
    let sessions = Array.isArray(rawData.sessions) ? rawData.sessions : [];
    let activeSessionId = rawData.activeSessionId || null;
    let skills = Array.isArray(rawData.skills) && rawData.skills.length > 0 ? rawData.skills : [...DEFAULT_SKILLS];
    let mcpServers = Array.isArray(rawData.mcpServers) ? rawData.mcpServers : [];

    const activeStreams = new Map(); // streamId -> AbortController
    const pendingApprovals = new Map(); // `${streamId}::${toolCallId}` -> { resolve, toolName }
    const mcpConns = new Map(); // serverId -> { conn, tools, error }

    const save = () => {
      ctx.data.set({ config, personas, sessions, activeSessionId, skills, mcpServers });
    };

    // Ensure at least one session exists
    if (sessions.length === 0) {
      const first = {
        id: genId('sess'),
        title: '新对话',
        personaId: 'general',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        messages: []
      };
      sessions.push(first);
      activeSessionId = first.id;
      save();
    }

    if (!sessions.some(s => s.id === activeSessionId)) {
      activeSessionId = sessions[0] ? sessions[0].id : null;
    }

    const findSession = id => sessions.find(s => s.id === id);
    const getPersona = id => personas.find(p => p.id === id) || personas[0] || DEFAULT_PERSONAS[0];

    /* --- IPC Handlers ----------------------------------------------------- */

    ctx.ipc.handle('getInitData', () => {
      return {
        config,
        personas,
        skills,
        mcpServers,
        sessions: sessions.map(s => ({
          id: s.id,
          title: s.title,
          personaId: s.personaId,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          totalTokens: s.totalTokens || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          messageCount: (s.messages || []).length
        })),
        activeSessionId,
        activeSession: findSession(activeSessionId) || null
      };
    });

    ctx.ipc.handle('saveConfig', args => {
      config = { ...config, ...(args || {}) };
      save();
      return { ok: true, config };
    });

    ctx.ipc.handle('savePersona', args => {
      const p = (args && args.persona) || args || {};
      if (!String(p.title || '').trim()) {
        return { ok: false, error: '人设名称不能为空' };
      }
      const id = p.id ? String(p.id) : genId('persona');
      const pIndex = personas.findIndex(x => x.id === id);
      const newP = {
        id,
        title: String(p.title).trim(),
        icon: String(p.icon || '✨').trim(),
        prompt: String(p.prompt || '').trim(),
        temperature: typeof p.temperature === 'number' ? p.temperature : 0.7
      };
      if (pIndex >= 0) {
        personas[pIndex] = newP;
      } else {
        personas.push(newP);
      }
      save();
      return { ok: true, persona: newP, personas };
    });

    ctx.ipc.handle('deletePersona', args => {
      const id = args && (args.id || args.personaId);
      if (!id) return { ok: false, error: '缺少人设 ID' };
      if (personas.length <= 1) return { ok: false, error: '必须保留至少一个人设' };
      personas = personas.filter(p => p.id !== id);
      save();
      return { ok: true, personas };
    });

    ctx.ipc.handle('resetPersonas', () => {
      personas = [...DEFAULT_PERSONAS];
      save();
      return { ok: true, personas };
    });

    ctx.ipc.handle('fetchModels', async args => {
      try {
        const p = args || {};
        const models = await fetchRemoteModels({
          protocol: p.protocol || config.protocol,
          baseUrl: p.baseUrl || config.baseUrl,
          apiKey: p.apiKey !== undefined ? p.apiKey : config.apiKey
        });
        return { ok: true, models };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    });

    ctx.ipc.handle('createSession', args => {
      const personaId = args && args.personaId ? args.personaId : 'general';
      const persona = getPersona(personaId);
      const newSession = {
        id: genId('sess'),
        title: (args && args.title) || `${persona.title || '新对话'}`,
        personaId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        messages: []
      };
      sessions.unshift(newSession);
      activeSessionId = newSession.id;
      save();
      return { ok: true, session: newSession, activeSessionId };
    });

    ctx.ipc.handle('switchSession', args => {
      const s = findSession(args.id);
      if (!s) return { ok: false, error: '会话不存在' };
      activeSessionId = s.id;
      save();
      return { ok: true, session: s, activeSessionId };
    });

    ctx.ipc.handle('renameSession', args => {
      const s = findSession(args.id);
      if (!s) return { ok: false, error: '会话不存在' };
      s.title = String(args.title || '未命名对话').trim();
      s.updatedAt = Date.now();
      save();
      return { ok: true, session: s };
    });

    ctx.ipc.handle('deleteSession', args => {
      sessions = sessions.filter(s => s.id !== args.id);
      if (sessions.length === 0) {
        const first = {
          id: genId('sess'),
          title: '新对话',
          personaId: 'general',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          messages: []
        };
        sessions.push(first);
      }
      if (activeSessionId === args.id) {
        activeSessionId = sessions[0].id;
      }
      save();
      return { ok: true, sessions, activeSessionId };
    });

    ctx.ipc.handle('clearSession', args => {
      const s = findSession(args.id);
      if (!s) return { ok: false, error: '会话不存在' };
      s.messages = [];
      s.updatedAt = Date.now();
      s.totalTokens = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      save();
      return { ok: true, session: s };
    });

    ctx.ipc.handle('deleteMessage', args => {
      const s = findSession(args.sessionId);
      if (!s) return { ok: false, error: '会话不存在' };
      const idx = s.messages.findIndex(m => m.id === args.messageId);
      if (idx < 0) return { ok: false, error: '消息未找到' };

      if (args.andSubsequent) {
        s.messages = s.messages.slice(0, idx);
      } else {
        s.messages.splice(idx, 1);
      }
      s.updatedAt = Date.now();
      save();
      return { ok: true, session: s };
    });

    // Deny any tool approvals still waiting for the user when a stream is aborted
    const denyPendingApprovals = (streamId, reason) => {
      for (const [key, pending] of [...pendingApprovals]) {
        if (key.startsWith(`${streamId}::`)) {
          pendingApprovals.delete(key);
          pending.resolve({ approved: false, reason });
        }
      }
    };

    ctx.ipc.handle('abortStream', args => {
      const streamId = args && args.streamId;
      if (streamId && activeStreams.has(streamId)) {
        const controller = activeStreams.get(streamId);
        controller.abort();
        denyPendingApprovals(streamId, 'aborted');
        activeStreams.delete(streamId);
        return { ok: true, aborted: true };
      }
      return { ok: false, message: '未找到运行中的任务' };
    });

    /* --- Agent Tool Approval (tier: ask / auto / full) ------------------- */

    ctx.ipc.handle('resolveToolApproval', args => {
      const key = `${args.streamId}::${args.toolCallId}`;
      const pending = pendingApprovals.get(key);
      if (!pending) return { ok: false, error: '该审批请求已失效或已处理' };
      pendingApprovals.delete(key);
      pending.resolve({ approved: !!args.approved, alwaysAllow: !!args.alwaysAllow });
      return { ok: true };
    });

    ctx.ipc.handle('resetSessionApprovals', args => {
      const s = findSession(args && args.sessionId);
      if (!s) return { ok: false, error: '会话不存在' };
      s.alwaysAllowTools = [];
      save();
      return { ok: true, alwaysAllowTools: [] };
    });

    /* --- MCP runtime: pooled connections + merged tool table ---------------- */

    const getMcpRuntime = async () => {
      const defs = [];
      const routes = new Map(); // openai tool name -> { conn, origName, serverName }
      const statuses = [];
      for (const srv of mcpServers) {
        if (!srv || srv.enabled === false) continue;
        let entry = mcpConns.get(srv.id);
        if (!entry) {
          entry = { conn: new McpServerConnection(srv), tools: [], error: null };
          mcpConns.set(srv.id, entry);
          try {
            await entry.conn.start();
            entry.tools = await entry.conn.listTools();
          } catch (err) {
            entry.error = err.message || String(err);
            try { entry.conn.dispose(); } catch {}
          }
        }
        if (entry.error) {
          statuses.push({ id: srv.id, name: srv.name, error: entry.error });
          continue;
        }
        for (const t of entry.tools) {
          const def = toOpenAiTool(srv.name, t);
          if (defs.some(d => d.function.name === def.function.name)) continue; // collision guard
          defs.push(def);
          routes.set(def.function.name, { conn: entry.conn, origName: t.name, serverName: srv.name });
        }
      }
      return { defs, routes, statuses };
    };

    const disposeMcpConn = id => {
      const entry = mcpConns.get(id);
      if (entry) {
        try { entry.conn.dispose(); } catch {}
        mcpConns.delete(id);
      }
    };

    // Unified agent tool dispatcher: skills tools + MCP routing + legacy built-ins
    const dispatchAgentTool = async (name, rawArgs, mcpRoutes) => {
      const parseArgs = () => {
        try { return typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs || {}); } catch { return {}; }
      };
      if (name === 'list_skills') {
        return { ok: true, skills: skills.map(s => ({ id: s.id, name: s.name, desc: s.desc })) };
      }
      if (name === 'read_skill') {
        const skill = skills.find(s => s.id === parseArgs().skill_id || s.name === parseArgs().skill_id);
        if (!skill) return { ok: false, error: `技能不存在，请先调用 list_skills 获取可用列表` };
        return { ok: true, skill_id: skill.id, content: skill.content };
      }
      const route = mcpRoutes && mcpRoutes.get(name);
      if (route) {
        try {
          const res = await route.conn.callTool(route.origName, parseArgs());
          return formatToolResult(res);
        } catch (err) {
          return { ok: false, error: `MCP 调用失败 (${route.serverName}): ${err.message}` };
        }
      }
      return executeAgentTool(name, rawArgs, ctx);
    };

    /* --- MCP Servers & Skills management ------------------------------------ */

    ctx.ipc.handle('saveMcpServer', args => {
      const s = (args && args.server) || args || {};
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
        enabled: s.enabled !== false
      };
      if (rec.transport === 'stdio' && !rec.command) return { ok: false, error: 'stdio 服务器需要填写启动命令' };
      if (rec.transport === 'http' && !rec.url) return { ok: false, error: 'HTTP 服务器需要填写 URL' };
      if (idx >= 0) mcpServers[idx] = rec; else mcpServers.push(rec);
      disposeMcpConn(id); // reconnect with the new config on next use
      save();
      return { ok: true, server: rec, mcpServers };
    });

    ctx.ipc.handle('deleteMcpServer', args => {
      const id = args && (args.id || args.serverId);
      if (!id) return { ok: false, error: '缺少服务器 ID' };
      mcpServers = mcpServers.filter(s => s.id !== id);
      disposeMcpConn(id);
      save();
      return { ok: true, mcpServers };
    });

    ctx.ipc.handle('testMcpServer', async args => {
      const s = (args && args.server) || args || {};
      const conn = new McpServerConnection(s);
      try {
        await conn.start();
        const tools = await conn.listTools();
        if (s.id) { // keep the verified connection for lazy reuse
          disposeMcpConn(s.id);
          mcpConns.set(s.id, { conn, tools, error: null });
        } else {
          conn.dispose();
        }
        return { ok: true, toolCount: tools.length, tools: tools.map(t => t.name) };
      } catch (err) {
        conn.dispose();
        return { ok: false, error: err.message || String(err) };
      }
    });

    ctx.ipc.handle('saveSkill', args => {
      const s = (args && args.skill) || args || {};
      if (!String(s.name || '').trim()) return { ok: false, error: '技能名称不能为空' };
      if (!String(s.content || '').trim()) return { ok: false, error: '技能内容不能为空' };
      const id = s.id ? String(s.id) : genId('skill');
      const idx = skills.findIndex(x => x.id === id);
      const rec = { id, name: String(s.name).trim(), desc: String(s.desc || '').trim(), content: String(s.content) };
      if (idx >= 0) skills[idx] = rec; else skills.push(rec);
      save();
      return { ok: true, skill: rec, skills };
    });

    ctx.ipc.handle('deleteSkill', args => {
      const id = args && (args.id || args.skillId);
      if (!id) return { ok: false, error: '缺少技能 ID' };
      skills = skills.filter(s => s.id !== id);
      save();
      return { ok: true, skills };
    });

    ctx.ipc.handle('resetSkills', () => {
      skills = [...DEFAULT_SKILLS];
      save();
      return { ok: true, skills };
    });

    /* --- Skills import: local files & GitHub download ----------------------- */

    const upsertImportedSkills = items => {
      let imported = 0;
      let skipped = 0;
      for (const it of items) {
        const parsed = parseSkillMarkdown((it && it.filename) || (it && it.name) || '', (it && it.content) || '');
        if (!parsed.content) continue;
        if (skills.some(s => s.name === parsed.name)) { skipped++; continue; } // don't clobber user edits
        skills.push({ id: genId('skill'), name: parsed.name, desc: parsed.desc, content: parsed.content });
        imported++;
      }
      if (imported > 0) save();
      return { imported, skipped };
    };

    ctx.ipc.handle('importSkills', args => {
      const items = Array.isArray(args && args.items) ? args.items : [];
      if (!items.length) return { ok: false, error: '没有可导入的技能内容' };
      const { imported, skipped } = upsertImportedSkills(items);
      return { ok: true, imported, skipped, skills };
    });

    ctx.ipc.handle('importSkillFromUrl', async args => {
      const src = resolveSkillSourceUrl(args && args.url);
      if (src.kind === 'invalid') return { ok: false, error: src.error };

      const fetchText = async url => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);
        try {
          const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Orbit-Toolbox-AI/1.0' } });
          if (!res.ok) throw new Error(`下载失败 [${res.status}] ${res.statusText}`);
          const text = await res.text();
          if (text.length > 512 * 1024) throw new Error('文件过大 (>512KB)，已取消导入');
          return text;
        } finally {
          clearTimeout(timer);
        }
      };

      try {
        if (src.kind === 'file') {
          if (!/\.(md|markdown|txt)$/i.test(src.filename || '')) {
            return { ok: false, error: '仅支持导入 Markdown / 文本文件' };
          }
          const content = await fetchText(src.rawUrl);
          const { imported, skipped } = upsertImportedSkills([{ filename: src.filename, content }]);
          return { ok: true, imported, skipped, total: 1, skills };
        }

        // folder: list .md entries via the GitHub contents API, then import each
        const api = `https://api.github.com/repos/${src.owner}/${src.repo}/contents/${src.path}${src.branch ? `?ref=${encodeURIComponent(src.branch)}` : ''}`;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);
        let entries;
        try {
          const res = await fetch(api, {
            signal: ctrl.signal,
            headers: { 'User-Agent': 'Orbit-Toolbox-AI/1.0', 'Accept': 'application/vnd.github+json' }
          });
          if (!res.ok) {
            let t = '';
            try { t = await res.text(); } catch {}
            throw new Error(`GitHub API ${res.status}: ${t.slice(0, 200) || res.statusText}`);
          }
          entries = await res.json();
        } finally {
          clearTimeout(timer);
        }
        if (!Array.isArray(entries)) {
          return { ok: false, error: '该链接指向单个文件而非目录 (请使用目录或仓库主页链接批量导入)' };
        }
        const mdFiles = entries.filter(e => e && e.type === 'file' && /\.(md|markdown|txt)$/i.test(e.name || ''));
        if (!mdFiles.length) return { ok: false, error: '目录中没有可导入的 .md / .txt 文件' };

        const items = [];
        for (const f of mdFiles) {
          try {
            items.push({ filename: f.name, content: await fetchText(f.download_url) });
          } catch { /* skip unreachable file */ }
        }
        const { imported, skipped } = upsertImportedSkills(items);
        return { ok: true, imported, skipped, total: mdFiles.length, skills };
      } catch (err) {
        return { ok: false, error: err.name === 'AbortError' ? '下载超时，请检查网络后重试' : (err.message || String(err)) };
      }
    });

    /* --- Chat Message Dispatch & Stream ----------------------------------- */

    ctx.ipc.handle('sendMessage', async args => {
      const {
        sessionId,
        content,
        editMessageId,
        streamId = genId('stream'),
        enableReasoning = config.enableReasoning,
        enableAgent = config.enableAgent,
        agentApprovalMode = config.agentApprovalMode || 'ask',
        thinkingLevel = config.thinkingLevel || 'auto',
        modelOverride = null,
        temperatureOverride = null
      } = args || {};

      const session = findSession(sessionId);
      if (!session) return { ok: false, error: '会话不存在' };

      // If user edits an existing message, truncate everything after it
      if (editMessageId) {
        const editIdx = session.messages.findIndex(m => m.id === editMessageId);
        if (editIdx >= 0) {
          session.messages = session.messages.slice(0, editIdx);
        }
      }

      // Add user message
      const userMsg = {
        id: genId('msg_user'),
        role: 'user',
        content: String(content || '').trim(),
        timestamp: Date.now()
      };
      session.messages.push(userMsg);

      // Auto-title fresh session
      if (session.messages.length === 1 && (!session.title || session.title === '新对话')) {
        session.title = userMsg.content.slice(0, 24) || '新对话';
      }

      // Prepare assistant placeholder message
      const assistantMsg = {
        id: genId('msg_ast'),
        role: 'assistant',
        content: '',
        reasoning: '',
        usage: null,
        toolCalls: null,
        timestamp: Date.now()
      };
      session.messages.push(assistantMsg);
      session.updatedAt = Date.now();
      save();

      // Assemble system prompt & bounded context
      const persona = getPersona(session.personaId);
      const systemContent = persona ? persona.prompt : '';

      const maxContext = Math.max(2, Number(config.maxContextMessages) || 16);
      // Grab preceding context messages (excluding current placeholder)
      const contextMsgs = session.messages.slice(0, -1);
      const boundedMsgs = contextMsgs.slice(-maxContext);

      const requestMessages = [];
      if (systemContent) {
        requestMessages.push({ role: 'system', content: systemContent });
      }
      for (const m of boundedMsgs) {
        requestMessages.push({
          role: m.role,
          content: m.content || '',
          ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
          ...(m.tool_calls ? { tool_calls: m.tool_calls } : {})
        });
      }

      // Start stream
      const controller = new AbortController();
      activeStreams.set(streamId, controller);

      const emitChunk = chunk => {
        ctx.send('stream-chunk', { streamId, sessionId, messageId: assistantMsg.id, chunk });
      };

      (async () => {
        let accumulatedContent = '';
        let accumulatedReasoning = '';
        let currentToolCalls = [];

        const primaryModel = modelOverride || config.model || 'gpt-4o-mini';
        const fallbackModel = (config.fallbackModel && config.fallbackModel.trim()) || '';

        // Agent tool table: built-ins + live MCP tools (chat must never block on MCP failure)
        let mcpRoutes = new Map();
        let agentToolDefs = AGENT_TOOLS_DEFINITIONS;
        if (enableAgent) {
          try {
            const rt = await getMcpRuntime();
            mcpRoutes = rt.routes;
            agentToolDefs = rt.defs.length > 0 ? [...AGENT_TOOLS_DEFINITIONS, ...rt.defs] : AGENT_TOOLS_DEFINITIONS;
            for (const st of rt.statuses) {
              emitChunk({ type: 'mcp_error', server: st.name, error: st.error });
            }
          } catch { /* MCP unavailable — continue with built-in tools only */ }
        }

        const runStream = async (targetModel, isFallback = false) => {
          accumulatedContent = '';
          accumulatedReasoning = '';
          currentToolCalls = [];

          const reqOpts = {
            protocol: config.protocol || 'openai-chat',
            baseUrl: config.baseUrl || 'https://api.openai.com/v1',
            apiKey: config.apiKey || '',
            model: targetModel,
            temperature: typeof temperatureOverride === 'number' ? temperatureOverride : (persona.temperature ?? config.temperature ?? 0.7),
            maxTokens: config.maxTokens || 4096,
            enableReasoning: !!enableReasoning,
            thinkingBudget: config.thinkingBudget || 2048,
            thinkingLevel: enableReasoning ? (thinkingLevel || 'auto') : 'auto',
            messages: requestMessages,
            tools: enableAgent ? agentToolDefs : null
          };

          await streamCompletion(reqOpts, async event => {
            if (event.type === 'content') {
              accumulatedContent += event.delta;
              assistantMsg.content = accumulatedContent;
              emitChunk({ type: 'content', delta: event.delta, content: accumulatedContent });
            } else if (event.type === 'reasoning') {
              accumulatedReasoning += event.delta;
              assistantMsg.reasoning = accumulatedReasoning;
              emitChunk({ type: 'reasoning', delta: event.delta, reasoning: accumulatedReasoning });
            } else if (event.type === 'tool_calls') {
              // Assemble tool call deltas
              for (const tc of event.delta) {
                const idx = tc.index ?? 0;
                if (!currentToolCalls[idx]) {
                  currentToolCalls[idx] = { id: tc.id || `tc_${idx}`, type: 'function', function: { name: '', arguments: '' } };
                }
                if (tc.function && tc.function.name) currentToolCalls[idx].function.name += tc.function.name;
                if (tc.function && tc.function.arguments) currentToolCalls[idx].function.arguments += tc.function.arguments;
              }
              emitChunk({ type: 'tool_calls', toolCalls: currentToolCalls });
            } else if (event.type === 'usage' || event.type === 'usage_delta') {
              const u = event.usage;
              assistantMsg.usage = {
                promptTokens: u.promptTokens || (assistantMsg.usage ? assistantMsg.usage.promptTokens : 0),
                completionTokens: u.completionTokens || (assistantMsg.usage ? assistantMsg.usage.completionTokens : 0),
                totalTokens: u.totalTokens || ((assistantMsg.usage ? assistantMsg.usage.promptTokens : 0) + (u.completionTokens || 0))
              };
              emitChunk({ type: 'usage', usage: assistantMsg.usage });
            } else if (event.type === 'done') {
              emitChunk({ type: 'done' });
            }
          }, controller.signal);

          // If tool calls were generated by model, execute them (gated by the approval tier)!
          if (currentToolCalls.length > 0 && enableAgent) {
            assistantMsg.toolCalls = currentToolCalls;
            assistantMsg.toolStatus = {};
            emitChunk({ type: 'tool_exec_start', toolCalls: currentToolCalls });

            // Suspend tool execution until the renderer answers resolveToolApproval
            const requestApproval = tc => new Promise(resolve => {
              pendingApprovals.set(`${streamId}::${tc.id}`, { resolve, toolName: tc.function.name });
              emitChunk({ type: 'tool_approval_request', toolId: tc.id, toolName: tc.function.name, args: tc.function.arguments });
            });

            for (const tc of currentToolCalls) {
              const toolName = tc.function.name;
              const toolArgs = tc.function.arguments;

              // Tiers: 'ask' confirms every call, 'auto' only high-risk tools, 'full' never asks
              const permission = resolveToolPermission(agentApprovalMode, toolName, session.alwaysAllowTools);
              let approved = true;
              if (permission === 'ask') {
                const decision = await requestApproval(tc);
                if (decision.approved && decision.alwaysAllow) {
                  session.alwaysAllowTools = Array.from(new Set([...(session.alwaysAllowTools || []), toolName]));
                  save();
                }
                if (!decision.approved && decision.reason === 'aborted') {
                  const abortErr = new Error('已中断生成');
                  abortErr.name = 'AbortError';
                  throw abortErr;
                }
                approved = !!decision.approved;
              }

              assistantMsg.toolStatus[tc.id] = approved ? (permission === 'ask' ? 'approved' : 'auto') : 'denied';

              const result = approved
                ? await dispatchAgentTool(toolName, toolArgs, mcpRoutes)
                : { ok: false, denied: true, error: '用户拒绝执行该工具调用，请改用纯文本回答或调整方案' };

              emitChunk({ type: 'tool_approval_result', toolId: tc.id, approved, asked: permission === 'ask' });
              emitChunk({ type: 'tool_result', toolId: tc.id, toolName, result });

              // Append tool response to conversation for continuation
              session.messages.push({
                id: genId('msg_tool'),
                role: 'tool',
                tool_call_id: tc.id,
                name: toolName,
                content: typeof result === 'object' ? JSON.stringify(result) : String(result),
                timestamp: Date.now()
              });
            }

            // Continue inference with tool output
            const followUpMsgs = [...requestMessages, {
              role: 'assistant',
              content: accumulatedContent || null,
              tool_calls: currentToolCalls
            }, ...session.messages.filter(m => m.role === 'tool').slice(-currentToolCalls.length).map(m => ({
              role: 'tool',
              tool_call_id: m.tool_call_id,
              name: m.name,
              content: m.content
            }))];

            let followUpContent = '';
            await streamCompletion({
              ...reqOpts,
              messages: followUpMsgs,
              tools: null // avoid endless tool recursion
            }, event => {
              if (event.type === 'content') {
                followUpContent += event.delta;
                assistantMsg.content = (accumulatedContent ? accumulatedContent + '\n\n' : '') + followUpContent;
                emitChunk({ type: 'content', delta: event.delta, content: assistantMsg.content });
              } else if (event.type === 'reasoning') {
                accumulatedReasoning += event.delta;
                assistantMsg.reasoning = accumulatedReasoning;
                emitChunk({ type: 'reasoning', delta: event.delta, reasoning: accumulatedReasoning });
              } else if (event.type === 'done') {
                emitChunk({ type: 'done' });
              }
            }, controller.signal);
          }
        };

        try {
          try {
            await runStream(primaryModel, false);
          } catch (primaryErr) {
            if (primaryErr.name === 'AbortError') throw primaryErr;
            if (fallbackModel && fallbackModel !== primaryModel) {
              assistantMsg.fallbackFrom = primaryModel;
              emitChunk({
                type: 'fallback',
                fromModel: primaryModel,
                toModel: fallbackModel,
                error: primaryErr.message
              });
              await runStream(fallbackModel, true);
            } else {
              throw primaryErr;
            }
          }

          // Update session total usage
          if (assistantMsg.usage) {
            session.totalTokens = session.totalTokens || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
            session.totalTokens.promptTokens += (assistantMsg.usage.promptTokens || 0);
            session.totalTokens.completionTokens += (assistantMsg.usage.completionTokens || 0);
            session.totalTokens.totalTokens += (assistantMsg.usage.totalTokens || 0);
          }

        } catch (err) {
          if (err.name === 'AbortError') {
            emitChunk({ type: 'aborted', message: '已中断生成' });
          } else {
            assistantMsg.error = err.message;
            emitChunk({ type: 'error', error: err.message });
          }
        } finally {
          denyPendingApprovals(streamId, 'aborted');
          activeStreams.delete(streamId);
          session.updatedAt = Date.now();
          save();
          emitChunk({ type: 'complete', message: assistantMsg, sessionTotalTokens: session.totalTokens });
        }
      })();

      return {
        ok: true,
        streamId,
        userMessage: userMsg,
        assistantMessage: assistantMsg
      };
    });

    /* --- Workflow Capability Hook: chatComplete -------------------------- */

    ctx.ipc.handle('chatComplete', async args => {
      const inputText = String(args.value ?? '');
      const nodeCfg = args.config || {};

      let prompt = inputText;
      if (nodeCfg.promptTemplate) {
        prompt = String(nodeCfg.promptTemplate).replaceAll('{{value}}', inputText);
      }

      let systemPrompt = '';
      if (nodeCfg.systemPrompt) {
        systemPrompt = nodeCfg.systemPrompt;
      } else if (nodeCfg.personaId) {
        const p = getPersona(nodeCfg.personaId);
        if (p) systemPrompt = p.prompt;
      }

      const reqOpts = {
        protocol: nodeCfg.protocol || config.protocol || 'openai-chat',
        baseUrl: nodeCfg.baseUrl || config.baseUrl || 'https://api.openai.com/v1',
        apiKey: nodeCfg.apiKey || config.apiKey || '',
        model: nodeCfg.model || config.model || 'gpt-4o-mini',
        temperature: typeof nodeCfg.temperature === 'number' ? nodeCfg.temperature : (config.temperature || 0.7),
        maxTokens: nodeCfg.maxTokens || config.maxTokens || 4096,
        enableReasoning: nodeCfg.enableReasoning !== undefined ? !!nodeCfg.enableReasoning : false,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: prompt }
        ]
      };

      let res;
      try {
        res = await syncCompletion(reqOpts);
      } catch (err) {
        const fallback = nodeCfg.fallbackModel || config.fallbackModel;
        if (fallback && fallback !== reqOpts.model) {
          res = await syncCompletion({ ...reqOpts, model: fallback });
          res.fallbackFrom = reqOpts.model;
        } else {
          throw err;
        }
      }
      return {
        type: 'text/plain',
        value: res.content || '',
        reasoning: res.reasoning || '',
        usage: res.usage || null,
        fallbackFrom: res.fallbackFrom || null
      };
    });

    disposeAll = () => {
      for (const id of [...mcpConns.keys()]) disposeMcpConn(id);
    };
  },

  deactivate() {
    if (disposeAll) {
      disposeAll();
      disposeAll = null;
    }
  }
};
