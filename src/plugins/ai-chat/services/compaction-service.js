/* Orbit AI Chat - Context Compaction Service
   Inspired by deepseek-harness context compaction & tool result pruner:
   1. Deterministic Head-Middle-Tail tool-result pruner (model-free token saving)
   2. Multimodal image offloader for historical messages
   3. Tool-pairing invariant preserved cut boundaries (zero orphan tool calls)
   4. Mutual-exclusion compaction transaction lock
   5. High-density checkpoint summary generation with graceful offline fallback */

const protocols = require('../protocols');
const { toolPairingBalancedAt, findBalancedCutIndex, assembleUserMessageContent } = require('../lib/context-bounds');
const { pruneTextContent } = require('./tool-pipeline');

class CompactionService {
  constructor() {
    this.compactionLocks = new Set(); // sessionId -> active compaction transaction
  }

  /**
   * Checks whether a session is currently undergoing compaction.
   */
  isCompacting(sessionId) {
    return this.compactionLocks.has(sessionId);
  }

  /**
   * Calculates the active context tokens currently occupied in the model's window.
   * Display vs Model Surface Isolation:
   * If the session contains compaction divider cards, only the active context window
   * (from the latest compaction divider onwards) is counted towards the model window.
   */
  calculateContextTokens(session, { enableAgent = true } = {}) {
    if (!session || !Array.isArray(session.messages) || session.messages.length === 0) {
      return 0;
    }

    // Find the latest compaction divider card index
    let startIdx = 0;
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const m = session.messages[i];
      if (m && (m.role === 'compaction_divider' || m.type === 'compaction_checkpoint')) {
        startIdx = i;
        break;
      }
    }

