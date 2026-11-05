/* AI Chat - Three-Stage Tool Execution Pipeline & Concurrency Scheduler
   Inspired by deepseek-harness ToolExecutionPipeline:
   1. Pre-Execute: Argument validation, sandbox policy, interactive Ask & Approval
   2. Execute: Execution body with AbortSignal binding & fail-closed safety
   3. Post-Execute: Standardization, budget clipping, and event broadcasting
   Includes a static concurrency classifier (isConcurrencySafe) & limited parallel pool. */

const TOOL_RESULT_CONTEXT_BUDGET = 24 * 1024;

/**
 * Static Concurrency Whitelist:
 * Tools known to be purely read-only and free of side-effects.
 * These can safely run concurrently in the parallel pool.
 */
const CONCURRENCY_SAFE_TOOLS = new Set([
  'list_dir',
  'read_file',
  'grep_search',
  'search_files',
  'get_current_time',
  'list_workflows',
  'list_skills',
  'read_skill',
  'list_open_source_skills',
  'memory_search',
  'memory_list',
  'list_available_ai_ides'
]);

/**
 * Determines whether a tool call can be executed concurrently.
 * Implements the Fail-Closed principle:
 * Any unknown, dynamic MCP, or mutating tool strictly evaluates to false (exclusive).
 *
 * @param {string} toolName
 * @param {object} [args]
 * @returns {boolean}
 */
function isConcurrencySafe(toolName, args) {
  if (!toolName || typeof toolName !== 'string') return false;
  return CONCURRENCY_SAFE_TOOLS.has(toolName);
}

/**
 * Head-Middle-Tail pruning inspired by deepseek-harness ToolResultPruner.
 * Preserves the beginning (context & setup) and the end (status, exit code, summary),
 * replacing the bloated middle with a structured omission marker.
 */
function pruneTextContent(s, { threshold = 8000, headChars = 2000, tailChars = 2000 } = {}) {
  const str = typeof s === 'object' ? JSON.stringify(s) : String(s ?? '');
  if (str.length <= threshold) return str;
  if (headChars + tailChars >= str.length) return str;

  const head = str.slice(0, headChars);
  const tail = str.slice(str.length - tailChars);
  const prunedCount = str.length - headChars - tailChars;
  return `${head}\n\n[... 工具结果过长，已省略中间 ${prunedCount} 字符以保护上下文 ...]\n\n${tail}`;
}

/**
 * Truncates oversized tool results to protect LLM context windows.
 * Upgraded with Head-Middle-Tail pruning to retain critical trailing exit codes/status.
 */
function clipToolContent(s, budget = TOOL_RESULT_CONTEXT_BUDGET) {
  const str = typeof s === 'object' ? JSON.stringify(s) : String(s ?? '');
  if (str.length <= budget) return str;

  const headChars = Math.floor(budget * 0.45);
  const tailChars = Math.floor(budget * 0.45);
  return pruneTextContent(str, { threshold: budget, headChars, tailChars });
}

class ToolExecutionPipeline {
  constructor({ maxConcurrency = 4 } = {}) {
    this.maxConcurrency = Math.max(1, Math.min(8, Number(maxConcurrency) || 4));
  }

  /**
   * Stage 1: Pre-Execute
   * Validates arguments, checks permissions, and requests user approval if required.
   */
  async preExecute(tc, { approvalService, agentApprovalMode, session, streamId, emitChunk, signal }) {
    const toolName = tc?.function?.name || '';
    const rawArgs = tc?.function?.arguments;

    let parsedArgs = {};
    try {
      parsedArgs = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs || {});
    } catch (parseErr) {
      return {
        ok: false,
        approved: false,
        error: `参数格式错误 (JSON Parse Error): ${parseErr.message}`,
        parsedArgs: {}
      };
    }

    const permission = approvalService.checkPermission(
      agentApprovalMode,
      toolName,
      session?.alwaysAllowTools
    );

