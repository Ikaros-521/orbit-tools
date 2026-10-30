/* memo panel — Markdown notes, Todo list & Calendar with scheduled reminders.
   Features:
   - Split live preview & Markdown editing with interactive checkboxes
   - Dedicated Todo list view with priority & due dates
   - Interactive monthly Calendar view with date filter
   - Timed alerts & reminder triggers integrated with desktop-pet
*/
(function () {
  'use strict';

  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeHref = u => (/^(https?:|#|\/|mailto:)/i.test(u) ? u : '#');
  const LIST_RE = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;

  function inlineMd(raw) {
    let s = escapeHtml(raw);
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) => `<img alt="${alt}" src="${safeHref(src)}" loading="lazy">`);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) => `<a href="${safeHref(href)}" data-ext target="_blank" rel="noopener">${text}</a>`);
    s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" data-ext target="_blank" rel="noopener">$2</a>');
    s = s.replace(/\u0000(\d+)\u0000/g, (m, idx) => `<code>${codes[+idx]}</code>`);
    return s;
  }

  function parseList(lines, start) {
    const first = LIST_RE.exec(lines[start]);
    const base = first[1].replace(/\t/g, '  ').length;
    const ordered = first[2].length > 1;
    const items = [];
    let i = start;
    let cur = null;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        let j = i + 1;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j < lines.length && LIST_RE.test(lines[j])) { i = j; continue; }
        break;
      }
      const m = LIST_RE.exec(line);
      const indent = (m ? m[1] : line.match(/^\s*/)[0]).replace(/\t/g, '  ').length;
      if (!m || indent < base) break;
      if (indent >= base + 2) {
        if (cur) cur.children.push(line.replace(/^\s{2}/, ''));
        i++;
        continue;
      }
      cur = { text: m[3], children: [], rawLineIndex: i };
      items.push(cur);
      i++;
    }
    const lis = items.map(it => {
      let inner;
      const task = /^\[( |x|X)\]\s+(.*)$/.exec(it.text);
      if (task) {
        const on = task[1].toLowerCase() === 'x';
        inner = `<span class="memo-task"><input type="checkbox" data-task-line="${it.rawLineIndex}" ${on ? 'checked' : ''}> ${inlineMd(task[2])}</span>`;
      } else {
        inner = inlineMd(it.text);
      }
      if (it.children.length) {
        inner += it.children.every(c => LIST_RE.test(c))
          ? parseList(it.children, 0)[0]
          : `<p>${it.children.map(c => inlineMd(c.trim())).join('<br>')}</p>`;
      }
      return `<li>${inner}</li>`;
    }).join('');
    return [`<${ordered ? 'ol' : 'ul'}>${lis}</${ordered ? 'ol' : 'ul'}>`, i];
  }

  function renderLines(lines) {
    const out = [];
    let para = '';
    const flush = () => { if (para) { out.push(`<p>${para}</p>`); para = ''; } };
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      const fence = /^ {0,3}```(\S*)\s*$/.exec(line);
      if (fence) {
        flush();
        const buf = [];
        i++;
        while (i < lines.length && !/^ {0,3}```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push(`<pre${fence[1] ? ` data-lang="${escapeHtml(fence[1])}"` : ''}><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
        continue;
      }

      const h = /^ {0,3}(#{1,6})\s+(.*)$/.exec(line);
      if (h) {
        flush();
        const n = h[1].length;
        out.push(`<h${n}>${inlineMd(h[2].replace(/\s+#+\s*$/, ''))}</h${n}>`);
        i++;
        continue;
      }

      if (/^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); i++; continue; }

      if (/^ {0,3}>/.test(line)) {
        flush();
        const buf = [];
        while (i < lines.length && /^ {0,3}>/.test(lines[i])) { buf.push(lines[i].replace(/^ {0,3}> ?/, '')); i++; }
        out.push(`<blockquote>${renderLines(buf)}</blockquote>`);
        continue;
      }

      if (line.includes('|') && i + 1 < lines.length && /-/.test(lines[i + 1]) && /^ {0,3}\|?[\s:|-]+\|?[\s:|-]*$/.test(lines[i + 1])) {
        flush();
        const cells = r => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
        const head = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) { rows.push(cells(lines[i])); i++; }
        out.push(`<table><thead><tr>${head.map(c => `<th>${inlineMd(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inlineMd(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
        continue;
      }

      if (LIST_RE.test(line)) {
        flush();
        const [html, next] = parseList(lines, i);
        out.push(html);
        i = next;
        continue;
      }

      if (!line.trim()) { flush(); i++; continue; }

      para += (para ? '<br>' : '') + inlineMd(line);
      i++;
    }
    flush();
    return out.join('\n');
  }

  const renderMarkdown = src => renderLines(String(src || '').replace(/\r\n?/g, '\n').split('\n'));

  function countText(text) {
    const t = String(text || '');
    const chars = Array.from(t).length;
    const latin = (t.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
    const cjk = (t.match(/[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uff66-\uff9f]/g) || []).length;
    return { chars, words: latin + cjk, lines: t === '' ? 1 : t.split('\n').length };
  }

  function caretPos(ta) {
    const upto = ta.value.slice(0, ta.selectionStart);
    const lines = upto.split('\n');
    return { ln: lines.length, col: Array.from(lines[lines.length - 1]).length + 1 };
  }

  const pad = n => String(n).padStart(2, '0');
  const formatDateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const relTime = (ts, isZh) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return isZh ? '刚刚' : 'just now';
    if (diff < 3600000) return isZh ? `${Math.floor(diff / 60000)} 分钟前` : `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return isZh ? `${Math.floor(diff / 3600000)} 小时前` : `${Math.floor(diff / 3600000)}h ago`;
    const d = new Date(ts);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return sameYear ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
      : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  function mount(el, ctx) {
    const isZh = ctx.lang !== 'en';
    const L = (zh, en) => (isZh ? zh : en);

    el.innerHTML = `
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
                  <label class="memo-todo-opt-label">📅 ${L('日期', 'Date')}:
                    <input type="date" class="memo-todo-date-input">
                  </label>
                  <label class="memo-todo-opt-label">⏰ ${L('定时提醒', 'Remind')}:
                    <select class="memo-todo-time-preset input small">
                      <option value="">${L('不提醒', 'No alert')}</option>
                      <option value="10m">${L('10分钟后', 'In 10 mins')}</option>
                      <option value="30m">${L('30分钟后', 'In 30 mins')}</option>
                      <option value="1h">${L('1小时后', 'In 1 hour')}</option>
                      <option value="today18">${L('今天 18:00', 'Today 18:00')}</option>
                      <option value="tomorrow09">${L('明天 09:00', 'Tomorrow 09:00')}</option>
                      <option value="custom">${L('自定义具体时刻…', 'Custom…')}</option>
                    </select>
                    <input type="datetime-local" class="memo-todo-time-custom" style="display:none;">
                  </label>
                  <label class="memo-todo-opt-label">🏷 ${L('优先级', 'Priority')}:
                    <select class="memo-todo-pri-select">
                      <option value="0">${L('普通', 'Normal')}</option>
                      <option value="1">⭐ ${L('重要', 'Important')}</option>
                      <option value="2">🔥 ${L('紧急', 'Urgent')}</option>
                    </select>
                  </label>
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
                  <div class="memo-cal-month-title"></div>
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
                <div class="memo-cal-day-items memo-todo-items"></div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    // Elements
    const navTabs = el.querySelectorAll('.memo-nav-tab');
    const notesSide = el.querySelector('.memo-notes-side');
    const todosSide = el.querySelector('.memo-todos-side');
    const paneNotes = el.querySelector('.memo-pane-notes');
    const paneTodos = el.querySelector('.memo-pane-todos');
    const paneCalendar = el.querySelector('.memo-pane-calendar');

    const sideList = el.querySelector('.memo-list');
    const searchInput = el.querySelector('.memo-search');
    const countEl = el.querySelector('.memo-count');
    const titleInput = el.querySelector('.memo-title');
    const editor = el.querySelector('.memo-editor');
    const preview = el.querySelector('.memo-preview');
    const editorArea = el.querySelector('.memo-editor-area');
    const modeSeg = el.querySelector('.memo-mode');
    const saveState = el.querySelector('.memo-save-state');
    const savedot = el.querySelector('.memo-savedot');
    const caretEl = el.querySelector('.memo-caret');
    const selinfoEl = el.querySelector('.memo-selinfo');
    const totalsEl = el.querySelector('.memo-totals');
    const tools = el.querySelector('.memo-tools');
    const todoBadge = el.querySelector('.memo-todo-badge');

    // Todo elements
    const todoAddInput = el.querySelector('.memo-todo-add-input');
    const todoAddBtn = el.querySelector('.memo-todo-add-btn');
    const todoDateInput = el.querySelector('.memo-todo-date-input');
    const todoTimePreset = el.querySelector('.memo-todo-time-preset');
    const todoTimeCustom = el.querySelector('.memo-todo-time-custom');
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
    const calGrid = el.querySelector('.memo-cal-grid');
    const calPrev = el.querySelector('.memo-cal-prev');
    const calNext = el.querySelector('.memo-cal-next');
    const calTodayBtn = el.querySelector('.memo-cal-today-btn');
    const calSelectedLabel = el.querySelector('.memo-cal-selected-label');
    const calDayItems = el.querySelector('.memo-cal-day-items');
    const calAddDayBtn = el.querySelector('.memo-cal-add-day-btn');

    let currentTab = 'notes';
    let notes = [];
    let todos = [];
    let activeId = null;
    let prefs = {};
    let query = '';
    let todoFilter = 'all';
    let dirty = false;
    let saveTimer = null;
    let lastSavedAt = 0;

    // Calendar state
    let calYear = new Date().getFullYear();
    let calMonth = new Date().getMonth(); // 0-11
    let calSelectedDate = formatDateStr(new Date());

    const activeNote = () => notes.find(n => n.id === activeId) || null;

    /* --- Tab Switching ------------------------------------------------------- */
    function switchTab(tab) {
      currentTab = tab;
      navTabs.forEach(btn => btn.classList.toggle('on', btn.dataset.tab === tab));
      notesSide.style.display = tab === 'notes' ? 'flex' : 'none';
      todosSide.style.display = tab !== 'notes' ? 'flex' : 'none';

      paneNotes.classList.toggle('hidden', tab !== 'notes');
      paneTodos.classList.toggle('hidden', tab !== 'todos');
      paneCalendar.classList.toggle('hidden', tab !== 'calendar');

      if (tab === 'todos') renderTodos();
      else if (tab === 'calendar') renderCalendar();
    }

    navTabs.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

    /* --- Notes Rendering & Interactions ------------------------------------- */
    const excerpt = n => {
      const line = String(n.content || '').split('\n').find(l => l.trim() && !/^#{1,6}\s/.test(l)) || '';
      return line.replace(/^>\s*/, '').replace(/[*_~`#>|]/g, '').trim().slice(0, 40);
    };

    function renderList() {
      sideList.innerHTML = '';
      countEl.textContent = String(notes.length);
      const q = query.trim().toLowerCase();
      const shown = q
        ? notes.filter(n => (n.title + '\n' + n.content).toLowerCase().includes(q))
        : notes;
      if (!shown.length) {
        const empty = document.createElement('div');
        empty.className = 'memo-list-empty';
        empty.textContent = q ? L('没有匹配的笔记', 'no matching notes') : L('还没有笔记，点击「新建」开始', 'no notes yet — hit “New”');
        sideList.appendChild(empty);
        return;
      }
      for (const n of shown) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'memo-item' + (n.id === activeId ? ' on' : '') + (n.pinned ? ' pinned' : '');
        item.dataset.id = n.id;
        item.innerHTML = `
          <span class="memo-item-pin" title="${L('置顶笔记', 'Pinned')}">📌</span>
          <span class="memo-item-body">
            <span class="memo-item-title"></span>
            <span class="memo-item-sub"></span>
          </span>
          <span class="memo-item-ops">
            <span class="memo-item-pinbtn" role="button" tabindex="-1" title="${n.pinned ? L('取消置顶', 'Unpin') : L('置顶', 'Pin')}">${n.pinned ? '⇩' : '📌'}</span>
            <span class="memo-item-del" role="button" tabindex="-1" title="${L('删除', 'Delete')}">🗑</span>
          </span>`;
        item.querySelector('.memo-item-title').textContent = n.title || L('无标题', 'untitled');
        item.querySelector('.memo-item-sub').textContent = `${relTime(n.updatedAt, isZh)} · ${excerpt(n)}`;
        item.addEventListener('click', e => {
          if (e.target.closest('.memo-item-ops')) return;
          if (n.id !== activeId) openNote(n.id);
        });
        item.querySelector('.memo-item-pinbtn').addEventListener('click', async e => {
          e.stopPropagation();
          const res = await ctx.call('togglePin', { id: n.id }).catch(() => null);
          if (res && res.ok) { notes = res.notes; renderList(); }
        });
        item.querySelector('.memo-item-del').addEventListener('click', async e => {
          e.stopPropagation();
          const res = await ctx.call('remove', { id: n.id }).catch(() => null);
          if (res && res.ok) {
            notes = res.notes;
            activeId = res.activeId;
            renderList();
            loadActiveNote();
          }
        });
        sideList.appendChild(item);
      }
    }

    function updatePreview() {
      preview.innerHTML = renderMarkdown(editor.value);
      // Interactive Checkbox in Preview: click to toggle in editor textarea
      preview.querySelectorAll('input[data-task-line]').forEach(chk => {
        chk.addEventListener('change', () => {
          const lineIdx = Number(chk.dataset.taskLine);
          const lines = editor.value.split('\n');
          if (lineIdx >= 0 && lineIdx < lines.length) {
            if (chk.checked) {
              lines[lineIdx] = lines[lineIdx].replace(/\[ \]/, '[x]');
            } else {
              lines[lineIdx] = lines[lineIdx].replace(/\[[xX]\]/, '[ ]');
            }
            editor.value = lines.join('\n');
            triggerSave(true);
            updatePreview();
          }
        });
      });
    }

    function updateStats() {
      const c = countText(editor.value);
      const pos = caretPos(editor);
      caretEl.textContent = `Ln ${pos.ln}, Col ${pos.col}`;
      totalsEl.textContent = `${c.lines} ${L('行', 'lines')}  ${c.words} ${L('词', 'words')}  ${c.chars} ${L('字', 'chars')}`;
      const selLen = Math.abs(editor.selectionEnd - editor.selectionStart);
      if (selLen > 0) {
        selinfoEl.hidden = false;
        selinfoEl.textContent = `${selLen} ${L('选中', 'selected')}`;
      } else {
        selinfoEl.hidden = true;
      }
    }

    function loadActiveNote() {
      const n = activeNote();
      if (!n) {
        titleInput.value = '';
        titleInput.disabled = true;
        editor.value = '';
        editor.disabled = true;
        preview.innerHTML = '';
        tools.classList.add('disabled');
        updateStats();
        return;
      }
      titleInput.disabled = false;
      editor.disabled = false;
      tools.classList.remove('disabled');
      titleInput.value = n.title || '';
      editor.value = n.content || '';
      updatePreview();
      updateStats();
      dirty = false;
      setSavedDot('ok', L('已同步', 'synced'));
    }

    function setSavedDot(st, tip) {
      savedot.className = 'memo-savedot ' + (st || '');
      savedot.title = tip || '';
      saveState.textContent = tip || '';
    }

    async function flushSave() {
      clearTimeout(saveTimer);
      if (!dirty) return;
      const n = activeNote();
      if (!n) return;
      setSavedDot('', L('保存中…', 'saving…'));
      const res = await ctx.call('save', {
        id: n.id,
        content: editor.value,
        title: titleInput.value.trim() || undefined,
      }).catch(() => null);
      if (res && res.ok) {
        dirty = false;
        lastSavedAt = Date.now();
        setSavedDot('ok', L('已保存', 'saved'));
        n.content = editor.value;
        n.title = res.note.title;
        n.updatedAt = res.note.updatedAt;
        renderList();
      } else {
        setSavedDot('bad', L('保存失败', 'save failed'));
      }
    }

    function triggerSave(immediate) {
      dirty = true;
      setSavedDot('', L('未保存', 'unsaved'));
      clearTimeout(saveTimer);
      if (immediate) flushSave();
      else saveTimer = setTimeout(flushSave, 600);
    }

    async function openNote(id) {
      if (dirty) await flushSave();
      activeId = id;
      await ctx.call('setActive', { id });
      renderList();
      loadActiveNote();
    }

    /* --- Todo List Rendering & Operations ------------------------------------ */
    function calcRemindAtFromPreset(preset, customVal) {
      if (!preset) return null;
      const now = Date.now();
      if (preset === '10m') return now + 10 * 60000;
      if (preset === '30m') return now + 30 * 60000;
      if (preset === '1h') return now + 60 * 60000;
      if (preset === 'today18') {
        const d = new Date(); d.setHours(18, 0, 0, 0);
        return d.getTime() > now ? d.getTime() : d.getTime() + 86400000;
      }
      if (preset === 'tomorrow09') {
        const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
        return d.getTime();
      }
      if (preset === 'custom' && customVal) {
        const t = new Date(customVal).getTime();
        return Number.isFinite(t) ? t : null;
      }
      return null;
    }

    function updateTodoBadge() {
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
      if (t.dueDate) {
        const isToday = t.dueDate === todayStr;
        const isOverdue = !t.done && t.dueDate < todayStr;
        const cls = isToday ? 'today' : (isOverdue ? 'overdue' : '');
        const label = isToday ? L('今天', 'Today') : t.dueDate.slice(5);
        dateTag = `<span class="memo-todo-tag ${cls}" title="${t.dueDate}">📅 ${label}</span>`;
      }

      let alertTag = '';
      if (t.remindAt) {
        const dateObj = new Date(t.remindAt);
        const timeStr = `${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
        const isReminded = !!t.reminded;
        alertTag = `<span class="memo-todo-tag alarm ${isReminded ? 'reminded' : ''}" title="${L('提醒时间: ', 'Alert at: ') + dateObj.toLocaleString()}">⏰ ${timeStr}${isReminded ? ` (${L('已提醒', 'done')})` : ''}</span>`;
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
          if (currentTab === 'calendar') renderCalendar();
        }
      });

      item.querySelector('.memo-todo-del').addEventListener('click', async e => {
        e.stopPropagation();
        const res = await ctx.call('todoDelete', { id: t.id }).catch(() => null);
        if (res && res.ok) {
          todos = res.todos;
          renderTodos();
          if (currentTab === 'calendar') renderCalendar();
        }
      });

      return item;
    }

    function renderTodos() {
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

      // sidebar view filter: all / today / done
      groupToday.style.display = todoFilter === 'all' || todoFilter === 'today' ? '' : 'none';
      groupPending.style.display = todoFilter === 'all' ? '' : 'none';
      groupDone.style.display = todoFilter === 'all' || todoFilter === 'done' ? '' : 'none';
    }

    el.querySelectorAll('.memo-todo-filter-btn').forEach(btn => btn.addEventListener('click', () => {
      todoFilter = btn.dataset.filter;
      el.querySelectorAll('.memo-todo-filter-btn').forEach(b => b.classList.toggle('on', b === btn));
      renderTodos();
    }));

    async function addTodoFromInput() {
      const title = todoAddInput.value.trim();
      if (!title) return;
      const dueDate = todoDateInput.value || null;
      const preset = todoTimePreset.value;
      const remindAt = calcRemindAtFromPreset(preset, todoTimeCustom.value);
      const priority = Number(todoPriSelect.value) || 0;

      const res = await ctx.call('todoCreate', { title, dueDate, remindAt, priority }).catch(() => null);
      if (res && res.ok) {
        todos = res.todos;
        todoAddInput.value = '';
        renderTodos();
        if (currentTab === 'calendar') renderCalendar();
      }
    }

    todoAddBtn.addEventListener('click', addTodoFromInput);
    todoAddInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addTodoFromInput(); }
    });
    todoTimePreset.addEventListener('change', () => {
      todoTimeCustom.style.display = todoTimePreset.value === 'custom' ? 'inline-block' : 'none';
    });

    /* --- Calendar Rendering & Operations ------------------------------------- */
    function renderCalendar() {
      calMonthTitle.textContent = `${calYear} ${L('年', '-')} ${calMonth + 1} ${L('月', '')}`;
      calGrid.innerHTML = '';

      // Week headers
      const weekLabels = isZh ? ['一', '二', '三', '四', '五', '六', '日'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      weekLabels.forEach(w => {
        const wh = document.createElement('div');
        wh.className = 'memo-cal-weekhead';
        wh.textContent = w;
        calGrid.appendChild(wh);
      });

      // Days of Month
      const firstDay = new Date(calYear, calMonth, 1);
      let startDayOfWeek = firstDay.getDay(); // 0 is Sun
      if (startDayOfWeek === 0) startDayOfWeek = 7; // Convert to Mon=1..Sun=7
      const offset = startDayOfWeek - 1;

      const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
      const prevMonthDays = new Date(calYear, calMonth, 0).getDate();

      const todayStr = formatDateStr(new Date());

      // Preceding days
      for (let i = offset - 1; i >= 0; i--) {
        const dNum = prevMonthDays - i;
        const cell = document.createElement('div');
        cell.className = 'memo-cal-cell other-month';
        cell.innerHTML = `<span class="memo-cal-num">${dNum}</span>`;
        calGrid.appendChild(cell);
      }

      // Current month days
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'memo-cal-cell';
        if (dateStr === todayStr) cell.classList.add('today');
        if (dateStr === calSelectedDate) cell.classList.add('selected');

        const dayTodos = todos.filter(t => t.dueDate === dateStr);
        const openDayTodos = dayTodos.filter(t => !t.done);
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
      calSelectedLabel.textContent = `📅 ${calSelectedDate} ${L('日程与待办清单', 'Tasks & Reminders')}`;
      calDayItems.innerHTML = '';
      const dayTodos = todos.filter(t => t.dueDate === calSelectedDate);
      if (!dayTodos.length) {
        calDayItems.innerHTML = `<div class="memo-todo-empty">${L('当日暂无待办日程，点击右上角添加', 'No tasks scheduled on this day')}</div>`;
      } else {
        dayTodos.forEach(t => calDayItems.appendChild(createTodoItemEl(t)));
      }
    }

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
    calAddDayBtn.addEventListener('click', async () => {
      const title = window.prompt(L('请输入待办内容:', 'Enter task title:'));
      if (!title || !title.trim()) return;
      const res = await ctx.call('todoCreate', {
        title: title.trim(),
        dueDate: calSelectedDate,
        priority: 0,
      }).catch(() => null);
      if (res && res.ok) {
        todos = res.todos;
        renderCalendar();
        updateTodoBadge();
      }
    });

    /* --- Formatter Tools ---------------------------------------------------- */
    function setRange(start, end) {
      editor.focus();
      editor.setSelectionRange(start, end);
      updateStats();
    }

    /* wrap (or unwrap, when exactly surrounded) the selection */
    function wrapSelection(before, after, placeholder) {
      const s = editor.selectionStart;
      const e = editor.selectionEnd;
      const val = editor.value;
      const sel = val.slice(s, e) || placeholder || '';
      if (s >= before.length && e <= val.length - after.length &&
          val.slice(s - before.length, s) === before && val.slice(e, e + after.length) === after &&
          val.slice(s - before.length, e + after.length) === before + val.slice(s, e) + after) {
        // unwrap the identical wrapping already present
        const inner = val.slice(s, e);
        editor.value = val.slice(0, s - before.length) + inner + val.slice(e + after.length);
        setRange(s - before.length, e - before.length);
      } else {
        editor.value = val.slice(0, s) + before + sel + after + val.slice(e);
        setRange(s + before.length, s + before.length + sel.length);
      }
      triggerSave();
      updatePreview();
    }

    /* toggle a per-line prefix (headings / quote / lists) over the selection */
    function toggleLinePrefix(prefixFn) {
      const s = editor.selectionStart;
      const e = editor.selectionEnd;
      const val = editor.value;
      const ls = val.lastIndexOf('\n', s - 1) + 1;
      let le = val.indexOf('\n', e);
      if (le === -1) le = val.length;
      const block = val.slice(ls, le) || '';
      const lines = block.split('\n');
      const { prefix } = prefixFn(lines[0] || '');
      const all = lines.every(l => l.startsWith(prefix));
      const next = lines.map(l => (all ? l.slice(prefix.length) : prefix + l.replace(/^(#{1,6}\s|>\s|[-*+]\s|\d+\.\s)/, '')));
      editor.value = val.slice(0, ls) + next.join('\n') + val.slice(le);
      setRange(ls, ls + next.join('\n').length);
      triggerSave();
      updatePreview();
    }

    function insertBlock(text) {
      const s = editor.selectionStart;
      const val = editor.value;
      const pre = s > 0 && val[s - 1] !== '\n' ? '\n\n' : '';
      editor.value = val.slice(0, s) + pre + text + val.slice(editor.selectionEnd);
      setRange(s + pre.length + text.length, s + pre.length + text.length);
      triggerSave();
      updatePreview();
    }

    function handleTab(e) {
      e.preventDefault();
      const s = editor.selectionStart;
      const epos = editor.selectionEnd;
      const val = editor.value;
      if (s !== epos || e.shiftKey) {
        // indent / outdent whole lines
        const ls = val.lastIndexOf('\n', s - 1) + 1;
        let le = val.indexOf('\n', epos);
        if (le === -1) le = val.length;
        const lines = val.slice(ls, le).split('\n');
        const next = lines.map(l => (e.shiftKey ? l.replace(/^ {1,2}/, '') : '  ' + l));
        editor.value = val.slice(0, ls) + next.join('\n') + val.slice(le);
        setRange(ls, ls + next.join('\n').length);
      } else if (e.shiftKey) {
        const ls = val.lastIndexOf('\n', s - 1) + 1;
        const removed = val.slice(ls, s).match(/ {1,2}$/);
        if (removed) {
          editor.value = val.slice(0, s - removed[0].length) + val.slice(s);
          setRange(s - removed[0].length, s - removed[0].length);
        }
      } else {
        editor.value = val.slice(0, s) + '  ' + val.slice(s);
        setRange(s + 2, s + 2);
      }
      triggerSave();
      updatePreview();
    }

    /* Enter continues lists (- / * / 1. / - [ ]) like mainstream editors;
       an empty item terminates the list instead */
    function handleEnter(e) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const s = editor.selectionStart;
      if (s !== editor.selectionEnd) return;
      const val = editor.value;
      const ls = val.lastIndexOf('\n', s - 1) + 1;
      const line = val.slice(ls, s);
      const m = /^(\s*)([-*+]|(\d+)\.)\s+(\[( |x|X)\]\s+)?(.*)$/.exec(line);
      if (!m) return;
      if (!m[6].trim()) {
        // empty item → remove the marker and break out of the list
        e.preventDefault();
        editor.value = val.slice(0, ls) + val.slice(s);
        setRange(ls, ls);
      } else {
        e.preventDefault();
        const marker = m[3] ? `${Number(m[3]) + 1}.` : m[2];
        const task = m[5] !== undefined ? '[ ] ' : '';
        const ins = '\n' + m[1] + marker + ' ' + task;
        editor.value = val.slice(0, s) + ins + val.slice(s);
        setRange(s + ins.length, s + ins.length);
      }
      triggerSave();
      updatePreview();
    }

    const TOOLBAR_DT = isZh
      ? '| 列一 | 列二 |\n| ---- | ---- |\n|  |  |'
      : '| col1 | col2 |\n| ---- | ---- |\n|  |  |';

    function localNow(zh) {
      const d = new Date();
      return zh
        ? `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
        : d.toISOString().replace('T', ' ').slice(0, 16);
    }

    tools.addEventListener('click', e => {
      const btn = e.target.closest('.memo-fmt');
      if (!btn || tools.classList.contains('disabled')) return;
      editor.focus();
      switch (btn.dataset.fmt) {
        case 'bold': wrapSelection('**', '**'); break;
        case 'italic': wrapSelection('*', '*'); break;
        case 'strike': wrapSelection('~~', '~~'); break;
        case 'code': wrapSelection('`', '`'); break;
        case 'link': wrapSelection('[', '](https://)', L('链接文字', 'link text')); break;
        case 'h': toggleLinePrefix(l => ({ prefix: /^#{1,5}\s/.test(l) ? '#'.repeat(l.match(/^#+/)[0].length + 1) + ' ' : '# ' })); break;
        case 'quote': toggleLinePrefix(() => ({ prefix: '> ' })); break;
        case 'ul': toggleLinePrefix(() => ({ prefix: '- ' })); break;
        case 'ol': toggleLinePrefix(() => ({ prefix: '1. ' })); break;
        case 'task': wrapSelection('- [ ] ', '', L('待办事项', 'todo item')); break;
        case 'table': insertBlock(TOOLBAR_DT); break;
        case 'date': insertBlock(localNow(isZh)); break;
      }
    });

    /* split-view scroll sync + external links through the host shell */
    let syncScroll = false;
    editor.addEventListener('scroll', () => {
      if (!syncScroll || modeSeg.dataset.mode !== 'split') return;
      const er = editor.scrollHeight - editor.clientHeight;
      const pr = preview.scrollHeight - preview.clientHeight;
      if (er > 0 && pr > 0) preview.scrollTop = editor.scrollTop / er * pr;
    });
    preview.addEventListener('click', e => {
      const a = e.target.closest('a[data-ext]');
      if (a) { e.preventDefault(); ctx.openExternal(a.href); }
    });

    /* --- View Mode (edit / split / preview) ---------------------------------- */
    function setMode(mode) {
      modeSeg.dataset.mode = mode;
      prefs.viewMode = mode;
      ctx.call('setPrefs', { viewMode: mode }).catch(() => {});
      modeSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
      editorArea.dataset.mode = mode;
      syncScroll = mode === 'split';
      if (mode === 'edit') editor.focus();
    }
    modeSeg.addEventListener('click', e => {
      const b = e.target.closest('button[data-mode]');
      if (b) setMode(b.dataset.mode);
    });

    /* --- New note / search / Ctrl+N ------------------------------------------ */
    async function newNote() {
      const res = await ctx.call('create', {}).catch(() => null);
      if (res && res.ok) {
        notes = res.notes;
        activeId = res.activeId;
        renderList();
        loadActiveNote();
        editor.focus();
      }
    }
    el.querySelector('.memo-new').addEventListener('click', newNote);
    el.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        newNote();
      }
    });
    searchInput.addEventListener('input', () => { query = searchInput.value; renderList(); });

    editor.addEventListener('input', () => {
      triggerSave();
      updatePreview();
      updateStats();
    });
    editor.addEventListener('keydown', e => {
      if (e.key === 'Tab') handleTab(e);
      else if (e.key === 'Enter') handleEnter(e);
      else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'b') { e.preventDefault(); wrapSelection('**', '**'); }
      else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'i') { e.preventDefault(); wrapSelection('*', '*'); }
      else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        dirty = true;
        flushSave();
      }
    });
    titleInput.addEventListener('input', () => { triggerSave(); });
    editor.addEventListener('keyup', updateStats);
    editor.addEventListener('mouseup', updateStats);

    /* --- Initial Boot -------------------------------------------------------- */
    (async () => {
      const res = await ctx.call('list').catch(() => null);
      if (res) {
        notes = res.notes || [];
        todos = res.todos || [];
        activeId = res.activeId;
        prefs = res.prefs || {};
      }
      // pipeline payload ("发送到备忘录") lands as a brand-new note
      const pv = ctx.payload && typeof ctx.payload.value === 'string' && ctx.payload.value.trim() ? ctx.payload.value : '';
      if (pv) {
        const r = await ctx.call('create', { content: pv }).catch(() => null);
        if (r && r.ok) {
          notes = r.notes;
          activeId = r.activeId;
        }
      }
      renderList();
      loadActiveNote();
      renderTodos();
      setMode(['edit', 'split', 'preview'].includes(prefs.viewMode) ? prefs.viewMode : 'split');

      // If opened via desktop-pet or palette with payload view
      if (ctx.payload && ctx.payload.view === 'calendar') {
        switchTab('calendar');
      } else if (ctx.payload && (ctx.payload.view === 'todos' || ctx.payload.view === 'todo')) {
        switchTab('todos');
      }
    })();

    // Listen to changes from background or other companion plugins
    ctx.onEvent('changed', payload => {
      if (!payload) return;
      if (Array.isArray(payload.notes)) { notes = payload.notes; renderList(); }
      if (Array.isArray(payload.todos)) { todos = payload.todos; renderTodos(); if (currentTab === 'calendar') renderCalendar(); }
      if (payload.activeId !== undefined && payload.activeId !== activeId) {
        activeId = payload.activeId;
        renderList();
        loadActiveNote();
      }
    });

    return {
      unmount() {
        flushSave();
      },
    };
  }

  window.Toolbox.panel({ mount });
})();