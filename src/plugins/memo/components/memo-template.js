/* memo-template.js — Static HTML structure and layout template for Memo Notes, Todos & Calendar.
   Provides CommonJS and window.MemoTemplate dual exports. */

(function () {
  'use strict';

  function getMemoLayoutHtml(L) {
    return `
      <div class="memo-root">
        <aside class="memo-side">
          <div class="memo-nav-tabs">
            <button type="button" class="memo-nav-tab on" data-tab="notes">📝 ${L('笔记', 'Notes')}</button>
            <button type="button" class="memo-nav-tab" data-tab="todos">✅ ${L('待办', 'Todos')} <span class="memo-nav-badge memo-todo-badge" style="display:none;">0</span></button>
            <button type="button" class="memo-nav-tab" data-tab="calendar">📅 ${L('日历', 'Calendar')}</button>
          </div>

          <!-- Notes Sidebar List -->
          <div class="memo-notes-side">
            <div class="memo-side-head">
              <span class="memo-side-title">${L('全部笔记', 'ALL NOTES')} <b class="memo-count"></b></span>
              <button type="button" class="btn small memo-new" title="${L('新建笔记 (Ctrl+N)', 'New note (Ctrl+N)')}">＋ ${L('新建', 'New')}</button>
            </div>
            <div class="memo-search-wrap">
              <input class="memo-search" type="text" spellcheck="false" placeholder="${L('搜索笔记…', 'Search notes…')}">
            </div>
            <div class="memo-list"></div>
          </div>

          <!-- Todos Sidebar Filter (Shown in Todo / Calendar Tab) -->
          <div class="memo-todos-side" style="display:none;">
            <div class="memo-side-head">
              <span class="memo-side-title">${L('待办视图', 'VIEWS')}</span>
            </div>
            <div class="memo-list">
              <button type="button" class="memo-item on memo-todo-filter-btn" data-filter="all">
                <span class="memo-item-body">
                  <span class="memo-item-title">📋 ${L('全部待办', 'All Todos')}</span>
                  <span class="memo-item-sub memo-stat-all">0 项</span>
                </span>
              </button>
              <button type="button" class="memo-item memo-todo-filter-btn" data-filter="today">
                <span class="memo-item-body">
                  <span class="memo-item-title">⭐ ${L('今日待办', 'Today')}</span>
                  <span class="memo-item-sub memo-stat-today">0 项</span>
                </span>
              </button>
              <button type="button" class="memo-item memo-todo-filter-btn" data-filter="done">
                <span class="memo-item-body">
                  <span class="memo-item-title">✓ ${L('已完成', 'Completed')}</span>
                  <span class="memo-item-sub memo-stat-done">0 项</span>
                </span>
              </button>
            </div>
          </div>
        </aside>

        <div class="memo-main">
          <!-- View Pane 1: Notes Editor & Preview -->
          <div class="memo-view-pane memo-pane-notes">
            <div class="memo-toolbar">
              <input class="memo-title" type="text" spellcheck="false" placeholder="${L('无标题笔记', 'Untitled note')}">
              <div class="seg memo-mode" role="group">
                <button type="button" data-mode="edit">${L('编辑', 'Edit')}</button>
                <button type="button" data-mode="split">${L('分屏', 'Split')}</button>
                <button type="button" data-mode="preview">${L('预览', 'Preview')}</button>
              </div>
            </div>
            <div class="memo-tools">
              <button type="button" class="memo-fmt" data-fmt="bold" title="${L('加粗', 'Bold')} (Ctrl+B)"><b>B</b></button>
              <button type="button" class="memo-fmt" data-fmt="italic" title="${L('斜体', 'Italic')} (Ctrl+I)"><i>I</i></button>
              <button type="button" class="memo-fmt" data-fmt="strike" title="${L('删除线', 'Strikethrough')}"><s>S</s></button>
              <button type="button" class="memo-fmt mono" data-fmt="code" title="${L('行内代码', 'Inline code')}">&lt;&gt;</button>
              <button type="button" class="memo-fmt" data-fmt="link" title="${L('插入链接', 'Insert link')}">🔗</button>
              <span class="memo-tools-sep"></span>
              <button type="button" class="memo-fmt" data-fmt="h" title="${L('标题层级（逐级加深）', 'Heading level')}">H</button>
              <button type="button" class="memo-fmt" data-fmt="quote" title="${L('引用块', 'Blockquote')}">❝</button>
              <button type="button" class="memo-fmt" data-fmt="ul" title="${L('无序列表', 'Bullet list')}">• ≡</button>
              <button type="button" class="memo-fmt" data-fmt="ol" title="${L('有序列表', 'Numbered list')}">1. ≡</button>
              <button type="button" class="memo-fmt" data-fmt="table" title="${L('插入表格', 'Insert table')}">⊞</button>
              <span class="memo-tools-sep"></span>
              <button type="button" class="memo-fmt" data-fmt="task" title="${L('插入待办项', 'Insert task')}">☑</button>
              <button type="button" class="memo-fmt" data-fmt="date" title="${L('插入当前日期时间', 'Insert date & time')}">🕐</button>
              <span class="memo-save-state"></span>
            </div>
            <div class="memo-editor-area" data-mode="split">
              <textarea class="memo-editor mono" spellcheck="false" placeholder="${L('开始记录… 支持 Markdown', 'Start writing… markdown supported')}"></textarea>
              <div class="memo-preview memo-md"></div>
            </div>
            <div class="memo-statusbar mono">
              <span class="memo-caret"></span>
              <span class="memo-selinfo" hidden></span>
              <span class="grow"></span>
              <span class="memo-totals"></span>
              <span class="memo-lang-badge">Markdown</span>
              <span class="memo-savedot" title=""></span>
            </div>
          </div>

          <!-- View Pane 2: Todo List View -->
          <div class="memo-view-pane memo-pane-todos hidden">
            <div class="memo-todo-wrap">
              <div class="memo-todo-card">
                <div class="memo-todo-input-row">
                  <input type="text" class="memo-todo-add-input" placeholder="${L('添加新待办，按回车键快速创建…', 'Add a new task, press Enter…')}" spellcheck="false">
                  <button type="button" class="btn small memo-todo-add-btn">＋ ${L('添加', 'Add')}</button>
                </div>
                <div class="memo-todo-opts-row">
                  <div class="memo-todo-opt-group">
                    <span class="memo-todo-opt-label">📅 ${L('时间点', 'Time')}:</span>
                    <input type="datetime-local" class="memo-todo-datetime-input">
                    <select class="memo-todo-quick-time" title="${L('快速填充时间点', 'Quick fill time')}">
                      <option value="">${L('快捷填充…', 'Quick fill…')}</option>
                      <option value="today18">${L('今天 18:00', 'Today 18:00')}</option>
                      <option value="today21">${L('今天 21:00', 'Today 21:00')}</option>
                      <option value="tomorrow09">${L('明天 09:00', 'Tomorrow 09:00')}</option>
                      <option value="tomorrow18">${L('明天 18:00', 'Tomorrow 18:00')}</option>
                      <option value="in1h">${L('1小时后', 'In 1 hour')}</option>
                      <option value="clear">${L('清除时间', 'Clear')}</option>
                    </select>
                  </div>
                  <div class="memo-todo-opt-group">
                    <span class="memo-todo-opt-label">⏰ ${L('提醒策略', 'Remind')}:</span>
                    <select class="memo-todo-strategy-select">
                      <option value="on_time">${L('准时提醒', 'On time')}</option>
                      <option value="5m">${L('提前 5 分钟', '5 mins before')}</option>
                      <option value="15m">${L('提前 15 分钟', '15 mins before')}</option>
                      <option value="30m">${L('提前 30 分钟', '30 mins before')}</option>
                      <option value="1h">${L('提前 1 小时', '1 hour before')}</option>
                      <option value="1d">${L('提前 1 天', '1 day before')}</option>
                      <option value="none">${L('不提醒', 'No alert')}</option>
                    </select>
                  </div>
                  <div class="memo-todo-opt-group">
                    <span class="memo-todo-opt-label">🏷 ${L('优先级', 'Priority')}:</span>
                    <select class="memo-todo-pri-select">
                      <option value="0">${L('普通', 'Normal')}</option>
                      <option value="1">⭐ ${L('重要', 'Important')}</option>
                      <option value="2">🔥 ${L('紧急', 'Urgent')}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div class="memo-todo-groups">
                <div class="memo-todo-group memo-group-today">
                  <div class="memo-todo-group-head">
                    <span>${L('今日待办', 'TODAY')} <b class="memo-cnt-today"></b></span>
                  </div>
                  <div class="memo-todo-items memo-items-today"></div>
                </div>

                <div class="memo-todo-group memo-group-pending">
                  <div class="memo-todo-group-head">
                    <span>${L('待处理事项', 'PENDING TASKS')} <b class="memo-cnt-pending"></b></span>
                  </div>
                  <div class="memo-todo-items memo-items-pending"></div>
                </div>

                <div class="memo-todo-group memo-group-done">
                  <div class="memo-todo-group-head">
                    <span>${L('已完成', 'COMPLETED')} <b class="memo-cnt-done"></b></span>
                  </div>
                  <div class="memo-todo-items memo-items-done"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- View Pane 3: Calendar View -->
          <div class="memo-view-pane memo-pane-calendar hidden">
            <div class="memo-cal-wrap">
              <div class="memo-cal-card">
                <div class="memo-cal-head">
                  <div class="memo-cal-title-wrap">
                    <button type="button" class="memo-cal-month-title" title="${L('选择年月', 'Pick month')}"></button>
                    <div class="memo-cal-picker">
                      <div class="memo-cal-picker-head">
                        <button type="button" class="btn ghost small memo-cal-picker-prev">‹</button>
                        <span class="memo-cal-picker-year"></span>
                        <button type="button" class="btn ghost small memo-cal-picker-next">›</button>
                      </div>
                      <div class="memo-cal-picker-grid"></div>
                    </div>
                  </div>
                  <div class="memo-cal-nav">
                    <button type="button" class="btn ghost small memo-cal-prev">◀</button>
                    <button type="button" class="btn ghost small memo-cal-today-btn">${L('今天', 'Today')}</button>
                    <button type="button" class="btn ghost small memo-cal-next">▶</button>
                  </div>
                </div>
                <div class="memo-cal-grid"></div>
              </div>

              <div class="memo-cal-daylist-card">
                <div class="memo-cal-daylist-title">
                  <span class="memo-cal-selected-label"></span>
                  <span class="grow"></span>
                  <button type="button" class="btn ghost small memo-cal-add-day-btn">＋ ${L('添加当日日程', 'Add task')}</button>
                </div>
                <div class="memo-cal-add-box">
                  <div class="memo-cal-add-row">
                    <input type="text" class="memo-cal-add-input" placeholder="${L('添加当日待办日程，按回车快速创建…', 'Add task for this day, press Enter…')}" spellcheck="false">
                    <button type="button" class="btn small memo-cal-submit-btn">＋ ${L('添加', 'Add')}</button>
                  </div>
                  <div class="memo-cal-add-subrow">
                    <div class="memo-cal-opt-group">
                      <span class="memo-cal-opt-label">⏰ ${L('时刻 (可选)', 'Time (opt)')}:</span>
                      <input type="time" class="memo-cal-add-time">
                    </div>
                    <div class="memo-cal-opt-group">
                      <span class="memo-cal-opt-label">🔔 ${L('提醒策略', 'Remind')}:</span>
                      <select class="memo-cal-add-strategy">
                        <option value="on_time">${L('准时提醒', 'On time')}</option>
                        <option value="15m">${L('提前 15 分钟', '15m before')}</option>
                        <option value="1h">${L('提前 1 小时', '1h before')}</option>
                        <option value="none">${L('不提醒', 'No alert')}</option>
                      </select>
                    </div>
                    <div class="memo-cal-opt-group">
                      <span class="memo-cal-opt-label">🏷 ${L('优先级', 'Priority')}:</span>
                      <select class="memo-cal-add-pri">
                        <option value="0">${L('普通', 'Normal')}</option>
                        <option value="1">⭐ ${L('重要', 'Important')}</option>
                        <option value="2">🔥 ${L('紧急', 'Urgent')}</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div class="memo-cal-day-items memo-todo-items"></div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  const memoTemplate = {
    getMemoLayoutHtml
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = memoTemplate;
  }
  if (typeof window !== 'undefined') {
    window.MemoTemplate = memoTemplate;
  }
})();
