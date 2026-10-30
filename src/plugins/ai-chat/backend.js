/* AI Chat Backend
   Handles session & message persistence, multi-protocol model requests,
   streaming SSE via IPC events, reasoning CoT, Agent tool execution,
   and capability exposure for workflows. */

const { streamCompletion, syncCompletion, fetchRemoteModels } = require('./protocols');
const { AGENT_TOOLS_DEFINITIONS, resolveToolPermission, executeAgentTool } = require('./agent-tools');
const { McpServerConnection, toOpenAiTool, formatToolResult } = require('./mcp-client');
const { parseSkillMarkdown, resolveSkillSourceUrl, pickSkillEntries, pickLocalSkillFiles } = require('./skills-util');
const { LOCAL_TOOL_NAMES, LOCAL_TOOLS_DEFINITIONS, executeLocalTool, killRunningCommands } = require('./local-tools');
const { dialog } = require('electron');
const os = require('os');
const fs = require('fs');
const path = require('path');

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
  thinkingLevel: 'auto',
  // Default working directory for the local assistant (empty -> user home)
  agentWorkDir: ''
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

/* Tool results replayed to the API must stay far below the context window;
   the tools themselves may return much larger payloads. */
const TOOL_RESULT_CONTEXT_BUDGET = 24 * 1024;
const clipToolContent = s => {
  const str = String(s ?? '');
  return str.length > TOOL_RESULT_CONTEXT_BUDGET ? str.slice(0, TOOL_RESULT_CONTEXT_BUDGET) + '\n…[工具结果过长，已截断]' : str;
};

/* Build the API message list from stored history with two invariants:
   1. an assistant message carrying tool_calls always travels together with
      its role:'tool' responses (splitting the pair across the context-window
      boundary makes OpenAI reject the whole request with 400);
   2. orphan tool messages (whose assistant message was deleted/cut) are dropped.
   Stored assistant messages use the camelCase `toolCalls` key; the wire
   format is snake_case `tool_calls`. */
