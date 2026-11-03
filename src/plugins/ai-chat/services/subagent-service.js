/* AI Chat - Subagent Manager & Hierarchy Service
   Inspired by deepseek-harness Subagent Architecture:
   - Unified SubagentActivation abstraction
   - Dual derivation mechanisms: Spawn (clean slate) vs Fork (snapshot clone)
   - Delegation depth guard (maxDepth) to prevent recursive runaway loops
   - Caller delivery (structured JSON/markdown result for parent tool call) */

const protocols = require('../protocols');
const { buildBoundedContext } = require('../lib/context-bounds');

const DEFAULT_MAX_DELEGATION_DEPTH = 2;
const DEFAULT_SUBAGENT_MAX_ROUNDS = 5;

const SUBAGENT_TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'dispatch_subagent',
    description: '派生专门的子智能体 (Subagent) 执行专项子任务或进行思维分叉探索。Spawn 为全新独立上下文（适合独立查阅文档、执行单测、排查异常），Fork 为继承当前上下文快照（适合对比 alternative 备选方案）。',
    parameters: {
      type: 'object',
      properties: {
        task_prompt: {
          type: 'string',
          description: '分配给子智能体的具体任务描述与目标'
        },
        mode: {
          type: 'string',
          enum: ['spawn', 'fork'],
          description: '派生模式：spawn (全新独立上下文，默认) / fork (继承当前对话快照进行思维分叉)'
        },
        role: {
          type: 'string',
          description: '子智能体角色（如：代码审查员、测试执行员、文献调研员）'
        },
        max_rounds: {
          type: 'number',
          description: '子智能体最大迭代轮次 (默认 4，上限 8)'
        }
      },
      required: ['task_prompt']
    }
  }
};

class SubagentManager {
  constructor({ maxDepth = DEFAULT_MAX_DELEGATION_DEPTH } = {}) {
    this.maxDepth = maxDepth;
    this.activeActivations = new Map(); // childId -> activation
  }

  /**
   * Checks whether the parent session is permitted to derive further subagents.
   */
  canDerive(parentSession) {
    const currentDepth = Number(parentSession?.delegationDepth) || 0;
    return currentDepth < this.maxDepth;
  }

  /**
   * Dispatches a subagent activation.
   *
   * @param {object} params
   * @param {object} params.parentSession - The calling session
   * @param {string} params.taskPrompt - Task instructions for subagent
   * @param {string} [params.mode='spawn'] - 'spawn' | 'fork'
   * @param {string} [params.role] - Subagent specialized persona/role
   * @param {number} [params.maxRounds=4] - Max execution rounds
   * @param {object} params.config - LLM connection configuration
   * @param {Array} params.availableTools - Filtered tool definitions for subagent
   * @param {Function} params.toolDispatcher - (name, args) => Promise<result>
   * @param {Function} [params.emitChunk] - Stream chunk emitter
   * @param {AbortSignal} [params.signal] - Cancellation signal
   */
  async runSubagent({
    parentSession,
    taskPrompt,
    mode = 'spawn',
    role = '专项研究员',
    maxRounds = DEFAULT_SUBAGENT_MAX_ROUNDS,
    config = {},
    availableTools = [],
    toolDispatcher,
    emitChunk,
    signal
  }) {
    const currentDepth = Number(parentSession?.delegationDepth) || 0;
    const nextDepth = currentDepth + 1;

    if (nextDepth > this.maxDepth) {
      return {
        ok: false,
        error: `已达到最大智能体派生深度限制 (当前深度: ${currentDepth}, 最大允许: ${this.maxDepth})，已阻断递归调用。`
      };
    }

    const childId = `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const boundedRounds = Math.max(1, Math.min(8, Number(maxRounds) || DEFAULT_SUBAGENT_MAX_ROUNDS));

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

    if (emitChunk) {
      emitChunk({
        type: 'subagent_start',
        childId,
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

    // Filter subagent tool definitions: do NOT allow recursive dispatch_subagent
    // to strictly enforce depth and avoid tool loop cycles
    const subagentToolDefs = availableTools.filter(
      t => t?.function?.name !== 'dispatch_subagent'
    );

    const baseOpts = {
      protocol: config.protocol || 'openai-chat',
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      apiKey: config.apiKey || '',
      model: config.model || 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 2048,
      enableReasoning: false
    };

    try {
      while (executedRounds < boundedRounds) {
        if (signal && signal.aborted) throw new Error('子智能体任务已中断');

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
        }, signal);

        finalSummary = roundContent;
        const validCalls = roundToolCalls.filter(tc => tc?.function?.name);

        if (validCalls.length === 0) {
          // Subagent decided to conclude without tools
          break;
        }

        totalToolCalls += validCalls.length;
        conversation.push({ role: 'assistant', content: roundContent || null, tool_calls: validCalls });

        // Execute subagent tool calls sequentially
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
              childId,
              round: executedRounds,
              toolName: tc.function.name,
              args: toolArgs
            });
          }

          let toolResult = { ok: false, error: '未定义执行器' };
          if (typeof toolDispatcher === 'function') {
            try {
              toolResult = await toolDispatcher(tc.function.name, toolArgs);
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
          childId,
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
          childId,
          ok: false,
          error: err.message
        });
      }
      return {
        ok: false,
        child_id: childId,
        error: `子智能体执行异常: ${err.message}`
      };
    }
  }
}

module.exports = {
  SUBAGENT_TOOL_DEFINITION,
  DEFAULT_MAX_DELEGATION_DEPTH,
  DEFAULT_SUBAGENT_MAX_ROUNDS,
  SubagentManager
};
