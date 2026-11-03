/* memo-todo-calendar.js — Todo List View & Interactive Monthly Calendar with Date Filter & Scheduling.
   Provides CommonJS and window.MemoTodoCalendar dual exports. */

(function () {
  'use strict';

  function createTodoCalendarManager(opts) {
    const {
      el,
      ctx,
      isZh,
      L,
      md,
      getTodos,
      setTodos,
      getCurrentTab
    } = opts;

    const { escapeHtml, formatDateStr, pad } = md;

    // Elements - Sidebar & Panes
    const navTabs = el.querySelectorAll('.memo-nav-tab');
    const notesSide = el.querySelector('.memo-notes-side');
    const todosSide = el.querySelector('.memo-todos-side');
    const paneNotes = el.querySelector('.memo-pane-notes');
    const paneTodos = el.querySelector('.memo-pane-todos');
    const paneCalendar = el.querySelector('.memo-pane-calendar');
    const todoBadge = el.querySelector('.memo-todo-badge');

    // Todo elements
    const todoAddInput = el.querySelector('.memo-todo-add-input');
    const todoAddBtn = el.querySelector('.memo-todo-add-btn');
    const todoDateTimeInput = el.querySelector('.memo-todo-datetime-input');
    const todoQuickTime = el.querySelector('.memo-todo-quick-time');
    const todoStrategySelect = el.querySelector('.memo-todo-strategy-select');
    const todoPriSelect = el.querySelector('.memo-todo-pri-select');
    const itemsToday = el.querySelector('.memo-items-today');
    const itemsPending = el.querySelector('.memo-items-pending');
    const itemsDone = el.querySelector('.memo-items-done');
    const cntToday = el.querySelector('.memo-cnt-today');
    const cntPending = el.querySelector('.memo-cnt-pending');
    const cntDone = el.querySelector('.memo-cnt-done');
    const groupToday = el.querySelector('.memo-group-today');
    const groupPending = el.querySelector('.memo-group-pending');
    const groupDone = el.querySelector('.memo-group-done');

    // Calendar elements
    const calMonthTitle = el.querySelector('.memo-cal-month-title');
    const calPicker = el.querySelector('.memo-cal-picker');
    const calPickerYear = el.querySelector('.memo-cal-picker-year');
    const calPickerGrid = el.querySelector('.memo-cal-picker-grid');
    const calPickerPrev = el.querySelector('.memo-cal-picker-prev');
    const calPickerNext = el.querySelector('.memo-cal-picker-next');
    const calGrid = el.querySelector('.memo-cal-grid');
    const calPrev = el.querySelector('.memo-cal-prev');
    const calNext = el.querySelector('.memo-cal-next');
    const calTodayBtn = el.querySelector('.memo-cal-today-btn');
    const calSelectedLabel = el.querySelector('.memo-cal-selected-label');
    const calDayItems = el.querySelector('.memo-cal-day-items');
    const calAddDayBtn = el.querySelector('.memo-cal-add-day-btn');
    const calAddInput = el.querySelector('.memo-cal-add-input');
    const calSubmitBtn = el.querySelector('.memo-cal-submit-btn');
    const calAddTime = el.querySelector('.memo-cal-add-time');
    const calAddStrategy = el.querySelector('.memo-cal-add-strategy');
    const calAddPri = el.querySelector('.memo-cal-add-pri');

    let todoFilter = 'all';

    // Calendar state
    let calYear = new Date().getFullYear();
    let calMonth = new Date().getMonth(); // 0-11
    let calSelectedDate = formatDateStr(new Date());
    let pickerYear = calYear;

    function formatDateTimeLocal(d) {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function calcRemindAt(targetTimestamp, strategy) {
      if (!targetTimestamp || !strategy || strategy === 'none') return null;
      let delta = 0;
      if (strategy === '5m') delta = 5 * 60000;
      else if (strategy === '15m') delta = 15 * 60000;
      else if (strategy === '30m') delta = 30 * 60000;
      else if (strategy === '1h') delta = 60 * 60000;
      else if (strategy === '1d') delta = 24 * 3600000;
      else if (strategy === 'on_time') delta = 0;
      else return null;

      const r = targetTimestamp - delta;
      return r > 0 ? r : null;
    }

    function updateTodoBadge() {
      const todos = getTodos();
      const openCount = todos.filter(t => !t.done).length;
      if (openCount > 0) {
        todoBadge.textContent = String(openCount);
        todoBadge.style.display = 'inline-block';
      } else {
        todoBadge.style.display = 'none';
      }
      const allSub = el.querySelector('.memo-stat-all');
      const todaySub = el.querySelector('.memo-stat-today');
      const doneSub = el.querySelector('.memo-stat-done');
      const todayStr = formatDateStr(new Date());
      if (allSub) allSub.textContent = `${todos.length} ${L('项', 'items')}`;
      if (todaySub) todaySub.textContent = `${todos.filter(t => !t.done && t.dueDate === todayStr).length} ${L('项', 'items')}`;
      if (doneSub) doneSub.textContent = `${todos.filter(t => t.done).length} ${L('项', 'items')}`;
    }

    function createTodoItemEl(t) {
      const item = document.createElement('div');
      item.className = 'memo-todo-item' + (t.done ? ' done' : '');
      item.dataset.id = t.id;

      const todayStr = formatDateStr(new Date());
      let dateTag = '';
      const dStr = t.dueDate || (t.targetTime ? formatDateStr(new Date(t.targetTime)) : null);
      if (dStr) {
        const isToday = dStr === todayStr;
        const isOverdue = !t.done && dStr < todayStr;
        const cls = isToday ? 'today' : (isOverdue ? 'overdue' : '');
        let label = isToday ? L('今天', 'Today') : dStr.slice(5);
        if (t.targetTime) {
          const dObj = new Date(t.targetTime);
          label += ` ${pad(dObj.getHours())}:${pad(dObj.getMinutes())}`;
        }
        dateTag = `<span class="memo-todo-tag ${cls}" title="${dStr}${t.targetTime ? ' ' + new Date(t.targetTime).toLocaleTimeString() : ''}">📅 ${label}</span>`;
      }

      let alertTag = '';
      if (t.remindAt) {
        const dateObj = new Date(t.remindAt);
        const timeStr = `${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
        const isReminded = !!t.reminded;
        const tip = `${L('提醒时间: ', 'Alert at: ')}${dateObj.toLocaleString()}`;
        alertTag = `<span class="memo-todo-tag alarm ${isReminded ? 'reminded' : ''}" title="${tip}">⏰ ${timeStr}${isReminded ? ` (${L('已提醒', 'done')})` : ''}</span>`;
      }

      let priTag = '';
      if (t.priority === 1) priTag = `<span class="memo-todo-tag pri-1">⭐ ${L('重要', 'High')}</span>`;
      else if (t.priority === 2) priTag = `<span class="memo-todo-tag pri-2">🔥 ${L('紧急', 'Urgent')}</span>`;

      item.innerHTML = `
        <input type="checkbox" class="memo-todo-chk" ${t.done ? 'checked' : ''}>
        <span class="memo-todo-title">${escapeHtml(t.title)}</span>
        <div class="memo-todo-meta">
          ${priTag}
          ${dateTag}
          ${alertTag}
          <span class="memo-todo-del" role="button" title="${L('删除待办', 'Delete')}">🗑</span>
        </div>`;

      item.querySelector('.memo-todo-chk').addEventListener('change', async () => {
        const res = await ctx.call('todoToggle', { id: t.id }).catch(() => null);
        if (res && res.ok) {
          t.done = res.todo.done;
          item.classList.toggle('done', t.done);
          renderTodos();
          if (getCurrentTab() === 'calendar') renderCalendar();
        }
      });

      item.querySelector('.memo-todo-del').addEventListener('click', async e => {
        e.stopPropagation();
        const res = await ctx.call('todoDelete', { id: t.id }).catch(() => null);
        if (res && res.ok) {
          setTodos(res.todos);
          renderTodos();
          if (getCurrentTab() === 'calendar') renderCalendar();
        }
      });

      return item;
    }

    function renderTodos() {
      const todos = getTodos();
      updateTodoBadge();
      itemsToday.innerHTML = '';
      itemsPending.innerHTML = '';
      itemsDone.innerHTML = '';

      const todayStr = formatDateStr(new Date());
      const listToday = [];
      const listPending = [];
      const listDone = [];

      for (const t of todos) {
        if (t.done) {
          listDone.push(t);
        } else if (t.dueDate === todayStr || (t.dueDate && t.dueDate < todayStr)) {
          listToday.push(t);
        } else {
          listPending.push(t);
        }
      }

      cntToday.textContent = `(${listToday.length})`;
      cntPending.textContent = `(${listPending.length})`;
      cntDone.textContent = `(${listDone.length})`;

      if (!listToday.length) {
        itemsToday.innerHTML = `<div class="memo-todo-empty">${L('今日暂无待办，享受轻松的一天 ✨', 'No tasks today!')}</div>`;
      } else {
        listToday.forEach(t => itemsToday.appendChild(createTodoItemEl(t)));
      }

      if (!listPending.length) {
        itemsPending.innerHTML = `<div class="memo-todo-empty">${L('暂无待处理事项', 'No pending tasks')}</div>`;
      } else {
        listPending.forEach(t => itemsPending.appendChild(createTodoItemEl(t)));
      }

      if (!listDone.length) {
        itemsDone.innerHTML = `<div class="memo-todo-empty">${L('还没有已完成的待办', 'None completed yet')}</div>`;
      } else {
        listDone.forEach(t => itemsDone.appendChild(createTodoItemEl(t)));
      }

      groupToday.style.display = todoFilter === 'all' || todoFilter === 'today' ? '' : 'none';
      groupPending.style.display = todoFilter === 'all' ? '' : 'none';
      groupDone.style.display = todoFilter === 'all' || todoFilter === 'done' ? '' : 'none';
    }

    async function addTodoFromInput() {
      const title = todoAddInput.value.trim();
      if (!title) return;
      const dtVal = todoDateTimeInput.value;
      let targetTime = null;
      let dueDate = null;
      if (dtVal) {
        const d = new Date(dtVal);
        if (!isNaN(d.getTime())) {
          targetTime = d.getTime();
          dueDate = dtVal.slice(0, 10);
        }
      }
      const strategy = todoStrategySelect.value;
      const remindAt = targetTime ? calcRemindAt(targetTime, strategy) : null;
      const priority = Number(todoPriSelect.value) || 0;

      const res = await ctx.call('todoCreate', {
        title,
        dueDate,
        targetTime,
        remindStrategy: strategy,
        remindAt,
        priority
      }).catch(() => null);
      if (res && res.ok) {
        setTodos(res.todos);
        todoAddInput.value = '';
        renderTodos();
        if (getCurrentTab() === 'calendar') renderCalendar();
      }
    }

    /* --- Calendar View --- */
    function renderCalendar() {
      const todos = getTodos();
      calMonthTitle.textContent = `${calYear} ${L('年', '-')} ${calMonth + 1} ${L('月', '')}`;
      calGrid.innerHTML = '';

      const weekLabels = isZh ? ['一', '二', '三', '四', '五', '六', '日'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      weekLabels.forEach(w => {
        const wh = document.createElement('div');
        wh.className = 'memo-cal-weekhead';
        wh.textContent = w;
        calGrid.appendChild(wh);
      });

      const firstDay = new Date(calYear, calMonth, 1);
      let startDayOfWeek = firstDay.getDay(); // 0 is Sun
      if (startDayOfWeek === 0) startDayOfWeek = 7;
      const offset = startDayOfWeek - 1;

      const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
      const prevMonthDays = new Date(calYear, calMonth, 0).getDate();
      const todayStr = formatDateStr(new Date());

      for (let i = offset - 1; i >= 0; i--) {
        const dNum = prevMonthDays - i;
        const cell = document.createElement('div');
        cell.className = 'memo-cal-cell other-month';
        cell.innerHTML = `<span class="memo-cal-num">${dNum}</span>`;
        calGrid.appendChild(cell);
      }

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'memo-cal-cell';
        if (dateStr === todayStr) cell.classList.add('today');
        if (dateStr === calSelectedDate) cell.classList.add('selected');

        const dayTodos = todos.filter(t => t.dueDate === dateStr);
        let dotsHtml = '';
        if (dayTodos.length > 0) {
          const hasUrgent = dayTodos.some(t => t.priority === 2 && !t.done);
          dotsHtml = `<div class="memo-cal-dots"><span class="memo-cal-dot ${hasUrgent ? 'pri-2' : ''}"></span><span class="memo-cal-badge">${dayTodos.length}</span></div>`;
        }

        cell.innerHTML = `<span class="memo-cal-num">${d}</span>${dotsHtml}`;
        cell.addEventListener('click', () => {
          calSelectedDate = dateStr;
          renderCalendar();
        });
        calGrid.appendChild(cell);
      }

      renderCalDayList();
    }

    function renderCalDayList() {
      const todos = getTodos();
      calSelectedLabel.textContent = `📅 ${calSelectedDate} ${L('日程与待办清单', 'Tasks & Reminders')}`;
      if (calAddInput) {
        calAddInput.placeholder = `${L('添加', 'Add to ')} ${calSelectedDate} ${L('日程，按回车快速创建…', 'task, press Enter…')}`;
      }
      calDayItems.innerHTML = '';
      const dayTodos = todos.filter(t => t.dueDate === calSelectedDate);
      if (!dayTodos.length) {
        calDayItems.innerHTML = `<div class="memo-todo-empty">${L('当日暂无待办日程，可在上方输入框快速添加 ✨', 'No tasks scheduled on this day')}</div>`;
      } else {
        dayTodos.forEach(t => calDayItems.appendChild(createTodoItemEl(t)));
      }
    }

    function renderCalPicker() {
      calPickerYear.textContent = String(pickerYear);
      calPickerGrid.innerHTML = '';
      const names = isZh
        ? Array.from({ length: 12 }, (_, i) => `${i + 1}月`)
        : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const now = new Date();
      names.forEach((nm, m) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'memo-cal-picker-month'
          + (pickerYear === calYear && m === calMonth ? ' on' : '')
          + (pickerYear === now.getFullYear() && m === now.getMonth() ? ' cur' : '');
        b.textContent = nm;
        b.addEventListener('click', () => {
          calYear = pickerYear;
          calMonth = m;
          closeCalPicker();
          renderCalendar();
        });
        calPickerGrid.appendChild(b);
      });
    }

    function openCalPicker() {
      pickerYear = calYear;
      renderCalPicker();
      calPicker.classList.add('open');
    }
    function closeCalPicker() { calPicker.classList.remove('open'); }

    async function addCalDayTodo() {
      const title = calAddInput.value.trim();
      if (!title) return;
      const timeVal = calAddTime.value;
      let targetTime = null;
      if (timeVal && /^\d{1,2}:\d{2}$/.test(timeVal)) {
        const d = new Date(`${calSelectedDate}T${timeVal}:00`);
        if (!isNaN(d.getTime())) targetTime = d.getTime();
      }
      const strategy = calAddStrategy.value;
      const remindAt = targetTime ? calcRemindAt(targetTime, strategy) : null;
      const priority = Number(calAddPri.value) || 0;

      const res = await ctx.call('todoCreate', {
        title,
        dueDate: calSelectedDate,
        targetTime,
        remindStrategy: strategy,
        remindAt,
        priority
      }).catch(() => null);
      if (res && res.ok) {
        setTodos(res.todos);
        calAddInput.value = '';
        calAddTime.value = '';
        renderCalendar();
        updateTodoBadge();
      }
    }

    // Initialize Event Listeners
    function initEvents() {
      el.querySelectorAll('.memo-todo-filter-btn').forEach(btn => btn.addEventListener('click', () => {
        todoFilter = btn.dataset.filter;
        el.querySelectorAll('.memo-todo-filter-btn').forEach(b => b.classList.toggle('on', b === btn));
        renderTodos();
      }));

      todoAddBtn.addEventListener('click', addTodoFromInput);
      todoAddInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); addTodoFromInput(); }
      });
      todoQuickTime.addEventListener('change', () => {
        const val = todoQuickTime.value;
        if (!val) return;
        if (val === 'clear') {
          todoDateTimeInput.value = '';
        } else if (val === 'today18') {
          const d = new Date(); d.setHours(18, 0, 0, 0);
          todoDateTimeInput.value = formatDateTimeLocal(d);
        } else if (val === 'today21') {
          const d = new Date(); d.setHours(21, 0, 0, 0);
          todoDateTimeInput.value = formatDateTimeLocal(d);
        } else if (val === 'tomorrow09') {
          const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
          todoDateTimeInput.value = formatDateTimeLocal(d);
        } else if (val === 'tomorrow18') {
          const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0);
          todoDateTimeInput.value = formatDateTimeLocal(d);
        } else if (val === 'in1h') {
          const d = new Date(Date.now() + 60 * 60000); d.setSeconds(0, 0);
          todoDateTimeInput.value = formatDateTimeLocal(d);
        }
        todoQuickTime.value = '';
      });

      calPrev.addEventListener('click', () => {
        calMonth--;
        if (calMonth < 0) { calMonth = 11; calYear--; }
        renderCalendar();
      });
      calNext.addEventListener('click', () => {
        calMonth++;
        if (calMonth > 11) { calMonth = 0; calYear++; }
        renderCalendar();
      });
      calTodayBtn.addEventListener('click', () => {
        const now = new Date();
        calYear = now.getFullYear();
        calMonth = now.getMonth();
        calSelectedDate = formatDateStr(now);
        renderCalendar();
      });

      calMonthTitle.addEventListener('click', () => {
        if (calPicker.classList.contains('open')) closeCalPicker();
        else openCalPicker();
      });
      calPickerPrev.addEventListener('click', () => { pickerYear--; renderCalPicker(); });
      calPickerNext.addEventListener('click', () => { pickerYear++; renderCalPicker(); });
      el.addEventListener('click', e => {
        if (calPicker.classList.contains('open') && !e.target.closest('.memo-cal-title-wrap')) closeCalPicker();
      });

      calSubmitBtn.addEventListener('click', addCalDayTodo);
      calAddInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); addCalDayTodo(); }
      });
      calAddDayBtn.addEventListener('click', () => {
        calAddInput.focus();
      });
    }

    initEvents();

    return {
      updateTodoBadge,
      renderTodos,
      renderCalendar,
      formatDateTimeLocal,
      calcRemindAt
    };
  }

  const memoTodoCalendar = {
    createTodoCalendarManager
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = memoTodoCalendar;
  }
  if (typeof window !== 'undefined') {
    window.MemoTodoCalendar = memoTodoCalendar;
  }
})();
