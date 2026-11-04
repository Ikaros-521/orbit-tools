/* AI Chat - Context Bounds & Tool Pairing Invariants
   Implements the toolPairingBalanced cut algorithm inspired by deepseek-harness.
   Guarantees that slicing conversation history never separates a tool_call
   from its corresponding tool result, completely eliminating orphaned tool messages
   and API protocol validation failures. */

/**
 * Checks whether cutting the message array at `cutIdx` leaves all tool calls
 * and tool results cleanly paired across the boundary.
 *
 * Invariant:
 * The retained tail (messages[cutIdx...end]) must NOT contain any 'tool' message
 * whose corresponding 'assistant' tool_call was cut off into the pruned head.
 * Nor should the pruned head leave unresolved dangling calls whose answers are in the tail.
 *
 * @param {Array} messages - Full conversation message list
 * @param {number} cutIdx - Candidate cut index (messages from cutIdx to end are kept)
 * @returns {boolean} True if the boundary is strictly balanced
 */
function toolPairingBalancedAt(messages, cutIdx) {
  if (!Array.isArray(messages) || messages.length === 0) return true;
  if (cutIdx <= 0 || cutIdx >= messages.length) return true;

  // Set of all tool_call_ids defined in the pruned head [0 ... cutIdx - 1]
  const headCallIds = new Set();
  const headResultIds = new Set();

  for (let i = 0; i < cutIdx; i++) {
    const m = messages[i];
    if (!m) continue;
    const calls = m.tool_calls || m.toolCalls;
    if (Array.isArray(calls)) {
      for (const tc of calls) {
        if (tc && tc.id) headCallIds.add(tc.id);
      }
    }
    if (m.role === 'tool' && m.tool_call_id) {
      headResultIds.add(m.tool_call_id);
    }
  }

  // Set of all tool_call_ids defined in the retained tail [cutIdx ... messages.length - 1]
  const tailResultIds = new Set();
  for (let i = cutIdx; i < messages.length; i++) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === 'tool' && m.tool_call_id) {
      tailResultIds.add(m.tool_call_id);
      // FATAL VIOLATION: Tail contains a tool result answering a call from the pruned head!
      if (headCallIds.has(m.tool_call_id)) {
        return false;
      }
    }
  }

  // If head has an initiated call whose result was pushed into the tail, it's unbalanced
  for (const tid of tailResultIds) {
    if (headCallIds.has(tid)) return false;
  }

  return true;
}

/**
 * Finds the nearest balanced cut index that satisfies toolPairingBalancedAt.
 * Given a target keep-count, searches backward from targetCutIdx towards the beginning
 * to include the entire turn, or forward if safe, avoiding any orphan tool_calls.
 *
 * @param {Array} messages - Message sequence
 * @param {number} maxKeepCount - Maximum number of message units to keep
 * @returns {number} Safe cut index in [0, messages.length]
 */
function findBalancedCutIndex(messages, maxKeepCount) {
  if (!Array.isArray(messages) || messages.length === 0) return 0;
  if (messages.length <= maxKeepCount) return 0;

  let candidateCut = messages.length - maxKeepCount;
  if (candidateCut <= 0) return 0;

  // Search backward towards 0 first to ensure we don't sever a tool chain
  for (let idx = candidateCut; idx >= 0; idx--) {
    // Also avoid cutting right in the middle of a user/assistant pair if possible
    if (toolPairingBalancedAt(messages, idx)) {
      // Prefer starting at a clean user turn or system turn rather than middle of tool execution
      const msg = messages[idx];
      if (idx === 0 || !msg || msg.role === 'user') {
        return idx;
      }
      // If idx is at an assistant message that has no tool_calls, that's also a valid point,
      // but user turn start is preferred
      if (msg.role !== 'tool') {
        return idx;
      }
    }
  }

  // If backward search failed to find a clean user boundary, search forward
  for (let idx = candidateCut + 1; idx < messages.length; idx++) {
    if (toolPairingBalancedAt(messages, idx) && messages[idx]?.role !== 'tool') {
      return idx;
    }
  }

  return 0; // Fallback: keep all rather than sending broken malformed context
}

/**
 * Builds a bounded context from message history with guaranteed tool pairing invariants.
 * Implements Display vs Model Context Surface Isolation (inspired by deepseek-harness):
 * - UI/Storage retains complete historical messages & attachments intact.
 * - Model View automatically folds away shadowed messages prior to the latest compaction divider,
 *   converting the divider into a high-density assistant checkpoint.
 * - Offloads bulky image payloads only for model inference without touching storage.
 *
 * @param {Array} messages - Raw messages from session
 * @param {number} maxContext - Max messages to include
 * @returns {Array} Clean array of messages safe for LLM API invocation
 */
