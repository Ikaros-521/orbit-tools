/* screen-cue host panel: live status badges, one-click actions (each is an
   independent exit path — the "can't turn it off" failsafe), and settings
   that apply live through the backend. */
(function () {
  function mount(el, ctx) {
    const isEn = ctx.lang === 'en';
    const T = {
      annotate: isEn ? 'Annotation mode' : '标注模式',
      annotateOn: isEn ? 'Exit annotation' : '退出标注',
      annotateOff: isEn ? 'Start annotating' : '开始标注',
      clearInk: isEn ? 'Clear ink' : '清除标注',
      magnifier: isEn ? 'Magnifier' : '放大镜',
      magOn: isEn ? 'Turn off' : '关闭放大镜',
      magOff: isEn ? 'Turn on' : '打开放大镜',
      stopAll: isEn ? 'Close & clear all' : '全部关闭并清空',
      strokes: isEn ? 'strokes' : '笔迹',
      on: isEn ? 'ON' : '开',
      off: isEn ? 'OFF' : '关',
      inkSection: isEn ? 'Ink defaults' : '标注默认',
      tool: isEn ? 'Tool' : '工具',
      width: isEn ? 'Width' : '线宽',
      exitBehavior: isEn ? 'On exit' : '退出后笔迹',
      keep: isEn ? 'Keep' : '保留',
      fade: isEn ? 'Auto-fade' : '自动淡出',
      clear: isEn ? 'Clear' : '清除',
      seconds: isEn ? 's' : '秒',
      freezeScreen: isEn ? 'Freeze screen while annotating' : '标注时冻结屏幕',
      freezeNote: isEn ? 'Off by default. Applies next time you start annotating; exiting always restores the live screen.' : '默认关闭；下次进入标注时生效，退出标注立即恢复实时画面。',
      showCrosshair: isEn ? 'Show center crosshair' : '显示中心十字',
      showZoomBadge: isEn ? 'Show zoom label' : '显示倍率标签',
      lensSection: isEn ? 'Magnifier' : '放大镜',
      shape: isEn ? 'Shape' : '形态',
      circle: isEn ? 'Circle' : '圆形',
      rect: isEn ? 'Rect' : '矩形',
      fullscreen: isEn ? 'Fullscreen' : '整屏',
      fullNote: isEn
        ? 'Fullscreen magnifies around the cursor and fills as much of the screen as possible; to keep the lens from capturing itself (a recursion that collapses to black) it automatically keeps clear of the source area and shrinks when needed.'
        : '整屏模式以鼠标为中心放大、尽量铺满屏幕；为避免放大镜拍摄到自己形成递归发黑，画面会自动避开取景区域、空间不足时自动收缩。',
      size: isEn ? 'Size' : '尺寸',
      zoom: isEn ? 'Zoom' : '倍率',
      hint: isEn
        ? 'Annotation keeps the screen live by default; enable freezing to annotate a still frame. Ink stays click-through after exit. Rebind hotkeys in the plugin center; close effects from the action palette (Ctrl+K) or here.'
        : '标注默认不冻结画面；可开启冻结，在当前静态画面上标注。退出后笔迹点击穿透、不影响操作底层应用。快捷键可在插件中心改绑；所有效果也可从动作抽屉（Ctrl+K）或本面板关闭。',
      winOnly: isEn ? 'Magnifier needs Windows (GDI capture).' : '放大镜仅支持 Windows（GDI 采集）。',
    };
    const TOOLS = [
      ['pen', isEn ? 'Pen' : '画笔'],
      ['highlighter', isEn ? 'Highlighter' : '荧光笔'],
      ['rect', isEn ? 'Rect' : '矩形'],
      ['ellipse', isEn ? 'Ellipse' : '圆形'],
      ['arrow', isEn ? 'Arrow' : '箭头'],
    ];

    el.innerHTML = `
      <div class="sc-wrap">
        <div class="sc-status">
          <span class="sc-badge" id="scBadgeDraw"><span class="dot"></span><span class="txt"></span></span>
          <span class="sc-badge" id="scBadgeMag"><span class="dot"></span><span class="txt"></span></span>
          <span class="sc-badge" id="scBadgeInk"><span class="txt"></span></span>
        </div>
        <div class="sc-err" id="scErr" style="display:none"></div>

        <div class="sc-actions">
          <button type="button" class="sc-btn" data-act="annotate">
            <span class="t" id="scAnnotateLabel">${T.annotateOff}</span>
            <span class="k">Ctrl+Shift+S</span>
          </button>
          <button type="button" class="sc-btn" data-act="clearInk">
            <span class="t">${T.clearInk}</span>
            <span class="k">Ctrl+Shift+X</span>
          </button>
          <button type="button" class="sc-btn" data-act="magnifier">
            <span class="t" id="scMagLabel">${T.magOff}</span>
            <span class="k">Ctrl+Shift+F</span>
          </button>
          <button type="button" class="sc-btn danger" data-act="stopAll">
            <span class="t">${T.stopAll}</span>
            <span class="k">Esc-safe</span>
          </button>
        </div>

        <div class="sc-section" id="scInkSection">
          <h3>${T.inkSection}</h3>
          <div class="sc-row"><label class="sc-check"><input type="checkbox" id="scFreezeScreen"> ${T.freezeScreen}</label></div>
          <p class="sc-note">${T.freezeNote}</p>
          <div class="sc-row">
            <label>${T.tool}</label>
            <div class="sc-seg" id="scTools">${TOOLS.map(([id, n]) => `<button type="button" data-tool="${id}">${n}</button>`).join('')}</div>
          </div>
          <div class="sc-row">
            <label>${T.width}</label>
            <input type="range" class="sc-range" id="scWidth" min="1" max="20" step="1">
            <span class="sc-range-val" id="scWidthVal"></span>
          </div>
          <div class="sc-row">
            <label>${T.exitBehavior}</label>
            <div class="sc-seg" id="scExits">
              <button type="button" data-exit="keep">${T.keep}</button>
              <button type="button" data-exit="fade">${T.fade}</button>
              <button type="button" data-exit="clear">${T.clear}</button>
            </div>
            <input type="number" class="sc-input" id="scFadeSec" min="2" max="120" step="1" style="display:none">
            <span id="scFadeSecLabel" style="display:none; font-size:12px; color: var(--ink-dim)">${T.seconds}</span>
          </div>
        </div>

        <div class="sc-section" id="scLensSection">
          <h3>${T.lensSection}</h3>
          <div class="sc-row">
            <label class="sc-check"><input type="checkbox" id="scShowCrosshair"> ${T.showCrosshair}</label>
            <label class="sc-check"><input type="checkbox" id="scShowZoomBadge"> ${T.showZoomBadge}</label>
          </div>
          <div class="sc-row">
            <label>${T.shape}</label>
            <div class="sc-seg" id="scShapes">
              <button type="button" data-shape="circle">${T.circle}</button>
              <button type="button" data-shape="rect">${T.rect}</button>
              <button type="button" data-shape="fullscreen">${T.fullscreen}</button>
            </div>
          </div>
          <p class="sc-note" id="scFullNote" style="display:none">${T.fullNote}</p>
          <div class="sc-row" id="scCircleRow">
            <label>${T.size}</label>
            <input type="number" class="sc-input" id="scCircleD" min="120" max="1000" step="10">
            <span style="font-size:12px; color: var(--ink-dim)">px</span>
          </div>
          <div class="sc-row" id="scRectRow" style="display:none">
            <label>${T.size}</label>
            <input type="number" class="sc-input" id="scRectW" min="120" max="1400" step="10">
            <span style="font-size:12px; color: var(--ink-dim)">×</span>
            <input type="number" class="sc-input" id="scRectH" min="80" max="1000" step="10">
            <span style="font-size:12px; color: var(--ink-dim)">px</span>
          </div>
          <div class="sc-row">
            <label>${T.zoom}</label>
            <input type="range" class="sc-range" id="scZoom" min="1.5" max="8" step="0.5">
            <span class="sc-range-val" id="scZoomVal"></span>
          </div>
          <p class="sc-note" id="scWinNote" style="display:none">${T.winOnly}</p>
        </div>

        <p class="sc-note">${T.hint}</p>
      </div>`;

    const $ = id => el.querySelector(`#${id}`);
    let state = null;

    function refresh(st) {
      if (!st) return;
      state = st;
      const ink = st.settings.ink;
      const lens = st.settings.lens;
      $('scFreezeScreen').checked = ink.freezeScreen === true;
      $('scShowCrosshair').checked = lens.showCrosshair !== false;
      $('scShowZoomBadge').checked = lens.showZoomBadge !== false;

      const bd = $('scBadgeDraw');
      bd.classList.toggle('on', st.drawMode);
      bd.querySelector('.txt').textContent = `${T.annotate}: ${st.drawMode ? T.on : T.off}`;
      $('scAnnotateLabel').textContent = st.drawMode ? T.annotateOn : T.annotateOff;
      el.querySelector('[data-act=annotate]').classList.toggle('on', st.drawMode);

      const bm = $('scBadgeMag');
      bm.classList.toggle('on', st.magnifierOn);
      bm.querySelector('.txt').textContent = `${T.magnifier}: ${st.magnifierOn ? T.on : T.off}`;
      $('scMagLabel').textContent = st.magnifierOn ? T.magOn : T.magOff;
      el.querySelector('[data-act=magnifier]').classList.toggle('on', st.magnifierOn);

      $('scBadgeInk').querySelector('.txt').textContent = `${st.strokeCount} ${T.strokes}`;

      const err = $('scErr');
      err.style.display = st.error ? 'block' : 'none';
      if (st.error) err.textContent = st.error;

      for (const b of $('scTools').querySelectorAll('button')) {
        b.classList.toggle('on', b.dataset.tool === ink.tool);
      }
      $('scWidth').value = String(ink.width);
      $('scWidthVal').textContent = `${ink.width}px`;
      for (const b of $('scExits').querySelectorAll('button')) {
        b.classList.toggle('on', b.dataset.exit === ink.exitAction);
      }
      const fading = ink.exitAction === 'fade';
      $('scFadeSec').style.display = fading ? 'inline-block' : 'none';
      $('scFadeSecLabel').style.display = fading ? 'inline' : 'none';
      $('scFadeSec').value = String(ink.fadeSeconds);

      for (const b of $('scShapes').querySelectorAll('button')) {
        b.classList.toggle('on', b.dataset.shape === lens.shape);
      }
      $('scFullNote').style.display = lens.shape === 'fullscreen' ? 'block' : 'none';
      $('scCircleRow').style.display = lens.shape === 'circle' ? 'flex' : 'none';
      $('scRectRow').style.display = lens.shape === 'rect' ? 'flex' : 'none';
      $('scCircleD').value = String(lens.circleD);
      $('scRectW').value = String(lens.rectW);
      $('scRectH').value = String(lens.rectH);
      $('scZoom').value = String(lens.zoom);
      $('scZoomVal').textContent = `${lens.zoom.toFixed(1)}×`;

      const winOk = st.win32 !== false;
      $('scLensSection').classList.toggle('sc-disabled', !winOk);
      $('scWinNote').style.display = winOk ? 'none' : 'block';
    }

    async function call(method, args) {
      try {
        const res = await ctx.call(method, args);
        if (res && res.ok === false) throw new Error(res.error || 'Action failed');
        if (res && typeof res === 'object' && 'drawMode' in res) refresh(res);
      } catch (err) {
        $('scErr').textContent = err.message || String(err);
        $('scErr').style.display = 'block';
      }
    }

    el.addEventListener('click', e => {
      const actBtn = e.target.closest('[data-act]');
      if (actBtn && actBtn.classList.contains('sc-btn')) {
        const methods = { annotate: 'toggleAnnotate', magnifier: 'toggleMagnifier', clearInk: 'clearInk', stopAll: 'stopAll' };
        call(methods[actBtn.dataset.act]);
        return;
      }
      const seg = e.target.closest('.sc-seg button');
      if (!seg || !state) return;
      if (seg.dataset.tool) call('setSettings', { ink: { tool: seg.dataset.tool } });
      else if (seg.dataset.exit) call('setSettings', { ink: { exitAction: seg.dataset.exit } });
      else if (seg.dataset.shape) call('setSettings', { lens: { shape: seg.dataset.shape } });
    });

    $('scFreezeScreen').addEventListener('change', e => {
      call('setSettings', { ink: { freezeScreen: e.target.checked } });
    });
    $('scShowCrosshair').addEventListener('change', e => {
      call('setSettings', { lens: { showCrosshair: e.target.checked } });
    });
    $('scShowZoomBadge').addEventListener('change', e => {
      call('setSettings', { lens: { showZoomBadge: e.target.checked } });
    });

    let widthT = 0;
    $('scWidth').addEventListener('input', e => {
      clearTimeout(widthT);
      const v = Number(e.target.value);
      $('scWidthVal').textContent = `${v}px`;
      widthT = setTimeout(() => call('setSettings', { ink: { width: v } }), 250);
    });

    $('scFadeSec').addEventListener('change', e => {
      call('setSettings', { ink: { fadeSeconds: Number(e.target.value) } });
    });
    $('scCircleD').addEventListener('change', e => {
      call('setSettings', { lens: { circleD: Number(e.target.value) } });
    });
    $('scRectW').addEventListener('change', e => {
      call('setSettings', { lens: { rectW: Number(e.target.value) } });
    });
    $('scRectH').addEventListener('change', e => {
      call('setSettings', { lens: { rectH: Number(e.target.value) } });
    });

    let zoomT = 0;
    $('scZoom').addEventListener('input', e => {
      clearTimeout(zoomT);
      const v = Number(e.target.value);
      $('scZoomVal').textContent = `${v.toFixed(1)}×`;
      zoomT = setTimeout(() => call('setSettings', { lens: { zoom: v } }), 250);
    });

    /* backend pushes status on every toggle/commit so badges stay live even
       while the panel sits open behind the overlays */
    if (typeof ctx.onEvent === 'function') ctx.onEvent('status', refresh);

    call('getState');
  }

  window.Toolbox.panel({ mount });
})();
