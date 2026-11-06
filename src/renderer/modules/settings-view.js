/* Settings View Module - Preferences, Hotkey Recorder & Storage Directories
   Manages application preferences, global & plugin hotkey recording, and user plugin paths. */
(() => {
  window.OrbitSettingsView = window.OrbitSettingsView || {};

  function accelFromEvent(e) {
    const mods = [];
    if (e.ctrlKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    if (e.metaKey) mods.push('Super');
    let key = e.key;
    if (key === ' ') key = 'Space';
    if (/^[a-z]$/i.test(key)) key = key.toUpperCase();
    const isF = /^F([1-9]|1[0-2])$/.test(key);
    const plain = /^[A-Z0-9]$/.test(key) || key === 'Space';
    if (isF) return [...mods, key].join('+');
    if (plain && mods.length) return [...mods, key].join('+');
    return null;
  }

  function init(ctx) {
    const { state, els, I18N } = ctx;

    function hotkeyEditor({ initial, allowClear = false, onApply }) {
      const wrap = document.createElement('div');
      wrap.className = 'hke';
      const input = document.createElement('input');
      input.readOnly = true;
      input.className = 'input mono hke-input';
      input.value = initial || '';
      input.placeholder = I18N.t('hotkeyRecord');
      const apply = document.createElement('button');
      apply.type = 'button'; apply.className = 'btn'; apply.textContent = I18N.t('apply');
      const clear = document.createElement('button');
      clear.type = 'button'; clear.className = 'btn ghost'; clear.textContent = I18N.t('clearHotkey');
      const status = document.createElement('span');
      status.className = 'hke-status';
      wrap.append(input, apply);
      if (allowClear) wrap.append(clear);
      wrap.append(status);

      let candidate = initial || null;
      let recording = false;
      input.addEventListener('click', () => {
        recording = true;
        input.classList.add('recording');
        input.value = '';
        status.textContent = '';
      });
      input.addEventListener('keydown', e => {
        if (!recording) return;
        e.preventDefault(); e.stopPropagation();
        if (e.key === 'Escape') {
          recording = false; input.classList.remove('recording');
          input.value = candidate || '';
          return;
        }
        if (e.key === 'Backspace' || e.key === 'Delete') {
          candidate = null;
          input.value = '';
          recording = false;
          input.classList.remove('recording');
          return;
        }
        const accel = accelFromEvent(e);
        if (accel) { candidate = accel; input.value = accel; recording = false; input.classList.remove('recording'); }
      });
      apply.addEventListener('click', async () => {
        if (!candidate && !allowClear) {
          candidate = initial || null;
          input.value = candidate || '';
          return;
        }
        apply.disabled = true;
        const res = await onApply(candidate);
        apply.disabled = false;
        status.classList.remove('bad');
        if (res && res.ok === false) {
          status.textContent = res.conflictKey
            ? I18N.t('conflictWith', { name: ctx.labelForKey(res.conflictKey) })
            : I18N.t('hotkeyBad');
          status.classList.add('bad');
        } else {
          status.textContent = '✓';
          input.value = res && res.hotkey ? res.hotkey : (candidate || '');
          initial = candidate;
        }
      });
      clear.addEventListener('click', async () => {
        candidate = null; input.value = ''; status.textContent = '';
        const res = await onApply(null);
        status.classList.remove('bad');
        if (res && res.ok === false) {
          status.textContent = res.conflictKey
            ? I18N.t('conflictWith', { name: ctx.labelForKey(res.conflictKey) })
            : I18N.t('hotkeyBad');
          status.classList.add('bad');
        } else {
          status.textContent = '✓';
          input.value = '';
          initial = null;
        }
      });
      return wrap;
    }

    function renderUserPluginsDirInfo() {
      const isCustom = !!state.isCustomUserPluginsDir;
      const dir = state.userPluginsDir || '';
      const badgeText = I18N.t(isCustom ? 'userPluginsCustom' : 'userPluginsDefault');

      if (els.userPluginsPath) {
        els.userPluginsPath.textContent = dir;
        els.userPluginsPath.title = dir;
      }
      if (els.userPluginsBadge) {
        els.userPluginsBadge.textContent = badgeText;
        els.userPluginsBadge.className = 'chip ' + (isCustom ? 'warn' : 'ghost');
      }
      if (els.btnResetUserPlugins) {
        els.btnResetUserPlugins.hidden = !isCustom;
      }

      if (els.userPluginsPath2) {
        els.userPluginsPath2.textContent = dir;
        els.userPluginsPath2.title = dir;
      }
      if (els.userPluginsBadge2) {
        els.userPluginsBadge2.textContent = badgeText;
        els.userPluginsBadge2.className = 'chip ' + (isCustom ? 'warn' : 'ghost');
      }
      if (els.btnResetUserPluginsHeader) {
        els.btnResetUserPluginsHeader.hidden = !isCustom;
      }
      if (els.guideUserPluginsPath) {
        els.guideUserPluginsPath.textContent = dir;
        els.guideUserPluginsPath.title = dir;
      }
    }

    async function applyUserPluginsDir(dir) {
      const res = await window.host.setUserPluginsDir(dir);
      state.plugins = [...res.plugins].sort((a, b) => a.id.localeCompare(b.id));
      state.hotkeys = res.hotkeys;
      state.userPluginsDir = res.userPluginsDir;
      state.defaultUserPluginsDir = res.defaultUserPluginsDir;
      state.isCustomUserPluginsDir = res.isCustom;
      renderUserPluginsDirInfo();
      if (ctx.renderDeck) ctx.renderDeck();
      if (ctx.renderPlugins) ctx.renderPlugins();
      return res;
    }
    window.__setUserPluginsDirForTest = applyUserPluginsDir;

    async function changeUserPluginsDir() {
      const chosen = await window.host.chooseUserPluginsDir();
      if (!chosen) return;
      await applyUserPluginsDir(chosen);
    }

    async function resetUserPluginsDir() {
      await applyUserPluginsDir(null);
    }

    function renderPluginDataDirInfo() {
      const isCustom = !!state.isCustomPluginDataDir;
      const dir = state.pluginDataDir || '';
      const badgeText = I18N.t(isCustom ? 'pluginDataCustom' : 'pluginDataDefault');

      if (els.pluginDataPath) {
        els.pluginDataPath.textContent = dir;
        els.pluginDataPath.title = dir;
      }
      if (els.pluginDataBadge) {
        els.pluginDataBadge.textContent = badgeText;
        els.pluginDataBadge.className = 'chip ' + (isCustom ? 'warn' : 'ghost');
      }
      if (els.btnResetPluginData) {
        els.btnResetPluginData.hidden = !isCustom;
      }
    }

    async function applyPluginDataDir(dir) {
      const res = await window.host.setPluginDataDir(dir);
      state.pluginDataDir = res.pluginDataDir;
      state.defaultPluginDataDir = res.defaultPluginDataDir;
      state.isCustomPluginDataDir = res.isCustom;
      renderPluginDataDirInfo();
      return res;
    }
    window.__setPluginDataDirForTest = applyPluginDataDir;

    async function changePluginDataDir() {
      const chosen = await window.host.choosePluginDataDir();
      if (!chosen) return;
      await applyPluginDataDir(chosen);
    }

    async function resetPluginDataDir() {
      await applyPluginDataDir(null);
    }

    function renderSettings() {
      renderUserPluginsDirInfo();
      renderPluginDataDirInfo();
      els.hotkeyCtrl.innerHTML = '';
      els.hotkeyCtrl.appendChild(hotkeyEditor({
        initial: state.config.hotkey,
        onApply: async accel => {
          const res = await window.host.setHotkey(accel);
          if (res.ok) {
            state.config.hotkey = res.hotkey;
            els.hotHint.textContent = res.hotkey;
            state.hotkeys = await window.host.hotkeys();
            renderSettings();
          }
          return res;
        },
      }));
      const hostRow = ctx.hotkeyRow('host');
      if (hostRow && !hostRow.ok) {
        const chip = document.createElement('span');
        chip.className = 'chip warn';
        chip.textContent = hostRow.conflictKey
          ? I18N.t('conflictWith', { name: ctx.labelForKey(hostRow.conflictKey) })
          : I18N.t('hotkeyBad');
        els.hotkeyCtrl.appendChild(chip);
      }

      if (els.actionPaletteHotkeyCtrl) {
        els.actionPaletteHotkeyCtrl.innerHTML = '';
        els.actionPaletteHotkeyCtrl.appendChild(hotkeyEditor({
          initial: state.config.actionPaletteHotkey || '',
          allowClear: true,
          onApply: async accel => {
            const res = await window.host.setPaletteHotkey(accel);
            if (res && res.ok) {
              state.config.actionPaletteHotkey = res.hotkey || null;
              if (els.apHint) els.apHint.textContent = state.config.actionPaletteHotkey || I18N.t('noHotkey');
              state.hotkeys = await window.host.hotkeys();
              renderSettings();
            }
            return res;
          }
        }));
        const apRow = ctx.hotkeyRow('action-palette');
        if (apRow && !apRow.ok) {
          const chip = document.createElement('span');
          chip.className = 'chip bad';
          chip.textContent = apRow.conflictKey
            ? I18N.t('conflictWith', { name: ctx.labelForKey(apRow.conflictKey) })
            : I18N.t('hotkeyBad');
          els.actionPaletteHotkeyCtrl.appendChild(chip);
        }
      }

      if (els.chkAutoUpdate) {
        els.chkAutoUpdate.checked = state.config.autoCheckUpdate !== false;
      }
    }

    // Directory buttons
    if (els.btnChooseUserPlugins) els.btnChooseUserPlugins.addEventListener('click', changeUserPluginsDir);
    if (els.btnChooseUserPluginsHeader) els.btnChooseUserPluginsHeader.addEventListener('click', changeUserPluginsDir);
    if (els.btnResetUserPlugins) els.btnResetUserPlugins.addEventListener('click', resetUserPluginsDir);
    if (els.btnResetUserPluginsHeader) els.btnResetUserPluginsHeader.addEventListener('click', resetUserPluginsDir);
    if (els.btnOpenUserPlugins) els.btnOpenUserPlugins.addEventListener('click', () => window.host.openUserPlugins());
    if (els.btnOpenUserPluginsHeader) els.btnOpenUserPluginsHeader.addEventListener('click', () => window.host.openUserPlugins());

    if (els.btnChoosePluginData) els.btnChoosePluginData.addEventListener('click', changePluginDataDir);
    if (els.btnResetPluginData) els.btnResetPluginData.addEventListener('click', resetPluginDataDir);
    if (els.btnOpenPluginData) els.btnOpenPluginData.addEventListener('click', () => window.host.openPluginDataDir());

    return {
      accelFromEvent,
      hotkeyEditor,
      renderSettings,
      renderUserPluginsDirInfo,
      renderPluginDataDirInfo,
      applyUserPluginsDir,
      applyPluginDataDir,
    };
  }

  window.OrbitSettingsView.init = init;
  window.OrbitSettingsView.accelFromEvent = accelFromEvent;
})();
