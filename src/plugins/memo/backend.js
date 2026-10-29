/* memo backend — note storage lives in plugin-data/memo.json via ctx.data.
   Content autosave is called so often (debounced per keystroke burst) that it
   deliberately does NOT broadcast; only structural changes (create/remove/
   pin/rename/active) emit 'changed' so multiple surfaces stay in sync. */

const MAX_NOTES = 500;
const MAX_CONTENT = 512 * 1024; // 512 KB per note — guards against pathological paste

const WELCOME = [
  '# 欢迎使用备忘录 ✨',
  '',
  '支持 **Markdown** 实时分屏渲染，像 VS Code 一样边写边看。',
  '',
  '## 编辑器功能',
  '- `Tab` / `Shift+Tab` 缩进，列表回车自动续项',
  '- `Ctrl+B` 加粗 · `Ctrl+I` 斜体 · `Ctrl+S` 立即保存',
  '- 选中文字后点工具栏快速包裹 **粗体** / *斜体* / ~~删除线~~ / `代码`',
  '- 底部状态栏实时显示 **Ln 行, Col 列** 与 行 / 字 / 词 / 选中 统计',
  '',
  '## Markdown 速查',
  '',
  '> 引用块：灵感随时记下来',
  '',
  '1. 有序列表',
  '2. 回车自动编号',
  '',
  '- [x] 支持任务清单',
  '- [ ] 试试 `Ctrl+Shift+N` 快速唤起备忘录',
  '',
  '| 功能     | 说明           |',
  '| -------- | -------------- |',
  '| 分屏预览 | 编辑 + 实时渲染 |',
  '| 字数统计 | 行 / 字 / 词    |',
  '',
  '```js',
  '// 代码块保留等宽排版',
  "const hello = 'orbit';",
  '```',
  '',
  '---',
  '',
  '普通段落支持[链接](https://github.com/Ikaros-521/orbit-tools)与自动识别的裸链接 https://electronjs.org ，单行换行也会断行。',
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

module.exports = {
  activate(ctx) {
    const data = ctx.data.get() || {};
    let notes = Array.isArray(data.notes) ? data.notes.filter(n => n && typeof n.id === 'string') : [];
    let activeId = typeof data.activeId === 'string' ? data.activeId : null;
    let prefs = data.prefs && typeof data.prefs === 'object' ? data.prefs : {};

    const save = () => ctx.data.set({ notes, activeId, prefs });
    const genId = () => `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const sortNotes = () => {
      notes.sort((a, b) => {
        if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
    };

    // seed only a truly fresh data file — a user who deleted every note
    // legitimately wants an empty list
    if (!Array.isArray(data.notes)) {
      const now = Date.now();
      notes = [{ id: genId(), title: deriveTitle(WELCOME) || '欢迎使用备忘录', content: WELCOME, pinned: false, autoTitle: true, createdAt: now, updatedAt: now }];
      activeId = notes[0].id;
      save();
    }
    if (activeId && !notes.some(n => n.id === activeId)) activeId = notes.length ? notes[0].id : null;

    const find = id => notes.find(n => n.id === id);

    ctx.ipc.handle('list', () => {
      sortNotes();
      return { notes, activeId, prefs };
    });

    ctx.ipc.handle('create', args => {
      if (notes.length >= MAX_NOTES) return { ok: false, error: 'note limit reached' };
      const now = Date.now();
      const content = String((args && args.content) || '');
      const note = {
        id: genId(),
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
      ctx.send('changed', { kind: 'create', notes, activeId });
      return { ok: true, note, notes, activeId };
    });

    ctx.ipc.handle('save', args => {
      const { id } = args || {};
      const note = find(id);
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
      return { ok: true, note };
    });

    ctx.ipc.handle('rename', args => {
      const note = find(args && args.id);
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
      if (!find(id)) return { ok: false, error: 'note not found' };
      notes = notes.filter(n => n.id !== id);
      if (activeId === id) activeId = notes.length ? notes[0].id : null;
      sortNotes();
      save();
      ctx.send('changed', { kind: 'remove', notes, activeId });
      return { ok: true, notes, activeId };
    });

    ctx.ipc.handle('togglePin', args => {
      const note = find(args && args.id);
      if (!note) return { ok: false, error: 'note not found' };
      note.pinned = !note.pinned;
      sortNotes();
      save();
      ctx.send('changed', { kind: 'pin', notes, activeId });
      return { ok: true, pinned: note.pinned, notes };
    });

    ctx.ipc.handle('setActive', args => {
      const { id } = args || {};
      if (id === null || find(id)) {
        activeId = id;
        save();
        return { ok: true };
      }
      return { ok: false };
    });

    ctx.ipc.handle('setPrefs', args => {
      prefs = { ...prefs, ...(args || {}) };
      save();
      return { ok: true, prefs };
    });
  },
};