function buildBoundedContext(messages, maxContext = 16) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const max = Math.max(2, Number(maxContext) || 16);

  // 1. Check for compaction divider cards (Display vs Model Surface isolation)
  let latestDividerIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && (m.role === 'compaction_divider' || m.type === 'compaction_checkpoint')) {
      latestDividerIdx = i;
      break;
    }
  }

  let activeSlice = [];
  if (latestDividerIdx >= 0) {
    const divider = messages[latestDividerIdx];
    const checkpointAssistantMsg = {
      role: 'assistant',
      content: divider.content || '### 📋 上下文压缩摘要\n(早期对话已提炼)'
    };
    const trailingMessages = messages.slice(latestDividerIdx + 1);

    if (trailingMessages.length > max) {
      const cutIdx = findBalancedCutIndex(trailingMessages, max);
      activeSlice = [checkpointAssistantMsg, ...trailingMessages.slice(cutIdx)];
    } else {
      activeSlice = [checkpointAssistantMsg, ...trailingMessages];
    }
  } else {
    if (messages.length <= max) {
      activeSlice = messages;
    } else {
      const cutIdx = findBalancedCutIndex(messages, max);
      activeSlice = messages.slice(cutIdx);
    }
  }

  // 2. Clone for inference & isolate image offloading for model
  let seenUserImgs = 0;
  const result = [];
  for (let i = activeSlice.length - 1; i >= 0; i--) {
    const m = activeSlice[i];
    let offloadImages = false;
    if (m && m.role === 'user' && Array.isArray(m.images) && m.images.length > 0) {
      seenUserImgs++;
      if (seenUserImgs > 2) {
        offloadImages = true;
      }
    }
    const cloned = cloneForInference(m, { offloadImages });
    if (cloned) result.unshift(cloned);
  }

  return result;
}

/**
 * Formats a single attachment item into a standard model-readable context block.
 *
 * @param {object} att - Attachment descriptor
 * @returns {string} Formatted context snippet
 */
function formatAttachmentContext(att) {
  if (!att) return '';
  if (att.type === 'file' || (!att.type && att.content !== undefined)) {
    return `### 附件文件: ${att.name || att.path}\n\`\`\`\n${att.content || ''}\n\`\`\``;
  }
  if (att.type === 'directory' || att.isDirectory) {
    return `### 附件文件夹目录: ${att.path || att.name}\n(已关联本地目录供分析与定位)`;
  }
  return '';
}

/**
 * Assembles user instruction text and attached files/folders into a coherent prompt.
 * If the raw content already contains the legacy context header, avoids duplicate assembly.
 *
 * @param {string} content - Raw user prompt/instruction
 * @param {Array} attachments - User-provided attachments
 * @returns {string} Fully assembled message content for LLM inference
 */
function assembleUserMessageContent(content, attachments) {
  const rawText = String(content || '').trim();
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return rawText;
  }

  const nonImgs = attachments.filter(a => a && (a.type === 'file' || a.type === 'directory' || (!a.type && a.content !== undefined)));
  if (nonImgs.length === 0) {
    return rawText;
  }

  // Idempotency: if already wrapped (e.g. legacy historical messages), return as is
  if (rawText.includes('[用户随附文件/目录上下文]:')) {
    return rawText;
  }

  const blocks = nonImgs.map(formatAttachmentContext).filter(Boolean);
  if (blocks.length === 0) {
    return rawText;
  }

  return `[用户随附文件/目录上下文]:\n${blocks.join('\n\n')}\n\n[用户指令]:\n${rawText || '请基于上述随附文件/目录进行分析。'}`;
}

/**
 * Clones a message object stripping non-standard internal fields
 * while preserving standard OpenAI/Claude/Responses properties.
 */
function cloneForInference(m, { offloadImages = false } = {}) {
  if (!m || typeof m !== 'object') return null;

  // Handle compaction divider card conversion
  if (m.role === 'compaction_divider' || m.type === 'compaction_checkpoint') {
    return {
      role: 'assistant',
      content: String(m.content || '')
    };
  }

  const toolCalls = m.tool_calls || m.toolCalls;

  if (m.role === 'tool') {
    return {
      role: 'tool',
      content: String(m.content || ''),
      tool_call_id: m.tool_call_id,
      ...(m.name ? { name: m.name } : {})
    };
  }

  if (m.role === 'assistant') {
    const res = {
      role: 'assistant',
      content: m.content || ''
    };
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      res.tool_calls = toolCalls.map(tc => ({
        id: tc.id,
        type: tc.type || 'function',
        function: {
          name: tc.function?.name || '',
          arguments: typeof tc.function?.arguments === 'string'
            ? tc.function.arguments
            : JSON.stringify(tc.function?.arguments || {})
        }
      }));
    }
    return res;
  }

  // Plain / user / system
  let userContent = String(m.content || '');
  if ((m.role === 'user' || !m.role) && Array.isArray(m.attachments) && m.attachments.length > 0) {
    userContent = assembleUserMessageContent(userContent, m.attachments);
  }

  const plain = {
    role: m.role || 'user',
    content: userContent
  };

  if (Array.isArray(m.images) && m.images.length > 0) {
    if (offloadImages) {
      const note = `\n[📷 历史多模态图片 (${m.images.length}张): 早期轮次已完成解析，当前推理已自动卸载以保护上下文]`;
      plain.content = (plain.content ? plain.content + note : note).trim();
    } else {
      plain.images = m.images;
    }
  }

  return plain;
}

/**
 * Surface Folding for LLM Inference:
 * In the model view, folds away older intermediate superseded tool steps
 * while leaving human/audit timeline untouched.
 */
function foldSurfaceForModel(messages) {
  if (!Array.isArray(messages)) return [];
  // For now return inference-ready cloned messages
  return messages.map(cloneForInference).filter(Boolean);
}

module.exports = {
  toolPairingBalancedAt,
  findBalancedCutIndex,
  buildBoundedContext,
  cloneForInference,
  foldSurfaceForModel,
  formatAttachmentContext,
  assembleUserMessageContent
};