const buildBoundedContext = (msgs, max) => {
  const units = [];
  for (const m of msgs) {
    const toolCalls = m.tool_calls || m.toolCalls;
    if (m.role === 'tool') {
      const last = units[units.length - 1];
      if (last && last.kind === 'assistant') {
        last.toolMsgs.push({
          role: 'tool',
          content: m.content || '',
          tool_call_id: m.tool_call_id,
          ...(m.name ? { name: m.name } : {})
        });
      }
      continue; // orphaned tool response — drop
    }
    if (m.role === 'assistant' && Array.isArray(toolCalls) && toolCalls.length > 0) {
      units.push({ kind: 'assistant', msg: { role: 'assistant', content: m.content || '', tool_calls: toolCalls }, toolMsgs: [] });
    } else {
      units.push({ kind: 'plain', msg: { role: m.role, content: m.content || '' } });
    }
  }
  const kept = [];
  let count = 0;
  for (let i = units.length - 1; i >= 0; i--) {
    const size = units[i].kind === 'assistant' ? 1 + units[i].toolMsgs.length : 1;
    if (count + size > max) break;
    count += size;
    kept.unshift(units[i]);
  }
  const flat = [];
  for (const u of kept) {
    flat.push(u.msg);
    if (u.kind === 'assistant') flat.push(...u.toolMsgs);
  }
  return flat;
};

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
    const streamBySession = new Map(); // sessionId -> streamId (guards re-entry & destructive IPC)
    const pendingApprovals = new Map(); // `${streamId}::${toolCallId}` -> { resolve, toolName }
    const mcpConns = new Map(); // serverId -> { conn, tools, error }

    const save = () => {
      ctx.data.set({ config, personas, sessions, activeSessionId, skills, mcpServers });
    };

    // Resolve a user-supplied work dir (relative paths anchor at the user home); '' = unset -> default home
    const validateWorkDir = raw => {
      const dir = String(raw || '').trim().replace(/^"|"$/g, '');
      if (!dir) return { ok: true, dir: '' };
      let resolved;
      try {
        resolved = path.resolve(os.homedir(), dir);
        if (!fs.statSync(resolved).isDirectory()) return { ok: false, error: '路径不是目录' };
      } catch {
        return { ok: false, error: `目录不存在或无法访问: ${resolved || dir}` };
      }
      return { ok: true, dir: resolved };
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
      const patch = { ...(args || {}) };
      if ('agentWorkDir' in patch) {
        const v = validateWorkDir(patch.agentWorkDir);
        if (!v.ok) return { ok: false, error: v.error };
        patch.agentWorkDir = v.dir;
      }
      config = { ...config, ...patch };
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
        workDir: config.agentWorkDir || os.homedir(),
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
      if (streamBySession.has(args.id)) return { ok: false, error: '该会话正在生成中，请先停止' };
      sessions = sessions.filter(s => s.id !== args.id);
      if (sessions.length === 0) {
        const first = {
          id: genId('sess'),
          title: '新对话',
          personaId: 'general',
          workDir: config.agentWorkDir || os.homedir(),
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
      if (streamBySession.has(args.id)) return { ok: false, error: '该会话正在生成中，请先停止' };
      s.messages = [];
      s.updatedAt = Date.now();
      s.totalTokens = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      save();
      return { ok: true, session: s };
    });

    ctx.ipc.handle('deleteMessage', args => {
      const s = findSession(args.sessionId);
      if (!s) return { ok: false, error: '会话不存在' };
      if (streamBySession.has(args.sessionId)) return { ok: false, error: '该会话正在生成中，请先停止' };
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
        killRunningCommands(streamId); // stop in-flight local commands' whole process tree
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

    // Persist a persona switch on an existing session (renderer footer pill)
    const setSessionPersonaHandler = args => {
      const s = findSession(args && args.sessionId);
      if (!s) return { ok: false, error: '会话不存在' };
      const pid = String((args && args.personaId) || '').trim();
      if (!personas.some(p => p.id === pid)) return { ok: false, error: '人设不存在' };
      s.personaId = pid;
      s.updatedAt = Date.now();
      save();
      return { ok: true, activeSession: s };
    };
    ctx.ipc.handle('setSessionPersona', setSessionPersonaHandler);
    ctx.ipc.handle('set_session_persona', setSessionPersonaHandler); // renderer alias

    ctx.ipc.handle('setSessionWorkDir', args => {
      const s = findSession(args && args.sessionId);
      if (!s) return { ok: false, error: '会话不存在' };
      const v = validateWorkDir(args && args.dir);
      if (!v.ok) return { ok: false, error: v.error };
      s.workDir = v.dir; // '' clears the per-session override -> falls back to the configured default
      s.updatedAt = Date.now();
      save();
      return { ok: true, workDir: v.dir };
    });

    // Native folder picker for the Agent working directory (renderer cannot open OS dialogs)
    ctx.ipc.handle('chooseAgentWorkDir', async args => {
      const start = (args && args.current)
        || config.agentWorkDir
        || os.homedir();
      const parent = ctx.getHostWindow ? ctx.getHostWindow() : null;
      const r = await dialog.showOpenDialog(parent && !parent.isDestroyed() ? parent : null, {
        title: '选择 Agent 工作目录',
        defaultPath: fs.existsSync(start) ? start : os.homedir(),
        properties: ['openDirectory', 'createDirectory'],
      });
      if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
      return { ok: true, dir: r.filePaths[0] };
    });

    /* --- MCP runtime: pooled connections + merged tool table ---------------- */

    const getMcpRuntime = async () => {
      const defs = [];
      const routes = new Map(); // openai tool name -> { conn, origName, serverName }
      const statuses = [];
      for (const srv of mcpServers) {
        if (!srv || srv.enabled === false) continue;
        let entry = mcpConns.get(srv.id);
        if (entry && entry.conn.exited) disposeMcpConn(srv.id); // dead process -> fresh init on next use
        entry = mcpConns.get(srv.id);
        if (!entry) {
          entry = { conn: new McpServerConnection(srv), tools: [], error: null, initPromise: null };
          mcpConns.set(srv.id, entry);
          entry.initPromise = (async () => {
            await entry.conn.start();
            entry.tools = await entry.conn.listTools();
          })().catch(err => {
            try { entry.conn.dispose(); } catch {}
            mcpConns.delete(srv.id); // evict so the next call retries a fresh start
            return { error: err.message || String(err) };
          });
        }
        // Concurrent callers share the in-flight init instead of reading an empty tool list
        const initResult = entry.initPromise ? await entry.initPromise : null;
        if (!mcpConns.has(srv.id)) {
          statuses.push({ id: srv.id, name: srv.name, error: (initResult && initResult.error) || 'MCP 服务器初始化失败' });
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

    const disposeMcpConn = (id, sync) => {
      const entry = mcpConns.get(id);
      if (entry) {
        try { entry.conn.dispose(!!sync); } catch {}
        mcpConns.delete(id);
      }
    };

    // Unified agent tool dispatcher: skills tools + MCP routing + legacy built-ins
    const dispatchAgentTool = async (name, rawArgs, mcpRoutes, workDir, streamId) => {
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
      if (LOCAL_TOOL_NAMES.has(name)) {
        return executeLocalTool(name, parseArgs(), { workDir: workDir || os.homedir(), streamId });
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
      if (mcpServers.some(x => x.name === rec.name && x.id !== id)) return { ok: false, error: `已存在同名服务器「${rec.name}」，请更换名称` };
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
      // Always a throwaway connection: pooling the form-under-test under its
      // server id would serve unsaved config to later chats if the user cancels.
      const conn = new McpServerConnection(s);
      try {
        await conn.start();
        const tools = await conn.listTools();
        return { ok: true, toolCount: tools.length, tools: tools.map(t => t.name) };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      } finally {
        try { conn.dispose(); } catch {}
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
      const names = [];
      for (const it of items) {
        const parsed = parseSkillMarkdown((it && it.filename) || (it && it.name) || '', (it && it.content) || '');
        if (!parsed.content || parsed.content.length > 512 * 1024) continue;
        if (skills.some(s => s.name === parsed.name)) { skipped++; continue; } // don't clobber user edits
        const rec = { id: genId('skill'), name: parsed.name, desc: parsed.desc, content: parsed.content };
        if (it && it.source) rec.source = it.source;
        skills.push(rec);
        names.push(parsed.name);
        imported++;
      }
      if (imported > 0) save();
      return { imported, skipped, names };
    };

    ctx.ipc.handle('importSkills', args => {
      const items = Array.isArray(args && args.items) ? args.items : [];
      if (!items.length) return { ok: false, error: '没有可导入的技能内容' };
      const { imported, skipped, names } = upsertImportedSkills(items);
      return { ok: true, imported, skipped, names, skills };
    });

    // pure path-grouping shared with tools/test-ai-skills.js (panel picks which
    // File objects to read; the rule lives in skills-util.js)
    ctx.ipc.handle('pickLocalSkillFiles', args => {
      const paths = Array.isArray(args && args.paths) ? args.paths : [];
      return { ok: true, ...pickLocalSkillFiles(paths) };
    });

    // Overridable for tests (tools/test-ai-skills.js mocks the GitHub API).
    const GH_API_BASE = process.env.ORBIT_GH_API_BASE || 'https://api.github.com';
    const GH_RAW_BASE = process.env.ORBIT_GH_RAW_BASE || 'https://raw.githubusercontent.com';
    const MAX_SKILL_FILES = 60;
    // raw.githubusercontent.com is unreachable on some networks (connection
    // reset); once a raw fetch fails, the rest of the session downloads via
    // the contents API instead (same host as the tree scan, so it works
    // wherever the scan worked)
    let ghRawUnavailable = false;

    const ghJson = async url => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      try {
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { 'User-Agent': 'Orbit-Toolbox-AI/1.0', 'Accept': 'application/vnd.github+json' }
        });
        if (!res.ok) {
          let t = '';
          try { t = await res.text(); } catch {}
          throw new Error(`GitHub API ${res.status}: ${t.slice(0, 200) || res.statusText}`);
        }
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    };

    const getText = async (url, headers) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      try {
        const res = await fetch(url, { signal: ctrl.signal, headers });
        if (!res.ok) throw new Error(`下载失败 [${res.status}] ${res.statusText}`);
        const text = await res.text();
        if (text.length > 512 * 1024) throw new Error('文件过大 (>512KB)，已取消导入');
        return text;
      } finally {
        clearTimeout(timer);
      }
    };

    // GitHub file download: raw CDN first (no API quota), contents API as
    // fallback (Accept: raw returns the file body on api.github.com)
    const fetchGhFile = async (gh, p) => {
      if (!ghRawUnavailable) {
        try {
          return await getText(`${GH_RAW_BASE}/${gh.owner}/${gh.repo}/${gh.branch}/${p}`, { 'User-Agent': 'Orbit-Toolbox-AI/1.0' });
        } catch (err) {
          if (err.name === 'AbortError') throw err;
          ghRawUnavailable = true;
        }
      }
      return getText(
        `${GH_API_BASE}/repos/${gh.owner}/${gh.repo}/contents/${p}?ref=${encodeURIComponent(gh.branch)}`,
        { 'User-Agent': 'Orbit-Toolbox-AI/1.0', 'Accept': 'application/vnd.github.raw' }
      );
    };

    ctx.ipc.handle('importSkillFromUrl', async args => {
      const src = resolveSkillSourceUrl(args && args.url);
      if (src.kind === 'invalid') return { ok: false, error: src.error };

      try {
        if (src.kind === 'file') {
          if (!/\.(md|markdown|txt)$/i.test(src.filename || '')) {
            return { ok: false, error: '仅支持导入 Markdown / 文本文件' };
          }
          let content;
          let sourceUrl = src.rawUrl;
          if (src.gh) {
            content = await fetchGhFile(src.gh, src.gh.path);
            sourceUrl = `https://github.com/${src.gh.owner}/${src.gh.repo}/blob/${src.gh.branch}/${src.gh.path}`;
          } else {
            content = await getText(src.rawUrl, { 'User-Agent': 'Orbit-Toolbox-AI/1.0' });
          }
          const { imported, skipped, names } = upsertImportedSkills([{ filename: src.filename, source: sourceUrl, content }]);
          return { ok: true, imported, skipped, names, total: 1, skills };
        }

        // folder: recursive tree scan; import every SKILL.md (agent-skill
        // convention: one skill per directory). Docs like README are support
        // material and never become skills.
        let branch = src.branch;
        if (!branch) {
          const repo = await ghJson(`${GH_API_BASE}/repos/${src.owner}/${src.repo}`);
          branch = repo && repo.default_branch;
        }
        if (!branch) return { ok: false, error: '无法确定该仓库的默认分支' };

        const tree = await ghJson(`${GH_API_BASE}/repos/${src.owner}/${src.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
        if (!tree || !Array.isArray(tree.tree)) return { ok: false, error: 'GitHub 未返回可用的目录结构' };

        const prefix = src.path ? `${src.path.replace(/\/+$/, '')}/` : '';
        const allEntries = pickSkillEntries(tree.tree.filter(e => e && e.type === 'blob').map(e => e.path))
          .filter(e => e.path.startsWith(prefix));
        const overflow = Math.max(0, allEntries.length - MAX_SKILL_FILES);
        const selected = allEntries.slice(0, MAX_SKILL_FILES);
        if (!selected.length) {
          return {
            ok: false,
            error: `该${src.path ? '目录' : '仓库'}下没有找到 SKILL.md。标准技能仓库的每个技能位于独立子目录（<技能名>/SKILL.md）；要导入单个文档请改用 blob 文件链接`
          };
        }

        const items = [];
        let failed = 0;
        for (const e of selected) {
          try {
            items.push({
              filename: e.path,
              source: `https://github.com/${src.owner}/${src.repo}/blob/${branch}/${e.path}`,
              content: await fetchGhFile({ owner: src.owner, repo: src.repo, branch }, e.path)
            });
          } catch { failed++; } // unreachable single file: count it, keep going
        }
        const { imported, skipped, names } = upsertImportedSkills(items);
        return { ok: true, imported, skipped, failed, overflow, names, total: selected.length, truncated: !!tree.truncated, skills };
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
      if (streamBySession.has(sessionId)) return { ok: false, error: '该会话正在生成中，请先停止或等待完成' };

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
      // Local assistant: resolve the session working directory + capability note
      const agentWorkDir = session.workDir || config.agentWorkDir || os.homedir();
      let systemContent = persona ? persona.prompt : '';
      if (enableAgent) {
        systemContent += `\n\n[本地助手环境] 工作目录: ${agentWorkDir}。你拥有本地能力：list_dir / read_file / search_files 操作文件系统，write_file 写入文件，run_command 在工作目录执行 shell 命令 (Windows 为 cmd)；相对路径一律基于工作目录解析。写文件与执行命令属高危操作，需用户审批。`;
      }

      const maxContext = Math.max(2, Number(config.maxContextMessages) || 16);
      // Grab preceding context messages (excluding current placeholder), keeping
      // assistant tool_calls grouped with their tool responses across the boundary
      const contextMsgs = session.messages.slice(0, -1);
      const boundedMsgs = buildBoundedContext(contextMsgs, maxContext);

      const requestMessages = [];
      if (systemContent) {
        requestMessages.push({ role: 'system', content: systemContent });
      }
      requestMessages.push(...boundedMsgs);

      // Start stream
      const controller = new AbortController();
      activeStreams.set(streamId, controller);
      streamBySession.set(sessionId, streamId);

      const emitChunk = chunk => {
        ctx.send('stream-chunk', { streamId, sessionId, messageId: assistantMsg.id, chunk });
      };

      (async () => {
        let accumulatedContent = '';
        let accumulatedReasoning = '';
        let currentToolCalls = [];
        let toolPhaseEntered = false; // tool execution started this turn -> fallback must not re-run

        const primaryModel = modelOverride || config.model || 'gpt-4o-mini';
        const fallbackModel = (config.fallbackModel && config.fallbackModel.trim()) || '';

        // Agent tool table: built-ins + local assistant tools + live MCP tools
        // (chat must never block on MCP failure)
        let mcpRoutes = new Map();
        let agentToolDefs = [...AGENT_TOOLS_DEFINITIONS, ...LOCAL_TOOLS_DEFINITIONS];
        if (enableAgent) {
          try {
            const rt = await getMcpRuntime();
            mcpRoutes = rt.routes;
            agentToolDefs = rt.defs.length > 0 ? [...agentToolDefs, ...rt.defs] : agentToolDefs;
            for (const st of rt.statuses) {
              emitChunk({ type: 'mcp_error', server: st.name, error: st.error, message: `[MCP] ${st.name}: ${st.error}` });
            }
          } catch { /* MCP unavailable — continue with built-in tools only */ }
        }

        const runStream = async (targetModel, isFallback = false) => {
          accumulatedContent = '';
          accumulatedReasoning = '';
          currentToolCalls = [];
          if (isFallback) {
            // Drop the failed primary attempt's partials so they are never
            // mistaken for the fallback model's output
            assistantMsg.content = '';
            assistantMsg.reasoning = '';
            assistantMsg.usage = null;
          }

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
              emitChunk({ type: 'tool_calls', toolCalls: currentToolCalls.filter(Boolean) });
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

          // Finalize the tool-call table: compact sparse slots from index-based
          // delta accumulation, drop nameless/duplicate-id entries (a repeated
          // id would deadlock the approval map), and never execute twice.
          currentToolCalls = currentToolCalls.filter(Boolean).filter(tc => tc && tc.function && tc.function.name);
          {
            const seenIds = new Set();
            currentToolCalls = currentToolCalls.filter(tc => {
              if (seenIds.has(tc.id)) return false;
              seenIds.add(tc.id);
              return true;
            });
          }

          // If tool calls were generated by model, execute them (gated by the approval tier)!
          if (currentToolCalls.length > 0 && enableAgent) {
            toolPhaseEntered = true; // block model fallback: tools must not re-run on another model
            assistantMsg.toolCalls = currentToolCalls;
            assistantMsg.toolStatus = {};
            emitChunk({ type: 'tool_exec_start', toolCalls: currentToolCalls });

            // Suspend tool execution until the renderer answers resolveToolApproval
            const requestApproval = tc => new Promise(resolve => {
              pendingApprovals.set(`${streamId}::${tc.id}`, { resolve, toolName: tc.function.name });
              emitChunk({ type: 'tool_approval_request', toolId: tc.id, toolName: tc.function.name, args: tc.function.arguments });
            });

            const turnToolMsgs = []; // this turn's tool responses, in call order
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
                ? await dispatchAgentTool(toolName, toolArgs, mcpRoutes, agentWorkDir, streamId)
                : { ok: false, denied: true, error: '用户拒绝执行该工具调用，请改用纯文本回答或调整方案' };

              emitChunk({ type: 'tool_approval_result', toolId: tc.id, approved, asked: permission === 'ask' });
              emitChunk({ type: 'tool_result', toolId: tc.id, toolName, result });

              // Append tool response to conversation for continuation
              const toolMsg = {
                id: genId('msg_tool'),
                role: 'tool',
                tool_call_id: tc.id,
                name: toolName,
                content: typeof result === 'object' ? JSON.stringify(result) : String(result),
                timestamp: Date.now()
              };
              session.messages.push(toolMsg);
              turnToolMsgs.push(toolMsg);
            }

            // Continue inference with tool output. Pair each response with its
            // own call (collected in execution order) instead of re-filtering
            // session history, which mispairs if anything interleaves.
            const prevUsage = assistantMsg.usage ? { ...assistantMsg.usage } : null;
            const followUpMsgs = [...requestMessages, {
              role: 'assistant',
              content: accumulatedContent || null,
              tool_calls: currentToolCalls
            }, ...turnToolMsgs.map(m => ({
              role: 'tool',
              tool_call_id: m.tool_call_id,
              name: m.name,
              content: clipToolContent(m.content)
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
              } else if (event.type === 'usage' || event.type === 'usage_delta') {
                // The follow-up is a second billed round; add it to round one
                const u = event.usage || {};
                const sum = (a, b) => (a || 0) + (b || 0);
                assistantMsg.usage = {
                  promptTokens: sum(prevUsage && prevUsage.promptTokens, u.promptTokens),
                  completionTokens: sum(prevUsage && prevUsage.completionTokens, u.completionTokens),
                  totalTokens: (prevUsage && prevUsage.totalTokens ? prevUsage.totalTokens : 0) + (u.totalTokens || sum(prevUsage && prevUsage.promptTokens, u.promptTokens) + sum(prevUsage && prevUsage.completionTokens, u.completionTokens))
                };
                emitChunk({ type: 'usage', usage: assistantMsg.usage });
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
            // Never re-run the turn on a fallback model once tools executed:
            // the fallback replays the original request and would re-issue
            // (and re-execute) the same tool calls.
            if (fallbackModel && fallbackModel !== primaryModel && !toolPhaseEntered) {
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
            // Keep history consistent: an assistant message may only advertise
            // tool calls that actually produced a tool response, otherwise the
            // next request carries orphaned tool_calls and the API 400s.
            if (Array.isArray(assistantMsg.toolCalls)) {
              const answered = new Set(session.messages.filter(m => m.role === 'tool').map(m => m.tool_call_id));
              assistantMsg.toolCalls = assistantMsg.toolCalls.filter(tc => answered.has(tc.id));
            }
            emitChunk({ type: 'aborted', message: '已中断生成' });
          } else {
            assistantMsg.error = err.message;
            emitChunk({ type: 'error', error: err.message });
          }
        } finally {
          denyPendingApprovals(streamId, 'aborted');
          killRunningCommands(streamId);
          activeStreams.delete(streamId);
          streamBySession.delete(sessionId);
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

      // A stalled provider must not stall the whole workflow run
      const withTimeout = (promise, ms) => {
        let timer = null;
        return Promise.race([
          promise,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`AI 请求超时 (${Math.round(ms / 1000)}s)`)), ms);
            if (timer.unref) timer.unref();
          })
        ]).finally(() => { if (timer) clearTimeout(timer); });
      };

      let res;
      try {
        res = await withTimeout(syncCompletion(reqOpts), 180000);
      } catch (err) {
        const fallback = nodeCfg.fallbackModel || config.fallbackModel;
        if (fallback && fallback !== reqOpts.model) {
          res = await withTimeout(syncCompletion({ ...reqOpts, model: fallback }), 180000);
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
      // Deactivate/disable/rescan must not leave streams running or approvals
      // permanently unresolvable (the IPC handlers are about to disappear).
      // Kills are sync: this runs from will-quit, and fire-and-forget
      // taskkill loses the race with app teardown (orphaned MCP node.exe /
      // shell grandchildren — measured 5/5 before the fix).
      for (const [streamId, controller] of [...activeStreams]) {
        try { controller.abort(); } catch {}
        denyPendingApprovals(streamId, 'aborted');
        killRunningCommands(streamId, true);
      }
      activeStreams.clear();
      streamBySession.clear();
      for (const id of [...mcpConns.keys()]) disposeMcpConn(id, true);
    };
  },

  deactivate() {
    if (disposeAll) {
      disposeAll();
      disposeAll = null;
    }
  }
};
