/* AI Chat - Chat Service
   Handles message dispatch, streaming SSE via IPC events, multi-round tool loops,
   fallback model recovery, context window bounding, and workflow capability hooks.
   Upgraded with deepseek-harness runtime mechanisms:
   - ToolExecutionPipeline (concurrency-safe parallel pool + Fail-Closed exclusive)
   - RuntimeContextService (immutable static prefix cache anchor + dynamic context injection)
   - SubagentManager (Spawn & Fork subagent derivations with recursion depth guard)
   - ToolPairingBalanced context window truncation (context-bounds.js) */

const os = require('os');
const protocols = require('../protocols');
const { AGENT_TOOLS_DEFINITIONS, executeAgentTool } = require('../agent-tools');
const { formatToolResult } = require('../mcp-client');
const { LOCAL_TOOL_NAMES, LOCAL_TOOLS_DEFINITIONS, executeLocalTool, killRunningCommands } = require('../local-tools');
const {
  MEMORY_TOOLS_DEFINITIONS,
  executeMemoryTool
} = require('../memory');
const { TASK_TOOLS_DEFINITIONS, normalizeTaskList, summarizeTaskProgress } = require('../task-tools');
const { buildBoundedContext } = require('../lib/context-bounds');
const { ToolExecutionPipeline, clipToolContent } = require('./tool-pipeline');
const { RuntimeContextService } = require('./runtime-context-service');
const { SubagentManager } = require('./subagent-service');

const MEMORY_TOOL_NAMES = new Set(MEMORY_TOOLS_DEFINITIONS.map(d => d.function.name));

class ChatService {
  constructor() {
    this.activeStreams = new Map(); // streamId -> AbortController
    this.streamBySession = new Map(); // sessionId -> streamId
    this.runtimeContextService = new RuntimeContextService();
    this.toolPipeline = new ToolExecutionPipeline({ maxConcurrency: 4 });
    this.subagentManager = new SubagentManager({ maxDepth: 2 });
  }

  isSessionStreaming(sessionId) {
    return this.streamBySession.has(sessionId);
  }

