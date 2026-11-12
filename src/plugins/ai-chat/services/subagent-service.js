/* AI Chat - Subagent Manager & Hierarchy Service
   Inspired by deepseek-harness Subagent Architecture:
   - Unified SubagentActivation abstraction + background task registry (wait:false)
   - Dual derivation mechanisms: Spawn (clean slate) vs Fork (snapshot clone)
   - Parallel fan-out via tasks[] with bounded concurrency pool
   - Delegation depth guard (maxDepth) with real depth propagation (受控嵌套派生)
   - Per-child wall-clock timeout; caller delivery (structured JSON result for parent tool call) */

const protocols = require('../protocols');
const { buildBoundedContext } = require('../lib/context-bounds');

const DEFAULT_MAX_DELEGATION_DEPTH = 2;
const DEFAULT_SUBAGENT_MAX_ROUNDS = 5;
const DEFAULT_CHILD_TIMEOUT_MS = 300000;   // 单个子代理默认 5 分钟墙钟超时
const CHILD_TIMEOUT_MIN_MS = 30000;
const CHILD_TIMEOUT_MAX_MS = 900000;
const MAX_TASKS_PER_DISPATCH = 4;          // 单次 dispatch 并行任务数上限
const MAX_PARALLEL_CHILDREN = 3;           // 并发池上限（同 API key 限流友好）
const BACKGROUND_TTL_MS = 30 * 60 * 1000;  // 已完成后台任务的保留时长
const BACKGROUND_MAX_PER_SESSION = 30;     // 每会话后台任务记录上限

const clampNumber = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const SUBAGENT_TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'dispatch_subagent',
    description: '派生专门的子智能体 (Subagent) 执行专项子任务或进行思维分叉探索。支持 tasks 数组一次并行派生多个子智能体（上限 4 个，并发 3 个）；需要并行探索互不依赖的子任务时务必使用 tasks 数组而非多次单独调用。Spawn 为全新独立上下文（适合独立查阅文档、执行单测、排查异常），Fork 为继承当前上下文快照（适合对比备选方案）。wait=false 时任务转入后台立即返回，随后用 check_subagents 查询状态与结果。',
    parameters: {
      type: 'object',
      properties: {
        task_prompt: {
          type: 'string',
          description: '分配给子智能体的具体任务描述与目标（单任务形式，与 tasks 二选一）'
        },
        tasks: {
          type: 'array',
          description: '并行任务列表（与 task_prompt 二选一，优先级更高）。每项含 task_prompt（必填）、role、mode、max_rounds',
          items: {
            type: 'object',
            properties: {
              task_prompt: { type: 'string', description: '该子任务的具体描述与目标' },
              role: { type: 'string', description: '子智能体角色（如：代码审查员、测试执行员）' },
              mode: { type: 'string', enum: ['spawn', 'fork'], description: 'spawn (默认) / fork' },
              max_rounds: { type: 'number', description: '该子任务最大迭代轮次 (默认 5，上限 8)' }
            },
            required: ['task_prompt']
          }
        },
        mode: {
          type: 'string',
          enum: ['spawn', 'fork'],
          description: '派生模式：spawn (全新独立上下文，默认) / fork (继承当前对话快照进行思维分叉)。tasks 数组下作为各项缺省值'
        },
        role: {
          type: 'string',
          description: '子智能体角色（如：代码审查员、测试执行员、文献调研员）。tasks 数组下作为各项缺省值'
        },
        max_rounds: {
          type: 'number',
          description: '子智能体最大迭代轮次 (默认 5，上限 8)'
        },
        wait: {
          type: 'boolean',
          description: 'true (默认)：阻塞等待全部子任务完成后返回汇总；false：转后台立即返回任务 ID，跨轮执行，用 check_subagents 获取结果'
        },
        timeout_ms: {
          type: 'number',
          description: '每个子智能体的墙钟超时毫秒数 (默认 300000，范围 30000-900000)，超时中止并返回已得结论'
        }
      }
    }
  }
};

