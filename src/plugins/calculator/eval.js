/* calculator expression engine — tokenizer + recursive-descent parser.
   No eval(), no dependencies. UMD so the main process (smart-peek detector,
   workflow backend) can require() it while the panel loads it as a plain
   <script> and gets window.OrbitCalc — one implementation everywhere. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OrbitCalc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* CJK full-width punctuation & math lookalikes typed with a Chinese IME
     normalize to their ASCII counterparts before tokenizing. */
  const CHAR_MAP = {
    '（': '(', '）': ')', '，': ',', '＋': '+', '－': '-', '＊': '*',
    '／': '/', '．': '.', '×': '*', '÷': '/', '−': '-', '–': '-',
    '—': '-', '﹣': '-', '﹢': '+', '：': ':', '　': ' ',
  };
  const normalize = s => String(s)
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[（）＋－＊／．，：×÷−–—﹣﹢　]/g, c => CHAR_MAP[c] || c);

  const CONSTANTS = {
    pi: Math.PI, e: Math.E, tau: Math.PI * 2, phi: (1 + Math.sqrt(5)) / 2,
  };

  /* error codes stay language-neutral; callers localize SYNTAX/DIV0/... */
  const err = (code, message) => ({ ok: false, code, message });
  const toDeg = r => r * 180 / Math.PI;
  const toRad = d => d * Math.PI / 180;

  function buildFuncs(angleMode) {
    const trigIn = angleMode === 'rad' ? (x => x) : toRad;
    const trigOut = angleMode === 'rad' ? (x => x) : toDeg;
    const f = {
      sin: x => Math.sin(trigIn(x)), cos: x => Math.cos(trigIn(x)), tan: x => Math.tan(trigIn(x)),
      asin: x => trigOut(Math.asin(x)), acos: x => trigOut(Math.acos(x)), atan: x => trigOut(Math.atan(x)),
      sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
      asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
      ln: Math.log, log: Math.log10, log2: Math.log2,
      sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp,
      sign: Math.sign, round: Math.round, floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc,
      atan2: Math.atan2, pow: Math.pow, hypot: Math.hypot,
      min: (...a) => Math.min(...a), max: (...a) => Math.max(...a),
      sum: (...a) => a.reduce((s, x) => s + x, 0),
      avg: (...a) => a.reduce((s, x) => s + x, 0) / a.length,
    };
    return f;
  }

  /* --- tokenizer ------------------------------------------------------------ */
  function tokenize(src) {
    const s = normalize(src);
    const tokens = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
        const m = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
        if (!m) return err('SYNTAX', `bad number at ${i + 1}`);
        tokens.push({ t: 'num', v: parseFloat(m[0]), pos: i });
        i += m[0].length;
        continue;
      }
      if (/[A-Za-z_πφτ]/.test(c)) {
        const m = /^(?:[A-Za-z_][A-Za-z0-9_]*|π|φ|τ)/.exec(s.slice(i));
        tokens.push({ t: 'id', v: m[0] === 'π' ? 'pi' : m[0] === 'φ' ? 'phi' : m[0] === 'τ' ? 'tau' : m[0], pos: i });
        i += m[0].length;
        continue;
      }
      if ('+-*/^%!(),'.includes(c)) {
        tokens.push({ t: c === ',' ? 'comma' : c === '(' ? 'lp' : c === ')' ? 'rp' : 'op', v: c, pos: i });
        i++;
        continue;
      }
      return err('SYNTAX', `unexpected character "${c}" at ${i + 1}`);
    }
    return { ok: true, tokens };
  }

  /* --- parser ------------------------------------------------------------------
     precedence (low→high):  + -   →   * / %   →   unary ±   →   ^ (right-assoc,
     binds the unary on its LEFT operand: -2^2 = -4)   →   postfix ! %   → atoms.
     '%' trailing an operand means percent (50% → 0.5); between operands it is
     modulo — decided by whether a value can follow.                              */
  function parse(tokens, funcs, vars) {
    let p = 0;
    const peek = k => tokens[p + (k || 0)];
    const isValueStart = tk => tk && (tk.t === 'num' || tk.t === 'id' || tk.t === 'lp');

    function parseExpr() {
      let v = parseTerm();
      while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
        const op = tokens[p++].v;
        const r = parseTerm();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }

    function parseTerm() {
      let v = parseUnary();
      for (;;) {
        const tk = peek();
        if (tk && tk.t === 'op' && '*/%'.includes(tk.v)) {
          p++;
          const r = parseUnary();
          if (tk.v === '*') v *= r;
          else if (tk.v === '/') { if (r === 0) throw new EvalError('DIV0'); v /= r; }
          else { if (r === 0) throw new EvalError('DIV0'); v %= r; }
        } else if (isValueStart(tk)) {
          v *= parseUnary();             // implicit multiply: 2(3+4), 3pi
        } else break;
      }
      return v;
    }

    function parseUnary() {
      const tk = peek();
      if (tk && tk.t === 'op' && (tk.v === '-' || tk.v === '+')) {
        p++;
        const v = parseUnary();
        return tk.v === '-' ? -v : v;
      }
      return parsePower();
    }

    function parsePower() {
      const base = parsePostfix();
      const tk = peek();
      if (tk && tk.t === 'op' && tk.v === '^') {
        p++;
        const exp = parseUnary();        // right-assoc, allows 2^-3
        return Math.pow(base, exp);
      }
      return base;
    }

    function parsePostfix() {
      let v = parseAtom();
      for (;;) {
        const tk = peek();
        if (tk && tk.t === 'op' && tk.v === '!') {
          p++;
          if (!(v >= 0 && Number.isInteger(v) && v <= 170)) throw new EvalError('RANGE');
          let r = 1;
          for (let k = 2; k <= v; k++) r *= k;
          v = r;
        } else if (tk && tk.t === 'op' && tk.v === '%' && !isValueStart(peek(1))) {
          p++;                           // trailing percent: 50% → 0.5
          v /= 100;
        } else break;
      }
      return v;
    }

    function parseAtom() {
      const tk = peek();
      if (!tk) throw new EvalError('SYNTAX');
      if (tk.t === 'num') { p++; return tk.v; }
      if (tk.t === 'op' && (tk.v === '-' || tk.v === '+')) return parseUnary();
      if (tk.t === 'lp') {
        p++;
        const v = parseExpr();
        if (!peek() || peek().t !== 'rp') throw new EvalError('SYNTAX');
        p++;
        return v;
      }
      if (tk.t === 'id') {
        p++;
        const name = tk.v.toLowerCase();
        if (peek() && peek().t === 'lp') {          // function call
          p++;
          const args = [];
          if (peek() && peek().t !== 'rp') {
            args.push(parseExpr());
            while (peek() && peek().t === 'comma') { p++; args.push(parseExpr()); }
          }
          if (!peek() || peek().t !== 'rp') throw new EvalError('SYNTAX');
          p++;
          const fn = funcs[name];
          if (typeof fn !== 'function') throw new EvalError('NAME');
          try { return fn(...args); } catch { throw new EvalError('RANGE'); }
        }
        if (vars && Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
        if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) return CONSTANTS[name];
        throw new EvalError('NAME');
      }
      throw new EvalError('SYNTAX');
    }

    class EvalError extends Error {
      constructor(code) {
        super(code);
        this.code = code;
      }
    }

    const value = parseExpr();
    if (p < tokens.length) throw new EvalError('SYNTAX');
    if (typeof value !== 'number' || Number.isNaN(value)) throw new EvalError('RANGE');
    if (!Number.isFinite(value)) throw new EvalError('RANGE');
    return value;
  }

  /* trim float noise: 0.1+0.2 → 0.3, not 0.30000000000000004 */
  function formatNumber(v) {
    if (!Number.isFinite(v)) return null;
    if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
    const p = parseFloat(v.toPrecision(12));
    if ((Math.abs(p) >= 1e15 || (Math.abs(p) < 1e-9 && p !== 0))) {
      return p.toExponential(8).replace(/\.?0+e/, 'e');
    }
    return String(p);
  }

  /* thousand separators on the integer part for display; raw stays copyable */
  function groupDigits(str) {
    const m = /^(-?)(\d+)(\.\d+)?$/.exec(String(str));
    if (!m) return String(str);
    return m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (m[3] || '');
  }

  function evaluate(expr, opts) {
    if (typeof expr !== 'string' || !expr.trim()) return err('EMPTY', 'empty expression');
    const angleMode = opts && opts.angleMode === 'rad' ? 'rad' : 'deg';
    const vars = opts && opts.vars ? opts.vars : null;
    const lexed = tokenize(expr);
    if (!lexed.ok) return lexed;
    try {
      const value = parse(lexed.tokens, buildFuncs(angleMode), vars);
      const display = formatNumber(value);
      if (display === null) return err('RANGE', 'result out of range');
      return { ok: true, value, display };
    } catch (e) {
      if (e && e.code) return err(e.code, `evaluation failed: ${e.code}`);
      return err('SYNTAX', String(e && e.message || e));
    }
  }

  return { evaluate, formatNumber, groupDigits, CONSTANTS };
});
