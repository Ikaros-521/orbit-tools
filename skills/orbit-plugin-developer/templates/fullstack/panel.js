(function () {
  function mount(el, ctx) {
    const isZh = ctx.lang !== 'en';

    el.innerHTML = `
      <div class="tool-bar">
        <button type="button" class="btn" id="btnRefresh">${isZh ? '获取系统信息 (IPC)' : 'Refresh Stats (IPC)'}</button>
      </div>
      <div id="statCard" style="margin-top:14px;padding:14px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--line-subtle);">
        <pre class="mono" id="statsContent" style="margin:0;font-size:12.5px;color:var(--ink);">${isZh ? '点击上方按钮获取系统数据…' : 'Click above to fetch system data…'}</pre>
      </div>
    `;

    const btn = el.querySelector('#btnRefresh');
    const content = el.querySelector('#statsContent');

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const stats = await ctx.call('getSystemStats');
        content.textContent = JSON.stringify(stats, null, 2);
      } catch (err) {
        content.textContent = (isZh ? '调用失败: ' : 'Call failed: ') + err.message;
      } finally {
        btn.disabled = false;
      }
    });

    // 监听后端推送
    ctx.onEvent('from-backend', payload => {
      alert((isZh ? '收到后端推送: ' : 'Event: ') + payload.message);
    });
  }

  function unmount() {}

  window.Toolbox.panel({ mount, unmount });
})();
