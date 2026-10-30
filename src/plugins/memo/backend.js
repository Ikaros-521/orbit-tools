/* memo backend — note & todo storage lives in plugin-data/memo.json via ctx.data.
   Features:
   - Markdown notes with pinned/active/autosave
   - Dedicated Todo items with dueDate (calendar) & remindAt (scheduled alerts)
   - Background reminder tick: sends desktop notifications & broadcasts to desktop-pet
   - Rich statistics (todos, note-embedded tasks, due dates)
*/

const { Notification } = require('electron');
const path = require('path');

const MAX_NOTES = 500;
const MAX_TODOS = 1000;
const MAX_CONTENT = 512 * 1024; // 512 KB per note

const WELCOME = [
  '# 欢迎使用备忘录 ✨',
  '',
  '支持 **Markdown** 实时分屏渲染，像 VS Code 一样边写边看。',
  '',
  '## 全新功能升级',
  '- 📝 **Markdown 笔记**：分屏实时预览、行号行列定位、字数统计',
  '- ✅ **待办清单 (Todo List)**：专用待办管理，支持优先级与一键打勾',
  '- 📅 **日历与定时提醒**：按日历规划日程，支持设置具体时刻闹钟',
  '- 🐾 **桌宠强力联动**：定时提醒到点由桌宠语音叫醒，打勾任务桌宠为你庆祝！',
  '',
  '## Markdown 语法速查',
  '> 灵感随时记录下来',
  '',
  '- [x] 已完成任务',
  '- [ ] 待办任务清单',
  '',
  '| 功能 | 说明 |',
  '| --- | --- |',
  '| 分屏预览 | 编辑 + 实时渲染 |',
  '| 定时提醒 | 到点自动语音播报 |',
  '',
  '```js',
  '// 支持语法高亮排版',
  "const memo = 'orbit-tools';",
  '```',
].join('\n');

