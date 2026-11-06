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
const { listAvailableIDEs: listAvailableAiIdes, dispatchTask: dispatchTaskToAiIde } = require('./ide-dispatcher');

const ApprovalService = require('./services/approval-service');
const McpService = require('./services/mcp-service');
const { SkillsService, DEFAULT_SKILLS } = require('./services/skills-service');
const { liveMcpEngine } = require('./services/live-mcp-engine');
const { ChatService } = require('./services/chat-service');
const { processManager } = require('./services/process-manager');
const { compactionService } = require('./services/compaction-service');
const { PRESET_CHANNELS } = require('./lib/markdown-renderer');

function createChannelInstance(presetOrData, overrides = {}) {
  const p = presetOrData || {};
  const id = overrides.id || p.id || `ch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  let apiKeys = Array.isArray(overrides.apiKeys) ? overrides.apiKeys : (
    Array.isArray(p.apiKeys) ? p.apiKeys : []
  );
  if (apiKeys.length === 0) {
    const singleKey = (overrides.apiKey || p.apiKey || '').trim();
    if (singleKey) {
      apiKeys = [{
        id: `key_${Date.now().toString(36)}_1`,
        name: '主密钥',
        key: singleKey
      }];
    }
  }
  let activeKeyId = overrides.activeKeyId || p.activeKeyId;
  if (!activeKeyId || !apiKeys.some(k => k.id === activeKeyId)) {
    activeKeyId = apiKeys[0] ? apiKeys[0].id : '';
  }
  const activeKeyObj = apiKeys.find(k => k.id === activeKeyId) || apiKeys[0] || null;
  const effectiveKey = activeKeyObj ? activeKeyObj.key : (overrides.apiKey || p.apiKey || '');

  const models = Array.isArray(overrides.models)
    ? [...overrides.models]
    : (Array.isArray(p.models) ? [...p.models] : []);

  const defaultModel = overrides.defaultModel || p.defaultModel || (models[0] || 'gpt-4o-mini');
  if (defaultModel && !models.includes(defaultModel)) {
    models.unshift(defaultModel);
  }

  return {
    id,
    name: (overrides.name || p.name || '新渠道').trim(),
    icon: overrides.icon || p.icon || '🤖',
    protocol: overrides.protocol || p.protocol || 'openai-chat',
    baseUrl: typeof overrides.baseUrl === 'string' ? overrides.baseUrl.trim() : (p.baseUrl || ''),
    apiKeys,
    activeKeyId,
    apiKey: effectiveKey,
    models,
    defaultModel,
    isPreset: overrides.isPreset !== undefined ? overrides.isPreset : (p.id !== 'custom' && !!p.id),
    presetId: overrides.presetId || p.presetId || (p.id !== 'custom' ? p.id : '')
  };
}

function buildInitialConfiguredChannels(rawCfg = {}) {
  const chId = rawCfg.channel || 'openai';
  const matchedPreset = (PRESET_CHANNELS || []).find(p => p.id === chId) || (PRESET_CHANNELS && PRESET_CHANNELS[0]) || {
    id: 'openai',
    name: 'OpenAI (官方)',
    icon: '🟢',
    protocol: 'openai-chat',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini'],
    defaultModel: 'gpt-4o-mini'
  };
  const singleKey = (rawCfg.apiKey || '').trim();
  const initialCh = createChannelInstance(matchedPreset, {
    id: matchedPreset.id,
    name: matchedPreset.name,
    baseUrl: rawCfg.baseUrl || matchedPreset.baseUrl,
    protocol: rawCfg.protocol || matchedPreset.protocol,
    apiKey: singleKey,
    defaultModel: rawCfg.model || matchedPreset.defaultModel
  });
  return [initialCh];
}

function sanitizeConfiguredChannels(channels, activeId) {
  if (!Array.isArray(channels) || channels.length === 0) {
    return buildInitialConfiguredChannels();
  }
  // 智能净化：仅保留配置了密钥的渠道、用户自定义渠道、或者当前处于激活状态的渠道；过滤未配置的空预设占位
  let sanitized = channels.filter(ch => {
    const hasKey = (Array.isArray(ch.apiKeys) && ch.apiKeys.some(k => k.key && k.key.trim()))
      || (typeof ch.apiKey === 'string' && ch.apiKey.trim().length > 0);
    const isCurrentActive = ch.id === activeId;
    const isCustom = !ch.isPreset;
    return hasKey || isCurrentActive || isCustom;
  });

  if (sanitized.length === 0) {
    sanitized = [channels[0] || buildInitialConfiguredChannels()[0]];
  }

  return sanitized.map(ch => createChannelInstance(ch));
}

function syncActiveChannelToConfig(cfg) {
  if (!Array.isArray(cfg.channels) || cfg.channels.length === 0) {
    cfg.channels = buildInitialConfiguredChannels(cfg);
  }
  const activeId = cfg.activeChannelId || cfg.channel || cfg.channels[0].id;
  let activeCh = cfg.channels.find(c => c.id === activeId);
  if (!activeCh) {
    activeCh = cfg.channels[0];
    cfg.activeChannelId = activeCh.id;
  }

  // 保证 activeCh 的 apiKeys 与 activeKeyId 正确同步
  if (!Array.isArray(activeCh.apiKeys)) activeCh.apiKeys = [];
  if (activeCh.apiKeys.length === 0 && activeCh.apiKey && activeCh.apiKey.trim()) {
    activeCh.apiKeys.push({ id: `key_${activeCh.id}_1`, name: '主密钥', key: activeCh.apiKey.trim() });
    activeCh.activeKeyId = activeCh.apiKeys[0].id;
  }
  const activeKeyObj = activeCh.apiKeys.find(k => k.id === activeCh.activeKeyId) || activeCh.apiKeys[0] || null;
  activeCh.apiKey = activeKeyObj ? activeKeyObj.key : (activeCh.apiKey || '');
  activeCh.activeKeyId = activeKeyObj ? activeKeyObj.id : '';

  cfg.channel = activeCh.id;
  cfg.activeChannelId = activeCh.id;
  cfg.protocol = activeCh.protocol || 'openai-chat';
  cfg.baseUrl = activeCh.baseUrl || '';
  cfg.apiKey = activeCh.apiKey || '';
  cfg.model = activeCh.defaultModel || (activeCh.models && activeCh.models[0]) || cfg.model || 'gpt-4o-mini';
}

const DEFAULT_CONFIG = {
  channel: 'openai',
  activeChannelId: 'openai',
  channels: buildInitialConfiguredChannels(),
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
  maxContextTokens: 200000,
  summarizationModel: '',
  compactionThresholdRatio: 0.8,
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
  DEFAULT_CONFIG,
  PRESET_TEMPLATES: PRESET_CHANNELS,
  buildInitialConfiguredChannels,
  sanitizeConfiguredChannels,
  createChannelInstance,
  syncActiveChannelToConfig,
  activate(ctx) {
    const rawData = ctx.data.get() || {};
    const rawCfg = rawData.config || {};
    let config = { ...DEFAULT_CONFIG, ...rawCfg };

    // 向上平滑迁移与渠道智能净化：
    const needsMigration = !Array.isArray(rawCfg.channels);
    if (needsMigration) {
      config.channels = buildInitialConfiguredChannels(rawCfg);
      config.activeChannelId = rawCfg.channel || 'openai';
    } else {
      config.channels = sanitizeConfiguredChannels(rawCfg.channels, config.activeChannelId || config.channel);
    }
    syncActiveChannelToConfig(config);
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

    if (needsMigration) {
      save();
    }

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

    ctx.ipc.handle('getPresetTemplates', () => ({
      ok: true,
      templates: (PRESET_CHANNELS || []).map(p => ({
        id: p.id,
        name: p.name,
        icon: p.icon || '🤖',
        protocol: p.protocol || 'openai-chat',
        baseUrl: p.baseUrl || '',
        defaultModel: p.defaultModel || (p.models && p.models[0]) || '',
        models: Array.isArray(p.models) ? [...p.models] : []
      }))
    }));

    ctx.ipc.handle('createChannelFromPreset', args => {
      const { presetId, name, icon, apiKey, apiKeys } = args || {};
      const template = (PRESET_CHANNELS || []).find(p => p.id === presetId) || {
        id: 'custom',
        name: '自定义渠道',
        icon: '🛠️',
        protocol: 'openai-chat',
        baseUrl: '',
        models: ['gpt-4o-mini'],
        defaultModel: 'gpt-4o-mini'
      };

      const newCh = createChannelInstance(template, {
        id: `ch_${template.id}_${Date.now().toString(36)}`,
        name: (name && name.trim()) || `${template.name.split(' ')[0]} 渠道`,
        icon: icon || template.icon || '🤖',
        apiKey: apiKey || '',
        apiKeys: Array.isArray(apiKeys) ? apiKeys : undefined
      });

      if (!Array.isArray(config.channels)) config.channels = [];
      config.channels.push(newCh);
      config.activeChannelId = newCh.id;
      syncActiveChannelToConfig(config);
      save();
      return { ok: true, channel: newCh, config };
    });

    ctx.ipc.handle('addChannelKey', args => {
      const { channelId, name, key, setActive } = args || {};
      if (!key || !key.trim()) return { ok: false, error: '密钥内容不能为空' };
      const targetId = channelId || config.activeChannelId || config.channel;
      const ch = Array.isArray(config.channels) ? config.channels.find(c => c.id === targetId) : null;
      if (!ch) return { ok: false, error: '渠道不存在' };

      if (!Array.isArray(ch.apiKeys)) ch.apiKeys = [];
      const newKey = {
        id: `key_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
        name: (name && name.trim()) || `密钥 ${ch.apiKeys.length + 1}`,
        key: key.trim(),
        createdAt: Date.now()
      };
      ch.apiKeys.push(newKey);
      if (setActive || ch.apiKeys.length === 1) {
        ch.activeKeyId = newKey.id;
      }
      syncActiveChannelToConfig(config);
      save();
      return { ok: true, channel: ch, key: newKey, newKey, config };
    });

    ctx.ipc.handle('deleteChannelKey', args => {
      const { channelId, keyId } = args || {};
      if (!keyId) return { ok: false, error: '缺少 keyId' };
      const targetId = channelId || config.activeChannelId || config.channel;
      const ch = Array.isArray(config.channels) ? config.channels.find(c => c.id === targetId) : null;
      if (!ch) return { ok: false, error: '渠道不存在' };

      ch.apiKeys = (ch.apiKeys || []).filter(k => k.id !== keyId);
      if (ch.activeKeyId === keyId) {
        ch.activeKeyId = ch.apiKeys[0] ? ch.apiKeys[0].id : '';
      }
      syncActiveChannelToConfig(config);
      save();
      return { ok: true, channel: ch, config };
    });

    ctx.ipc.handle('switchChannelActiveKey', args => {
      const { channelId, keyId } = args || {};
      if (!keyId) return { ok: false, error: '缺少 keyId' };
      const targetId = channelId || config.activeChannelId || config.channel;
      const ch = Array.isArray(config.channels) ? config.channels.find(c => c.id === targetId) : null;
      if (!ch) return { ok: false, error: '渠道不存在' };

      if (!ch.apiKeys || !ch.apiKeys.some(k => k.id === keyId)) {
        return { ok: false, error: '指定密钥不存在' };
      }
      ch.activeKeyId = keyId;
      syncActiveChannelToConfig(config);
      save();
      return { ok: true, channel: ch, config };
    });

    ctx.ipc.handle('saveConfig', patch => {
      const p = patch || {};
      if (Array.isArray(p.channels)) {
        config.channels = p.channels.map(c => createChannelInstance(c));
      }
      if (p.activeChannelId || p.channel) {
        config.activeChannelId = p.activeChannelId || p.channel;
      }
      // 将顶层 model/baseUrl/apiKey/protocol 的变更同步回当前激活的渠道对象中
      const activeId = config.activeChannelId || config.channel;
      const activeCh = Array.isArray(config.channels) ? config.channels.find(c => c.id === activeId) : null;
      if (activeCh) {
        if (typeof p.model === 'string' && p.model.trim()) {
          activeCh.defaultModel = p.model.trim();
          if (!activeCh.models.includes(p.model.trim())) {
            activeCh.models.unshift(p.model.trim());
          }
        }
        if (typeof p.baseUrl === 'string') activeCh.baseUrl = p.baseUrl.trim();
        if (typeof p.apiKey === 'string') {
          activeCh.apiKey = p.apiKey.trim();
          if (activeCh.apiKey) {
            if (!Array.isArray(activeCh.apiKeys) || activeCh.apiKeys.length === 0) {
              activeCh.apiKeys = [{ id: `key_${Date.now().toString(36)}_1`, name: '主密钥', key: activeCh.apiKey }];
              activeCh.activeKeyId = activeCh.apiKeys[0].id;
            } else {
              const curKeyObj = activeCh.apiKeys.find(k => k.id === activeCh.activeKeyId) || activeCh.apiKeys[0];
              if (curKeyObj) curKeyObj.key = activeCh.apiKey;
            }
          }
        }
        if (typeof p.protocol === 'string') activeCh.protocol = p.protocol;
      }
      config = { ...config, ...p };
      syncActiveChannelToConfig(config);
      save();
      return { ok: true, config };
    });

    ctx.ipc.handle('switchActiveChannel', args => {
      const { channelId, model, activeKeyId } = args || {};
      if (!channelId) return { ok: false, error: '缺少 channelId' };
      if (!Array.isArray(config.channels) || config.channels.length === 0) {
        config.channels = buildInitialConfiguredChannels(config);
      }
      const targetCh = config.channels.find(c => c.id === channelId);
      if (!targetCh) return { ok: false, error: `未找到渠道: ${channelId}` };

      config.activeChannelId = targetCh.id;
      if (activeKeyId && Array.isArray(targetCh.apiKeys) && targetCh.apiKeys.some(k => k.id === activeKeyId)) {
        targetCh.activeKeyId = activeKeyId;
      }
      if (model && typeof model === 'string' && model.trim()) {
        targetCh.defaultModel = model.trim();
        if (!targetCh.models.includes(model.trim())) {
          targetCh.models.unshift(model.trim());
        }
      }
      syncActiveChannelToConfig(config);
      save();
      return { ok: true, config, activeChannel: targetCh };
    });

    ctx.ipc.handle('saveChannel', chData => {
      if (!chData) return { ok: false, error: '渠道数据不能为空' };
      if (!Array.isArray(config.channels)) config.channels = buildInitialConfiguredChannels(config);

      const id = chData.id || genId('ch');
      const idx = config.channels.findIndex(c => c.id === id);
      const existing = idx >= 0 ? config.channels[idx] : {};

      const updatedCh = createChannelInstance({ ...existing, ...chData }, { id });

      if (idx >= 0) {
        config.channels[idx] = updatedCh;
      } else {
        config.channels.push(updatedCh);
      }

      if (chData.isActive || config.activeChannelId === id) {
        config.activeChannelId = id;
      }

      syncActiveChannelToConfig(config);
      save();
      return { ok: true, channel: updatedCh, config };
    });

    ctx.ipc.handle('deleteChannel', args => {
      const id = args && args.id;
      if (!id) return { ok: false, error: '缺少渠道 ID' };
      if (!Array.isArray(config.channels) || config.channels.length <= 1) {
        return { ok: false, error: '必须保留至少一个已配置渠道' };
      }
      const idx = config.channels.findIndex(c => c.id === id);
      if (idx === -1) return { ok: false, error: '渠道不存在' };

      config.channels.splice(idx, 1);
      if (config.activeChannelId === id) {
        config.activeChannelId = config.channels[0].id;
      }
      syncActiveChannelToConfig(config);
      save();
      return { ok: true, config };
    });

    ctx.ipc.handle('syncChannelModels', args => {
      const { channelId, models } = args || {};
      const targetId = channelId || config.activeChannelId || config.channel;
      if (!Array.isArray(config.channels)) config.channels = buildInitialConfiguredChannels(config);
      const ch = config.channels.find(c => c.id === targetId);
      if (!ch) return { ok: false, error: '渠道不存在' };

      if (Array.isArray(models)) {
        const set = new Set(ch.models || []);
        models.forEach(m => {
          const s = String(m || '').trim();
          if (s) set.add(s);
        });
        ch.models = Array.from(set);
      }

      syncActiveChannelToConfig(config);
      save();
      return { ok: true, channel: ch, config };
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
      const res = mcpService.installMarketMcp(args && (args.marketId || args.id), mcpServers, args && (args.server || args.item));
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

    ctx.ipc.handle('getSkillMarket', args => {
      const q = args && args.query;
      const cat = args && args.category;
      return skillsService.getSkillMarket({ query: q, category: cat }, skills);
    });

    ctx.ipc.handle('searchLiveSkills', async args => {
      return await skillsService.searchLiveSkills(args || {}, skills);
    });

    ctx.ipc.handle('fetchRemoteSkillDetail', async args => {
      const target = (args && args.target) || args || {};
      return await skillsService.fetchRemoteSkillDetail(target);
    });

    ctx.ipc.handle('installRemoteSkill', async args => {
      const target = (args && args.target) || args || {};
      const res = await skillsService.installRemoteSkill(target, skills, genId);
      if (res && res.ok) {
        skills = res.skills;
        save();
      }
      return res;
    });

    ctx.ipc.handle('createSkillFromRemote', async args => {
      const target = (args && args.target) || args || {};
      const overrides = (args && args.overrides) || {};
      const res = await skillsService.createSkillFromRemote(target, overrides, skills, genId);
      if (res && res.ok) {
        skills = res.skills;
        save();
      }
      return res;
    });

    ctx.ipc.handle('searchLiveMcp', async args => {
      return await liveMcpEngine.searchLiveMcp(args || {}, mcpServers);
    });

    ctx.ipc.handle('installMarketSkill', args => {
      const marketId = args && (args.marketId || args.id);
      const res = skillsService.installMarketSkill(marketId, skills, genId);
      if (res.ok) {
        skills = res.skills;
        save();
      }
      return res;
    });

    ctx.ipc.handle('createSkillFromMarket', args => {
      const marketId = args && (args.marketId || args.id);
      const overrides = (args && args.overrides) || args || {};
      const res = skillsService.createSkillFromMarket(marketId, overrides, skills, genId);
      if (res.ok) {
        skills = res.skills;
        save();
      }
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

    ctx.ipc.handle('setTaskList', args => {
      const s = findSession(args && args.sessionId);
      if (!s) return { ok: false, error: '会话不存在' };
      s.taskList = Array.isArray(args.tasks) ? args.tasks : null;
      s.updatedAt = Date.now();
      save();
      return { ok: true, session: s };
    });

    /* --- Context Compaction & Token Metrics --- */

    ctx.ipc.handle('compactContext', async args => {
      const sessionId = args && args.sessionId;
      const s = findSession(sessionId);
      if (!s) return { ok: false, error: '会话不存在' };
      if (chatService.isSessionStreaming(s.id)) {
        return { ok: false, error: '该会话正在生成中，请先等待或中断生成' };
      }
      const res = await compactionService.compactSession(s, { config, getPersona, genId });
      if (res && res.ok) {
        save();
      }
      return res;
    });

    ctx.ipc.handle('pruneToolResults', args => {
      const s = findSession(args && args.sessionId);
      if (!s) return { ok: false, error: '会话不存在' };
      const res = compactionService.pruneSessionToolResults(s);
      if (res.prunedCount > 0) save();
      return res;
    });

    ctx.ipc.handle('getContextTokens', args => {
      const s = findSession(args && args.sessionId);
      if (!s) return { ok: false, tokens: 0 };
      return { ok: true, tokens: compactionService.calculateContextTokens(s, { enableAgent: config.enableAgent !== false }) };
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
        skillsService,
        mcpServers,
        mcpService,
        approvalService,
        save,
        genId
      });
    };

    ctx.ipc.handle('sendMessage', sendMessageHandler);
    ctx.ipc.handle('chatStream', sendMessageHandler); // Renderer alias compatibility

    /* --- dsh Steering: interject mid-run (Enter while generating) --- */

    ctx.ipc.handle('steerMessage', async args => {
      return chatService.steerMessage(args, { ctx, findSession, save, genId });
    });

    /* --- Lightweight Plan Mode (submit_plan review loop) --- */

    ctx.ipc.handle('resolvePlanReview', args => {
      return chatService.planService.resolvePlanReview(args || {});
    });

    ctx.ipc.handle('setSessionPlanMode', args => {
      const s = findSession(args && args.sessionId);
      if (!s) return { ok: false, error: '会话不存在' };
      s.planMode = !!((args && args.enabled));
      s.updatedAt = Date.now();
      save();
      return { ok: true, planMode: s.planMode };
    });

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