const CHECK_SUBAGENTS_TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'check_subagents',
    description: '查询本会话后台子代理任务的状态与结果（前台阻塞式任务无需查询，其结果已直接返回）。wait=true 时阻塞等待指定（或全部）后台任务完成后再返回，默认最多等待 60 秒。',
    parameters: {
      type: 'object',
      properties: {
        task_ids: {
          type: 'array',
          items: { type: 'string' },
          description: '要查询的任务 ID 列表（省略表示本会话全部后台任务）'
        },
        wait: {
          type: 'boolean',
          description: 'true 时阻塞等待至任务完成或超时 (默认 false 立即返回快照)'
        },
        timeout_ms: {
          type: 'number',
          description: 'wait=true 时的最长等待毫秒数 (默认 60000，上限 300000)'
        }
      }
    }
  }
};

class SubagentManager {
  constructor({ maxDepth = DEFAULT_MAX_DELEGATION_DEPTH, minChildTimeoutMs = CHILD_TIMEOUT_MIN_MS } = {}) {
    this.maxDepth = maxDepth;
    this.minChildTimeoutMs = Number(minChildTimeoutMs) > 0 ? Number(minChildTimeoutMs) : CHILD_TIMEOUT_MIN_MS;
    // 后台任务注册表: taskId(=childId) -> activation
    this.activeActivations = new Map();
  }

  /**
   * Checks whether the parent session is permitted to derive further subagents.
   */
  canDerive(parentSession) {
    const currentDepth = Number(parentSession?.delegationDepth) || 0;
    return currentDepth < this.maxDepth;
  }

  /**
   * Normalizes dispatch args into a task list.
   * 单任务 task_prompt 与 tasks 数组二选一；tasks 优先。嵌套层强制单任务防并行×嵌套爆炸。
   */
  _normalizeTasks({ taskPrompt, tasks, mode, role, maxRounds, forceSingle }) {
    let list = [];
    if (Array.isArray(tasks) && tasks.length > 0) {
      list = tasks
        .map(t => ({
          taskPrompt: String(t?.task_prompt || '').trim(),
          mode: t?.mode || mode || 'spawn',
          role: t?.role || role || '专项研究员',
          maxRounds: t?.max_rounds !== undefined ? t.max_rounds : maxRounds
        }))
        .filter(t => t.taskPrompt);
    } else if (taskPrompt && String(taskPrompt).trim()) {
      list = [{
        taskPrompt: String(taskPrompt).trim(),
        mode: mode || 'spawn',
        role: role || '专项研究员',
        maxRounds
      }];
    }
    if (list.length === 0) return { ok: false, error: '缺少任务描述：请提供 task_prompt 或非空 tasks 数组' };
    if (forceSingle && list.length > 1) {
      list = [list[0]];
    }
    return { ok: true, tasks: list.slice(0, MAX_TASKS_PER_DISPATCH) };
  }

