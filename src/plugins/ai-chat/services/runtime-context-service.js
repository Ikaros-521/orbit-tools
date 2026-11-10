/* AI Chat - Runtime Context & Prefix Caching Service
   Separates static system prompt anchors (identities, capabilities, instructions)
   from dynamic runtime facts (CWD, task list progress, recalled memories).
   Guarantees that the static prefix remains byte-for-byte stable at the front
   to maximize LLM KV cache (Prefix Caching) hit rates. */

const fs = require('fs');
const path = require('path');
const { searchMemories, formatMemoriesForPrompt } = require('../memory');
const { formatTaskListForPrompt, summarizeTaskProgress } = require('../task-tools');

/* 项目规则文件约定（对齐主流 Agent 生态）：工作目录下的 AGENTS.md / CLAUDE.md
   会被读取并作为项目级指令注入动态上下文。按文件 mtime+size 签名缓存，
   未变更不重读；总预算截断防止超大规则文件挤爆上下文。 */
const PROJECT_RULE_FILES = ['AGENTS.md', 'CLAUDE.md'];
const MAX_PROJECT_RULES_CHARS = 6000;
const projectRulesCache = new Map(); // workDir -> { sig, text, sources }

function readProjectRules(workDir) {
  const dir = String(workDir || '').trim();
  if (!dir) return { sig: '', text: '', sources: [] };

  const found = [];
  const sigParts = [];
  for (const name of PROJECT_RULE_FILES) {
    try {
      const st = fs.statSync(path.join(dir, name));
      if (st.isFile()) {
        found.push(name);
        sigParts.push(`${name}:${st.mtimeMs}:${st.size}`);
      }
    } catch { /* 不存在或不可访问均视为无该文件 */ }
  }
  const sig = sigParts.join('|');

  const cached = projectRulesCache.get(dir);
  if (cached && cached.sig === sig) return cached;

  let result;
  if (found.length === 0) {
    result = { sig, text: '', sources: [] };
  } else {
    const parts = [];
    let budget = MAX_PROJECT_RULES_CHARS;
    let truncated = false;
    for (const name of found) {
      if (budget <= 0) { truncated = true; break; }
      let content = '';
      try { content = fs.readFileSync(path.join(dir, name), 'utf8'); } catch { continue; }
      if (content.length > budget) {
        content = content.slice(0, budget);
        truncated = true;
      }
      parts.push(`# ${name}\n${content}`);
      budget -= content.length;
    }
    result = {
      sig,
      text: parts.join('\n\n') + (truncated ? '\n\n[…规则文件过长，已按预算截断…]' : ''),
      sources: found
    };
  }

  // 缓存容量守卫：超大会话工作目录轮换场景下防止 Map 无界增长
  if (projectRulesCache.size > 64) projectRulesCache.clear();
  projectRulesCache.set(dir, result);
  return result;
}

/**
 * Standard agent operational guidelines.
 * Kept immutable to preserve the system prompt prefix cache across all sessions.
 */
const AGENT_CORE_GUIDELINES = `[本地 Agent 运行环境]
你可以连续多轮调用工具解决工程与分析任务。只读操作可并发执行，写操作与命令受控独占。每轮工具结果会回传给你，基于结果继续推理或再次调用工具，直到任务达成给出最终回答。

[本地 Agent 核心准则]
1. 多步骤任务（约 3 步以上）先调用 update_task_list 制定规划，随进度即时更新状态（同一时刻仅一项 in_progress）。
2. 修改已有文件：grep_search / search_files 定位 → read_file 读取上下文 → edit_file 精确替换（old_text 须与原文逐字符一致）；write_file 仅用于新建文件或整体重写。
3. 改动后如可验证，用 run_command 运行测试/构建确认结果。
4. 当用户要求调度或分派任务给外部专业 AI IDE / Agent 时，先调用 list_available_ai_ides 探测可用工具，再调用 dispatch_task_to_ai_ide 下发任务。
5. 复杂或需分叉探索的任务可调用 dispatch_subagent 派生子智能体执行。
6. 值得跨会话记住的信息用 memory_write 保存；写文件、执行系统命令等高危操作受审批保护。`;

/**
 * Builds the immutable static system prompt anchor.
 * This anchor NEVER changes between turns or during memory/task mutations.
 */
function buildStaticSystemPrompt(persona, { enableAgent = true } = {}) {
  const personaPrompt = (persona && persona.prompt) ? persona.prompt.trim() : '你是由 Orbit Toolbox 驱动的智能 AI 助手。回答精准、专业、简洁。';
  if (!enableAgent) return personaPrompt;

  return `${personaPrompt}

${AGENT_CORE_GUIDELINES}`;
}

