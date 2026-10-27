/* screenshot-pin host panel — trigger captures, manage pins. */
(function () {
  function mount(el, ctx) {
    const L = ctx.lang;
    const T = {
      zh: { capture: '框选截图', hint: '快捷键可在 设置 → 插件 里修改；框选时按 ESC 取消',
        pins: '当前贴图', closeAll: '关闭全部贴图', none: '没有贴图',
        hideHost: '截图时自动隐藏当前程序' },
      en: { capture: 'Capture region', hint: 'Hotkey is configurable in Settings → Plugins; ESC cancels a capture',
        pins: 'Pinned shots', closeAll: 'Close all pins', none: 'no pins',
        hideHost: 'Auto hide window during capture' },
    }[L === 'en' ? 'en' : 'zh'];

    let pinCount = 0;
    let hideHost = true;

    el.innerHTML = `
      <div class="sp-wrap">
        <button type="button" class="sp-big" data-act="capture">
          <span class="sp-big-ic">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M8 5h8"/><rect x="3" y="7" width="18" height="14" rx="3"/><path d="m9 12 2.2 5 1.3-2.7L15.2 13 11 14.7 9 12z" fill="currentColor" stroke="none"/></svg>
          </span>
          <span>${T.capture}</span>
        </button>
        <p class="sp-hint">${T.hint}</p>
        <div class="sp-opt">
          <span>${T.hideHost}</span>
          <button type="button" class="switch on" data-role="hideHost" role="switch" aria-checked="true"></button>
        </div>
        <div class="sp-pins">
          <span class="hint">${T.pins}</span>
          <b class="mono" data-role="count">0</b>
          <button type="button" class="btn ghost" data-act="closeAll">${T.closeAll}</button>
        </div>
      </div>`;

    const countEl = el.querySelector('[data-role=count]');
    const hideHostSw = el.querySelector('[data-role=hideHost]');
    const optEl = el.querySelector('.sp-opt');

    const refresh = async () => {
      try {
        const r = await ctx.call('pins');
        pinCount = r.count;
        countEl.textContent = String(r.count);
      } catch { /* backend off */ }
    };

    const loadConfig = async () => {
      try {
        const cfg = await ctx.call('getConfig');
        hideHost = cfg.hideHost !== false;
        hideHostSw.classList.toggle('on', hideHost);
        hideHostSw.setAttribute('aria-checked', String(hideHost));
      } catch {}
    };

    const toggleHideHost = async () => {
      hideHost = !hideHost;
      hideHostSw.classList.toggle('on', hideHost);
      hideHostSw.setAttribute('aria-checked', String(hideHost));
      try {
        await ctx.call('setConfig', { hideHost });
      } catch {}
    };

    optEl.addEventListener('click', e => {
      e.preventDefault();
      toggleHideHost();
    });

    el.addEventListener('click', async e => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      if (b.dataset.act === 'capture') {
        await ctx.call('startCapture'); // host hides itself; overlays take over
      } else if (b.dataset.act === 'closeAll') {
        await ctx.call('closeAllPins');
        refresh();
      }
    });

    ctx.onEvent('pins-changed', () => refresh());
    refresh();
    loadConfig();
  }

  window.Toolbox.panel({ mount });
})();
