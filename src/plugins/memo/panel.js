/* memo panel — Markdown notes, Todo list & Calendar with scheduled reminders.
   Modularized enterprise architecture orchestrating:
   - lib/memo-markdown.js (Markdown parsing, inline formatting & text statistics)
   - components/memo-template.js (Static HTML layout template)
   - modules/memo-todo-calendar.js (Todo list management & interactive monthly calendar)
*/
(function () {
  'use strict';

  function loadScript(src) {
    if (typeof document === 'undefined') return Promise.resolve();
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') return Promise.resolve();
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
      });
    }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.dataset.loaded = 'false';
      s.onload = () => { s.dataset.loaded = 'true'; resolve(); };
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  const getMemoMd = () => (typeof window !== 'undefined' ? window.MemoMarkdown : null) || (typeof require !== 'undefined' ? require('./lib/memo-markdown') : {});
  const getMemoTmpl = () => (typeof window !== 'undefined' ? window.MemoTemplate : null) || (typeof require !== 'undefined' ? require('./components/memo-template') : {});
  const getMemoTodoCal = () => (typeof window !== 'undefined' ? window.MemoTodoCalendar : null) || (typeof require !== 'undefined' ? require('./modules/memo-todo-calendar') : {});

  function ensureDependencies() {
    if (typeof document === 'undefined') return Promise.resolve();
    return Promise.all([
      loadScript('plugin://memo/lib/memo-markdown.js'),
      loadScript('plugin://memo/components/memo-template.js'),
      loadScript('plugin://memo/modules/memo-todo-calendar.js')
    ]);
  }

  // Pre-load helper scripts when running in browser
  if (typeof document !== 'undefined') {
    ensureDependencies().catch(() => {});
  }

  async function mount(el, ctx) {
    await ensureDependencies();
    const isZh = ctx.lang !== 'en';
    const L = (zh, en) => (isZh ? zh : en);

    const md = getMemoMd();
    const tmpl = getMemoTmpl();
    const todoCalMod = getMemoTodoCal();

    el.innerHTML = tmpl.getMemoLayoutHtml(L);

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

    let currentTab = 'notes';
    let notes = [];
    let todos = [];
    let activeId = null;
    let prefs = {};
    let query = '';
    let dirty = false;
    let saveTimer = null;
    let lastSavedAt = 0;

    const activeNote = () => notes.find(n => n.id === activeId) || null;

    // Initialize Todo & Calendar Manager
    const todoCal = todoCalMod.createTodoCalendarManager({
      el,
      ctx,
      isZh,
      L,
      md,
      getTodos: () => todos,
      setTodos: newTodos => { todos = newTodos; },
      getCurrentTab: () => currentTab
    });

    /* --- Tab Switching ------------------------------------------------------- */
    function switchTab(tab) {
      currentTab = tab;
      navTabs.forEach(btn => btn.classList.toggle('on', btn.dataset.tab === tab));
      notesSide.style.display = tab === 'notes' ? 'flex' : 'none';
      todosSide.style.display = tab !== 'notes' ? 'flex' : 'none';

      paneNotes.classList.toggle('hidden', tab !== 'notes');
      paneTodos.classList.toggle('hidden', tab !== 'todos');
      paneCalendar.classList.toggle('hidden', tab !== 'calendar');

      if (tab === 'todos') todoCal.renderTodos();
      else if (tab === 'calendar') todoCal.renderCalendar();
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
        item.querySelector('.memo-item-sub').textContent = `${md.relTime(n.updatedAt, isZh)} · ${excerpt(n)}`;
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

    function setSavedDot(state, text) {
      savedot.className = 'memo-savedot' + (state ? ' ' + state : '');
      savedot.title = text || '';
      saveState.textContent = text || '';
    }

    function updatePreview() {
      preview.innerHTML = md.renderMarkdown(editor.value);
      preview.querySelectorAll('input[type="checkbox"][data-task-line]').forEach(chk => {
        chk.addEventListener('change', () => {
          const idx = +chk.dataset.taskLine;
          const lines = editor.value.split('\n');
          if (lines[idx] !== undefined) {
            lines[idx] = lines[idx].replace(/^(\s*[-*+]\s+\[)( |x|X)(\]\s+)/, (m, pre, val, post) => `${pre}${chk.checked ? 'x' : ' '}${post}`);
            editor.value = lines.join('\n');
            triggerSave();
            updatePreview();
            updateStats();
          }
        });
      });
    }

    function updateStats() {
      const pos = md.caretPos(editor);
      caretEl.textContent = `${L('行', 'Ln')} ${pos.ln}, ${L('列', 'Col')} ${pos.col}`;
      const s = editor.selectionStart;
      const e = editor.selectionEnd;
      if (s !== e) {
        const selText = editor.value.slice(Math.min(s, e), Math.max(s, e));
        const st = md.countText(selText);
        selinfoEl.hidden = false;
        selinfoEl.textContent = `${L('选中', 'sel')} ${st.chars} ${L('字', 'chars')}${st.lines > 1 ? ` (${st.lines} ${L('行', 'lines')})` : ''}`;
      } else {
        selinfoEl.hidden = true;
      }
      const all = md.countText(editor.value);
      totalsEl.textContent = `${all.lines} ${L('行', 'lines')} · ${all.words} ${L('词', 'words')} · ${all.chars} ${L('字', 'chars')}`;
    }

    function loadActiveNote() {
      const n = activeNote();
      if (!n) {
        titleInput.value = '';
        editor.value = '';
        titleInput.disabled = true;
        editor.disabled = true;
        tools.classList.add('disabled');
        updatePreview();
        updateStats();
        setSavedDot('', '');
        return;
      }
      titleInput.disabled = false;
      editor.disabled = false;
      tools.classList.remove('disabled');
      titleInput.value = n.title || '';
      editor.value = n.content || '';
      dirty = false;
      clearTimeout(saveTimer);
      setSavedDot('ok', L('已同步', 'synced'));
      updatePreview();
      updateStats();
    }

    async function flushSave() {
      clearTimeout(saveTimer);
      const n = activeNote();
      if (!n || !dirty) return;
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

    /* --- Formatter Tools ---------------------------------------------------- */
    function setRange(start, end) {
      editor.focus();
      editor.setSelectionRange(start, end);
      updateStats();
    }

    function wrapSelection(before, after, placeholder) {
      const s = editor.selectionStart;
      const e = editor.selectionEnd;
      const val = editor.value;
      const sel = val.slice(s, e) || placeholder || '';
      if (s >= before.length && e <= val.length - after.length &&
          val.slice(s - before.length, s) === before && val.slice(e, e + after.length) === after &&
          val.slice(s - before.length, e + after.length) === before + val.slice(s, e) + after) {
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
        ? `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 ${md.pad(d.getHours())}:${md.pad(d.getMinutes())}`
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
      todoCal.renderTodos();
      setMode(['edit', 'split', 'preview'].includes(prefs.viewMode) ? prefs.viewMode : 'split');

      if (ctx.payload && ctx.payload.view === 'calendar') {
        switchTab('calendar');
      } else if (ctx.payload && (ctx.payload.view === 'todos' || ctx.payload.view === 'todo')) {
        switchTab('todos');
      }
    })();

    ctx.onEvent('changed', payload => {
      if (!payload) return;
      if (Array.isArray(payload.notes)) { notes = payload.notes; renderList(); }
      if (Array.isArray(payload.todos)) {
        todos = payload.todos;
        todoCal.renderTodos();
        if (currentTab === 'calendar') todoCal.renderCalendar();
      }
      if (payload.activeId !== undefined && payload.activeId !== activeId) {
        activeId = payload.activeId;
        renderList();
        loadActiveNote();
      }
    });

    return {
      unmount() {
        flushSave();
      }
    };
  }


  if (typeof window !== 'undefined' && window.Toolbox && window.Toolbox.panel) {
    window.Toolbox.panel({ mount });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { mount };
  }
})();
