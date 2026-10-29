/* calculator panel — display + keypad + collapsible history sidebar.
   Live evaluation runs renderer-side against the same engine the backend and
   smart-peek use (eval.js, loaded here as window.OrbitCalc); only commits,
   history edits and the angle mode round-trip through the backend so every
   window/tab stays in sync. */
(function () {
  'use strict';

  /* the engine ships as a sibling file — load once, cache on success */
  function loadEngine(cb) {
    if (window.OrbitCalc) return cb(window.OrbitCalc);
    const s = document.createElement('script');
    s.src = 'plugin://calculator/eval.js';
    s.onload = () => cb(window.OrbitCalc || null);
    s.onerror = () => cb(null);
    document.head.appendChild(s);
  }

  const ERR_TEXT = {
    zh: { SYNTAX: '算式语法错误', DIV0: '除数不能为零', RANGE: '数值超出范围', NAME: '未知函数或变量', EMPTY: '' },
    en: { SYNTAX: 'syntax error', DIV0: 'division by zero', RANGE: 'out of range', NAME: 'unknown function or name', EMPTY: '' },
  };

  /* trailing-number sign flip; a '-' after another operator or '(' is unary */
  function toggleTrailingSign(v) {
    const m = /(\d*\.?\d+(?:[eE][+-]?\d+)?)$/.exec(v);
    if (!m) return v + '-';
    const numStart = v.length - m[0].length;
    const prev = v[numStart - 1];
    const prev2 = v[numStart - 2];
    if (prev === '-' && (numStart - 1 === 0 || '+-*/^%!('.includes(prev2))) {
      return v.slice(0, numStart - 1) + m[0];            // strip unary minus
    }
    return v.slice(0, numStart) + '-' + m[0];            // "3-5" → "3--5" = 3-(-5)
  }

  function mount(el, ctx) {
    const isZh = ctx.lang !== 'en';
    const L = (zh, en) => (isZh ? zh : en);
    let angleMode = 'deg';
    let lastAns = null;
    let history = [];

    el.innerHTML = `
      <div class="calc-root">
        <div class="calc-main">
          <div class="calc-topbar">
            <div class="seg calc-mode" role="group" aria-label="${L('角度制', 'Angle unit')}">
              <button type="button" data-mode="deg" aria-pressed="true">DEG</button>
              <button type="button" data-mode="rad" aria-pressed="false">RAD</button>
            </div>
            <span class="calc-hint">${L('Enter 计算 · 点击结果复制 · Esc 清空', 'Enter = · click result to copy · Esc clear')}</span>
            <div class="calc-top-ops">
              <button type="button" class="btn ghost small calc-hist-toggle" aria-pressed="false">${L('历史', 'History')}</button>
            </div>
          </div>
          <div class="calc-display">
            <input class="calc-input mono" spellcheck="false" autocomplete="off"
              placeholder="${L('输入算式：1+2*3 · sin(30) · sqrt(2)^2 · 5! · 50%+10', 'type an expression: 1+2*3 · sin(30) · sqrt(2)^2 · 5! · 50%+10')}">
            <div class="calc-live mono" title="${L('点击复制结果', 'click to copy')}"></div>
          </div>
          <div class="calc-pad">
            <button type="button" class="calc-key" data-k="(">(</button>
            <button type="button" class="calc-key" data-k=")">)</button>
            <button type="button" class="calc-key" data-k="%">%</button>
            <button type="button" class="calc-key" data-k="^">xʸ</button>
            <button type="button" class="calc-key" data-k="!">n!</button>
            <button type="button" class="calc-key calc-key-warn" data-act="back">⌫</button>

            <button type="button" class="calc-key" data-k="7">7</button>
            <button type="button" class="calc-key" data-k="8">8</button>
            <button type="button" class="calc-key" data-k="9">9</button>
            <button type="button" class="calc-key" data-op="÷">÷</button>
            <button type="button" class="calc-key calc-key-fn" data-ins="sin(">sin</button>
            <button type="button" class="calc-key calc-key-fn" data-ins="cos(">cos</button>

            <button type="button" class="calc-key" data-k="4">4</button>
            <button type="button" class="calc-key" data-k="5">5</button>
            <button type="button" class="calc-key" data-k="6">6</button>
            <button type="button" class="calc-key" data-op="×">×</button>
            <button type="button" class="calc-key calc-key-fn" data-ins="sqrt(">√</button>
            <button type="button" class="calc-key calc-key-fn" data-ins="tan(">tan</button>

            <button type="button" class="calc-key" data-k="1">1</button>
            <button type="button" class="calc-key" data-k="2">2</button>
            <button type="button" class="calc-key" data-k="3">3</button>
            <button type="button" class="calc-key" data-op="−">−</button>
            <button type="button" class="calc-key calc-key-fn" data-ins="ln(">ln</button>
            <button type="button" class="calc-key calc-key-fn" data-ins="log(">log</button>

            <button type="button" class="calc-key" data-k="0">0</button>
            <button type="button" class="calc-key" data-k=".">.</button>
            <button type="button" class="calc-key" data-act="sign">±</button>
            <button type="button" class="calc-key" data-op="+">+</button>
            <button type="button" class="calc-key calc-key-fn" data-k="pi">π</button>
            <button type="button" class="calc-key calc-key-fn" data-k="e">e</button>

            <button type="button" class="calc-key calc-key-fn" data-var="ans">Ans</button>
            <button type="button" class="calc-key calc-key-warn" data-act="clear">C</button>
            <button type="button" class="calc-key calc-key-eq" data-act="equals" style="grid-column: span 4">=</button>
          </div>
        </div>
        <aside class="calc-history" hidden>
          <div class="calc-hist-head">
            <span>${L('历史记录', 'History')}</span>
            <button type="button" class="btn ghost small calc-hist-clear">${L('清空', 'Clear')}</button>
          </div>
          <div class="calc-hist-list"></div>
        </aside>
      </div>`;

    const input = el.querySelector('.calc-input');
    const live = el.querySelector('.calc-live');
    const histAside = el.querySelector('.calc-history');
    const histList = el.querySelector('.calc-hist-list');
    const histToggle = el.querySelector('.calc-hist-toggle');
    const pad = el.querySelector('.calc-pad');
    const modeSeg = el.querySelector('.calc-mode');
    let engine = null;
    let lastDisplay = '';

    const flash = (node, text) => {
      const orig = node.textContent;
      node.textContent = text;
      setTimeout(() => { if (node.textContent === text) node.textContent = orig; }, 900);
    };

    const renderHistory = () => {
      histList.innerHTML = '';
      if (!history.length) {
        const empty = document.createElement('div');
        empty.className = 'calc-hist-empty';
        empty.textContent = L('暂无记录 · 按 Enter 记录算式', 'nothing yet · press Enter to record');
        histList.appendChild(empty);
        return;
      }
      for (const h of history) {
        const item = document.createElement('div');
        item.className = 'calc-hist-item';
        const expr = document.createElement('button');
        expr.type = 'button';
        expr.className = 'calc-hist-expr mono';
        expr.innerHTML = `<span class="calc-hist-e"></span><span class="calc-hist-r mono"></span>`;
        expr.querySelector('.calc-hist-e').textContent = h.expr;
        expr.querySelector('.calc-hist-r').textContent = '= ' + h.display;
        expr.title = L('点击填入该算式', 'click to reuse');
        expr.addEventListener('click', () => {
          input.value = h.expr;
          input.focus();
          doLive();
        });
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'calc-hist-del';
        del.textContent = '×';
        del.title = L('删除', 'Delete');
        del.addEventListener('click', async e => {
          e.stopPropagation();
          await ctx.call('removeHistoryItem', { id: h.id }).catch(() => {});
          history = history.filter(x => x.id !== h.id);
          renderHistory();
        });
        item.append(expr, del);
        histList.appendChild(item);
      }
    };

    const doLive = () => {
      if (!engine) return;
      const expr = input.value.trim();
      lastDisplay = '';
      if (!expr) { live.textContent = ''; live.classList.remove('err'); return; }
      const res = engine.evaluate(expr, { angleMode, vars: lastAns === null ? null : { ans: lastAns, Ans: lastAns } });
      if (res.ok) {
        lastDisplay = res.display;
        live.textContent = '= ' + engine.groupDigits(res.display);
        live.classList.remove('err');
      } else {
        live.textContent = expr ? (ERR_TEXT[isZh ? 'zh' : 'en'][res.code] || res.code) : '';
        live.classList.add('err');
      }
    };

    const commit = async () => {
      const expr = input.value.trim();
      if (!expr) return;
      try {
        const res = await ctx.call('commit', { expr });
        if (res && res.ok) {
          lastAns = res.value;
          lastDisplay = res.display;
          live.textContent = '= ' + (engine ? engine.groupDigits(res.display) : res.display);
          live.classList.remove('err');
          if (res.item) {
            history = [res.item, ...history.filter(h => h.id !== res.item.id)].slice(0, 60);
            renderHistory();
          }
          input.select();
        }
      } catch { doLive(); }
    };

    const insert = text => {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      input.value = input.value.slice(0, start) + text + input.value.slice(end);
      const pos = start + text.length;
      input.setSelectionRange(pos, pos);
      input.focus();
      doLive();
    };

    /* --- keypad -------------------------------------------------------------- */
    pad.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || !engine) return;
      const k = b.dataset.k;
      if (k) return insert(k);
      if (b.dataset.ins) return insert(b.dataset.ins);
      if (b.dataset.var) return insert('Ans');
      if (b.dataset.op) return insert(b.dataset.op);
      const act = b.dataset.act;
      if (act === 'back') {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        if (start !== end) input.value = input.value.slice(0, start) + input.value.slice(end);
        else if (start > 0) input.value = input.value.slice(0, start - 1) + input.value.slice(start);
        input.focus();
        doLive();
      } else if (act === 'clear') {
        input.value = '';
        input.focus();
        doLive();
      } else if (act === 'sign') {
        input.value = toggleTrailingSign(input.value);
        input.focus();
        doLive();
      } else if (act === 'equals') {
        commit();
      }
    });

    input.addEventListener('input', doLive);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { input.value = ''; doLive(); }
    });
    live.addEventListener('click', async () => {
      if (!lastDisplay) return;
      try {
        await navigator.clipboard.writeText(lastDisplay);
        flash(live, L('✓ 已复制', '✓ copied'));
      } catch { /* clipboard may be locked by the OS */ }
    });

    histToggle.addEventListener('click', () => {
      const open = histAside.hidden;
      histAside.hidden = !open;
      histToggle.setAttribute('aria-pressed', String(open));
    });
    el.querySelector('.calc-hist-clear').addEventListener('click', async () => {
      await ctx.call('clearHistory').catch(() => {});
      history = [];
      renderHistory();
    });

    modeSeg.addEventListener('click', e => {
      const b = e.target.closest('button[data-mode]');
      if (!b || b.dataset.mode === angleMode) return;
      angleMode = b.dataset.mode;
      modeSeg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      ctx.call('setAngleMode', { mode: angleMode }).catch(() => {});
      doLive();
    });
    ctx.onEvent('angle-mode', mode => {
      if (mode !== angleMode) {
        angleMode = mode;
        modeSeg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.mode === mode)));
        doLive();
      }
    });

    /* --- boot: engine + persisted state --------------------------------------- */
    loadEngine(eng => {
      engine = eng;
      if (!engine) {
        live.textContent = L('算式引擎加载失败', 'failed to load expression engine');
        live.classList.add('err');
        return;
      }
      ctx.call('getState').then(st => {
        if (!st) return;
        angleMode = st.angleMode || 'deg';
        lastAns = typeof st.lastAns === 'number' ? st.lastAns : null;
        history = Array.isArray(st.history) ? st.history : [];
        modeSeg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.mode === angleMode)));
        renderHistory();
        // pipeline payloads (send-to-calculator) prefill the expression
        const pv = ctx.payload && typeof ctx.payload.value === 'string' ? ctx.payload.value.trim() : '';
        if (pv) {
          input.value = pv;
          doLive();
          const res = engine.evaluate(pv, { angleMode });
          if (res.ok) commit();
        } else {
          doLive();
        }
      }).catch(() => doLive());
      input.focus();
    });
  }

  window.Toolbox.panel({ mount });
})();
