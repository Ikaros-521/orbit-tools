/* memo-markdown.js — Markdown parsing, inline formatting, and text stats for the Memo plugin.
   Provides CommonJS and window.MemoMarkdown dual exports. */

(function () {
  'use strict';

  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeHref = u => (/^(https?:|#|\/|mailto:)/i.test(u) ? u : '#');
  const LIST_RE = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;

  function inlineMd(raw) {
    let s = escapeHtml(raw);
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) => `<img alt="${alt}" src="${safeHref(src)}" loading="lazy">`);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) => `<a href="${safeHref(href)}" data-ext target="_blank" rel="noopener">${text}</a>`);
    s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" data-ext target="_blank" rel="noopener">$2</a>');
    s = s.replace(/\u0000(\d+)\u0000/g, (m, idx) => `<code>${codes[+idx]}</code>`);
    return s;
  }

  function parseList(lines, start) {
    const first = LIST_RE.exec(lines[start]);
    const base = first[1].replace(/\t/g, '  ').length;
    const ordered = first[2].length > 1;
    const items = [];
    let i = start;
    let cur = null;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        let j = i + 1;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j < lines.length && LIST_RE.test(lines[j])) { i = j; continue; }
        break;
      }
      const m = LIST_RE.exec(line);
      const indent = (m ? m[1] : line.match(/^\s*/)[0]).replace(/\t/g, '  ').length;
      if (!m || indent < base) break;
      if (indent >= base + 2) {
        if (cur) cur.children.push(line.replace(/^\s{2}/, ''));
        i++;
        continue;
      }
      cur = { text: m[3], children: [], rawLineIndex: i };
      items.push(cur);
      i++;
    }
    const lis = items.map(it => {
      let inner;
      const task = /^\[( |x|X)\]\s+(.*)$/.exec(it.text);
      if (task) {
        const on = task[1].toLowerCase() === 'x';
        inner = `<span class="memo-task"><input type="checkbox" data-task-line="${it.rawLineIndex}" ${on ? 'checked' : ''}> ${inlineMd(task[2])}</span>`;
      } else {
        inner = inlineMd(it.text);
      }
      if (it.children.length) {
        inner += it.children.every(c => LIST_RE.test(c))
          ? parseList(it.children, 0)[0]
          : `<p>${it.children.map(c => inlineMd(c.trim())).join('<br>')}</p>`;
      }
      return `<li>${inner}</li>`;
    }).join('');
    return [`<${ordered ? 'ol' : 'ul'}>${lis}</${ordered ? 'ol' : 'ul'}>`, i];
  }

  function renderLines(lines) {
    const out = [];
    let para = '';
    const flush = () => { if (para) { out.push(`<p>${para}</p>`); para = ''; } };
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      const fence = /^ {0,3}```(\S*)\s*$/.exec(line);
      if (fence) {
        flush();
        const buf = [];
        i++;
        while (i < lines.length && !/^ {0,3}```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push(`<pre${fence[1] ? ` data-lang="${escapeHtml(fence[1])}"` : ''}><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
        continue;
      }

      const h = /^ {0,3}(#{1,6})\s+(.*)$/.exec(line);
      if (h) {
        flush();
        const n = h[1].length;
        out.push(`<h${n}>${inlineMd(h[2].replace(/\s+#+\s*$/, ''))}</h${n}>`);
        i++;
        continue;
      }

      if (/^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); i++; continue; }

      if (/^ {0,3}>/.test(line)) {
        flush();
        const buf = [];
        while (i < lines.length && /^ {0,3}>/.test(lines[i])) { buf.push(lines[i].replace(/^ {0,3}> ?/, '')); i++; }
        out.push(`<blockquote>${renderLines(buf)}</blockquote>`);
        continue;
      }

      if (line.includes('|') && i + 1 < lines.length && /-/.test(lines[i + 1]) && /^ {0,3}\|?[\s:|-]+\|?[\s:|-]*$/.test(lines[i + 1])) {
        flush();
        const cells = r => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
        const head = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) { rows.push(cells(lines[i])); i++; }
        out.push(`<table><thead><tr>${head.map(c => `<th>${inlineMd(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inlineMd(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
        continue;
      }

      if (LIST_RE.test(line)) {
        flush();
        const [html, next] = parseList(lines, i);
        out.push(html);
        i = next;
        continue;
      }

      if (!line.trim()) { flush(); i++; continue; }

      para += (para ? '<br>' : '') + inlineMd(line);
      i++;
    }
    flush();
    return out.join('\n');
  }

  const renderMarkdown = src => renderLines(String(src || '').replace(/\r\n?/g, '\n').split('\n'));

  function countText(text) {
    const t = String(text || '');
    const chars = Array.from(t).length;
    const latin = (t.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
    const cjk = (t.match(/[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uff66-\uff9f]/g) || []).length;
    return { chars, words: latin + cjk, lines: t === '' ? 1 : t.split('\n').length };
  }

  function caretPos(ta) {
    const upto = ta.value.slice(0, ta.selectionStart);
    const lines = upto.split('\n');
    return { ln: lines.length, col: Array.from(lines[lines.length - 1]).length + 1 };
  }

  const pad = n => String(n).padStart(2, '0');
  const formatDateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const relTime = (ts, isZh) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return isZh ? '刚刚' : 'just now';
    if (diff < 3600000) return isZh ? `${Math.floor(diff / 60000)} 分钟前` : `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return isZh ? `${Math.floor(diff / 3600000)} 小时前` : `${Math.floor(diff / 3600000)}h ago`;
    const d = new Date(ts);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return sameYear ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
      : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const memoMd = {
    escapeHtml,
    safeHref,
    inlineMd,
    parseList,
    renderLines,
    renderMarkdown,
    countText,
    caretPos,
    pad,
    formatDateStr,
    relTime
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = memoMd;
  }
  if (typeof window !== 'undefined') {
    window.MemoMarkdown = memoMd;
  }
})();