  /**
   * Dispatches subagent activation(s): parallel fan-out, optional background mode.
   *
   * @param {object} params
   * @param {object} params.parentSession - The calling session (delegationDepth propagated)
   * @param {string} [params.taskPrompt] - Single task form (backward compatible)
   * @param {Array} [params.tasks] - Parallel task list [{task_prompt, role?, mode?, max_rounds?}]
   * @param {string} [params.mode='spawn'] - 'spawn' | 'fork' (default for each task)
   * @param {string} [params.role] - Default role for each task
   * @param {number} [params.maxRounds] - Default max rounds for each task
   * @param {number} [params.timeoutMs] - Per-child wall-clock timeout ms
   * @param {boolean} [params.wait=true] - false: background mode, return task ids immediately
   * @param {object} params.config - LLM connection configuration
   * @param {Array} params.availableTools - Filtered tool definitions for subagent
   * @param {Function} params.toolDispatcher - (name, args, childInfo) => Promise<result>
   * @param {Function} [params.emitChunk] - Stream chunk emitter
   * @param {AbortSignal} [params.signal] - Cancellation signal (foreground children only)
   * @param {string} [params.toolCallId] - Parent tool call id for UI progress routing
   * @param {string} [params.sessionId] - Session scope for background registry
   */
  async runSubagent({
    parentSession,
    taskPrompt,
    tasks,
    mode = 'spawn',
    role,
    maxRounds,
    timeoutMs,
    wait = true,
    config = {},
    availableTools = [],
    toolDispatcher,
    emitChunk,
    signal,
    toolCallId,
    taskIndex = 0,
    sessionId
  }) {
    const currentDepth = Number(parentSession?.delegationDepth) || 0;
    const nextDepth = currentDepth + 1;

    if (nextDepth > this.maxDepth) {
      return {
        ok: false,
        error: `已达到最大智能体派生深度限制 (当前深度: ${currentDepth}, 最大允许: ${this.maxDepth})，已阻断递归调用。`
      };
    }

    // 嵌套层只允许单任务：并行扇出只发生在顶层，防并行×嵌套组合爆炸
    const normalized = this._normalizeTasks({
      taskPrompt, tasks, mode, role, maxRounds,
      forceSingle: currentDepth > 0
    });
    if (!normalized.ok) return normalized;

    const boundedTimeout = clampNumber(timeoutMs, this.minChildTimeoutMs, CHILD_TIMEOUT_MAX_MS, DEFAULT_CHILD_TIMEOUT_MS);

    if (wait === false) {
      return this._dispatchBackground({
        normalized, parentSession, nextDepth, boundedTimeout,
        config, availableTools, toolDispatcher, emitChunk,
        toolCallId, sessionId
      });
    }

    // 前台：并发池执行全部子任务并阻塞等待（父循环语义不变）
    const results = await this._runPool(normalized.tasks, (task, idx) => this._runChild({
      parentSession,
      taskPrompt: task.taskPrompt,
      mode: task.mode,
      role: task.role,
      maxRounds: task.maxRounds,
      timeoutMs: boundedTimeout,
      config,
      availableTools,
      toolDispatcher,
      emitChunk,
      signal,
      toolCallId,
      taskIndex: idx
    }), MAX_PARALLEL_CHILDREN);

    if (results.length === 1) {
      return results[0]; // 单任务保持既有返回形状（向后兼容）
    }

    const succeeded = results.filter(r => r.ok).length;
    const failed = results.length - succeeded;
    const timedOut = results.filter(r => r.timed_out).length;
    const briefs = results.map(r => {
      const head = r.ok ? `[${r.role || '子智能体'}] ${String(r.summary || '').slice(0, 160)}` : `[${r.role || '子智能体'}] 失败: ${String(r.error || '').slice(0, 120)}`;
      return head;
    });
    return {
      ok: succeeded > 0,
      mode: 'multi',
      depth: nextDepth,
      total: results.length,
      succeeded,
      failed,
      timed_out: timedOut,
      tasks: results,
      summary: `${results.length} 个子任务完成：${succeeded} 成功 · ${failed} 失败${timedOut ? ` · ${timedOut} 超时` : ''}\n${briefs.join('\n')}`
    };
  }

  /**
   * Background dispatch: children run detached from the parent stream signal,
   * registered in activeActivations, retrievable via check_subagents.
   */
  _dispatchBackground({ normalized, parentSession, nextDepth, boundedTimeout, config, availableTools, toolDispatcher, emitChunk, toolCallId, sessionId }) {
    const scopeId = sessionId || parentSession?.id || null;
    const started = [];
    for (let i = 0; i < normalized.tasks.length; i++) {
      const task = normalized.tasks[i];
      const childId = this._newChildId();
      const activation = {
        taskId: childId,
        childId,
        sessionId: scopeId,
        role: task.role || '专项研究员',
        mode: task.mode || 'spawn',
        status: 'running',
        startedAt: Date.now(),
        finishedAt: null,
        result: null,
        controller: new AbortController()
      };
      this.activeActivations.set(childId, activation);
      started.push(activation);

      // 后台子代理：独立 controller（不挂父流 signal），仅受超时与 disposeAll 约束
      this._runChild({
        parentSession,
        childId,
        taskPrompt: task.taskPrompt,
        mode: task.mode,
        role: task.role,
        maxRounds: task.maxRounds,
        timeoutMs: boundedTimeout,
        config,
        availableTools,
        toolDispatcher,
        emitChunk,
        signal: null,
        ownController: activation.controller,
        toolCallId,
        taskIndex: i
      }).then(result => {
        activation.result = result;
        activation.status = result.ok ? 'completed' : (result.timed_out ? 'timed_out' : 'failed');
      }).catch(err => {
        activation.result = { ok: false, error: err.message };
        activation.status = 'failed';
      }).finally(() => {
        activation.finishedAt = Date.now();
        this._pruneActivations();
      });
    }

    return {
      ok: true,
      background: true,
      total: started.length,
      tasks: started.map(a => ({ task_id: a.taskId, role: a.role, mode: a.mode, status: a.status })),
      note: '子代理任务已转入后台执行（不随本轮结束而中止），用 check_subagents 查询状态与结果；完成结果也会在下一轮开场注入提醒。'
    };
  }

