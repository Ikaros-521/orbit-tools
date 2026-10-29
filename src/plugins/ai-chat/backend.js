/* AI Chat Backend
   Handles session & message persistence, multi-protocol model requests,
   streaming SSE via IPC events, reasoning CoT, Agent tool execution,
   and capability exposure for workflows. */

const { streamCompletion, syncCompletion, fetchRemoteModels } = require('./protocols');
const { AGENT_TOOLS_DEFINITIONS, resolveToolPermission, executeAgentTool } = require('./agent-tools');

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

module.exports = {
  activate(ctx) {
    const rawData = ctx.data.get() || {};
    let config = { ...DEFAULT_CONFIG, ...(rawData.config || {}) };
    let personas = Array.isArray(rawData.personas) && rawData.personas.length > 0 ? rawData.personas : [...DEFAULT_PERSONAS];
    let sessions = Array.isArray(rawData.sessions) ? rawData.sessions : [];
    let activeSessionId = rawData.activeSessionId || null;

    const activeStreams = new Map(); // streamId -> AbortController
    const pendingApprovals = new Map(); // `${streamId}::${toolCallId}` -> { resolve, toolName }

    const save = () => {
      ctx.data.set({ config, personas, sessions, activeSessionId });
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
            tools: enableAgent ? AGENT_TOOLS_DEFINITIONS : null
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
                ? await executeAgentTool(toolName, toolArgs, ctx)
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
  },

  deactivate() {}
};
