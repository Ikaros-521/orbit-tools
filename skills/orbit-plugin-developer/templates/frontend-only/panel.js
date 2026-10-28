(function () {
  function mount(el, ctx) {
    const isZh = ctx.lang !== 'en';

    el.innerHTML = `
      <div class="tool-bar">
        <button type="button" class="btn" id="btnCount">${isZh ? '统计字符' : 'Count Characters'}</button>
        <button type="button" class="btn ghost" id="btnClear">${isZh ? '清空' : 'Clear'}</button>
        <span class="grow"></span>
        <span class="mono" id="statOutput" style="font-size:12px;color:var(--ink-faint);">0 ${isZh ? '字符' : 'characters'}</span>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;min-height:0;margin-top:10px;">
        <textarea id="myInput" class="input" style="flex:1;resize:none;font-family:monospace;" placeholder="${isZh ? '在此输入文字…' : 'Enter text here…'}"></textarea>
      </div>
    `;

    const btnCount = el.querySelector('#btnCount');
    const btnClear = el.querySelector('#btnClear');
    const statOutput = el.querySelector('#statOutput');
    const input = el.querySelector('#myInput');

    const update = () => {
      const len = input.value.length;
      statOutput.textContent = `${len} ${isZh ? '字符' : 'characters'}`;
    };

    input.addEventListener('input', update);
    btnCount.addEventListener('click', update);
    btnClear.addEventListener('click', () => {
      input.value = '';
      update();
      input.focus();
    });

    input.focus();
  }

  function unmount() {
    // 销毁时的清理操作
  }

  window.Toolbox.panel({ mount, unmount });
})();