    const msgs = session.messages.slice(startIdx);
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
        const m = msgs[i];
        const fullText = (m && m.role === 'user' && Array.isArray(m.attachments) && m.attachments.length > 0)
          ? assembleUserMessageContent(m.content, m.attachments)
          : String(m?.content || '');
        trailingChars += fullText.length;
      }
      return baseTokens + Math.ceil(trailingChars / 3.2);
    }

    // Heuristic estimation if no API usage recorded yet
    let totalChars = 0;
    for (const m of msgs) {
      const fullText = (m && m.role === 'user' && Array.isArray(m.attachments) && m.attachments.length > 0)
        ? assembleUserMessageContent(m.content, m.attachments)
        : String(m?.content || '');
      totalChars += fullText.length;
    }
    // Include approximate system prompt overhead (~350) + agent tools overhead (~1450) when enabled
    const baseOverhead = enableAgent ? 1800 : 350;
    return Math.max(150, Math.ceil(totalChars / 3.2) + baseOverhead);
  }

  /**
   * Deterministic Model-Free Tool-Result Pruning (deepseek-harness ToolResultPruner).
   * Scans historical tool messages and trims bloated middles using head/tail preservation.
   * This is zero-cost and preserves exit codes, command summaries, and final results.
   *
   * @param {object} session
   * @param {object} options
   * @returns {{ ok: boolean, prunedCount: number, savedChars: number }}
   */
  pruneSessionToolResults(session, { threshold = 6000, headChars = 1500, tailChars = 1500 } = {}) {
    if (!session || !Array.isArray(session.messages) || session.messages.length === 0) {
      return { ok: true, prunedCount: 0, savedChars: 0 };
    }

    let prunedCount = 0;
    let savedChars = 0;

    for (const m of session.messages) {
      if (!m) continue;

      // 1. Standalone tool messages
      if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > threshold) {
        const origLen = m.content.length;
        m.content = pruneTextContent(m.content, { threshold, headChars, tailChars });
        const diff = origLen - m.content.length;
        if (diff > 0) {
          prunedCount++;
          savedChars += diff;
        }
      }

      // 2. Assistant messages with attached toolResults mapping
      if (m.role === 'assistant' && m.toolResults && typeof m.toolResults === 'object') {
        for (const [callId, res] of Object.entries(m.toolResults)) {
          const bodyStr = typeof res === 'object' ? JSON.stringify(res) : String(res ?? '');
          if (bodyStr.length > threshold) {
            const prunedBody = pruneTextContent(bodyStr, { threshold, headChars, tailChars });
            const diff = bodyStr.length - prunedBody.length;
            if (diff > 0) {
              m.toolResults[callId] = prunedBody;
              prunedCount++;
              savedChars += diff;
            }
          }
        }
      }
    }

    return { ok: true, prunedCount, savedChars };
  }

  /**
   * Historical Multimodal Image Offloading (deepseek-harness compaction-image-offload).
   * Identifies older images to offload during model inference.
   * NOTE: The stored message.images array is NEVER mutated, ensuring human UI viewing
   * and lightbox zoom remain 100% intact (Display vs Model Surface Isolation).
   *
   * @param {object} session
   * @param {object} options
   * @returns {{ ok: boolean, offloadedCount: number }}
   */
  offloadSessionImages(session, { keepRecentRounds = 2 } = {}) {
    if (!session || !Array.isArray(session.messages) || session.messages.length === 0) {
      return { ok: true, offloadedCount: 0 };
    }

    const userImgIndices = [];
    session.messages.forEach((m, idx) => {
      if (m && m.role === 'user' && Array.isArray(m.images) && m.images.length > 0) {
        userImgIndices.push(idx);
      }
    });

    if (userImgIndices.length <= keepRecentRounds) {
      return { ok: true, offloadedCount: 0 };
    }

    const offloadIndices = userImgIndices.slice(0, userImgIndices.length - keepRecentRounds);
    let offloadedCount = 0;

    for (const idx of offloadIndices) {
      const msg = session.messages[idx];
      msg.imagesOffloadedForModel = true;
      offloadedCount += msg.images.length;
    }

    return { ok: true, offloadedCount };
  }

  /**
   * Compacts historical conversation messages into a structured, high-density checkpoint summary.
   * Preserves tool pairing invariants so assistant tool_calls and results are NEVER orphaned.
   *
   * @param {object} session
   * @param {object} options
   */
  async compactSession(session, {
    config = {},
    getPersona = () => null,
    genId = () => `msg_${Date.now()}`,
    keepCount = 2,
    thresholdRatio = 0.8
  } = {}) {
    if (!session || !Array.isArray(session.messages) || session.messages.length < 2) {
      return { ok: false, error: '当前会话历史较短，无需压缩' };
    }

    const sessionId = session.id || 'anonymous';
    if (this.compactionLocks.has(sessionId)) {
      return { ok: false, error: '当前会话正在压缩中，请稍候' };
    }

    this.compactionLocks.add(sessionId);

    try {
      // Step 1: Pre-compaction pruning & offloading (model-free token reductions)
      this.pruneSessionToolResults(session);
      this.offloadSessionImages(session, { keepRecentRounds: Math.max(1, keepCount) });

      // Step 2: Calculate balanced cut point adhering to Tool Pairing Invariants
      // Target keeping recent `targetKeep` messages (default 2~4 units)
      const targetKeep = Math.max(1, Number(keepCount) || 2);
      let cutIdx = findBalancedCutIndex(session.messages, targetKeep);

      // If cutIdx is 0 or exceeds bounds, fallback to safe backward search
      if (cutIdx <= 0 && session.messages.length > targetKeep) {
        // Try searching backward from length - 1 down to 1
        for (let idx = session.messages.length - 1; idx >= 1; idx--) {
          if (toolPairingBalancedAt(session.messages, idx)) {
            cutIdx = idx;
            break;
          }
        }
      }

      if (cutIdx <= 0 || cutIdx >= session.messages.length) {
        return { ok: false, error: '没有需要压缩的早期历史记录' };
      }

      const olderMsgs = session.messages.slice(0, cutIdx);
      const recentMsgs = session.messages.slice(cutIdx);

      if (olderMsgs.length === 0) {
        return { ok: false, error: '没有需要压缩的早期历史记录' };
      }

      // Step 3: Build structured transcript for summarization
      const transcriptLines = [];
      for (const m of olderMsgs) {
        if (!m) continue;
        if (m.role === 'user') {
          const userText = (Array.isArray(m.attachments) && m.attachments.length > 0)
            ? assembleUserMessageContent(m.content, m.attachments)
            : String(m.content || '').trim();
          transcriptLines.push(`[用户]: ${userText}`);
        } else if (m.role === 'assistant') {
          const calls = m.tool_calls || m.toolCalls;
          if (Array.isArray(calls) && calls.length > 0) {
            const callNames = calls.map(c => c?.function?.name || 'tool').join(', ');
            transcriptLines.push(`[助手调用工具: ${callNames}]: ${String(m.content || '').trim()}`);
          } else {
            transcriptLines.push(`[助手]: ${String(m.content || '').trim()}`);
          }
        } else if (m.role === 'tool') {
          const snippet = String(m.content || '').slice(0, 300);
          transcriptLines.push(`[工具结果]: ${snippet}`);
        }
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
        // Allow dedicated summarizationModel or fallback to general model
        const model = config.summarizationModel || config.model || 'gpt-4o-mini';
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

        // syncCompletion (protocols.parseSyncResponse) returns the text under `content`.
        // Reading `res.text` here previously made every LLM summary silently fall
        // back to the offline rule-based condensation.
        if (res && typeof res.content === 'string' && res.content.trim()) {
          summaryText = res.content.trim();
        }
        if (res && res.usage) {
          session.totalTokens = session.totalTokens || { promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0 };
          session.totalTokens.promptTokens += (res.usage.promptTokens || 0);
          session.totalTokens.completionTokens += (res.usage.completionTokens || 0);
          session.totalTokens.totalTokens += (res.usage.totalTokens || ((res.usage.promptTokens || 0) + (res.usage.completionTokens || 0)));
          session.totalTokens.cachedTokens = (session.totalTokens.cachedTokens || 0) + (res.usage.cachedTokens || 0);
        }
      } catch (err) {
        // Fallback to offline rule-based condensation
        summaryText = this.buildOfflineSummary(olderMsgs);
      }

      if (!summaryText) {
        summaryText = this.buildOfflineSummary(olderMsgs);
      }

      // Step 4: Display vs Model Context Surface Isolation
      // Mark older messages as shadowed (folded away from model inference context),
      // while preserving 100% of their content, images, and tools for human UI viewing.
      for (const m of olderMsgs) {
        if (m) m.isShadowed = true;
      }

      const checkpointMsg = {
        id: genId('chk'),
        role: 'compaction_divider',
        type: 'compaction_checkpoint',
        content: summaryText,
        isCompacted: true,
        checkpoint: true,
        compactedCount: olderMsgs.length,
        timestamp: Date.now()
      };

      // Keep complete historical data intact, inserting the new compaction divider card at the boundary
      session.messages = [...olderMsgs, checkpointMsg, ...recentMsgs];
      session.updatedAt = Date.now();

      const activeContextTokens = this.calculateContextTokens(session, { enableAgent: config.enableAgent !== false });

      return {
        ok: true,
        session,
        compactedCount: olderMsgs.length,
        summary: summaryText,
        activeContextTokens,
        totalDisplayMessagesCount: session.messages.length,
        remainingActiveMessagesCount: recentMsgs.length + 1
      };
    } finally {
      this.compactionLocks.delete(sessionId);
    }
  }

  /**
   * Offline Rule-Based Summary Fallback when network or LLM is unavailable.
   */
  buildOfflineSummary(olderMsgs) {
    const lines = [
      '### 📋 上下文压缩摘要（本地提炼）',
      `*已对前 ${olderMsgs.length} 条早期对话记录进行精简提炼：*`,
      ''
    ];
    for (const m of olderMsgs) {
      if (!m) continue;
      const role = m.role === 'user' ? '用户' : (m.role === 'tool' ? '工具' : '助手');
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
