/* AI Chat - Floating Task Drawer & Planning Cards Component
   Handles session-scoped task checklist extraction, dynamic floating badge, progress calculation, and IDE handoff integration.
   Dual CommonJS / Browser environment export. */
(() => {
  let taskPanelCollapsed = false;

  const defaultEscapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function getActiveTasks(currentSession, extractTasksFromContent) {
    if (!currentSession) return null;
    const extractFn = extractTasksFromContent || (window.AiChatMarkdown && window.AiChatMarkdown.extractTasksFromContent);

    // 1. 优先检查最新一条 assistant 消息中是否有 Markdown checklist
    // 这样当 AI 在后续对话轮次中通过文本更新清单（如勾选 [x]）时，浮窗能即时反映最新进度
    let latestAssistantMsg = null;
    if (Array.isArray(currentSession.messages)) {
      for (let i = currentSession.messages.length - 1; i >= 0; i--) {
        if (currentSession.messages[i].role === 'assistant') {
          latestAssistantMsg = currentSession.messages[i];
          break;
        }
      }
    }

    if (latestAssistantMsg && typeof latestAssistantMsg.content === 'string' && typeof extractFn === 'function') {
      if (currentSession._hiddenTasksMessageId !== latestAssistantMsg.id && !currentSession._hideExtractedTasks) {
        const matches = extractFn(latestAssistantMsg.content);
        if (matches && matches.length >= 2) {
          return { tasks: matches, isExplicit: false };
        }
      }
    }

    // 2. 检查会话持久化的显式 taskList (来自 update_task_list 工具或用户交互设置)
    if (Array.isArray(currentSession.taskList) && currentSession.taskList.length > 0) {
      return { tasks: currentSession.taskList, isExplicit: true };
    }

    // 3. 回溯更早的 assistant 历史消息提取任务
    if (!currentSession._hideExtractedTasks && Array.isArray(currentSession.messages) && typeof extractFn === 'function') {
      for (let i = currentSession.messages.length - 1; i >= 0; i--) {
        const msg = currentSession.messages[i];
        if (msg.role === 'assistant' && typeof msg.content === 'string') {
          if (currentSession._hiddenTasksMessageId === msg.id) continue;
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
            <div class="ai-task-item ${t.status}" data-idx="${idx}" title="点击切换状态 (待办 ➔ 进行中 ➔ 已完成)">
              <span class="ai-task-ico">${icon(t)}</span>
              <span class="ai-task-text">${escapeHtml(t.content)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    const taskItems = wrap.querySelectorAll('.ai-task-item');
    taskItems.forEach(item => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = Number(item.dataset.idx);
        if (isNaN(idx) || !tasks[idx]) return;
        const curStatus = tasks[idx].status;
        const nextStatus = curStatus === 'completed' ? 'pending' : (curStatus === 'in_progress' ? 'completed' : 'in_progress');
        tasks[idx].status = nextStatus;
        currentSession.taskList = tasks;
        if (ctx && ctx.call) {
          try {
            await ctx.call('setTaskList', { sessionId: currentSession.id, tasks });
          } catch {}
        }
        renderTaskCard({ panelEl, messagesScroll, currentSession, ctx, extractTasksFromContent, escapeHtml });
      });
    });

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
        currentSession.taskList = null;
        let latestMsg = null;
        if (Array.isArray(currentSession.messages)) {
          for (let i = currentSession.messages.length - 1; i >= 0; i--) {
            if (currentSession.messages[i].role === 'assistant') { latestMsg = currentSession.messages[i]; break; }
          }
        }
        if (latestMsg) currentSession._hiddenTasksMessageId = latestMsg.id;
        currentSession._hideExtractedTasks = true;
        if (ctx && ctx.call) {
          try {
            await ctx.call('clearTaskList', { sessionId: currentSession.id });
          } catch {}
        }
        renderTaskCard({ panelEl, messagesScroll, currentSession, ctx, extractTasksFromContent, escapeHtml });
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