  _newChildId() {
    return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  /**
   * Bounded concurrency pool. Each item's worker exceptions are captured per-item
   * (never reject the whole pool).
   */
  async _runPool(items, worker, limit) {
    const results = new Array(items.length);
    let nextIdx = 0;
    const workerCount = Math.max(1, Math.min(limit, items.length));
    const runners = [];
    for (let w = 0; w < workerCount; w++) {
      runners.push((async () => {
        while (nextIdx < items.length) {
          const idx = nextIdx++;
          try {
            results[idx] = await worker(items[idx], idx);
          } catch (err) {
            results[idx] = { ok: false, role: items[idx].role, error: `子智能体执行异常: ${err.message}` };
          }
        }
      })());
    }
    await Promise.all(runners);
    return results;
  }

  /**
   * Single child execution loop: streamCompletion rounds + sub tool dispatch.
   * Own AbortController links parent signal (foreground) and wall-clock timeout.
   */
  async _runChild({
    parentSession,
    childId: providedChildId,
    taskPrompt,
    mode = 'spawn',
    role = '专项研究员',
    maxRounds = DEFAULT_SUBAGENT_MAX_ROUNDS,
    timeoutMs = DEFAULT_CHILD_TIMEOUT_MS,
    config = {},
    availableTools = [],
    toolDispatcher,
    emitChunk,
    signal,
    ownController,
    toolCallId,
    taskIndex = 0
  }) {
    const nextDepth = (Number(parentSession?.delegationDepth) || 0) + 1;
    const childId = providedChildId || this._newChildId();
    const boundedRounds = Math.max(1, Math.min(8, Number(maxRounds) || DEFAULT_SUBAGENT_MAX_ROUNDS));

    // 独立 controller：超时/父流中断只影响本子代理，不干扰同批兄弟任务
    const controller = ownController || new AbortController();
    let timedOut = false;
    const onParentAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onParentAbort, { once: true });
    }
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    // Construct conversation seed based on mode (Spawn vs Fork)
    let initialMessages = [];
    const systemPrompt = `你是由主智能体派生的专项子智能体 (Subagent)。
角色定义: ${role}
派生模式: ${mode} (深度: ${nextDepth}/${this.maxDepth})
目标: 聚焦完成下述专项任务，完成后给出清晰明了的总结结论，无需寒暄。`;