    if (permission === 'ask') {
      // 流已中止就不再进入审批等待：一次性清扫结束后新挂起的审批
      // 无人决议，会把整条 dispatchBatch 永久吊死。
      if (signal && signal.aborted) {
        const abortErr = new Error('已中断生成');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      const decision = await approvalService.requestApproval(streamId, tc, emitChunk, signal);
      if (decision.approved && decision.alwaysAllow && session) {
        session.alwaysAllowTools = Array.from(new Set([...(session.alwaysAllowTools || []), toolName]));
      }
      if (!decision.approved && decision.reason === 'aborted') {
        const abortErr = new Error('已中断生成');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      return {
        ok: true,
        approved: !!decision.approved,
        asked: true,
        parsedArgs
      };
    }

    return {
      ok: true,
      approved: true,
      asked: false,
      parsedArgs
    };
  }

  /**
   * Stage 2: Execute
   * Executes the resolved tool body via the dispatcher function.
   */
  async execute(tc, parsedArgs, dispatchFn, { signal }) {
    if (signal && signal.aborted) {
      const abortErr = new Error('已中断生成');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    try {
      return await dispatchFn(tc.function.name, parsedArgs);
    } catch (err) {
      return { ok: false, error: `工具执行异常: ${err.message}` };
    }
  }

  /**
   * Stage 3: Post-Execute
   * Standardizes result formatting, enforces context budget clipping,
   * and broadcasts output chunks to UI/stream listeners.
   */
  postExecute(tc, rawResult, { approved, asked, emitChunk }) {
    const toolName = tc?.function?.name || '';
    const toolId = tc?.id;

    let result = rawResult;
    if (!approved) {
      result = { ok: false, denied: true, error: '用户拒绝执行该工具调用，请改用纯文本回答或调整方案' };
    }

    if (emitChunk) {
      emitChunk({ type: 'tool_approval_result', toolId, approved, asked });
      emitChunk({ type: 'tool_result', toolId, toolName, result });
    }

    const toolBodyString = typeof result === 'object' ? JSON.stringify(result) : String(result);
    const clippedBody = clipToolContent(toolBodyString);

    return {
      rawResult: result,
      serialized: toolBodyString,
      clippedForContext: clippedBody
    };
  }

  /**
   * Dispatches a batch of tool calls using static concurrency classification.
   * Concurrency-safe calls execute in parallel pools (up to maxConcurrency);
   * mutating or high-risk calls execute strictly sequentially (Fail-Closed).
   *
   * @param {Array} toolCalls - The tool calls requested by the model
   * @param {Function} dispatchFn - (toolName, parsedArgs) => Promise<result>
   * @param {object} context - Execution context, approvalService, session, etc.
   * @returns {Promise<Array<{ tc, preResult, postResult }>>}
   */
  async dispatchBatch(toolCalls, dispatchFn, context) {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return [];
    const results = new Array(toolCalls.length);

    // Group items into segments of (parallel batch) vs (exclusive item)
    let currentParallelGroup = [];

    const flushParallelGroup = async () => {
      if (currentParallelGroup.length === 0) return;
      const group = currentParallelGroup;
      currentParallelGroup = [];

      // Execute group with concurrency limit
      let nextIdx = 0;
      const worker = async () => {
        while (nextIdx < group.length) {
          const item = group[nextIdx++];
          results[item.origIndex] = await this._runSingle(item.tc, dispatchFn, context);
        }
      };

      const workerCount = Math.min(this.maxConcurrency, group.length);
      const workers = [];
      for (let w = 0; w < workerCount; w++) {
        workers.push(worker());
      }
      await Promise.all(workers);
    };

    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      const safe = isConcurrencySafe(tc?.function?.name);

      if (safe) {
        currentParallelGroup.push({ tc, origIndex: i });
      } else {
        // Must flush pending parallel items first to preserve execution ordering
        await flushParallelGroup();
        // Execute exclusive item sequentially
        results[i] = await this._runSingle(tc, dispatchFn, context);
      }
    }

    await flushParallelGroup();
    return results;
  }

  /**
   * Internal helper running a single tool call through the 3 stages.
   */
  async _runSingle(tc, dispatchFn, context) {
    const { approvalService, agentApprovalMode, session, streamId, emitChunk, signal } = context;

    // 1. Pre-Execute
    const preResult = await this.preExecute(tc, {
      approvalService,
      agentApprovalMode,
      session,
      streamId,
      emitChunk,
      signal
    });

    if (!preResult.approved) {
      const postResult = this.postExecute(tc, null, {
        approved: false,
        asked: preResult.asked,
        emitChunk
      });
      return { tc, preResult, postResult };
    }

    // 2. Execute
    const rawResult = await this.execute(tc, preResult.parsedArgs, dispatchFn, { signal });

    // 3. Post-Execute
    const postResult = this.postExecute(tc, rawResult, {
      approved: true,
      asked: preResult.asked,
      emitChunk
    });

    return { tc, preResult, postResult };
  }
}

module.exports = {
  CONCURRENCY_SAFE_TOOLS,
  isConcurrencySafe,
  clipToolContent,
  pruneTextContent,
  ToolExecutionPipeline
};
