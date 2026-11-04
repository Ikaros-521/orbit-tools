/* AI Chat - Plan Review Service (lightweight plan mode)
   Mirrors the ApprovalService suspension pattern (deepseek-harness user
   interaction seam): submit_plan suspends the agent loop until the user
   approves the plan (converted into the session task list) or sends it back
   for revision with feedback. Any abort/stream end fails closed. */

class PlanReviewService {
  constructor() {
    this.pendingReviews = new Map(); // `${streamId}::${planId}` -> { resolve, markdown }
  }

  requestPlanReview(streamId, markdown, emitChunk) {
    return new Promise(resolve => {
      const planId = `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const key = `${streamId}::${planId}`;
      this.pendingReviews.set(key, { resolve, markdown });
      if (typeof emitChunk === 'function') {
        emitChunk({ type: 'plan_review_request', planId, markdown });
      }
    });
  }

  resolvePlanReview({ streamId, planId, approved, feedback }) {
    const key = `${streamId}::${planId}`;
    const pending = this.pendingReviews.get(key);
    if (!pending) {
      return { ok: false, error: '该计划评审已失效或已处理' };
    }
    this.pendingReviews.delete(key);
    pending.resolve({
      approved: !!approved,
      feedback: String(feedback || '').trim(),
      reason: 'user'
    });
    return { ok: true };
  }

  denyPendingReviews(streamId, reason = 'aborted') {
    for (const [key, pending] of [...this.pendingReviews]) {
      if (key.startsWith(`${streamId}::`)) {
        this.pendingReviews.delete(key);
        pending.resolve({ approved: false, feedback: '', reason });
      }
    }
  }

  denyAll() {
    for (const [, pending] of [...this.pendingReviews]) {
      pending.resolve({ approved: false, feedback: '', reason: 'plugin_deactivated' });
    }
    this.pendingReviews.clear();
  }
}

module.exports = PlanReviewService;
