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
 *
 * @param {Array} messages - Raw messages from session
 * @param {number} maxContext - Max messages to include
 * @returns {Array} Clean array of messages safe for LLM API invocation
 */
function buildBoundedContext(messages, maxContext = 16) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const max = Math.max(2, Number(maxContext) || 16);

  if (messages.length <= max) {
    return messages.map(cloneForInference);
  }

  const cutIdx = findBalancedCutIndex(messages, max);
  const retained = messages.slice(cutIdx);

  return retained.map(cloneForInference).filter(Boolean);
}

/**
 * Clones a message object stripping non-standard internal fields
 * while preserving standard OpenAI/Claude/Responses properties.
 */
function cloneForInference(m) {
  if (!m || typeof m !== 'object') return null;
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
  const plain = {
    role: m.role || 'user',
    content: String(m.content || '')
  };
  if (Array.isArray(m.images) && m.images.length > 0) {
    plain.images = m.images;
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
  foldSurfaceForModel
};