  abortStream(streamId, approvalService) {
    const controller = this.activeStreams.get(streamId);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(streamId);
      for (const [sessId, sId] of this.streamBySession) {
        if (sId === streamId) {
          this.streamBySession.delete(sessId);
          break;
        }
      }
      if (approvalService) {
        approvalService.denyPendingApprovals(streamId, 'aborted');
      }
      killRunningCommands(streamId);
      return { ok: true, streamId };
    }
    return { ok: false, error: '未找到运行中的生成任务' };
  }

  abortAll(approvalService) {
    for (const [streamId, controller] of this.activeStreams) {
      try { controller.abort(); } catch {}
      killRunningCommands(streamId);
      if (approvalService) {
        approvalService.denyPendingApprovals(streamId, 'aborted');
      }
    }
    this.activeStreams.clear();
    this.streamBySession.clear();
  }

  async dispatchAgentTool(name, rawArgs, rt, { skills, memories, save, ctx, config }) {
    const parseArgs = () => {
      try { return typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs || {}); } catch { return {}; }
    };
    if (name === 'list_skills') {
      return { ok: true, skills: (skills || []).map(s => ({ id: s.id, name: s.name, desc: s.desc })) };
    }
    if (name === 'read_skill') {
      const skill = (skills || []).find(s => s.id === parseArgs().skill_id || s.name === parseArgs().skill_id);
      if (!skill) return { ok: false, error: '技能不存在，请先调用 list_skills 获取可用列表' };
      return { ok: true, skill_id: skill.id, content: skill.content };
    }
    if (MEMORY_TOOL_NAMES.has(name)) {
      return executeMemoryTool(name, parseArgs(), { memories, save, scope: rt.workDir || 'global' });
    }
    if (name === 'update_task_list') {
      const norm = normalizeTaskList(parseArgs().tasks);
      if (!norm.ok) return norm;
      if (rt.session) {
        rt.session.taskList = norm.tasks;
        rt.session.updatedAt = Date.now();
        if (typeof save === 'function') save();
      }
      if (rt.emit) rt.emit({ type: 'task_list', tasks: norm.tasks });
      return { ok: true, taskCount: norm.tasks.length, progress: summarizeTaskProgress(norm.tasks) };
    }
    if (name === 'dispatch_subagent') {
      const pArgs = parseArgs();
      return await this.subagentManager.runSubagent({
        parentSession: rt.session,
        taskPrompt: pArgs.task_prompt,
        mode: pArgs.mode || 'spawn',
        role: pArgs.role,
        maxRounds: pArgs.max_rounds,
        config: rt.config || config,
        availableTools: rt.availableTools || [],
        toolDispatcher: async (subToolName, subArgs) => {
          return await this.dispatchAgentTool(subToolName, subArgs, rt, { skills, memories, save, ctx, config });
        },
        emitChunk: rt.emit,
        signal: rt.signal
      });
    }
    const route = rt.mcpRoutes && rt.mcpRoutes.get(name);
    if (route) {
      try {
        const res = await route.conn.callTool(route.origName, parseArgs());
        return formatToolResult(res);
      } catch (err) {
        return { ok: false, error: `MCP 调用失败 (${route.serverName}): ${err.message}` };
      }
    }
    if (LOCAL_TOOL_NAMES.has(name)) {
      return executeLocalTool(name, parseArgs(), { workDir: rt.workDir || os.homedir(), streamId: rt.streamId });
    }
    return executeAgentTool(name, rawArgs, { ...ctx, workDir: rt.workDir || os.homedir() });
  }

  async sendMessage(args, { ctx, config, findSession, getPersona, memories, skills, mcpServers, mcpService, approvalService, save, genId }) {
    const {
      sessionId,
      content,
      images = [],
      attachments = [],
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
    if (this.streamBySession.has(sessionId)) return { ok: false, error: '该会话正在生成中，请先停止或等待完成' };

    if (editMessageId) {
      const editIdx = session.messages.findIndex(m => m.id === editMessageId);
      if (editIdx >= 0) {
        session.messages = session.messages.slice(0, editIdx);
      }
    }

    const userMsg = {
      id: genId('msg_user'),
      role: 'user',
      content: String(content || '').trim(),
      images: Array.isArray(images) ? images : [],
      attachments: Array.isArray(attachments) ? attachments : [],
      timestamp: Date.now()
    };
    session.messages.push(userMsg);

    if (session.messages.length === 1 && (!session.title || session.title === '新对话')) {
      const titleText = userMsg.content || (userMsg.images.length > 0 ? '[图片对话]' : '新对话');
      session.title = titleText.slice(0, 24) || '新对话';
    }

    const assistantMsg = {
      id: genId('msg_ast'),
      role: 'assistant',
      content: '',
      contentSteps: [],
      reasoning: '',
      reasoningSteps: [],
      usage: null,
      toolCalls: null,
      toolResults: {},
      timestamp: Date.now()
    };
    session.messages.push(assistantMsg);
    session.updatedAt = Date.now();
    save();

    const persona = getPersona(session.personaId);
    const agentWorkDir = session.workDir || config.agentWorkDir || os.homedir();

    // 1. Double-layer context assembly: Static cache anchor + dynamic runtime facts
    const assembled = this.runtimeContextService.assembleContext({
      session,
      persona,
      enableAgent,
      agentWorkDir,
      userQuery: userMsg.content,
      memories
    });

    // 2. Bounded context window with strict tool pairing invariant
    const maxContext = Math.max(2, Number(config.maxContextMessages) || 16);
    const contextMsgs = session.messages.slice(0, -1);
    const boundedMsgs = buildBoundedContext(contextMsgs, maxContext);

    let systemContent = assembled.systemPrompt || '';
    if (assembled.dynamicContextBlock) {
      systemContent = systemContent
        ? `${systemContent}\n\n${assembled.dynamicContextBlock}`
        : assembled.dynamicContextBlock;
    }

    const requestMessages = [];
    if (systemContent) {
      requestMessages.push({ role: 'system', content: systemContent });
    }
    requestMessages.push(...boundedMsgs);

    const controller = new AbortController();
    this.activeStreams.set(streamId, controller);
    this.streamBySession.set(sessionId, streamId);

    const emitChunk = chunk => {
      ctx.send('stream-chunk', { streamId, sessionId, messageId: assistantMsg.id, chunk });
    };

    (async () => {
      let accumulatedContent = '';
      let accumulatedReasoning = '';
      let toolPhaseEntered = false;

      const primaryModel = modelOverride || config.model || 'gpt-4o-mini';
      const fallbackModel = (config.fallbackModel && config.fallbackModel.trim()) || '';

      let mcpRoutes = new Map();
      let agentToolDefs = [
        ...AGENT_TOOLS_DEFINITIONS,
        ...LOCAL_TOOLS_DEFINITIONS,
        ...MEMORY_TOOLS_DEFINITIONS,
        ...TASK_TOOLS_DEFINITIONS
      ];
      if (enableAgent && mcpService) {
        try {
          const rt = await mcpService.getMcpRuntime(mcpServers);
          mcpRoutes = rt.routes;
          agentToolDefs = rt.defs.length > 0 ? [...agentToolDefs, ...rt.defs] : agentToolDefs;
          for (const st of rt.statuses) {
            emitChunk({ type: 'mcp_error', server: st.name, error: st.error, message: `[MCP] ${st.name}: ${st.error}` });
          }
        } catch {}
      }

      const runStream = async (targetModel, isFallback = false) => {
        accumulatedContent = '';
        accumulatedReasoning = '';
        if (isFallback) {
          assistantMsg.content = '';
          assistantMsg.contentSteps = [];
          assistantMsg.reasoning = '';
          assistantMsg.reasoningSteps = [];
          assistantMsg.usage = null;
        }

        const baseOpts = {
          protocol: config.protocol || 'openai-chat',
          baseUrl: config.baseUrl || 'https://api.openai.com/v1',
          apiKey: config.apiKey || '',
          model: targetModel,
          temperature: typeof temperatureOverride === 'number' ? temperatureOverride : (persona?.temperature ?? config.temperature ?? 0.7),
          maxTokens: config.maxTokens || 4096,
          enableReasoning: !!enableReasoning,
          thinkingBudget: config.thinkingBudget || 2048,
          thinkingLevel: enableReasoning ? (thinkingLevel || 'auto') : 'auto'
        };

        const maxRounds = Math.min(40, Math.max(1, Number(config.agentMaxRounds) || 8));
        const conversation = [...requestMessages];
        const executedIds = new Set();
        let round = 0;

        while (true) {
          const allowTools = enableAgent && round < maxRounds;
          let roundContent = '';
          let roundReasoning = '';
          let roundUsage = null;
          const roundToolCalls = [];

          await protocols.streamCompletion({
            ...baseOpts,
            messages: conversation,
            tools: allowTools ? agentToolDefs : null
          }, event => {
            if (event.type === 'content') {
              roundContent += event.delta;
              assistantMsg.content = accumulatedContent
                ? accumulatedContent + '\n\n' + roundContent
                : roundContent;
              emitChunk({
                type: 'content',
                round,
                delta: event.delta,
                roundContent,
                content: assistantMsg.content
              });
            } else if (event.type === 'reasoning') {
              roundReasoning += event.delta;
              accumulatedReasoning += event.delta;
              assistantMsg.reasoning = accumulatedReasoning;
              emitChunk({
                type: 'reasoning',
                round,
                delta: event.delta,
                reasoning: roundReasoning,
                totalReasoning: accumulatedReasoning
              });
            } else if (event.type === 'tool_calls') {
              for (const tc of event.delta) {
                const idx = tc.index ?? 0;
                if (!roundToolCalls[idx]) {
                  roundToolCalls[idx] = { id: tc.id || `tc_${idx}`, type: 'function', function: { name: '', arguments: '' } };
                }
                if (tc.function && tc.function.name) roundToolCalls[idx].function.name += tc.function.name;
                if (tc.function && tc.function.arguments) roundToolCalls[idx].function.arguments += tc.function.arguments;
              }
              emitChunk({ type: 'tool_calls', toolCalls: roundToolCalls.filter(Boolean) });
            } else if (event.type === 'usage' || event.type === 'usage_delta') {
              const u = event.usage || {};
              roundUsage = {
                promptTokens: u.promptTokens || (roundUsage ? roundUsage.promptTokens : 0),
                completionTokens: u.completionTokens || (roundUsage ? roundUsage.completionTokens : 0),
                totalTokens: u.totalTokens || (((roundUsage ? roundUsage.promptTokens : 0) + (u.promptTokens || 0)) + (u.completionTokens || 0))
              };
            } else if (event.type === 'done') {
              emitChunk({ type: 'done' });
            }
          }, controller.signal);

          if (roundReasoning && roundReasoning.trim()) {
            assistantMsg.reasoningSteps = assistantMsg.reasoningSteps || [];
            assistantMsg.reasoningSteps.push({ round, reasoning: roundReasoning });
          }
          if (roundContent && roundContent.trim()) {
            assistantMsg.contentSteps = assistantMsg.contentSteps || [];
            assistantMsg.contentSteps.push({ round, content: roundContent });
          }

          if (roundUsage) {
            const prev = assistantMsg.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
            assistantMsg.usage = {
              promptTokens: (prev.promptTokens || 0) + (roundUsage.promptTokens || 0),
              completionTokens: (prev.completionTokens || 0) + (roundUsage.completionTokens || 0),
              totalTokens: (prev.totalTokens || 0) + (roundUsage.totalTokens || ((roundUsage.promptTokens || 0) + (roundUsage.completionTokens || 0)))
            };
            emitChunk({ type: 'usage', usage: assistantMsg.usage });
          }

          let toolCalls = roundToolCalls.filter(Boolean).filter(tc => tc && tc.function && tc.function.name);
          {
            const seenIds = new Set();
            toolCalls = toolCalls.filter(tc => {
              if (seenIds.has(tc.id)) return false;
              seenIds.add(tc.id);
              return true;
            });
          }

          if (toolCalls.length === 0 || !enableAgent || !allowTools) {
            accumulatedContent = assistantMsg.content || '';
            return;
          }

          toolPhaseEntered = true;
          for (const tc of toolCalls) {
            if (executedIds.has(tc.id)) {
              let nid = `${tc.id}_r${round}_${executedIds.size}`;
              while (executedIds.has(nid)) nid += 'x';
              tc.id = nid;
            }
            tc.round = round;
            executedIds.add(tc.id);
          }
          assistantMsg.toolCalls = [...(assistantMsg.toolCalls || []), ...toolCalls];
          assistantMsg.toolStatus = assistantMsg.toolStatus || {};
          emitChunk({ type: 'tool_exec_start', toolCalls });

          conversation.push({ role: 'assistant', content: roundContent || null, tool_calls: toolCalls });

          // Dispatch tools through the Three-Stage Tool Pipeline with concurrency support!
          const toolResults = await this.toolPipeline.dispatchBatch(
            toolCalls,
            async (name, parsedArgs) => {
              return await this.dispatchAgentTool(name, parsedArgs, {
                mcpRoutes,
                workDir: agentWorkDir,
                streamId,
                session,
                emit: emitChunk,
                signal: controller.signal,
                config,
                availableTools: agentToolDefs
              }, { skills, memories, save, ctx, config });
            },
            {
              approvalService,
              agentApprovalMode,
              session,
              streamId,
              emitChunk,
              signal: controller.signal
            }
          );

          for (let i = 0; i < toolCalls.length; i++) {
            const tc = toolCalls[i];
            const tr = toolResults[i];
            if (!tr) continue;

            const preResult = tr.preResult || {};
            const postResult = tr.postResult || {};

            assistantMsg.toolStatus[tc.id] = preResult.approved ? (preResult.asked ? 'approved' : 'auto') : 'denied';
            assistantMsg.toolResults = assistantMsg.toolResults || {};
            assistantMsg.toolResults[tc.id] = postResult.rawResult;
            tc.result = postResult.rawResult;

            session.messages.push({
              id: genId('msg_tool'),
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.function.name,
              content: postResult.serialized || '',
              timestamp: Date.now()
            });

            conversation.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.function.name,
              content: postResult.clippedForContext || ''
            });
          }

          round++;
          accumulatedContent = assistantMsg.content || '';
          if (round >= maxRounds) {
            conversation.push({
              role: 'user',
              content: '[系统提示] 已达到本轮任务的工具调用上限，请立即基于已获得的信息给出最终回答，不要再调用工具。'
            });
          }
        }
      };

      try {
        try {
          await runStream(primaryModel, false);
        } catch (primaryErr) {
          if (primaryErr.name === 'AbortError') throw primaryErr;
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

        if (assistantMsg.usage) {
          session.totalTokens = session.totalTokens || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
          session.totalTokens.promptTokens += (assistantMsg.usage.promptTokens || 0);
          session.totalTokens.completionTokens += (assistantMsg.usage.completionTokens || 0);
          session.totalTokens.totalTokens += (assistantMsg.usage.totalTokens || 0);
        }

      } catch (err) {
        if (err.name === 'AbortError') {
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
        approvalService.denyPendingApprovals(streamId, 'aborted');
        killRunningCommands(streamId);
        this.activeStreams.delete(streamId);
        this.streamBySession.delete(sessionId);
        session.updatedAt = Date.now();
        if (typeof save === 'function') save();
        emitChunk({ type: 'complete', message: assistantMsg, sessionTotalTokens: session.totalTokens });
      }
    })();

    return {
      ok: true,
      streamId,
      userMessage: userMsg,
      assistantMessage: assistantMsg
    };
  }

  async chatComplete(args, { config, getPersona }) {
    const inputText = String(args.value ?? '');
    const nodeCfg = args.config || {};

    let prompt = inputText;
    if (nodeCfg.promptTemplate) {
      prompt = String(nodeCfg.promptTemplate).replaceAll('{{value}}', inputText);
    }

    let systemPrompt = '';
    if (nodeCfg.personaId) {
      const p = getPersona(nodeCfg.personaId);
      if (p) systemPrompt = p.prompt;
    }
    if (nodeCfg.customSystemPrompt) {
      systemPrompt = nodeCfg.customSystemPrompt;
    }

    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const model = nodeCfg.model || config.model || 'gpt-4o-mini';
    const temperature = typeof nodeCfg.temperature === 'number' ? nodeCfg.temperature : (config.temperature ?? 0.7);

    const res = await protocols.syncCompletion({
      protocol: config.protocol || 'openai-chat',
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      apiKey: config.apiKey || '',
      model,
      temperature,
      maxTokens: nodeCfg.maxTokens || 2048,
      messages
    });

    return {
      ok: true,
      result: res.content,
      usage: res.usage
    };
  }
}

module.exports = {
  ChatService,
  buildBoundedContext,
  clipToolContent,
};
