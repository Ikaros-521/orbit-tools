/* AI Chat Backend
   Central plugin lifecycle, IPC router facade, and persistent state management.
   Orchestrates:
   - services/approval-service.js (Agent authorization tiers & approval promises)
   - services/mcp-service.js (Pooled subprocess connections & tool schemas)
   - services/skills-service.js (Skills inventory & recursive GitHub imports)
   - services/chat-service.js (Streaming SSE, multi-round tool loops & fallback recovery) */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');

const { fetchRemoteModels } = require('./protocols');
const { normalizeMemoryRecord } = require('./memory');
const { DEFAULT_MCP_SERVERS } = require('./mcp-market');
const { listAvailableAiIdes, dispatchTaskToAiIde } = require('./ide-dispatcher');

const ApprovalService = require('./services/approval-service');
const McpService = require('./services/mcp-service');
const { SkillsService, DEFAULT_SKILLS } = require('./services/skills-service');
const { ChatService } = require('./services/chat-service');
const { processManager } = require('./services/process-manager');

const DEFAULT_CONFIG = {
  channel: 'openai',
  protocol: 'openai-chat',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  fallbackModel: '',
  temperature: 0.7,
  maxTokens: 4096,
  enableReasoning: true,
  thinkingBudget: 2048,
  maxContextMessages: 16,
  enableAgent: true,
  agentApprovalMode: 'ask',
  agentMaxRounds: 8,
  thinkingLevel: 'auto',
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

    const isTestRun = typeof process !== 'undefined' && Array.isArray(process.argv) &&
      process.argv.some(a => String(a).includes('test-ai-'));
    if (!isTestRun) {
      if (mcpServers.length === 0) {
        mcpServers = DEFAULT_MCP_SERVERS.map(s => ({ ...s }));
      } else if (!mcpServers.some(s => s.id === 'preset-playwright' || (s.name && s.name.toLowerCase() === 'playwright'))) {
        mcpServers.unshift({ ...DEFAULT_MCP_SERVERS[0] });
      }
    }

    let memories = (Array.isArray(rawData.memories) ? rawData.memories : [])
      .map(normalizeMemoryRecord)
      .filter(Boolean);

    const approvalService = new ApprovalService();
    const mcpService = new McpService();
    const skillsService = new SkillsService();
    const chatService = new ChatService();

    const save = () => {
      ctx.data.set({ config, personas, sessions, activeSessionId, skills, mcpServers, memories });
    };

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
      activeSessionId = first.id;
      save();
    }

    if (!sessions.some(s => s.id === activeSessionId)) {
      activeSessionId = sessions[0] ? sessions[0].id : null;
    }

    const findSession = id => sessions.find(s => s.id === id);
    const getPersona = id => personas.find(p => p.id === id) || personas[0] || DEFAULT_PERSONAS[0];

    /* --- IPC Handlers ----------------------------------------------------- */

    ctx.ipc.handle('getInitData', () => ({
      config,
      personas,
      sessions: sessions.map(s => ({
        id: s.id,
        title: s.title,
        personaId: s.personaId,
        workDir: s.workDir || '',
        messageCount: (s.messages || []).filter(m => m.role === 'user' || m.role === 'assistant').length,
        updatedAt: s.updatedAt,
        taskList: s.taskList || null
      })),
      activeSessionId,
      activeSession: findSession(activeSessionId) || sessions[0] || null,
      skills,
      mcpServers,
      memories
    }));

    ctx.ipc.handle('saveConfig', patch => {
      config = { ...config, ...(patch || {}) };
      save();
      return { ok: true, config };
    });

    ctx.ipc.handle('savePersona', p => {
      if (!p || !p.title) return { ok: false, error: '人设标题不能为空' };
      const id = p.id || genId('persona');
      const idx = personas.findIndex(x => x.id === id);
      const rec = { id, title: p.title, icon: p.icon || '✨', prompt: p.prompt || '', temperature: p.temperature ?? 0.7 };
      if (idx >= 0) personas[idx] = rec; else personas.push(rec);
      save();
      return { ok: true, persona: rec, personas };
    });

    ctx.ipc.handle('deletePersona', args => {
      const id = args && args.id;
      if (!id) return { ok: false, error: '缺少人设 ID' };
      if (personas.length <= 1) return { ok: false, error: '必须保留至少一个人设角色' };
      personas = personas.filter(x => x.id !== id);
      save();
      return { ok: true, personas };
    });

    ctx.ipc.handle('resetPersonas', () => {
      personas = [...DEFAULT_PERSONAS];
      save();
      return { ok: true, personas };
    });

    ctx.ipc.handle('fetchModels', async args => {
      const { protocol = config.protocol, baseUrl = config.baseUrl, apiKey = config.apiKey } = args || {};
      if (!baseUrl) return { ok: false, error: 'Base URL 不能为空' };
      try {
        const models = await fetchRemoteModels({ protocol, baseUrl, apiKey });
        return { ok: true, models };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    });

    ctx.ipc.handle('createSession', args => {
      const personaId = (args && args.personaId) || 'general';
      const sess = {
        id: genId('sess'),
        title: (args && args.title) || '新对话',
        personaId,
        workDir: config.agentWorkDir || os.homedir(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        messages: []
      };
      sessions.unshift(sess);
      activeSessionId = sess.id;
      save();
      return { ok: true, session: sess, sessions };
    });

    ctx.ipc.handle('switchSession', args => {
      const id = args && args.id;
      const s = findSession(id);
      if (!s) return { ok: false, error: '会话不存在' };
      activeSessionId = s.id;
      save();
      return { ok: true, session: s };
    });

    ctx.ipc.handle('renameSession', args => {
      const s = findSession(args && args.id);
      if (!s) return { ok: false, error: '会话不存在' };
      s.title = String(args.title || '新对话').slice(0, 48);
      s.updatedAt = Date.now();
      save();
      return { ok: true, session: s };
    });

    ctx.ipc.handle('deleteSession', args => {
      const id = args && args.id;
      if (chatService.isSessionStreaming(id)) return { ok: false, error: '该会话正在生成中，无法删除' };
      sessions = sessions.filter(s => s.id !== id);
      if (sessions.length === 0) {
        const fresh = {
          id: genId('sess'),
          title: '新对话',
          personaId: 'general',
          workDir: config.agentWorkDir || os.homedir(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          messages: []
        };
        sessions.push(fresh);
        activeSessionId = fresh.id;
      } else if (activeSessionId === id) {
        activeSessionId = sessions[0].id;
      }
      save();
      return { ok: true, sessions, activeSessionId };
    });

    ctx.ipc.handle('clearSession', args => {
      const s = findSession(args && args.id);
      if (!s) return { ok: false, error: '会话不存在' };
      if (chatService.isSessionStreaming(s.id)) return { ok: false, error: '该会话正在生成中，请先中断生成' };
      s.messages = [];
      s.taskList = null;
      s.totalTokens = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      s.updatedAt = Date.now();
      save();
      return { ok: true, session: s };
    });

    ctx.ipc.handle('deleteMessage', args => {
      const { sessionId, messageId } = args || {};
      const s = findSession(sessionId);
      if (!s) return { ok: false, error: '会话不存在' };
      if (chatService.isSessionStreaming(s.id)) return { ok: false, error: '该会话正在生成中，无法删除消息' };
      const idx = s.messages.findIndex(m => m.id === messageId);
      if (idx === -1) return { ok: false, error: '消息不存在' };

      const target = s.messages[idx];
      if (target.role === 'assistant' && Array.isArray(target.toolCalls) && target.toolCalls.length > 0) {
        const tcIds = new Set(target.toolCalls.map(tc => tc.id));
        s.messages = s.messages.filter((m, i) => i !== idx && !(m.role === 'tool' && tcIds.has(m.tool_call_id)));
      } else {
        s.messages.splice(idx, 1);
      }
      s.updatedAt = Date.now();
      save();
      return { ok: true, session: s };
    });

    ctx.ipc.handle('abortStream', args => {
      const streamId = args && args.streamId;
      return chatService.abortStream(streamId, approvalService);
    });

    /* --- Tool Approvals & Workspace --- */

    ctx.ipc.handle('resolveToolApproval', args => {
      return approvalService.resolveApproval(args || {});
    });

    ctx.ipc.handle('resetSessionApprovals', args => {
      const s = findSession(args && args.sessionId);
      if (!s) return { ok: false, error: '会话不存在' };
      s.alwaysAllowTools = [];
      save();
      return { ok: true, alwaysAllowTools: [] };
    });

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
    ctx.ipc.handle('set_session_persona', setSessionPersonaHandler);

    ctx.ipc.handle('setSessionWorkDir', args => {
      const s = findSession(args && args.sessionId);
      if (!s) return { ok: false, error: '会话不存在' };
      const v = validateWorkDir(args && args.dir);
      if (!v.ok) return { ok: false, error: v.error };
      s.workDir = v.dir;
      s.updatedAt = Date.now();
      save();
      return { ok: true, workDir: v.dir };
    });

    ctx.ipc.handle('chooseAgentWorkDir', async args => {
      const start = (args && args.current) || config.agentWorkDir || os.homedir();
      const parent = ctx.getHostWindow ? ctx.getHostWindow() : null;
      const r = await dialog.showOpenDialog(parent && !parent.isDestroyed() ? parent : null, {
        title: '选择 Agent 工作目录',
        defaultPath: fs.existsSync(start) ? start : os.homedir(),
        properties: ['openDirectory', 'createDirectory'],
      });
      if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
      return { ok: true, dir: r.filePaths[0] };
    });

    ctx.ipc.handle('chooseFiles', async args => {
      const parent = ctx.getHostWindow ? ctx.getHostWindow() : null;
      const r = await dialog.showOpenDialog(parent && !parent.isDestroyed() ? parent : null, {
        title: (args && args.title) || '选择附件文件',
        properties: ['openFile', 'multiSelections']
      });
      if (r.canceled || !r.filePaths || r.filePaths.length === 0) return { ok: false, canceled: true, files: [] };
      const files = [];
      for (const fp of r.filePaths) {
        try {
          const stat = fs.statSync(fp);
          const isImg = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(fp);
          let dataUrl = null;
          let content = null;
          if (isImg) {
            const buf = fs.readFileSync(fp);
            const ext = fp.split('.').pop().toLowerCase() || 'png';
            const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
            dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
          } else if (stat.size <= 512 * 1024) {
            content = fs.readFileSync(fp, 'utf8');
          }
          files.push({
            path: fp,
            name: fp.split(/[\\/]/).pop(),
            size: stat.size,
            isImage: isImg,
            dataUrl,
            content
          });
        } catch {}
      }
      return { ok: true, files };
    });

    ctx.ipc.handle('chooseDirectory', async args => {
      const parent = ctx.getHostWindow ? ctx.getHostWindow() : null;
      const r = await dialog.showOpenDialog(parent && !parent.isDestroyed() ? parent : null, {
        title: (args && args.title) || '选择关联文件夹 / 项目目录',
        properties: ['openDirectory']
      });
      if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false, canceled: true };
      const dirPath = r.filePaths[0];
      return {
        ok: true,
        directory: {
          path: dirPath,
          name: dirPath.split(/[\\/]/).pop() || dirPath
        }
      };
    });

    /* --- MCP Server Management --- */

    ctx.ipc.handle('saveMcpServer', args => {
      const s = (args && args.server) || args || {};
      const res = mcpService.saveMcpServer(s, mcpServers, genId);
      if (res.ok) {
        mcpServers = res.mcpServers;
        save();
      }
      return res;
    });

    ctx.ipc.handle('deleteMcpServer', args => {
      const id = args && (args.id || args.serverId);
      const res = mcpService.deleteMcpServer(id, mcpServers);
      if (res.ok) {
        mcpServers = res.mcpServers;
        save();
      }
      return res;
    });

    ctx.ipc.handle('getMcpMarket', args => {
      return mcpService.getMcpMarket(args && args.query, args && args.category, mcpServers);
    });

    ctx.ipc.handle('installMarketMcp', args => {
      const res = mcpService.installMarketMcp(args && args.marketId, mcpServers);
      if (res.ok) save();
      return res;
    });

    ctx.ipc.handle('resetMcpServers', () => {
      mcpServers = mcpService.resetMcpServers();
      save();
      return { ok: true, mcpServers };
    });

    ctx.ipc.handle('testMcpServer', async args => {
      const s = (args && args.server) || args || {};
      return mcpService.testMcpServer(s);
    });

    /* --- Skills Management --- */

    ctx.ipc.handle('saveSkill', args => {
      const s = (args && args.skill) || args || {};
      const res = skillsService.saveSkill(s, skills, genId);
      if (res.ok) {
        skills = res.skills;
        save();
      }
      return res;
    });

    ctx.ipc.handle('deleteSkill', args => {
      const id = args && (args.id || args.skillId);
      const res = skillsService.deleteSkill(id, skills);
      if (res.ok) {
        skills = res.skills;
        save();
      }
      return res;
    });

    ctx.ipc.handle('resetSkills', () => {
      skills = skillsService.resetSkills();
      save();
      return { ok: true, skills };
    });

    ctx.ipc.handle('importSkills', args => {
      const res = skillsService.importSkills(args && args.items, skills, genId);
      if (res.ok && res.imported > 0) save();
      return res;
    });

    ctx.ipc.handle('pickLocalSkillFiles', args => {
      return skillsService.pickLocalSkillFiles(args && args.paths);
    });

    ctx.ipc.handle('importSkillFromUrl', async args => {
      const res = await skillsService.importSkillFromUrl(args && args.url, skills, genId);
      if (res.ok && res.imported > 0) save();
      return res;
    });

    /* --- Memories & Tasks --- */

    ctx.ipc.handle('listMemories', () => ({ ok: true, memories }));

    ctx.ipc.handle('saveMemory', args => {
      const m = (args && args.memory) || args || {};
      const content = String(m.content || '').trim();
      if (!content) return { ok: false, error: '记忆内容不能为空' };
      if (content.length > 2000) return { ok: false, error: '记忆内容过长 (上限 2000 字符)' };
      let scope = String(m.scope || 'global').trim() || 'global';
      if (scope !== 'global') {
        const v = validateWorkDir(scope);
        if (!v.ok) return { ok: false, error: `项目作用域无效: ${v.error}` };
        scope = v.dir;
      }
      const mid = m.id ? String(m.id) : genId('mem');
      const idx = memories.findIndex(x => x.id === mid);
      const rec = normalizeMemoryRecord({
        id: mid,
        content,
        type: m.type,
        scope,
        createdAt: idx >= 0 ? memories[idx].createdAt : Date.now(),
        updatedAt: Date.now()
      });
      if (idx >= 0) memories[idx] = rec; else memories.push(rec);
      save();
      return { ok: true, memory: rec, memories };
    });

    ctx.ipc.handle('deleteMemory', args => {
      const id = args && args.id;
      if (!id) return { ok: false, error: '缺少记忆 ID' };
      memories = memories.filter(m => m.id !== id);
      save();
      return { ok: true, memories };
    });

    ctx.ipc.handle('clearTaskList', args => {
      const s = findSession(args && args.sessionId);
      if (!s) return { ok: false, error: '会话不存在' };
      s.taskList = null;
      s.updatedAt = Date.now();
      save();
      return { ok: true, session: s };
    });

    /* --- External AI IDEs --- */

    ctx.ipc.handle('listAvailableAiIdes', () => {
      return listAvailableAiIdes();
    });

    ctx.ipc.handle('dispatchTaskToAiIde', args => {
      return dispatchTaskToAiIde(args);
    });

    /* --- Send Message & Stream Routing --- */

    const sendMessageHandler = async args => {
      return chatService.sendMessage(args, {
        ctx,
        config,
        findSession,
        getPersona,
        memories,
        skills,
        mcpServers,
        mcpService,
        approvalService,
        save,
        genId
      });
    };

    ctx.ipc.handle('sendMessage', sendMessageHandler);
    ctx.ipc.handle('chatStream', sendMessageHandler); // Renderer alias compatibility

    /* --- Workflow Capability Hook --- */

    ctx.ipc.handle('chatComplete', async args => {
      return chatService.chatComplete(args, { config, getPersona });
    });

    /* --- Subprocess Registry & Lifecycle IPC --- */

    ctx.ipc.handle('listProcesses', args => {
      const sessionId = (args && args.sessionId) || null;
      return { ok: true, processes: processManager.listProcesses(sessionId) };
    });

    ctx.ipc.handle('killProcess', args => {
      const pid = args && args.pid;
      return processManager.killProcess(pid, false);
    });

    disposeAll = sync => {
      chatService.abortAll(approvalService);
      approvalService.denyAll();
      mcpService.disposeAll(sync);
      processManager.killAll(sync);
    };
  },

  deactivate() {
    if (typeof disposeAll === 'function') {
      try { disposeAll(true); } catch {}
      disposeAll = null;
    }
  }
};
