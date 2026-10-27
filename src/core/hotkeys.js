/* Global hotkey registry with in-app conflict detection.
   Electron cannot tell us when another APPLICATION already owns an accelerator
   (register() fails silently), but every conflict inside this app — the summon
   hotkey vs a plugin action, or two plugin actions — is caught here: the second
   registration is refused, reported in status[], and the rejected change is
   reverted so config never holds a hotkey that isn't actually live. */
const { globalShortcut } = require('electron');

const HOST_KEY = 'host';

module.exports = function createHotkeys({ cfg, manager, onSummon }) {
  let status = []; // [{key, accel, ok, conflictKey, error}]

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

  function registerAll() {
    globalShortcut.unregisterAll();
    const owners = new Map(); // accel -> key (the registry of what WE hold)
    status = [];

    const put = (key, accel, fn) => {
      const holder = owners.get(accel);
      if (holder && holder !== key) {
        status.push({ key, accel, ok: false, conflictKey: holder });
        return;
      }
      try {
        globalShortcut.register(accel, fn);
      } catch (err) {
        status.push({ key, accel, ok: false, conflictKey: null, error: String(err && err.message || err) });
        return;
      }
      owners.set(accel, key);
      status.push({ key, accel, ok: true });
    };

    if (cfg.data.hotkey) put(HOST_KEY, cfg.data.hotkey, onSummon);

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
    registerAll();
    const row = status.find(r => r.key === key);
    if (row && !row.ok) {
      restore();
      registerAll();
      return { ok: false, conflictKey: row.conflictKey || null };
    }
    return { ok: true, hotkey: row ? row.accel : undefined };
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
