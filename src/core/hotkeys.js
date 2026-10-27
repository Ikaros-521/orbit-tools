/* Global hotkey registry with in-app & OS conflict detection.
   Electron's globalShortcut.register() returns boolean false when another
   application or the OS already owns an accelerator. Internal conflicts
   (between plugins or summon hotkey) and external occupation are caught here. */
const { globalShortcut } = require('electron');

const HOST_KEY = 'host';
const HOST_FALLBACKS = ['Alt+Shift+Space', 'Ctrl+Shift+Space', 'Alt+O'];

module.exports = function createHotkeys({ cfg, manager, onSummon }) {
  let status = []; // [{key, accel, ok, conflictKey, externalOccupied, error}]

  const actionOf = key => {
    const [pluginId, actionId] = key.split(':');
    const p = manager.plugins.get(pluginId);
    const a = p && Array.isArray(p.manifest.actions) && p.manifest.actions.find(x => x.id === actionId);
    return a ? { pluginId, method: a.method } : null;
  };

  /* Every hotkey that WOULD be live with the current config — the source of
     truth for conflict pre-checks, independent of registration order. */
  function effectiveAssignments() {
    const rows = [];
    if (cfg.data.hotkey) rows.push({ key: HOST_KEY, accel: cfg.data.hotkey });
    for (const p of manager.plugins.values()) {
      if (!p.enabled || !Array.isArray(p.manifest.actions)) continue;
      for (const a of p.manifest.actions) {
        const accel = cfg.data.pluginHotkeys[`${p.id}:${a.id}`] ?? a.hotkey;
        if (accel) rows.push({ key: `${p.id}:${a.id}`, accel });
      }
    }
    return rows;
  }

  // Which OTHER key already owns `accel`, or null. The new assignment always
  // loses a conflict — the pre-existing binding stays live.
  function conflictOwner(key, accel) {
    for (const r of effectiveAssignments()) {
      if (r.key !== key && r.accel === accel) return r.key;
    }
    return null;
  }

  function registerAll({ allowFallback = true } = {}) {
    globalShortcut.unregisterAll();
    const owners = new Map(); // accel -> key (the registry of what WE hold)
    status = [];

    const put = (key, accel, fn) => {
      const holder = owners.get(accel);
      if (holder && holder !== key) {
        status.push({ key, accel, ok: false, conflictKey: holder });
        return false;
      }
      try {
        const ok = globalShortcut.register(accel, fn);
        if (!ok) {
          status.push({ key, accel, ok: false, conflictKey: null, externalOccupied: true });
          return false;
        }
      } catch (err) {
        status.push({ key, accel, ok: false, conflictKey: null, error: String(err && err.message || err) });
        return false;
      }
      owners.set(accel, key);
      status.push({ key, accel, ok: true });
      return true;
    };

    if (cfg.data.hotkey) {
      const hostOk = put(HOST_KEY, cfg.data.hotkey, onSummon);
      if (!hostOk && allowFallback) {
        // cfg.data.hotkey failed to register (e.g. Alt+Space is occupied by uTools/system).
        // Try fallback summon hotkeys so the host window is never left unreachable.
        for (const fb of HOST_FALLBACKS) {
          if (fb === cfg.data.hotkey) continue;
          if (put(HOST_KEY, fb, onSummon)) {
            cfg.set({ hotkey: fb });
            break;
          }
        }
      }
    }

    for (const p of manager.plugins.values()) {
      if (!p.enabled || !Array.isArray(p.manifest.actions)) continue;
      for (const a of p.manifest.actions) {
        const key = `${p.id}:${a.id}`;
        const accel = cfg.data.pluginHotkeys[key] ?? a.hotkey;
        if (!accel) continue;
        const h = actionOf(key);
        if (!h) continue;
        put(key, accel, () => manager.call(h.pluginId, h.method, {}).catch(() => {}));
      }
    }
    return status;
  }

  /* Pre-check makes the outcome deterministic (the new assignment loses);
     apply-then-verify stays as a safety net that reverts on any surprise. */
  function applyWithRollback(key, apply, restore) {
    apply();
    registerAll({ allowFallback: false });
    const row = status.find(r => r.key === key && r.ok);
    if (!row) {
      const failRow = status.find(r => r.key === key);
      restore();
      registerAll({ allowFallback: false });
      return {
        ok: false,
        conflictKey: failRow ? failRow.conflictKey : null,
        externalOccupied: failRow ? !!failRow.externalOccupied : false,
      };
    }
    return { ok: true, hotkey: row.accel };
  }

  function setHostHotkey(accel) {
    const prev = cfg.data.hotkey;
    if (accel === prev) return { ok: true, hotkey: accel };
    const owner = conflictOwner(HOST_KEY, accel);
    if (owner) return { ok: false, conflictKey: owner, hotkey: prev };
    return applyWithRollback(
      HOST_KEY,
      () => cfg.set({ hotkey: accel }),
      () => cfg.set({ hotkey: prev }),
    );
  }

  function setPluginHotkey(key, accel /* string | null to clear */) {
    const prev = cfg.data.pluginHotkeys[key] ?? null;
    if ((accel || null) === prev) return { ok: true, hotkey: accel || undefined };
    if (accel) {
      const owner = conflictOwner(key, accel);
      if (owner) return { ok: false, conflictKey: owner, hotkey: prev || undefined };
    }
    return applyWithRollback(
      key,
      () => {
        const next = { ...cfg.data.pluginHotkeys };
        if (accel) next[key] = accel; else delete next[key];
        cfg.set({ pluginHotkeys: next });
      },
      () => {
        const back = { ...cfg.data.pluginHotkeys };
        if (prev) back[key] = prev; else delete back[key];
        cfg.set({ pluginHotkeys: back });
      },
    );
  }

  return {
    HOST_KEY,
    registerAll,
    setHostHotkey,
    setPluginHotkey,
    get status() { return status; },
  };
};
