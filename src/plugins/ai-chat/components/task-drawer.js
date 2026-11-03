/* AI Chat - Floating Task Drawer & Planning Cards Component
   Handles session-scoped task checklist extraction, dynamic floating badge, progress calculation, and IDE handoff integration.
   Dual CommonJS / Browser environment export. */
(() => {
  let taskPanelCollapsed = false;

  const defaultEscapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function getActiveTasks(currentSession, extractTasksFromContent) {
    if (!currentSession) return null;
    if (Array.isArray(currentSession.taskList) && currentSession.taskList.length > 0) {
      return { tasks: currentSession.taskList, isExplicit: true };
    }
    // 智能识别：若无显式 taskList 且未被用户手动隐藏，自动提取最新 assistant 消息中的 Markdown checklist
    const extractFn = extractTasksFromContent || (window.AiChatMarkdown && window.AiChatMarkdown.extractTasksFromContent);
    if (!currentSession._hideExtractedTasks && Array.isArray(currentSession.messages) && typeof extractFn === 'function') {
      for (let i = currentSession.messages.length - 1; i >= 0; i--) {
        const msg = currentSession.messages[i];
        if (msg.role === 'assistant' && typeof msg.content === 'string') {
          const matches = extractFn(msg.content);
          if (matches && matches.length >= 2) {
            return { tasks: matches, isExplicit: false };
          }
        }
      }
    }
    return null;
  }

  /* Floating task drawer: positioned on the side/top-right of the main stage,
     visible regardless of message scroll position so users don't have to scroll up. */
  function renderTaskCard({
    panelEl,
    messagesScroll,
    currentSession,
    ctx,
    extractTasksFromContent,
    escapeHtml = defaultEscapeHtml
  }) {
    if (!messagesScroll) return;

    // Clean up legacy inline card inside messagesScroll if present
    const legacyCard = messagesScroll.querySelector('#aiTaskCard');
    if (legacyCard) legacyCard.remove();

    const mainStage = (panelEl && panelEl.querySelector('.ai-main')) || messagesScroll.parentElement;
    if (!mainStage) return;

    let wrap = mainStage.querySelector('#aiFloatingTaskWrap');
    const taskData = getActiveTasks(currentSession, extractTasksFromContent);
    if (!taskData || !taskData.tasks || taskData.tasks.length === 0) {
      if (wrap) wrap.remove();
      return;
    }

    const { tasks, isExplicit } = taskData;
    const done = tasks.filter(t => t.status === 'completed').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const percent = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;

    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'aiFloatingTaskWrap';
      mainStage.appendChild(wrap);
    }

    wrap.className = `ai-floating-task-wrap ${taskPanelCollapsed ? 'collapsed' : 'expanded'}`;

    const icon = t => (t.status === 'completed' ? '✅' : (t.status === 'in_progress' ? '🔵' : '⚪'));

    wrap.innerHTML = `
      <!-- 折叠态：精致悬浮胶囊徽标 -->
      <button type="button" class="ai-task-badge" id="aiTaskBadge" title="点击展开任务清单 (${done}/${tasks.length})">
        <span class="ai-task-badge-icon">📋</span>
        <span class="ai-task-badge-label">任务清单</span>
        <span class="ai-task-badge-progress">${done}/${tasks.length}</span>
        <span class="ai-task-badge-percent">${percent}%</span>
        ${inProgress > 0 ? '<span class="ai-task-badge-pulse" title="有任务正在进行中"></span>' : ''}
        <span class="ai-task-badge-arrow">▾</span>
      </button>

      <!-- 展开态：侧边悬浮任务卡片 -->
      <div class="ai-task-card-floating">
        <div class="ai-task-card-head">
          <div class="ai-task-card-title-wrap">
            <span class="ai-task-card-icon">📋</span>
            <span class="ai-task-card-title">任务清单</span>
            <span class="ai-task-card-progress">${done}/${tasks.length}</span>
            <span class="ai-task-card-percent">(${percent}%)</span>
          </div>
          <div class="ai-task-card-actions">
            <button type="button" class="ai-task-card-btn collapse" id="btnCollapseTasks" title="收起至悬浮徽标">−</button>
            <button type="button" class="ai-task-card-btn clear" id="btnClearTasks" title="${isExplicit ? '清空任务清单' : '关闭任务浮窗'}">×</button>
          </div>
        </div>

        <!-- 动态彩色进度条 -->
        <div class="ai-task-progress-bar-wrap">
          <div class="ai-task-progress-bar" style="width: ${percent}%;"></div>
        </div>

        <!-- 任务列表滚动区 -->
        <div class="ai-task-list">
          ${tasks.map((t, idx) => `
            <div class="ai-task-item ${t.status}" data-idx="${idx}">
              <span class="ai-task-ico">${icon(t)}</span>
              <span class="ai-task-text">${escapeHtml(t.content)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    const badge = wrap.querySelector('#aiTaskBadge');
    if (badge) {
      badge.addEventListener('click', () => {
        taskPanelCollapsed = false;
        wrap.classList.remove('collapsed');
        wrap.classList.add('expanded');
      });
    }

    const btnCollapse = wrap.querySelector('#btnCollapseTasks');
    if (btnCollapse) {
      btnCollapse.addEventListener('click', () => {
        taskPanelCollapsed = true;
        wrap.classList.remove('expanded');
        wrap.classList.add('collapsed');
      });
    }

    const btnClear = wrap.querySelector('#btnClearTasks');
    if (btnClear) {
      btnClear.addEventListener('click', async () => {
        if (!currentSession) return;
        if (isExplicit) {
          if (ctx && ctx.call) {
            const res = await ctx.call('clearTaskList', { sessionId: currentSession.id });
            if (res && res.ok) {
              currentSession.taskList = null;
              renderTaskCard({ panelEl, messagesScroll, currentSession, ctx, extractTasksFromContent, escapeHtml });
            }
          }
        } else {
          currentSession._hideExtractedTasks = true;
          renderTaskCard({ panelEl, messagesScroll, currentSession, ctx, extractTasksFromContent, escapeHtml });
        }
      });
    }
  }

  const exportsObj = {
    getActiveTasks,
    renderTaskCard,
    isCollapsed: () => taskPanelCollapsed,
    setCollapsed: (val) => { taskPanelCollapsed = !!val; }
  };

  if (typeof window !== 'undefined') {
    window.AiChatTaskDrawer = exportsObj;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})();