    if (mode === 'fork' && Array.isArray(parentSession?.messages)) {
      // Fork mode: clone parent's conversation snapshot
      const boundedParentHistory = buildBoundedContext(parentSession.messages, 12);
      initialMessages = [
        { role: 'system', content: systemPrompt },
        ...boundedParentHistory,
        { role: 'user', content: `[分叉任务指令] ${taskPrompt}` }
      ];
    } else {
      // Spawn mode: completely fresh slate
      initialMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: taskPrompt }
      ];
    }

    const chunkMeta = { childId, toolCallId, taskIndex };
    if (emitChunk) {
      emitChunk({
        type: 'subagent_start',
        ...chunkMeta,
        mode,
        role,
        depth: nextDepth,
        taskPrompt
      });
    }

    const conversation = [...initialMessages];
    let executedRounds = 0;
    let finalSummary = '';
    let totalToolCalls = 0;

    // 受控嵌套：深度未满时子工具表保留 dispatch_subagent（孙代单任务由
    // _normalizeTasks forceSingle 保证）；check_subagents 一律不下放给子代理
    const canNest = nextDepth < this.maxDepth;
    const subagentToolDefs = availableTools.filter(t => {
      const n = t?.function?.name;
      if (n === 'check_subagents') return false;
      if (n === 'dispatch_subagent') return canNest;
      return true;
    });

    const baseOpts = {
      protocol: config.protocol || 'openai-chat',
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      apiKey: config.apiKey || '',
      model: config.model || 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 2048,
      enableReasoning: false
    };

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      if (signal) signal.removeEventListener('abort', onParentAbort);
    };

    try {
      while (executedRounds < boundedRounds) {
        if (controller.signal.aborted) throw new Error(timedOut ? '子智能体执行超时' : '子智能体任务已中断');

        let roundContent = '';
        const roundToolCalls = [];

        await protocols.streamCompletion({
          ...baseOpts,
          messages: conversation,
          tools: subagentToolDefs.length > 0 ? subagentToolDefs : null
        }, event => {
          if (event.type === 'content') {
            roundContent += event.delta;
          } else if (event.type === 'tool_calls') {
            for (const tc of event.delta) {
              const idx = tc.index ?? 0;
              if (!roundToolCalls[idx]) {
                roundToolCalls[idx] = { id: tc.id || `sub_tc_${idx}`, type: 'function', function: { name: '', arguments: '' } };
              }
              if (tc.function?.name) roundToolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) roundToolCalls[idx].function.arguments += tc.function.arguments;
            }
          }
        }, controller.signal);

        finalSummary = roundContent;
        const validCalls = roundToolCalls.filter(tc => tc?.function?.name);

        if (validCalls.length === 0) {
          // Subagent decided to conclude without tools
          break;
        }

        totalToolCalls += validCalls.length;
        conversation.push({ role: 'assistant', content: roundContent || null, tool_calls: validCalls });

        // Execute subagent tool calls sequentially（单子代理内串行，跨子代理由池并行）
        for (const tc of validCalls) {
          let toolArgs = {};
          try {
            toolArgs = typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : (tc.function.arguments || {});
          } catch {}

          if (emitChunk) {
            emitChunk({
              type: 'subagent_step',
              ...chunkMeta,
              round: executedRounds,
              toolName: tc.function.name,
              args: toolArgs
            });
          }

          let toolResult = { ok: false, error: '未定义执行器' };
          if (typeof toolDispatcher === 'function') {
            try {
              // childInfo：供 chat-service 判定嵌套深度并继承子会话快照
              toolResult = await toolDispatcher(tc.function.name, toolArgs, {
                childId,
                depth: nextDepth,
                conversation
              });
            } catch (err) {
              toolResult = { ok: false, error: err.message };
            }
          }

          conversation.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.function.name,
            content: typeof toolResult === 'object' ? JSON.stringify(toolResult) : String(toolResult)
          });
        }

        executedRounds++;
      }

      if (emitChunk) {
        emitChunk({
          type: 'subagent_finish',
          ...chunkMeta,
          ok: true,
          totalToolCalls,
          executedRounds,
          summary: finalSummary
        });
      }

      return {
        ok: true,
        child_id: childId,
        mode,
        role,
        depth: nextDepth,
        rounds_executed: executedRounds,
        total_tool_calls: totalToolCalls,
        summary: finalSummary || '子智能体已完成调研与执行。'
      };
    } catch (err) {
      if (emitChunk) {
        emitChunk({
          type: 'subagent_finish',
          ...chunkMeta,
          ok: false,
          timed_out: timedOut,
          error: err.message
        });
      }
      const base = { child_id: childId, mode, role, depth: nextDepth, rounds_executed: executedRounds, total_tool_calls: totalToolCalls };
      if (timedOut) {
        return {
          ok: false,
          timed_out: true,
          ...base,
          summary: finalSummary || '',
          error: `子智能体执行超时 (${Math.round(timeoutMs / 1000)}s)，已返回截至超时的结论`
        };
      }
      return {
        ok: false,
        ...base,
        error: `子智能体执行异常: ${err.message}`
      };
    } finally {
      cleanup();
    }
  }

  /**
   * check_subagents tool body: snapshot or blocking wait for background tasks.
   */
  async checkSubagents({ sessionId, taskIds, wait = false, timeoutMs = 60000, signal } = {}) {
    const select = () => {
      let list = [...this.activeActivations.values()];
      if (sessionId) list = list.filter(a => a.sessionId === sessionId || a.sessionId === null);
      if (Array.isArray(taskIds) && taskIds.length > 0) {
        const wanted = new Set(taskIds);
        list = list.filter(a => wanted.has(a.taskId));
      }
      return list;
    };

    if (!wait) {
      return { ok: true, tasks: select().map(a => this._activationView(a)) };
    }

    const deadline = Date.now() + clampNumber(timeoutMs, 1000, 300000, 60000);
    let latest = select();
    while (Date.now() < deadline) {
      latest = select();
      if (!latest.some(a => a.status === 'running')) {
        return { ok: true, tasks: latest.map(a => this._activationView(a)) };
      }
      if (signal && signal.aborted) {
        return { ok: true, tasks: latest.map(a => this._activationView(a)), note: '等待已被中断，返回当前快照' };
      }
      await new Promise(r => setTimeout(r, 400));
    }
    return {
      ok: true,
      tasks: latest.map(a => this._activationView(a)),
      note: '等待超时，部分后台任务仍在运行，可稍后再次查询或带 wait 继续等待'
    };
  }

  _activationView(a) {
    const view = {
      task_id: a.taskId,
      role: a.role,
      mode: a.mode,
      status: a.status,
      started_at: a.startedAt,
      finished_at: a.finishedAt
    };
    const r = a.result;
    if (r) {
      if (r.ok) {
        view.ok = true;
        view.rounds_executed = r.rounds_executed;
        view.total_tool_calls = r.total_tool_calls;
        view.summary = r.summary || '';
      } else {
        view.ok = false;
        view.timed_out = !!r.timed_out;
        view.error = r.error || '';
        if (r.summary) view.summary = r.summary;
      }
    }
    return view;
  }

  /**
   * Reminder snapshot for runtime-context injection (next-turn system-reminder).
   */
  getReminderSnapshot(sessionId) {
    this._pruneActivations();
    const scope = sessionId || null;
    const list = [...this.activeActivations.values()]
      .filter(a => a.sessionId === scope || a.sessionId === null);
    if (list.length === 0) return [];
    return list.slice(-BACKGROUND_MAX_PER_SESSION).map(a => {
      const view = this._activationView(a);
      return {
        task_id: view.task_id,
        role: view.role,
        status: view.status,
        summary: view.summary ? String(view.summary).slice(0, 500) : '',
        error: view.error ? String(view.error).slice(0, 200) : '',
        timed_out: !!view.timed_out
      };
    });
  }

  _pruneActivations() {
    const now = Date.now();
    for (const [id, a] of this.activeActivations) {
      if (a.status !== 'running' && a.finishedAt && now - a.finishedAt > BACKGROUND_TTL_MS) {
        this.activeActivations.delete(id);
      }
    }
    // 会话内超出上限时优先淘汰最旧的已完结任务
    const bySession = new Map();
    for (const [id, a] of this.activeActivations) {
      const key = a.sessionId || null;
      if (!bySession.has(key)) bySession.set(key, []);
      bySession.get(key).push(a);
    }
    for (const list of bySession.values()) {
      const settled = list.filter(a => a.status !== 'running').sort((x, y) => x.finishedAt - y.finishedAt);
      let over = list.length - BACKGROUND_MAX_PER_SESSION;
      for (const a of settled) {
        if (over <= 0) break;
        this.activeActivations.delete(a.taskId);
        over--;
      }
    }
  }

  /**
   * Abort all running background activations (plugin dispose / app quit path).
   */
  disposeAll() {
    for (const a of this.activeActivations.values()) {
      if (a.status === 'running' && a.controller) {
        try { a.controller.abort(); } catch {}
      }
    }
  }
}

module.exports = {
  SUBAGENT_TOOL_DEFINITION,
  CHECK_SUBAGENTS_TOOL_DEFINITION,
  DEFAULT_MAX_DELEGATION_DEPTH,
  DEFAULT_SUBAGENT_MAX_ROUNDS,
  DEFAULT_CHILD_TIMEOUT_MS,
  SubagentManager
};
