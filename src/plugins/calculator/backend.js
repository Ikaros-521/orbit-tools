/* calculator backend — owns persisted state (history / angle mode / Ans) and
   the workflow entry point. The math engine itself lives in eval.js so the
   smart-peek detector, this backend and the panel all evaluate identically. */
const engine = require('./eval');

const MAX_HISTORY = 60;

module.exports = {
  activate(ctx) {
    const data = ctx.data.get() || {};
    let history = Array.isArray(data.history) ? data.history.filter(h => h && typeof h.expr === 'string') : [];
    let angleMode = data.angleMode === 'rad' ? 'rad' : 'deg';
    let lastAns = typeof data.lastAns === 'number' && Number.isFinite(data.lastAns) ? data.lastAns : null;

    const save = () => ctx.data.set({ history, angleMode, lastAns });

    const push = (expr, display) => {
      const trimmed = String(expr).trim();
      if (!trimmed) return null;
      // consecutive duplicates just bump to top — no flooding on re-equals
      if (history.length && history[0].expr === trimmed) return history[0];
      const item = { id: `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, expr: trimmed, display: String(display), at: Date.now() };
      history.unshift(item);
      if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
      save();
      return item;
    };

    ctx.ipc.handle('getState', () => ({ history, angleMode, lastAns }));

    ctx.ipc.handle('evaluate', args => {
      const { expr } = args || {};
      const res = engine.evaluate(expr, { angleMode, vars: lastAns === null ? null : { ans: lastAns, Ans: lastAns } });
      if (res.ok) { lastAns = res.value; save(); }
      return res;
    });

    // commit on Enter/equals — live per-keystroke preview stays renderer-side
    ctx.ipc.handle('commit', args => {
      const { expr } = args || {};
      const res = engine.evaluate(expr, { angleMode, vars: lastAns === null ? null : { ans: lastAns, Ans: lastAns } });
      if (!res.ok) return res;
      lastAns = res.value;
      const item = push(expr, res.display);
      return { ok: true, value: res.value, display: res.display, item };
    });

    ctx.ipc.handle('setAngleMode', args => {
      angleMode = (args && args.mode) === 'rad' ? 'rad' : 'deg';
      save();
      ctx.send('angle-mode', angleMode);
      return { ok: true, angleMode };
    });

    ctx.ipc.handle('removeHistoryItem', args => {
      const { id } = args || {};
      const before = history.length;
      history = history.filter(h => h.id !== id);
      if (history.length !== before) save();
      return { ok: true };
    });

    ctx.ipc.handle('clearHistory', () => {
      history = [];
      save();
      return { ok: true };
    });

    /* workflow capability `calc`: receives the {value,type,config} envelope.
       A plain string return keeps the workflow envelope contract simple. */
    ctx.ipc.handle('calc', args => {
      const text = String((args && args.value) || '').trim();
      const res = engine.evaluate(text, { angleMode });
      if (!res.ok) throw new Error(`算式 "${text}" 无法求值 (${res.code})`);
      push(text, res.display);
      return res.display;
    });
  },
};
