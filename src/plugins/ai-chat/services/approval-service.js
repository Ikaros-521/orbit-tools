/* AI Chat - Approval Service
   Manages tool authorization requests, approval tiers (ask / auto / full),
   session-scoped alwaysAllow approvals, and pending approval promises. */

const { resolveToolPermission } = require('../agent-tools');

class ApprovalService {
  constructor() {
    this.pendingApprovals = new Map(); // `${streamId}::${toolCallId}` -> { resolve, toolName }
  }

  requestApproval(streamId, tc, emitChunk, signal) {
    return new Promise(resolve => {
      // 已中断的流直接拒绝：此刻挂起的审批永远不会有人决议
      if (signal && signal.aborted) {
        resolve({ approved: false, reason: 'aborted' });
        return;
      }
      const key = `${streamId}::${tc.id}`;
      const settle = (value) => {
        this.pendingApprovals.delete(key);
        if (onAbort && signal) signal.removeEventListener('abort', onAbort);
        resolve(value);
      };
      // denyPendingApprovals 是一次性快照清扫；若本请求在清扫之后才挂起
      // （worker 仍在收尾），没有这个 abort 监听它将永久 pending 并卡死
      // agent 循环 —— fail-closed。
      const onAbort = () => settle({ approved: false, reason: 'aborted' });
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      this.pendingApprovals.set(key, { resolve: settle, toolName: tc.function.name });
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
