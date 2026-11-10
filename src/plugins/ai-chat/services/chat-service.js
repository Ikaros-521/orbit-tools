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
const { TASK_TOOLS_DEFINITIONS, SUBMIT_PLAN_TOOL_DEFINITION, planMarkdownToTasks, normalizeTaskList, summarizeTaskProgress, extractTasksFromMarkdown } = require('../task-tools');
const { buildBoundedContext } = require('../lib/context-bounds');
const { ToolExecutionPipeline, clipToolContent } = require('./tool-pipeline');
const { RuntimeContextService } = require('./runtime-context-service');
const { SubagentManager } = require('./subagent-service');
const { compactionService } = require('./compaction-service');
const PlanReviewService = require('./plan-service');
const { SkillsService } = require('./skills-service');

const MEMORY_TOOL_NAMES = new Set(MEMORY_TOOLS_DEFINITIONS.map(d => d.function.name));

class ChatService {
  constructor() {
    this.activeStreams = new Map(); // streamId -> AbortController
    this.streamBySession = new Map(); // sessionId -> streamId
    this.steerInbox = new Map(); // streamId -> [{ id, content }] (dsh steering)
    this.runtimeContextService = new RuntimeContextService();
    this.compactionService = compactionService;
    this.toolPipeline = new ToolExecutionPipeline({ maxConcurrency: 4 });
    this.subagentManager = new SubagentManager({ maxDepth: 2 });
    this.planService = new PlanReviewService();
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
      this.planService.denyPendingReviews(streamId, 'aborted');
      this.steerInbox.delete(streamId);
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
      this.planService.denyPendingReviews(streamId, 'aborted');
    }
    this.activeStreams.clear();
    this.streamBySession.clear();
    this.steerInbox.clear();
  }

  /**
   * dsh Steering: interject a user message while the agent is streaming.
   * The message is persisted & displayed immediately, then injected into the
   * live conversation at the next round (Step) boundary. If the turn ends
   * without consuming it, it simply remains in history for the next turn.
   */
  async steerMessage(args, { ctx, findSession, save, genId }) {
    const { sessionId, content } = args || {};
    const text = String(content || '').trim();
    if (!text) return { ok: false, error: '插话内容为空' };
    const session = findSession(sessionId);
    if (!session) return { ok: false, error: '会话不存在' };
    const streamId = this.streamBySession.get(sessionId);
    if (!streamId) return { ok: false, error: '当前没有进行中的生成任务' };

    const userMsg = {
      id: (args && args.userMessageId) || genId('msg_user'),
      role: 'user',
      content: text,
      steered: true,
      timestamp: Date.now()
    };
    session.messages.push(userMsg);
    session.updatedAt = Date.now();
    if (typeof save === 'function') save();

    let inbox = this.steerInbox.get(streamId);
    if (!inbox) {
      inbox = [];
      this.steerInbox.set(streamId, inbox);
    }
    inbox.push({ id: userMsg.id, content: text });

    ctx.send('stream-chunk', { streamId, sessionId, messageId: null, chunk: { type: 'steered', message: userMsg } });
    return { ok: true, streamId, userMessage: userMsg };
  }

  async dispatchAgentTool(name, rawArgs, rt, { skills, skillsService, memories, save, ctx, config, genId }) {
    const parseArgs = () => {
      try { return typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs || {}); } catch { return {}; }
    };
    const svc = skillsService || new SkillsService();
    const gid = genId || (prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);

    if (name === 'list_skills') {
      return { ok: true, skills: (skills || []).map(s => ({ id: s.id, name: s.name, desc: s.desc })) };
    }
    if (name === 'read_skill') {
      const pArgs = parseArgs();
      const target = pArgs.skill_id || pArgs.id || pArgs.name;
      const skill = (skills || []).find(s => s.id === target || s.name === target);
      if (!skill) return { ok: false, error: '技能不存在，请先调用 list_skills 获取可用列表' };
      return { ok: true, skill_id: skill.id, name: skill.name, content: skill.content };
    }
    if (name === 'list_open_source_skills') {
      const pArgs = parseArgs();
      const isOnline = pArgs.online !== false;
      let res;
      if (isOnline) {
        res = await svc.searchLiveSkills({ query: pArgs.query, category: pArgs.category, limit: pArgs.limit || 15 }, skills);
      } else {
        res = svc.getSkillMarket({ query: pArgs.query, category: pArgs.category }, skills);
      }
      return {
        ok: true,
        total: res.items.length,
        skills: res.items.map(it => ({
          id: it.id,
          name: it.name,
          category: it.category,
          desc: it.desc,
          repo: it.repo || '',
          stars: it.stars || 0,
          sourceUrl: it.sourceUrl || '',
          sourceType: it.sourceType || 'curated',
          official: !!it.official,
          installed: !!it.installed
        }))
      };
    }
    if (name === 'install_skill') {
      const pArgs = parseArgs();
      const source = pArgs.source || pArgs.skill_id || pArgs.market_id || pArgs.url;
      if (!source) return { ok: false, error: '缺少 source 参数 (可为开源技能 ID/名称或 GitHub 链接)' };
      const res = await svc.installSkillBySource(source, skills, gid);
      if (res && res.ok) {
        if (typeof save === 'function') save();
        if (rt.emit) rt.emit({ type: 'skill_installed', skill: res.skill || (res.names && res.names[0]) });
        return {
          ok: true,
          message: res.names ? `成功导入 ${res.imported} 个技能：${res.names.join('、')}` : `开源技能「${res.skill.name}」已成功安装！`,
          ...res
        };
      }
      return { ok: false, error: (res && res.error) || '安装技能失败' };
    }
    if (name === 'create_skill') {
      const pArgs = parseArgs();
      const res = await svc.createSkillFromInput(pArgs, skills, gid);
      if (res && res.ok) {
        if (typeof save === 'function') save();
        if (rt.emit) rt.emit({ type: 'skill_created', skill: res.skill });
        return {
          ok: true,
          skill_id: res.skill.id,
          name: res.skill.name,
          desc: res.skill.desc,
          source: res.skill.source,
          message: `技能「${res.skill.name}」已成功创建并保存！后续可通过 list_skills 与 read_skill 读取执行。`
        };
      }
      return { ok: false, error: (res && res.error) || '创建技能失败' };
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
    if (name === 'submit_plan') {
      // 轻量计划模式（dsh plan review seam）：呈交计划 → 批准转任务清单 / 反馈修订
      const pArgs = parseArgs();
      const markdown = String(pArgs.plan_markdown || pArgs.plan || '').trim();
      if (!markdown) return { ok: false, error: '计划内容为空，请以 Markdown 提交完整计划' };
      const decision = await this.planService.requestPlanReview(rt.streamId, markdown, rt.emit);
      if (decision.reason === 'aborted') {
        const abortErr = new Error('已中断生成');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      if (decision.approved) {
        const conv = planMarkdownToTasks(markdown);
        if (conv.ok) {
          if (rt.session) {
            rt.session.taskList = conv.tasks;
            rt.session.updatedAt = Date.now();
            if (typeof save === 'function') save();
          }
          if (rt.emit) rt.emit({ type: 'task_list', tasks: conv.tasks });
          return { ok: true, approved: true, taskCount: conv.tasks.length, note: '用户已批准计划并生成任务清单，按清单执行并随进度用 update_task_list 维护' };
        }
        return { ok: true, approved: true, taskCount: 0, note: '用户已批准计划（计划未解析出任务清单，请自行用 update_task_list 维护步骤）' };
      }
      return { ok: true, approved: false, feedback: decision.feedback || '用户要求继续完善计划，未给出具体反馈，请细化后重新呈交' };
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
          // 硬阻断递归派生：子代理工具表虽已过滤 dispatch_subagent，模型仍
          // 可能幻觉调用未声明工具名，不能只依赖软过滤。
          if (subToolName === 'dispatch_subagent') {
            return { ok: false, error: '子智能体内禁止再次派生子智能体（已达到派生深度限制）' };
          }
          // 子代理工具必须走与主循环相同的三段管线：直连 dispatchAgentTool
          // 会绕过 preExecute 审批，形成 fail-open。
          if (rt.approvalService) {
            const subTc = {
              id: `subtc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
              type: 'function',
              function: { name: subToolName, arguments: JSON.stringify(subArgs || {}) }
            };
            const [res] = await this.toolPipeline.dispatchBatch(
              [subTc],
              (n, parsedArgs) => this.dispatchAgentTool(n, parsedArgs, rt, { skills, skillsService, memories, save, ctx, config, genId }),
              {
                approvalService: rt.approvalService,
                agentApprovalMode: rt.agentApprovalMode || 'ask',
                session: rt.session,
                streamId: rt.streamId,
                emitChunk: rt.emit,
                signal: rt.signal
              }
            );
            return res ? res.postResult.rawResult : { ok: false, error: '子代理工具调度失败' };
          }
          return await this.dispatchAgentTool(subToolName, subArgs, rt, { skills, skillsService, memories, save, ctx, config, genId });
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
      return executeLocalTool(name, parseArgs(), {
        workDir: rt.workDir || os.homedir(),
        streamId: rt.streamId,
        sessionId: rt.session ? rt.session.id : null
      });
    }
    return executeAgentTool(name, rawArgs, { ...ctx, workDir: rt.workDir || os.homedir() });
  }

  async sendMessage(args, { ctx, config, findSession, getPersona, memories, skills, skillsService, mcpServers, mcpService, approvalService, save, genId }) {
    const {
      sessionId,
      content,
      images = [],
      attachments = [],
      editMessageId,
      userMessageId = null,
      assistantMessageId = null,
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
      id: userMessageId || genId('msg_user'),
      role: 'user',
      content: String(content || '').trim(),
      images: Array.isArray(images) ? images : [],
      attachments: Array.isArray(attachments) ? attachments : [],
      timestamp: Date.now()
    };
    session.messages.push(userMsg);

    if (session.messages.length === 1 && (!session.title || session.title === '新对话')) {
      let titleText = userMsg.content;
      if (!titleText) {
        if (userMsg.attachments && userMsg.attachments.length > 0) {
          titleText = `[附件] ${userMsg.attachments[0].name || '文件'}`;
        } else if (userMsg.images && userMsg.images.length > 0) {
          titleText = '[图片对话]';
        }
      }
      session.title = (titleText || '新对话').slice(0, 24);
    }

    const assistantMsg = {
      id: assistantMessageId || genId('msg_ast'),
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

    // Helper to build request messages adhering to Prefix Caching and Tool Pairing Invariants
    const buildRequestSequence = () => {
      const assembled = this.runtimeContextService.assembleContext({
        session,
        persona,
        enableAgent,
        agentWorkDir,
        userQuery: userMsg.content,
        memories
      });

      const maxContext = Math.max(2, Number(config.maxContextMessages) || 16);
      const contextMsgs = session.messages.slice(0, -1);
      const boundedMsgs = buildBoundedContext(contextMsgs, maxContext);

      // DeepSeek Prefix Cache Optimization:
      // The system prompt is an IMMUTABLE prefix cache anchor. NEVER append changing facts to it.
      // Dynamic facts (CWD, task progress, recalled memories) are injected via a scoped <system-reminder>
      // attached to the latest user message or as a separate trailing context node.
      const msgs = [];
      if (assembled.systemPrompt) {
        msgs.push({ role: 'system', content: assembled.systemPrompt });
      }

      if (assembled.dynamicContextBlock) {
        const lastUserIdx = boundedMsgs.map(m => m.role).lastIndexOf('user');
        if (lastUserIdx >= 0) {
          const orig = boundedMsgs[lastUserIdx];
          const reminderText = `<system-reminder>\n${assembled.dynamicContextBlock}\n</system-reminder>`;
          boundedMsgs[lastUserIdx] = {
            ...orig,
            content: orig.content ? `${reminderText}\n\n${orig.content}` : reminderText
          };
        } else {
          boundedMsgs.unshift({
            role: 'user',
            content: `<system-reminder>\n${assembled.dynamicContextBlock}\n</system-reminder>`
          });
        }
      }

      msgs.push(...boundedMsgs);
      return msgs;
    };

    let requestMessages = buildRequestSequence();

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

      // Automatic Pressure Compaction (deepseek-harness 'pressure' trigger)
      const maxContextTokens = Number(config.maxContextTokens) || 200000;
      const thresholdRatio = Number(config.compactionThresholdRatio) || 0.8;
      const currentTokens = this.compactionService.calculateContextTokens(session, { enableAgent });

      if (currentTokens > maxContextTokens * thresholdRatio && session.messages.length >= 6) {
        try {
          emitChunk({
            type: 'status',
            status: 'compaction_start',
            message: '上下文使用率接近上限 (80%)，正在自动进行智能历史提炼…'
          });
          const compRes = await this.compactionService.compactSession(session, {
            config,
            getPersona,
            genId,
            keepCount: 2
          });
          if (compRes && compRes.ok) {
            assistantMsg.compactedDuringTurn = true; // Turn 页脚「已压缩」标记
            save();
            requestMessages = buildRequestSequence();
            emitChunk({
              type: 'status',
              status: 'compaction_end',
              message: '上下文已自动提炼，释放历史 Token 压力。'
            });
          }
        } catch {}
      }

      const primaryModel = modelOverride || config.model || 'gpt-4o-mini';
      const fallbackModel = (config.fallbackModel && config.fallbackModel.trim()) || '';

      let mcpRoutes = new Map();
      let agentToolDefs = [
        ...AGENT_TOOLS_DEFINITIONS,
        ...LOCAL_TOOLS_DEFINITIONS,
        ...MEMORY_TOOLS_DEFINITIONS,
        ...TASK_TOOLS_DEFINITIONS
      ];
      // 计划模式渐进式披露：仅开启时声明 submit_plan
      if (enableAgent && session.planMode) {
        agentToolDefs = [...agentToolDefs, SUBMIT_PLAN_TOOL_DEFINITION];
      }
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
        assistantMsg.model = targetModel; // Turn 页脚元数据
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
          thinkingLevel: enableReasoning ? (thinkingLevel || 'auto') : 'auto',
          // Claude 渠道开启原生 prompt caching：system + tools 两个 ephemeral 断点，
          // 稳定前缀（人设/Agent 准则/工具 schema）命中读缓存计价 0.1x
          enablePromptCaching: (config.protocol || 'openai-chat') === 'claude-messages'
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
                totalTokens: u.totalTokens || (((roundUsage ? roundUsage.promptTokens : 0) + (u.promptTokens || 0)) + (u.completionTokens || 0)),
                cachedTokens: u.cachedTokens || (roundUsage ? roundUsage.cachedTokens : 0)
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
            const prev = assistantMsg.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0 };
            assistantMsg.usage = {
              promptTokens: (prev.promptTokens || 0) + (roundUsage.promptTokens || 0),
              completionTokens: (prev.completionTokens || 0) + (roundUsage.completionTokens || 0),
              totalTokens: (prev.totalTokens || 0) + (roundUsage.totalTokens || ((roundUsage.promptTokens || 0) + (roundUsage.completionTokens || 0))),
              cachedTokens: (prev.cachedTokens || 0) + (roundUsage.cachedTokens || 0),
              // contextTokens represents the single-round context window occupied during this latest round
              contextTokens: (roundUsage.promptTokens || 0) + (roundUsage.completionTokens || 0)
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
            assistantMsg.rounds = round;
            return;
          }

          // dsh 流式安全语义：max-tokens 截断的工具调用参数不完整，不能安全执行。
          // 保留协议配对（assistant tool_calls + 合成错误结果），模型据此重新调用。
          const executableCalls = [];
          const truncatedCalls = [];
          for (const tc of toolCalls) {
            const raw = tc.function.arguments;
            let argsValid = false;
            if (typeof raw === 'string') {
              if (raw === '') argsValid = true;
              else { try { JSON.parse(raw); argsValid = true; } catch { argsValid = false; } }
            } else if (raw && typeof raw === 'object') {
              argsValid = true;
            } else if (raw === undefined || raw === null) {
              argsValid = true; // 无参工具
            }
            if (argsValid) executableCalls.push(tc);
            else truncatedCalls.push(tc);
          }
          for (const tc of truncatedCalls) {
            emitChunk({ type: 'tool_truncated', toolId: tc.id, toolName: tc.function.name });
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
          emitChunk({ type: 'tool_exec_start', toolCalls: executableCalls });

          conversation.push({ role: 'assistant', content: roundContent || null, tool_calls: toolCalls });

          // 截断调用：合成错误结果保持协议配对，模型下一轮重新发起
          for (const tc of truncatedCalls) {
            const synth = { ok: false, error: '参数不完整（疑似 max-tokens 截断），本次调用已安全丢弃，请重新调用该工具并完整给出参数' };
            assistantMsg.toolStatus[tc.id] = 'truncated';
            assistantMsg.toolResults = assistantMsg.toolResults || {};
            assistantMsg.toolResults[tc.id] = synth;
            tc.result = synth;
            session.messages.push({
              id: genId('msg_tool'),
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.function.name,
              content: JSON.stringify(synth),
              timestamp: Date.now()
            });
            conversation.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.function.name,
              content: JSON.stringify(synth)
            });
          }

          // Dispatch tools through the Three-Stage Tool Pipeline with concurrency support!
          const toolResults = executableCalls.length > 0 ? await this.toolPipeline.dispatchBatch(
            executableCalls,
            async (name, parsedArgs) => {
              return await this.dispatchAgentTool(name, parsedArgs, {
                mcpRoutes,
                workDir: agentWorkDir,
                streamId,
                session,
                emit: emitChunk,
                signal: controller.signal,
                config,
                availableTools: agentToolDefs,
                // 子代理 toolDispatcher 复用同一 rt，审批服务/档位须随行
                approvalService,
                agentApprovalMode
              }, { skills, skillsService, memories, save, ctx, config, genId });
            },
            {
              approvalService,
              agentApprovalMode,
              session,
              streamId,
              emitChunk,
              signal: controller.signal
            }
          ) : [];

          for (let i = 0; i < executableCalls.length; i++) {
            const tc = executableCalls[i];
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

          // dsh Steering：轮（Step）边界消费用户插话，作为下一步输入改变方向
          const steerPending = this.steerInbox.get(streamId);
          if (steerPending && steerPending.length > 0) {
            const consumed = steerPending.splice(0, steerPending.length);
            for (const item of consumed) {
              conversation.push({
                role: 'user',
                content: `[用户在任务执行中插话] ${item.content}`
              });
            }
            emitChunk({ type: 'steer_consumed', ids: consumed.map(c => c.id) });
          }

          round++;
          accumulatedContent = assistantMsg.content || '';
          assistantMsg.rounds = round;
          if (round >= maxRounds) {
            conversation.push({
              role: 'user',
              content: '[系统提示] 已达到本轮任务的工具调用上限，请立即基于已获得的信息给出最终回答，不要再调用工具。'
            });
          }
        }
      };

      const isContextOverflow = err => {
        if (!err || !err.message) return false;
        return (
          /context.*length.*exceeded/i.test(err.message) ||
          /maximum context length/i.test(err.message) ||
          /exceeds the context window/i.test(err.message) ||
          /prompt is too long/i.test(err.message) ||
          /token.*limit.*exceeded/i.test(err.message) ||
          (err.status === 400 && /token|context/i.test(err.message))
        );
      };

      try {
        let overflowRecovered = false;
        try {
          await runStream(primaryModel, false);
        } catch (primaryErr) {
          if (primaryErr.name === 'AbortError') throw primaryErr;

          // Check for Context Overflow Recovery (deepseek-harness 'context-overflow' recovery)
          if (isContextOverflow(primaryErr) && !overflowRecovered && session.messages.length > 2) {
            overflowRecovered = true;
            emitChunk({
              type: 'status',
              status: 'overflow_recovery',
              message: '检测到模型上下文超限错误，正在执行紧急剪枝提炼并自动重试…'
            });

            // Stage 1: Aggressive Tool Result Pruning
            this.compactionService.pruneSessionToolResults(session, { threshold: 3000, headChars: 800, tailChars: 800 });
            // Stage 2: Multimodal Image Offload
            this.compactionService.offloadSessionImages(session, { keepRecentRounds: 1 });
            // Stage 3: Emergency Compaction
            await this.compactionService.compactSession(session, {
              config,
              getPersona,
              genId,
              keepCount: 1
            });
            assistantMsg.compactedDuringTurn = true;
            if (typeof save === 'function') save();

            // Rebuild conversation sequence and retry
            requestMessages = buildRequestSequence();
            await runStream(primaryModel, true);
          } else if (fallbackModel && fallbackModel !== primaryModel && !toolPhaseEntered) {
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
          session.totalTokens = session.totalTokens || { promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0 };
          session.totalTokens.promptTokens += (assistantMsg.usage.promptTokens || 0);
          session.totalTokens.completionTokens += (assistantMsg.usage.completionTokens || 0);
          session.totalTokens.totalTokens += (assistantMsg.usage.totalTokens || 0);
          session.totalTokens.cachedTokens = (session.totalTokens.cachedTokens || 0) + (assistantMsg.usage.cachedTokens || 0);
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
        this.planService.denyPendingReviews(streamId, 'aborted');
        killRunningCommands(streamId);
        this.activeStreams.delete(streamId);
        // abortStream already dropped the mapping synchronously; by the time
        // this stale loop unwinds, a NEW stream may own the session — only
        // delete when this stream still holds the registration.
        if (this.streamBySession.get(sessionId) === streamId) {
          this.streamBySession.delete(sessionId);
        }

        // Turn 页脚元数据收尾
        assistantMsg.endedAt = Date.now();
        if (!Number.isFinite(assistantMsg.rounds)) assistantMsg.rounds = 0;

        // 未被消费的插话保留在历史中（下一轮上下文自然包含），提示前端
        const steerLeftover = this.steerInbox.get(streamId);
        if (steerLeftover && steerLeftover.length > 0) {
          emitChunk({ type: 'steer_deferred', ids: steerLeftover.map(c => c.id) });
        }
        this.steerInbox.delete(streamId);

        if (assistantMsg && assistantMsg.content) {
          const extracted = extractTasksFromMarkdown(assistantMsg.content);
          if (extracted && extracted.length >= 2) {
            session.taskList = extracted;
          }
        }
        session.updatedAt = Date.now();
        if (typeof save === 'function') save();
        emitChunk({
          type: 'complete',
          message: assistantMsg,
          sessionTotalTokens: session.totalTokens,
          taskList: session.taskList || null
        });
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
