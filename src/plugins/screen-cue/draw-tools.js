/* Toolbar widget for the draw layer (DOM inside the same window —
   "one renderer, no cross-window IPC", the draw-board pattern).
   Factory receives callbacks and exposes setState() so backend-pushed
   ink defaults can re-select the active buttons. */
(function () {
  const TOOLS = [
    { id: 'pen', label: '✏️', title: '画笔 (1)' },
    { id: 'highlighter', label: '🖍️', title: '荧光笔 (2)' },
    { id: 'rect', label: '□', title: '矩形选框 (3)' },
    { id: 'ellipse', label: '○', title: '圆形选框 (4)' },
    { id: 'arrow', label: '➜', title: '箭头 (5)' },
  ];
  const COLORS = ['#ffb400', '#ff4d4f', '#40a9ff', '#52c41a', '#ff85c0', '#ffffff'];
  const SIZES = [2, 4, 8];

  function createDrawToolbar(bar, opts) {
    const initial = opts.initial || {};
    const state = {
      tool: initial.tool || 'pen',
      color: initial.color || '#ffb400',
      width: initial.width || 4,
    };
    const toolBtns = new Map();
    const colorBtns = new Map();
    const sizeBtns = new Map();

    const toolsEl = bar.querySelector('#scTools');
    const colorsEl = bar.querySelector('#scColors');
    const sizesEl = bar.querySelector('#scSizes');

    const emit = () => {
      if (typeof opts.onToolState === 'function') opts.onToolState({ ...state });
    };

    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sc-tool';
      b.textContent = t.label;
      b.title = t.title;
      b.addEventListener('click', () => {
        state.tool = t.id;
        paint();
        emit();
      });
      toolsEl.appendChild(b);
      toolBtns.set(t.id, b);
    }
    for (const col of COLORS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sc-swatch';
      b.style.background = col;
      b.title = col;
      b.addEventListener('click', () => {
        state.color = col;
        paint();
        emit();
      });
      colorsEl.appendChild(b);
      colorBtns.set(col, b);
    }
    for (const w of SIZES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sc-size';
      b.textContent = String(w);
      b.title = `线宽 ${w}px`;
      b.addEventListener('click', () => {
        state.width = w;
        paint();
        emit();
      });
      sizesEl.appendChild(b);
      sizeBtns.set(w, b);
    }
    for (const b of bar.querySelectorAll('button[data-act]')) {
      b.addEventListener('click', () => {
        const act = b.dataset.act;
        if (act === 'undo' && typeof opts.onUndo === 'function') opts.onUndo();
        if (act === 'clear' && typeof opts.onClear === 'function') opts.onClear();
        if (act === 'exit' && typeof opts.onExit === 'function') opts.onExit();
      });
    }

    /* Drag the whole bar by its handle (bar keeps its fixed position via
       left/top once dragged — transform centered is only the default). */
    const drag = bar.querySelector('#scDrag');
    drag.addEventListener('pointerdown', e => {
      e.preventDefault();
      drag.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startY = e.clientY;
      const r = bar.getBoundingClientRect();
      const baseLeft = r.left;
      const baseTop = r.top;
      const onMove = ev => {
        bar.classList.add('sc-dragged');
        bar.style.left = `${Math.max(0, baseLeft + ev.clientX - startX)}px`;
        bar.style.top = `${Math.max(0, baseTop + ev.clientY - startY)}px`;
      };
      const onUp = () => {
        drag.removeEventListener('pointermove', onMove);
        drag.removeEventListener('pointerup', onUp);
      };
      drag.addEventListener('pointermove', onMove);
      drag.addEventListener('pointerup', onUp);
    });

    function paint() {
      for (const [id, b] of toolBtns) b.classList.toggle('on', id === state.tool);
      for (const [col, b] of colorBtns) b.classList.toggle('on', col === state.color);
      for (const [w, b] of sizeBtns) b.classList.toggle('on', w === state.width);
    }

    paint();

    return {
      setState(next) {
        if (!next) return;
        if (TOOLS.some(t => t.id === next.tool)) state.tool = next.tool;
        if (/^#[0-9a-fA-F]{6}$/.test(String(next.color || ''))) state.color = next.color.toLowerCase();
        if (Number.isFinite(+next.width)) state.width = Math.min(40, Math.max(1, Math.round(+next.width)));
        paint();
      },
      getState() {
        return { ...state };
      },
      COLORS,
    };
  }

  window.createDrawToolbar = createDrawToolbar;
})();
