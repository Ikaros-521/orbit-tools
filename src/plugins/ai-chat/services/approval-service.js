/* AI Chat - Approval Service
   Manages tool authorization requests, approval tiers (ask / auto / full),
   session-scoped alwaysAllow approvals, and pending approval promises. */

const { resolveToolPermission } = require('../agent-tools');

class ApprovalService {
  constructor() {
    this.pendingApprovals = new Map(); // `${streamId}::${toolCallId}` -> { resolve, toolName }
  }

  requestApproval(streamId, tc, emitChunk) {
    return new Promise(resolve => {
      const key = `${streamId}::${tc.id}`;
      this.pendingApprovals.set(key, { resolve, toolName: tc.function.name });
      if (typeof emitChunk === 'function') {
        emitChunk({
          type: 'tool_approval_request',
          toolId: tc.id,
          toolName: tc.function.name,
          args: tc.function.arguments
        });
      }
    });
  }

  resolveApproval({ streamId, toolCallId, approved, alwaysAllow }) {
    const key = `${streamId}::${toolCallId}`;
    const pending = this.pendingApprovals.get(key);
    if (!pending) {
      return { ok: false, error: '该审批请求已失效或已处理' };
    }
    this.pendingApprovals.delete(key);
    pending.resolve({ approved: !!approved, alwaysAllow: !!alwaysAllow });
    return { ok: true, toolName: pending.toolName };
  }

  denyPendingApprovals(streamId, reason = 'aborted') {
    for (const [key, pending] of [...this.pendingApprovals]) {
      if (key.startsWith(`${streamId}::`)) {
        this.pendingApprovals.delete(key);
        pending.resolve({ approved: false, reason });
      }
    }
  }

  denyAll() {
    for (const [, pending] of [...this.pendingApprovals]) {
      pending.resolve({ approved: false, reason: 'plugin_deactivated' });
    }
    this.pendingApprovals.clear();
  }

  checkPermission(agentApprovalMode, toolName, alwaysAllowTools = []) {
    return resolveToolPermission(agentApprovalMode, toolName, alwaysAllowTools);
  }
}

module.exports = ApprovalService;
