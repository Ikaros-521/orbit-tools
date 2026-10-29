/* Shared search/rank layer for BOTH action palettes (in-window Ctrl+K and the
   standalone floating palette) — one place so they can't drift again.

   Features: pinyin (full + initials) matching via Pinyin.keys, frecency
   ranking via the usage map from the main process, a "Recently Used" group
   for empty queries, and <mark> highlighting for direct title hits. */
(() => {
  const hasPy = () => typeof window.Pinyin !== 'undefined';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* append pinyin tokens (full pinyin + initials) of the title to a searchKey */
  function enrich(key, title) {
    const base = String(key || '').toLowerCase();
    if (!hasPy() || !title) return base;
    return `${base} ${window.Pinyin.keys(title)}`.toLowerCase();
  }

  /* frecency: usage count damped by hours since last use */
  function usageScore(usage, id, now = Date.now()) {
    if (!usage || !id || !usage[id]) return 0;
    const u = usage[id];
    const hours = Math.max(0, (now - (u.t || 0)) / 3600000);
    return (u.n || 1) / (1 + hours);
  }

  function matchQuality(item, q) {
    if (!q) return 0;
    const title = String(item.title || '').toLowerCase();
    if (title.includes(q)) return 4;
    if (hasPy() && title && window.Pinyin.keys(title).includes(q)) return 3;
    if (item.sub && String(item.sub).toLowerCase().includes(q)) return 2;
    if (item.searchKey && item.searchKey.includes(q)) return 1;
    if (item.group && String(item.group).toLowerCase().includes(q)) return 0;
    return -1;
  }

  /* empty query -> Recently Used group first (deduped); otherwise rank by
     match quality, then frecency, then original order.
     Pinned rows (payload recommendations) always stay above the recency
     reshuffle — a fresh selection must not be buried by usage history. */
  function filterAndRank(items, q, usage, isEn) {
    if (!q) {
      const pinned = items.filter(it => it.pinned);
      if (pinned.length === 0) return recentFirst(items, usage, isEn);
      const rest = items.filter(it => !it.pinned);
      return [...pinned, ...recentFirst(rest, usage, isEn)];
    }
    const scored = [];
    for (let i = 0; i < items.length; i++) {
      const m = matchQuality(items[i], q);
      if (m >= 0) scored.push({ it: items[i], m, i });
    }
    scored.sort((a, b) =>
      b.m - a.m ||
      usageScore(usage, b.it.usageId) - usageScore(usage, a.it.usageId) ||
      a.i - b.i);
    return scored.map(x => x.it);
  }

  function recentFirst(items, usage, isEn, max = 6) {
    if (!usage) return items;
    const label = isEn ? '🕐 Recently Used' : '🕐 最近使用';
    const used = items.filter(it => it.usageId && usage[it.usageId]);
    if (used.length === 0) return items;
    used.sort((a, b) => (usage[b.usageId].t || 0) - (usage[a.usageId].t || 0));
    const top = used.slice(0, max);
    const inRecent = new Set(top.map(x => x.usageId));
    const rest = items.filter(it => !(it.usageId && inRecent.has(it.usageId)));
    return [...top.map(it => ({ ...it, group: label })), ...rest];
  }

  /* highlight the first direct hit of q inside title (pinyin hits are not
     highlighted — mapping keystrokes back to hanzi positions isn't worth it) */
  function highlightHtml(title, q) {
    const text = String(title || '');
    if (!q) return escapeHtml(text);
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return escapeHtml(text);
    return escapeHtml(text.slice(0, i)) +
      '<mark>' + escapeHtml(text.slice(i, i + q.length)) + '</mark>' +
      escapeHtml(text.slice(i + q.length));
  }

  window.PaletteSearch = { enrich, usageScore, filterAndRank, highlightHtml, escapeHtml };
})();