function deriveTitle(content) {
  const line = String(content || '').split('\n').find(l => l.trim()) || '';
  const t = line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s*/, '')
    .replace(/^([-*+]\s+|\d+\.\s+|\[[ xX]\]\s+)/, '')
    .replace(/[*_~`]/g, '')
    .trim();
  return t.slice(0, 30) || '';
}

function countNoteTasks(notes) {
  let open = 0, done = 0;
  for (const n of notes) {
    for (const line of String(n.content || '').split('\n')) {
      if (/^\s*[-*+]\s+\[ \]/i.test(line)) open++;
      else if (/^\s*[-*+]\s+\[x\]/i.test(line)) done++;
    }
  }
  return { open, done };
}

let reminderTimer = null;

module.exports = {
  activate(ctx) {
    const data = ctx.data.get() || {};
    let notes = Array.isArray(data.notes) ? data.notes.filter(n => n && typeof n.id === 'string') : [];
    let todos = Array.isArray(data.todos) ? data.todos.filter(t => t && typeof t.id === 'string') : [];
    let activeId = typeof data.activeId === 'string' ? data.activeId : null;
    let prefs = data.prefs && typeof data.prefs === 'object' ? data.prefs : {};

    const genId = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const save = () => ctx.data.set({ notes, todos, activeId, prefs });

    const sortNotes = () => {
      notes.sort((a, b) => {
        if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
    };

    const sortTodos = () => {
      todos.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
        if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
    };

    // Seed notes if completely fresh
    if (!Array.isArray(data.notes)) {
      const now = Date.now();
      notes = [{ id: genId('n'), title: deriveTitle(WELCOME) || '欢迎使用备忘录', content: WELCOME, pinned: false, autoTitle: true, createdAt: now, updatedAt: now }];
      activeId = notes[0].id;
    }
    if (activeId && !notes.some(n => n.id === activeId)) activeId = notes.length ? notes[0].id : null;

    // Seed sample todos if fresh
    if (!Array.isArray(data.todos)) {
      const now = Date.now();
      const todayStr = new Date().toISOString().slice(0, 10);
      todos = [
        {
          id: genId('td'),
          title: '体验全新待办清单与日历视图',
          done: false,
          dueDate: todayStr,
          remindAt: null,
          reminded: false,
          priority: 1,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: genId('td'),
          title: '点击闹钟图标设置定时提醒，桌宠会准时提醒你',
          done: false,
          dueDate: todayStr,
          remindAt: null,
          reminded: false,
          priority: 0,
          createdAt: now,
          updatedAt: now,
        },
      ];
    }
    save();

    const findNote = id => notes.find(n => n.id === id);
    const findTodo = id => todos.find(t => t.id === id);

    const getStats = () => {
      const noteTasks = countNoteTasks(notes);
      const openTodos = todos.filter(t => !t.done).length;
      const doneTodos = todos.filter(t => t.done).length;
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayTodos = todos.filter(t => !t.done && t.dueDate === todayStr).length;
      return {
        openTodos,
        doneTodos,
        noteTasksOpen: noteTasks.open,
        noteTasksDone: noteTasks.done,
        totalOpen: openTodos + noteTasks.open,
        todayTodos,
      };
    };

    /* --- Note Handlers -------------------------------------------------------- */

    ctx.ipc.handle('list', () => {
      sortNotes();
      sortTodos();
      return { notes, todos, activeId, prefs, stats: getStats() };
    });

    ctx.ipc.handle('create', args => {
      if (notes.length >= MAX_NOTES) return { ok: false, error: 'note limit reached' };
      const now = Date.now();
      const content = String((args && args.content) || '');
      const note = {
        id: genId('n'),
        title: String((args && args.title) || deriveTitle(content)),
        content: content.slice(0, MAX_CONTENT),
        pinned: false,
        autoTitle: !((args && args.title)),
        createdAt: now,
        updatedAt: now,
      };
      notes.unshift(note);
      activeId = note.id;
      sortNotes();
      save();
      ctx.send('changed', { kind: 'create', notes, activeId, stats: getStats() });
      return { ok: true, note, notes, activeId };
    });

    ctx.ipc.handle('save', args => {
      const { id } = args || {};
      const note = findNote(id);
      if (!note) return { ok: false, error: 'note not found' };
      if (typeof args.content === 'string') note.content = args.content.slice(0, MAX_CONTENT);
      if (typeof args.title === 'string') {
        note.title = args.title.slice(0, 60);
        note.autoTitle = false;
      } else if (note.autoTitle) {
        note.title = deriveTitle(note.content) || note.title;
      }
      note.updatedAt = Date.now();
      sortNotes();
      save();
      return { ok: true, note, stats: getStats() };
    });

    ctx.ipc.handle('rename', args => {
      const note = findNote(args && args.id);
      if (!note) return { ok: false, error: 'note not found' };
      note.title = String(args.title || '').slice(0, 60).trim() || note.title;
      note.autoTitle = false;
      note.updatedAt = Date.now();
      sortNotes();
      save();
      ctx.send('changed', { kind: 'rename', notes, activeId });
      return { ok: true, note };
    });

    ctx.ipc.handle('remove', args => {
      const { id } = args || {};
      if (!findNote(id)) return { ok: false, error: 'note not found' };
      notes = notes.filter(n => n.id !== id);
      if (activeId === id) activeId = notes.length ? notes[0].id : null;
      sortNotes();
      save();
      ctx.send('changed', { kind: 'remove', notes, activeId, stats: getStats() });
      return { ok: true, notes, activeId };
    });

    ctx.ipc.handle('togglePin', args => {
      const note = findNote(args && args.id);
      if (!note) return { ok: false, error: 'note not found' };
      note.pinned = !note.pinned;
      sortNotes();
      save();
      ctx.send('changed', { kind: 'pin', notes, activeId });
      return { ok: true, pinned: note.pinned, notes };
    });

    ctx.ipc.handle('setActive', args => {
      const { id } = args || {};
      if (id === null || findNote(id)) {
        activeId = id;
        save();
        return { ok: true };
      }
      return { ok: false };
    });

    /* --- Todo & Calendar Handlers -------------------------------------------- */

    ctx.ipc.handle('todoCreate', args => {
      if (todos.length >= MAX_TODOS) return { ok: false, error: 'todo limit reached' };
      const title = String((args && args.title) || '').trim().slice(0, 200);
      if (!title) return { ok: false, error: 'title is empty' };
      const now = Date.now();
      const todo = {
        id: genId('td'),
        title,
        done: false,
        dueDate: (args && typeof args.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.dueDate)) ? args.dueDate : null,
        remindAt: (args && Number.isFinite(args.remindAt) && args.remindAt > 0) ? Math.round(args.remindAt) : null,
        reminded: false,
        priority: (args && [0, 1, 2].includes(args.priority)) ? args.priority : 0,
        createdAt: now,
        updatedAt: now,
      };
      todos.unshift(todo);
      sortTodos();
      save();
      ctx.send('changed', { kind: 'todo-create', todo, todos, stats: getStats() });
      return { ok: true, todo, todos, stats: getStats() };
    });

    ctx.ipc.handle('todoToggle', args => {
      const todo = findTodo(args && args.id);
      if (!todo) return { ok: false, error: 'todo not found' };
      todo.done = !todo.done;
      todo.updatedAt = Date.now();
      sortTodos();
      save();
      const stats = getStats();
      if (todo.done) {
        // Broadcast completion event — desktop pet reacts with celebration!
        ctx.send('todo-done', { todo, stats });
      }
      ctx.send('changed', { kind: 'todo-toggle', todo, todos, stats });
      return { ok: true, todo, todos, stats };
    });

    ctx.ipc.handle('todoUpdate', args => {
      const todo = findTodo(args && args.id);
      if (!todo) return { ok: false, error: 'todo not found' };
      const wasDone = todo.done;
      if (typeof args.title === 'string' && args.title.trim()) todo.title = args.title.trim().slice(0, 200);
      if (typeof args.done === 'boolean') todo.done = args.done;
      if (args.dueDate !== undefined) {
        todo.dueDate = (typeof args.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.dueDate)) ? args.dueDate : null;
      }
      if (args.remindAt !== undefined) {
        const nextRemind = Number.isFinite(args.remindAt) && args.remindAt > 0 ? Math.round(args.remindAt) : null;
        if (nextRemind !== todo.remindAt) {
          todo.remindAt = nextRemind;
          todo.reminded = false; // reset reminder status on time change
        }
      }
      if ([0, 1, 2].includes(args.priority)) todo.priority = args.priority;
      todo.updatedAt = Date.now();
      sortTodos();
      save();
      const stats = getStats();
      if (!wasDone && todo.done) {
        ctx.send('todo-done', { todo, stats });
      }
      ctx.send('changed', { kind: 'todo-update', todo, todos, stats });
      return { ok: true, todo, todos, stats };
    });

    ctx.ipc.handle('todoDelete', args => {
      const { id } = args || {};
      if (!findTodo(id)) return { ok: false, error: 'todo not found' };
      todos = todos.filter(t => t.id !== id);
      sortTodos();
      save();
      const stats = getStats();
      ctx.send('changed', { kind: 'todo-delete', todos, stats });
      return { ok: true, todos, stats };
    });

    ctx.ipc.handle('stats', () => ({ ok: true, stats: getStats() }));

    ctx.ipc.handle('setPrefs', args => {
      prefs = { ...prefs, ...(args || {}) };
      save();
      return { ok: true, prefs };
    });

    /* --- Reminder Scheduler (Background Tick) -------------------------------- */

    clearInterval(reminderTimer);
    const checkReminders = () => {
      const now = Date.now();
      let changed = false;
      for (const t of todos) {
        if (!t.done && !t.reminded && t.remindAt && now >= t.remindAt) {
          t.reminded = true;
          changed = true;

          // 1. Desktop Notification
          try {
            if (Notification && typeof Notification.isSupported === 'function' && Notification.isSupported()) {
              new Notification({
                title: '备忘录待办提醒 ⏰',
                body: t.title || '您有一项待办日程时间到了',
                silent: false,
              }).show();
            }
          } catch { /* notification disabled or headless */ }

          // 2. Broadcast reminder event to host & companion plugins (especially desktop-pet!)
          ctx.send('reminder', {
            id: t.id,
            title: t.title,
            dueDate: t.dueDate,
            remindAt: t.remindAt,
          });
        }
      }
      if (changed) {
        save();
        ctx.send('changed', { kind: 'todo-reminded', todos, stats: getStats() });
      }
    };
    reminderTimer = setInterval(checkReminders, 8000);
    reminderTimer.unref?.();
  },

  deactivate() {
    clearInterval(reminderTimer);
    reminderTimer = null;
  },
};