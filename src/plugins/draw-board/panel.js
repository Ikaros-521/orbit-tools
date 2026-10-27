/* draw-board host panel. */
(function () {
  function mount(el, ctx) {
    const L = ctx.lang;
    const T = {
      zh: { open: '打开画板', hint: '画板覆盖当前屏幕，可标注后保存 PNG；ESC 退出', openNow: '画板已打开' },
      en: { open: 'Open board', hint: 'The board covers the screen — annotate, save PNG, ESC to exit', openNow: 'board is open' },
    }[L === 'en' ? 'en' : 'zh'];

    el.innerHTML = `
      <div class="db-wrap">
        <button type="button" class="sp-big" data-act="open">
          <span class="sp-big-ic">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
          </span>
          <span>${T.open}</span>
        </button>
        <p class="sp-hint">${T.hint}</p>
      </div>`;

    el.addEventListener('click', async e => {
      if (e.target.closest('button[data-act=open]')) {
        await ctx.call('start'); // host hides itself while the board is up
      }
    });
  }

  window.Toolbox.panel({ mount });
})();
