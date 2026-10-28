(function () {
  function mount(el, ctx) {
    const isZh = ctx.lang !== 'en';

    el.innerHTML = `
      <div class="tool-bar">
        <button type="button" class="btn" id="btnOpen">${isZh ? '打开独立浮窗' : 'Open Window'}</button>
      </div>
      <p style="margin-top:14px;color:var(--ink-dim);font-size:13px;">
        ${isZh ? '点击上方按钮或按快捷键 Ctrl+Shift+W 呼出浮窗。' : 'Click the button or press Ctrl+Shift+W to open window.'}
      </p>
    `;

    el.querySelector('#btnOpen').addEventListener('click', () => {
      ctx.call('openWindow');
    });
  }

  function unmount() {}

  window.Toolbox.panel({ mount, unmount });
})();