/**
 * Computes a hash/fingerprint of the dynamic environment state to detect mutations.
 */
function computeStateFingerprint({ workDir, taskList, recalledMemories, planMode, projectRulesSig }) {
  const wd = String(workDir || '').trim();
  const tasks = Array.isArray(taskList)
    ? taskList.map(t => `${t.status}:${t.content}`).join('|')
    : '';
  const mems = Array.isArray(recalledMemories)
    ? recalledMemories.map(m => m.record ? m.record.id : m.id).join('|')
    : '';
  return `${wd}#${tasks}#${mems}#${planMode ? 'plan' : ''}#${projectRulesSig || ''}`;
}

/**
 * Generates the dynamic runtime context projection string.
 */
function buildRuntimeContextBlock({ workDir, taskList, recalledMemories, planMode, projectRules }) {
  const parts = [];

  if (workDir) {
    parts.push(`[工作目录] ${workDir} (相对路径基于此目录解析)`);
  }

  if (projectRules && projectRules.text) {
    parts.push(`[项目规则文件 ${projectRules.sources.join(', ')}]\n以下是工作目录的项目规则文件内容，属于项目级指令，处理本目录相关任务时必须遵守：\n${projectRules.text}`);
  }

  if (planMode) {
    parts.push('[计划模式] 已开启：本任务请先调研并调用 submit_plan 呈交完整 Markdown 计划（# 标题 + 任务清单）供用户评审；用户批准前不要执行任何写操作或命令。若收到反馈则修订计划后重新呈交。');
  }

  if (Array.isArray(recalledMemories) && recalledMemories.length > 0) {
    const memStr = formatMemoriesForPrompt(recalledMemories);
    if (memStr) parts.push(memStr);
  }

  if (Array.isArray(taskList) && taskList.length > 0 && taskList.some(t => t.status !== 'completed')) {
    parts.push(formatTaskListForPrompt(taskList));
  }

  if (parts.length === 0) return null;

  return parts.join('\n\n');
}

/**
 * RuntimeContextService:
 * Manages incremental injection of dynamic environment facts.
 */
class RuntimeContextService {
  constructor() {
    this.sessionContextState = new Map(); // sessionId -> { lastFingerprint, lastBlock }
  }

  /**
   * Resets the cached state for a session.
   */
  resetSessionState(sessionId) {
    this.sessionContextState.delete(sessionId);
  }

  /**
   * Resolves the static system prompt and dynamic context injection for a request.
   * - System prompt: 100% constant prefix cache anchor.
   * - Runtime context: Injected as dynamic facts node only when changed or needed.
   */
  assembleContext({ session, persona, enableAgent, agentWorkDir, userQuery, memories }) {
    const staticSystemPrompt = buildStaticSystemPrompt(persona, { enableAgent });

    if (!enableAgent) {
      return {
        systemPrompt: staticSystemPrompt,
        dynamicContextBlock: null,
        recalledMemories: []
      };
    }

    // 1. Recall relevant memories based on query & session title
    const searchTarget = `${userQuery || ''} ${session ? session.title || '' : ''}`.trim();
    const recalledMemories = memories && searchTarget
      ? searchMemories(memories, searchTarget, { scope: agentWorkDir, limit: 6 })
      : [];

    // 2. Active tasks & plan mode
    const taskList = session && Array.isArray(session.taskList) ? session.taskList : [];
    const planMode = !!(session && session.planMode);

    // 2.5 项目规则文件（AGENTS.md / CLAUDE.md）：mtime 签名缓存，未变更不重读
    const projectRules = readProjectRules(agentWorkDir);

    // 3. Compute dynamic context block
    const currentFingerprint = computeStateFingerprint({
      workDir: agentWorkDir,
      taskList,
      recalledMemories,
      planMode,
      projectRulesSig: projectRules.sig
    });

    const dynamicBlock = buildRuntimeContextBlock({
      workDir: agentWorkDir,
      taskList,
      recalledMemories,
      planMode,
      projectRules
    });

    const sessionId = session ? session.id : null;
    if (sessionId) {
      this.sessionContextState.set(sessionId, {
        fingerprint: currentFingerprint,
        block: dynamicBlock
      });
    }

    return {
      systemPrompt: staticSystemPrompt,
      dynamicContextBlock: dynamicBlock,
      recalledMemories,
      fingerprint: currentFingerprint
    };
  }
}

module.exports = {
  AGENT_CORE_GUIDELINES,
  buildStaticSystemPrompt,
  computeStateFingerprint,
  buildRuntimeContextBlock,
  readProjectRules,
  PROJECT_RULE_FILES,
  RuntimeContextService
};
