/* Orbit AI Chat - Context Compaction Service
   Calculates active context window tokens, and compacts lengthy conversation
   histories into structured, high-density checkpoint summaries. */

const protocols = require('../protocols');

class CompactionService {
  /**
   * Calculates the active context tokens currently occupied in the model's window.
   * If the latest assistant message has usage stats, uses its promptTokens + completionTokens;
   * otherwise estimates based on message content length (~3.2 chars per token).
   */
  calculateContextTokens(session, { enableAgent = true } = {}) {
    if (!session || !Array.isArray(session.messages) || session.messages.length === 0) {
      return 0;
    }

    const msgs = session.messages;
    let lastAsstWithUsageIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant' && msgs[i].usage && (typeof msgs[i].usage.contextTokens === 'number' || typeof msgs[i].usage.promptTokens === 'number')) {
        lastAsstWithUsageIdx = i;
        break;
      }
    }

    if (lastAsstWithUsageIdx !== -1) {
      const baseUsage = msgs[lastAsstWithUsageIdx].usage;
      const baseTokens = (typeof baseUsage.contextTokens === 'number')
        ? baseUsage.contextTokens
        : ((baseUsage.promptTokens || 0) + (baseUsage.completionTokens || 0));
      let trailingChars = 0;
      for (let i = lastAsstWithUsageIdx + 1; i < msgs.length; i++) {
        trailingChars += String(msgs[i].content || '').length;
      }
      return baseTokens + Math.ceil(trailingChars / 3.2);
    }

    // Heuristic estimation if no API usage recorded yet
    let totalChars = 0;
    for (const m of msgs) {
      totalChars += String(m.content || '').length;
    }
    // Include approximate system prompt overhead (~350) + agent tools overhead (~1450) when enabled
    const baseOverhead = enableAgent ? 1800 : 350;
    return Math.max(150, Math.ceil(totalChars / 3.2) + baseOverhead);
  }

  /**
   * Compacts the historical messages of a session into a high-density summary checkpoint.
   */
  async compactSession(session, { config = {}, getPersona = () => null, genId = () => `msg_${Date.now()}` } = {}) {
    if (!session || !Array.isArray(session.messages) || session.messages.length < 2) {
      return { ok: false, error: '当前会话历史较短，无需压缩' };
    }

    const allMsgs = session.messages.filter(m => m.role === 'user' || m.role === 'assistant');
    if (allMsgs.length < 2) {
      return { ok: false, error: '没有足够的多轮对话可供压缩' };
    }

    // Preserve the latest 1-2 messages intact to maintain conversational continuity
    const keepCount = allMsgs.length > 3 ? 2 : 1;
    const olderMsgs = allMsgs.slice(0, allMsgs.length - keepCount);
    const recentMsgs = allMsgs.slice(allMsgs.length - keepCount);

    if (olderMsgs.length === 0) {
      return { ok: false, error: '没有需要压缩的早期历史记录' };
    }

    // Build transcript for compression
    const transcriptLines = [];
    for (const m of olderMsgs) {
      const roleName = m.role === 'user' ? '用户' : '助手';
      const content = String(m.content || '').trim();
      transcriptLines.push(`[${roleName}]: ${content}`);
    }
    const transcriptText = transcriptLines.join('\n\n');

    const prompt = `请对以下历史对话内容进行高密度压缩提炼：\n\n${transcriptText}`;

    const systemPrompt = `你是一个专业的对话上下文压缩引擎。你的任务是将早期对话提炼为结构化的高密度知识摘要。
要求：
1. 提取核心事实、用户主要意图与技术背景；
2. 记录已修改/已创建的文件、运行的关键命令及结论；
3. 保留关键的技术决策与未完成的待办事项；
4. 输出结构清晰的 Markdown 摘要，去除寒暄和冗余对话；
5. 必须使用中文输出，以「### 📋 上下文压缩摘要」作为标题开头。`;

    let summaryText = '';
    try {
      const model = config.model || 'gpt-4o-mini';
      const res = await protocols.syncCompletion({
        protocol: config.protocol || 'openai-chat',
        baseUrl: config.baseUrl || 'https://api.openai.com/v1',
        apiKey: config.apiKey || '',
        model,
        temperature: 0.3,
        maxTokens: 2048,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ]
      });

      if (res && res.text && res.text.trim()) {
        summaryText = res.text.trim();
      }
    } catch (err) {
      // Graceful fallback to offline rule-based condensation if LLM call fails
      summaryText = this.buildOfflineSummary(olderMsgs);
    }

    if (!summaryText) {
      summaryText = this.buildOfflineSummary(olderMsgs);
    }

    const compactedMsg = {
      id: genId('msg'),
      role: 'assistant',
      content: summaryText,
      isCompacted: true,
      createdAt: Date.now()
    };

    // Replace session messages
    session.messages = [compactedMsg, ...recentMsgs];
    session.updatedAt = Date.now();

    return {
      ok: true,
      session,
      compactedCount: olderMsgs.length,
      summary: summaryText,
      remainingMessagesCount: session.messages.length
    };
  }

  buildOfflineSummary(olderMsgs) {
    const lines = [
      '### 📋 上下文压缩摘要（本地提炼）',
      `*已对前 ${olderMsgs.length} 条早期对话记录进行精简提炼：*`,
      ''
    ];
    for (const m of olderMsgs) {
      const role = m.role === 'user' ? '用户' : '助手';
      const clean = String(m.content || '').replace(/\s+/g, ' ').trim();
      const snippet = clean.length > 120 ? clean.slice(0, 120) + '…' : clean;
      lines.push(`- **${role}**: ${snippet}`);
    }
    return lines.join('\n');
  }
}

const compactionService = new CompactionService();

module.exports = {
  CompactionService,
  compactionService
};
