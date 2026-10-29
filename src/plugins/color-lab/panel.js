/* color-lab panel — RGBA palette, multi-format readout and the screen
   eyedropper launcher. Color math is shared with backend.js / the picker
   through color-math.js, loaded lazily so the panel can register its
   Toolbox.panel() definition synchronously. */
(function () {
  'use strict';

  const PRESETS = [
    '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#30B0C7',
    '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#FFAB2E', '#38BDF8',
    '#000000', '#1C1C1E', '#3A3A3C', '#636366', '#8E8E93', '#AEAEB2',
    '#C7C7CC', '#D1D1D6', '#E5E5EA', '#F2F2F7', '#FFFFFF', '#8B5E3C',
  ];

  const T = {
    zh: {
      loading: '正在加载调色板…',
      fail: '色彩工坊加载失败',
      pick: '吸管取色',
      pickHint: '在屏幕上吸取任意像素的颜色',
      hide: '取色时隐藏工具箱',
      hideHint: '开启后先收起工具箱再截屏，避免吸到自己的界面',
      freeze: '冻结屏幕',
      freezeHint: '开启：冻结画面后取色，像素最准；关闭：实时取色，适合从视频/动画/可滚动页面中取色',
      copyAfter: '取色复制',
      copyFormatHint: '吸管取色成功后自动写入剪贴板的格式',
      copy: '复制',
      copied: '✓ 已复制',
      copyFail: '复制失败',
      applied: '✓ 已应用',
      picked: '已取色并复制 {v}',
      pickFail: '取色失败',
      formats: '多格式色值',
      clickCopy: '点击任意行复制',
      presets: '预设色板',
      recent: '最近取色',
      clear: '清空',
      cleared: '历史已清空',
      noHistory: '还没有取过色，点上方「吸管取色」试试',
      hexPh: '#RRGGBB',
      hexBad: 'HEX 格式无效',
      red: '红', green: '绿', blue: '蓝', alpha: '透明度',
      pickBtnBusy: '正在准备屏幕…',
    },
    en: {
      loading: 'Loading palette…',
      fail: 'Color Lab failed to load',
      pick: 'Pick from screen',
      pickHint: 'Sample any pixel on screen',
      hide: 'Hide toolbox while picking',
      hideHint: 'Hides the app before the screen grab so you never sample your own UI',
      freeze: 'Freeze screen',
      freezeHint: 'On: freeze the frame for pixel-exact colors; Off: live sampling for videos, animations and scrollable pages',
      copyAfter: 'Pick copies',
      copyFormatHint: 'Format written to the clipboard after a successful pick',
      copy: 'copy',
      copied: '✓ copied',
      copyFail: 'copy failed',
      applied: '✓ applied',
      picked: 'Picked & copied {v}',
      pickFail: 'pick failed',
      formats: 'Color formats',
      clickCopy: 'click a row to copy',
      presets: 'Preset palette',
      recent: 'Recent picks',
      clear: 'clear',
      cleared: 'History cleared',
      noHistory: 'No picks yet — try “Pick from screen” above',
      hexPh: '#RRGGBB',
      hexBad: 'invalid HEX',
      red: 'Red', green: 'Green', blue: 'Blue', alpha: 'Alpha',
      pickBtnBusy: 'Preparing screen…',
    },
  };

  let mathLoad = null;
  function ensureMath() {
    if (window.ColorMath) return Promise.resolve(window.ColorMath);
    if (mathLoad) return mathLoad;
    mathLoad = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'plugin://color-lab/color-math.js';
      s.onload = () => (window.ColorMath ? resolve(window.ColorMath) : reject(new Error('ColorMath missing')));
      s.onerror = () => reject(new Error('cannot load color-math.js'));
      document.head.appendChild(s);
    });
    return mathLoad;
  }

  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const EYEDROPPER = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>';

  function build(el, ctx, T) {
    const CM = window.ColorMath;
    const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

    const pickAction = (ctx.plugin.actions || []).find(a => a.key === 'color-lab:pick');
    const pickAccel = pickAction && pickAction.hotkey;
    const accelHtml = pickAccel ? `<kbd>${escapeHtml(pickAccel)}</kbd>` : '';

    el.innerHTML = `
      <div class="cl-root">
        <div class="tool-bar cl-bar">
          <button type="button" class="btn primary cl-pick" id="clPick" title="${T.pickHint}">
            ${EYEDROPPER}<span>${T.pick}</span>${accelHtml}
          </button>
          <label class="cl-chk" title="${T.hideHint}">
            <input type="checkbox" id="clHide"> <span>${T.hide}</span>
          </label>
          <label class="cl-chk" title="${T.freezeHint}">
            <input type="checkbox" id="clFreeze"> <span>${T.freeze}</span>
          </label>
          <span class="grow"></span>
          <span class="cl-status" id="clStatus" aria-live="polite"></span>
          <label class="cl-sel" title="${T.copyFormatHint}">
            <span>${T.copyAfter}</span>
            <select id="clFormat"></select>
          </label>
        </div>
        <div class="cl-body">
          <section class="cl-card cl-left">
            <div class="cl-preview" id="clPreview">
              <span class="cl-preview-hex" id="clPrevHex">#FFAB2E</span>
              <span class="cl-preview-rgba" id="clPrevRgba">rgba(255, 171, 46, 1)</span>
            </div>
            <div class="cl-hexrow">
              <input class="input cl-hex" id="clHex" spellcheck="false" autocomplete="off"
                     placeholder="${T.hexPh}" aria-label="HEX">
              <button type="button" class="btn ghost small" id="clHexCopy">${T.copy}</button>
            </div>
            <div class="cl-channels" id="clChannels"></div>
            <div class="cl-sv" id="clSv" title="饱和度 / 明度"><i class="cl-knob" id="clKnob"></i></div>
            <div class="cl-sliders">
              <div class="cl-slider cl-hue" id="clHue" title="色相"><i class="cl-thumb" id="clHueThumb"></i></div>
              <div class="cl-slider cl-alpha" id="clAlpha" title="${T.alpha}"><i class="cl-thumb" id="clAlphaThumb"></i></div>
            </div>
          </section>
          <section class="cl-card cl-right">
            <div class="cl-sec-head">
              <h4>${T.formats}</h4>
              <span class="hint">${T.clickCopy}</span>
            </div>
            <div class="cl-fmts" id="clFmts"></div>
            <div class="cl-sec-head"><h4>${T.presets}</h4></div>
            <div class="cl-swatches" id="clPresets"></div>
            <div class="cl-sec-head">
              <h4>${T.recent}</h4>
              <button type="button" class="cl-link" id="clClearHist">${T.clear}</button>
            </div>
            <div class="cl-swatches" id="clHist"></div>
          </section>
        </div>
      </div>`;

    const $ = id => el.querySelector(`#${id}`);
    const pickBtn = $('clPick');
    const hideChk = $('clHide');
    const freezeChk = $('clFreeze');
    const statusEl = $('clStatus');
    const formatSel = $('clFormat');
    const preview = $('clPreview');
    const prevHex = $('clPrevHex');
    const prevRgba = $('clPrevRgba');
    const hexInput = $('clHex');
    const hexCopy = $('clHexCopy');
    const channelsEl = $('clChannels');
    const sv = $('clSv');
    const knob = $('clKnob');
    const hueTrack = $('clHue');
    const hueThumb = $('clHueThumb');
    const alphaTrack = $('clAlpha');
    const alphaThumb = $('clAlphaThumb');
    const fmtsEl = $('clFmts');
    const presetsEl = $('clPresets');
    const histEl = $('clHist');
    const clearHist = $('clClearHist');

    let color = { r: 255, g: 171, b: 46, a: 255 };
    let hue = 36, sat = 82, val = 100;
    let history = [];
    let active = true;
    let saveTimer = 0;
    let dirty = false;
    let statusTimer = 0;
    const flashTimers = new Map();
    const pickLabel = pickBtn.querySelector('span');

    /* --- toolbar ------------------------------------------------------------ */

    for (const key of CM.COPY_FORMATS) {
      const opt = document.createElement('option');
      opt.value = key;
      const meta = CM.FORMATS.find(f => f.key === key);
      opt.textContent = meta ? meta.label : key;
      formatSel.appendChild(opt);
    }

    formatSel.addEventListener('change', () => {
      ctx.call('setConfig', { copyFormat: formatSel.value }).catch(() => {});
    });

    hideChk.addEventListener('change', () => {
      ctx.call('setConfig', { hideHost: hideChk.checked }).catch(() => {});
    });

    freezeChk.addEventListener('change', () => {
      ctx.call('setConfig', { freeze: freezeChk.checked }).catch(() => {});
    });

    pickBtn.addEventListener('click', async () => {
      pickBtn.disabled = true;
      const prev = pickLabel.textContent;
      pickLabel.textContent = T.pickBtnBusy;
      try {
        const res = await ctx.call('startPick');
        if (res && res.ok === false) toast(res.error || T.pickFail, true);
      } catch (err) {
        toast(err.message || T.pickFail, true);
      } finally {
        pickBtn.disabled = false;
        pickLabel.textContent = prev;
      }
    });

    /* --- channel rows ------------------------------------------------------- */

    const CHANNELS = [
      { key: 'r', label: 'R' },
      { key: 'g', label: 'G' },
      { key: 'b', label: 'B' },
      { key: 'a', label: 'A' },
    ];
    const channelRows = CHANNELS.map(ch => {
      const row = document.createElement('div');
      row.className = 'cl-ch';
      row.innerHTML = `
        <span class="cl-ch-label">${ch.label}</span>
        <input type="range" min="0" max="255" step="1" aria-label="${ch.label}">
        <input type="number" min="0" max="255" step="1" aria-label="${ch.label} 0-255">`;
      const range = row.querySelector('input[type=range]');
      const num = row.querySelector('input[type=number]');
      const apply = v => {
        color = { ...color, [ch.key]: v };
        syncHsv();
        render();
        schedulePersist();
      };
      range.addEventListener('input', () => apply(Number(range.value)));
      num.addEventListener('input', () => {
        if (num.value === '') return;
        const v = clamp(Math.round(Number(num.value) || 0), 0, 255);
        apply(v);
      });
      num.addEventListener('blur', () => { num.value = String(color[ch.key]); });
      num.addEventListener('keydown', e => { if (e.key === 'Enter') num.blur(); });
      channelsEl.appendChild(row);
      return { key: ch.key, range, num };
    });

    /* --- hex input ---------------------------------------------------------- */

    hexInput.addEventListener('input', () => {
      const c = CM.parse(hexInput.value);
      hexInput.classList.toggle('err', !c);
      if (!c) return;
      color = { ...c, a: color.a };
      syncHsv();
      render();
      schedulePersist();
    });
    hexInput.addEventListener('blur', () => {
      hexInput.value = CM.format(color, 'hex');
      hexInput.classList.remove('err');
    });
    hexInput.addEventListener('keydown', e => { if (e.key === 'Enter') hexInput.blur(); });

    hexCopy.addEventListener('click', () => copyText(CM.format(color, 'hex'), hexCopy));

    /* --- SV square + sliders ------------------------------------------------ */

    function track(el, onMove) {
      let dragging = false;
      const handle = e => {
        const r = el.getBoundingClientRect();
        onMove(
          clamp((e.clientX - r.left) / r.width, 0, 1),
          clamp((e.clientY - r.top) / r.height, 0, 1),
        );
      };
      el.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        dragging = true;
        try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        handle(e);
      });
      el.addEventListener('pointermove', e => { if (dragging) handle(e); });
      el.addEventListener('pointerup', () => { dragging = false; });
      el.addEventListener('pointercancel', () => { dragging = false; });
    }

    track(sv, (x, y) => {
      sat = x * 100;
      val = (1 - y) * 100;
      color = { ...CM.hsvToRgb(hue, sat, val), a: color.a };
      render();
      schedulePersist();
    });

    track(hueTrack, x => {
      hue = x * 360;
      color = { ...CM.hsvToRgb(hue, sat, val), a: color.a };
      render();
      schedulePersist();
    });

    track(alphaTrack, x => {
      color = { ...color, a: Math.round(x * 255) };
      render();
      schedulePersist();
    });

    /* --- formats ------------------------------------------------------------ */

    const fmtRows = CM.FORMATS.map(f => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'cl-fmt';
      row.innerHTML = `
        <span class="cl-fmt-label">${f.label}</span>
        <code class="cl-fmt-val"></code>
        <span class="cl-fmt-copy">${T.copy}</span>`;
      const valEl = row.querySelector('.cl-fmt-val');
      row.addEventListener('click', () => copyText(valEl.textContent, row.querySelector('.cl-fmt-copy')));
      fmtsEl.appendChild(row);
      return { key: f.key, val: valEl };
    });

    /* --- presets & history -------------------------------------------------- */

    function swatch(hexOrColor) {
      const c = CM.normalize(hexOrColor) || CM.parse(hexOrColor);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cl-sw';
      b.style.setProperty('--sw', CM.format(c, 'rgba'));
      b.title = `${CM.format(c, 'hex')} · ${CM.format(c, 'rgb')}`;
      b.addEventListener('click', () => { setColor(c); toast(T.applied); });
      return b;
    }

    for (const p of PRESETS) presetsEl.appendChild(swatch(p));

    function renderHistory() {
      histEl.innerHTML = '';
      if (!history.length) {
        const empty = document.createElement('span');
        empty.className = 'cl-empty';
        empty.textContent = T.noHistory;
        histEl.appendChild(empty);
        return;
      }
      for (const c of history) histEl.appendChild(swatch(c));
    }

    clearHist.addEventListener('click', async () => {
      try {
        const res = await ctx.call('clearHistory');
        history = (res && res.history) || [];
        renderHistory();
        toast(T.cleared);
      } catch (err) {
        toast(err.message, true);
      }
    });

    /* --- rendering ---------------------------------------------------------- */

    function syncHsv() {
      const hsv = CM.rgbToHsv(color.r, color.g, color.b);
      // keep the last hue on pure black/white/gray so the slider does not jump
      if (hsv.s > 0.01 && hsv.v > 0.01) hue = hsv.h;
      sat = hsv.s;
      val = hsv.v;
    }

    function render() {
      const hex = CM.format(color, 'hex');
      const rgba = CM.format(color, 'rgba');
      preview.style.setProperty('--c', rgba);
      preview.style.setProperty('--ink-on', CM.contrastInk(color));
      prevHex.textContent = hex;
      prevRgba.textContent = rgba;
      if (document.activeElement !== hexInput) hexInput.value = hex;

      for (const ch of channelRows) {
        const v = color[ch.key];
        if (document.activeElement !== ch.num) ch.num.value = String(v);
        ch.range.value = String(v);
      }

      sv.style.backgroundColor = `hsl(${hue}, 100%, 50%)`;
      knob.style.left = `${sat}%`;
      knob.style.top = `${100 - val}%`;
      hueThumb.style.left = `${(hue / 360) * 100}%`;
      alphaThumb.style.left = `${(color.a / 255) * 100}%`;
      alphaTrack.style.setProperty('--rgb', `${color.r}, ${color.g}, ${color.b}`);

      for (const row of fmtRows) row.val.textContent = CM.format(color, row.key);
    }

    function setColor(c, opts = {}) {
      const n = CM.normalize(c);
      if (!n) return;
      color = n;
      syncHsv();
      render();
      if (opts.persist !== false) schedulePersist();
    }

    function schedulePersist() {
      dirty = true;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = 0;
        if (!active) return;
        dirty = false;
        ctx.call('setColor', { color }).catch(() => {});
      }, 350);
    }

    /* --- feedback ----------------------------------------------------------- */

    function toast(msg, bad = false) {
      statusEl.textContent = msg;
      statusEl.classList.toggle('bad', !!bad);
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => {
        if (!active) return;
        statusEl.textContent = '';
        statusEl.classList.remove('bad');
      }, 2400);
    }

    function flash(node) {
      if (!node) return;
      const prev = node.textContent;
      node.textContent = T.copied;
      node.classList.add('copied');
      clearTimeout(flashTimers.get(node));
      flashTimers.set(node, setTimeout(() => {
        if (!active) return;
        node.textContent = prev;
        node.classList.remove('copied');
      }, 1100));
    }

    async function copyText(text, feedbackNode) {
      try {
        if (window.host && typeof window.host.writeClipboardText === 'function') {
          await window.host.writeClipboardText(text);
        } else {
          await navigator.clipboard.writeText(text);
        }
        flash(feedbackNode);
      } catch {
        toast(T.copyFail, true);
      }
    }

    /* --- boot --------------------------------------------------------------- */

    render();
    renderHistory();

    ctx.call('getState').then(st => {
      if (!active || !st) return;
      if (st.settings) {
        hideChk.checked = !!st.settings.hideHost;
        freezeChk.checked = st.settings.freeze !== false;
        if (st.settings.copyFormat) formatSel.value = st.settings.copyFormat;
      }
      if (Array.isArray(st.history)) {
        history = st.history;
        renderHistory();
      }
      if (st.color) setColor(st.color, { persist: false });

      // Smart-peek / action-palette hand-off: { color } or { type, value }
      const payload = ctx.payload;
      if (payload) {
        const raw = payload.color !== undefined ? payload.color
          : payload.value !== undefined ? payload.value : payload;
        const c = CM.parse(raw);
        if (c) {
          setColor(c);
          toast(T.applied);
        }
      }
    }).catch(err => {
      if (active) toast(err.message || T.pickFail, true);
    });

    ctx.onEvent('picked', payload => {
      if (!active || !payload) return;
      // the backend already persisted this pick; drop any pending debounce so
      // it cannot write the pre-pick color back afterwards
      clearTimeout(saveTimer);
      saveTimer = 0;
      dirty = false;
      if (payload.color) setColor(payload.color, { persist: false });
      if (Array.isArray(payload.history)) {
        history = payload.history;
        renderHistory();
      }
      if (payload.copied) toast(T.picked.replace('{v}', payload.copied));
    });

    return () => {
      active = false;
      clearTimeout(statusTimer);
      for (const t of flashTimers.values()) clearTimeout(t);
      if (saveTimer) {
        clearTimeout(saveTimer);
        if (dirty) ctx.call('setColor', { color }).catch(() => {});
        saveTimer = 0;
        dirty = false;
      }
    };
  }

  let dispose = null;
  let alive = false;

  function mount(el, ctx) {
    const L = ctx.lang === 'en' ? 'en' : 'zh';
    const T = T_LOCAL(L);
    alive = true;
    el.innerHTML = `<div class="cl-boot">${T.loading}</div>`;
    ensureMath()
      .then(() => { if (alive) dispose = build(el, ctx, T); })
      .catch(err => {
        if (alive) el.innerHTML = `<div class="panel-error"><b>${T.fail}</b><code>${escapeHtml(err.message)}</code></div>`;
      });
  }

  function T_LOCAL(lang) { return T[lang] || T.zh; }

  window.Toolbox.panel({
    mount,
    unmount() {
      alive = false;
      if (dispose) { dispose(); dispose = null; }
    },
  });
})();
