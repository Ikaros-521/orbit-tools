/* AI Chat - Context usage ring & compaction trigger (extracted from panel.js):
   token accounting for the active session, the header ring meter, and the
   manual compact button flow. Dual CommonJS / Browser export; mutable
   session/config state is shared with panel.js via the `state` bag. */
(() => {
  function createContextRing(deps) {
    const {
      state,
      ctx,
      renderMessages, renderSessionsList, updateHeader,
      btnCompactContext, contextRingMeter, contextRingText, contextRingWrap
    } = deps;
    if (!contextRingWrap) return null;

    function calculateCurrentContextTokens(session) {
      if (!session || !Array.isArray(session.messages) || session.messages.length === 0) {
        return 0;
      }

      // Display vs Model Surface Isolation:
      // If the session contains compaction divider cards, only the active context window
      // (from the latest compaction divider onwards) is counted towards the model window!
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
      function getMessageCharLength(msgItem) {
        if (!msgItem) return 0;
        let len = String(msgItem.content || '').length;
        if (msgItem.role === 'user' && Array.isArray(msgItem.attachments) && msgItem.attachments.length > 0) {
          for (const a of msgItem.attachments) {
            if (a && a.content) len += String(a.content).length + 80;
            else if (a && (a.path || a.name)) len += String(a.path || a.name).length + 60;
          }
        }
        return len;
      }

      if (lastAsstWithUsageIdx !== -1) {
        const baseUsage = msgs[lastAsstWithUsageIdx].usage;
        const baseTokens = (typeof baseUsage.contextTokens === 'number')
          ? baseUsage.contextTokens
          : ((baseUsage.promptTokens || 0) + (baseUsage.completionTokens || 0));
        let trailingChars = 0;
        for (let i = lastAsstWithUsageIdx + 1; i < msgs.length; i++) {
          trailingChars += getMessageCharLength(msgs[i]);
        }
        return baseTokens + Math.ceil(trailingChars / 3.2);
      }
      let totalChars = 0;
      for (const m of msgs) {
        totalChars += getMessageCharLength(m);
      }
      // 历史消息无 usage 时的合理估算：包含系统 Prompt 基础开销及 Agent 工具声明开销
      const isAgent = state.config && state.config.enableAgent !== false;
      const baseOverhead = isAgent ? 1800 : 350;
      return Math.max(150, Math.ceil(totalChars / 3.2) + baseOverhead);
    }

    function updateContextProgress() {
      if (!contextRingMeter || !contextRingText) return;
      const maxTokens = (state.config && Number(state.config.maxContextTokens)) || 200000;
      if (!state.currentSession || !Array.isArray(state.currentSession.messages) || state.currentSession.messages.length === 0) {
        contextRingMeter.setAttribute('stroke-dasharray', '0, 100');
        contextRingText.textContent = '0%';
        contextRingMeter.classList.remove('warning', 'danger');
        if (contextRingWrap) {
          contextRingWrap.title = `当前上下文: 0 / ${maxTokens.toLocaleString()} tokens (0%)\n【说明】模型单轮工作记忆负载；不同于右上角多轮累计总账\n点击一键压缩上下文`;
        }
        return;
      }

      const currentTokens = calculateCurrentContextTokens(state.currentSession);
      const rawPct = (currentTokens / maxTokens) * 100;
      const pct = Math.min(100, Math.max(0, Math.round(rawPct)));

      let displayPctText = `${pct}%`;
      let meterDashPct = pct;
      if (currentTokens > 0 && rawPct < 1) {
        displayPctText = '<1%';
        meterDashPct = Math.max(0.8, Number(rawPct.toFixed(1)));
      }

      contextRingMeter.setAttribute('stroke-dasharray', `${meterDashPct}, 100`);
      contextRingText.textContent = displayPctText;

      if (pct >= 85) {
        contextRingMeter.classList.add('danger');
        contextRingMeter.classList.remove('warning');
      } else if (pct >= 60) {
        contextRingMeter.classList.add('warning');
        contextRingMeter.classList.remove('danger');
      } else {
        contextRingMeter.classList.remove('warning', 'danger');
      }

      const pctDetail = rawPct >= 1 ? `${pct}%` : `${rawPct.toFixed(2)}%`;
      if (contextRingWrap) {
        contextRingWrap.title = `当前上下文窗口: ${currentTokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens (${pctDetail})\n【说明】当前单轮发给模型的活跃工作记忆（含系统设定、工具定义及最近上下文）；\n与右上角「会话累计账单」不同，此处反映窗口拥挤度，接近上限时建议压缩\n点击一键压缩上下文`;
      }
    }

    async function triggerCompactContext() {
      if (!state.currentSession) {
        alert('当前没有活跃的会话');
        return;
      }
      if (state.isGenerating && state.generatingSessionId === state.currentSession.id) {
        alert('当前会话正在生成回复中，请等待生成完毕或中断后再压缩上下文。');
        return;
      }
      const msgs = state.currentSession.messages || [];
      const userOrAsstMsgs = msgs.filter(m => m.role === 'user' || m.role === 'assistant');
      if (userOrAsstMsgs.length < 2) {
        alert('当前会话历史记录较短，暂无需压缩上下文。');
        return;
      }

      const confirmMsg = '确定要对当前会话进行一键压缩上下文吗？\n\n系统将保留最新对话轮次，把较早的历史对话高密度提炼为结构化摘要，大幅释放模型上下文窗口空间。';
      if (!confirm(confirmMsg)) {
        return;
      }

      if (btnCompactContext) {
        btnCompactContext.disabled = true;
        btnCompactContext.textContent = '压缩中…';
      }
      if (contextRingWrap) {
        contextRingWrap.style.opacity = '0.6';
        contextRingWrap.style.pointerEvents = 'none';
      }

      try {
        const res = await ctx.call('compactContext', { sessionId: state.currentSession.id });
        if (res && res.ok && res.session) {
          state.currentSession = res.session;
          const sIdx = state.sessions.findIndex(s => s.id === state.currentSession.id);
          if (sIdx !== -1) {
            state.sessions[sIdx] = state.currentSession;
          }
          renderMessages();
          updateHeader();
          renderSessionsList();
        } else {
          alert('压缩上下文失败: ' + ((res && res.error) || '未知错误'));
        }
      } catch (err) {
        alert('压缩上下文请求异常: ' + (err.message || String(err)));
      } finally {
        if (btnCompactContext) {
          btnCompactContext.disabled = false;
          btnCompactContext.textContent = '🗜️ 压缩上下文';
        }
        if (contextRingWrap) {
          contextRingWrap.style.opacity = '';
          contextRingWrap.style.pointerEvents = '';
        }
      }
    }

    if (btnCompactContext) {
      btnCompactContext.addEventListener('click', () => {
        triggerCompactContext();
      });
    }

    if (contextRingWrap) {
      contextRingWrap.addEventListener('click', () => {
        triggerCompactContext();
      });
    }


    return { calculateCurrentContextTokens, updateContextProgress };
  }

  const exportsObj = { createContextRing };
  if (typeof window !== 'undefined') window.AiChatContextRing = exportsObj;
  if (typeof module !== 'undefined' && module.exports) module.exports = exportsObj;
})();
