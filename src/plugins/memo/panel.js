/* memo panel — markdown notes with a VS Code-flavoured editor:
   split live preview, Ln/Col cursor, line/char/word + selection stats,
   smart Tab / list-continuation Enter, autosave flushed on unmount. */
(function () {
  'use strict';

  /* --- markdown renderer (subset: headings, hr, quote, nested lists, tasks,
         tables, fenced code, emphasis, links, images, autolink, soft breaks).
         Everything is HTML-escaped first; transforms never inject raw input. --- */
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
      cur = { text: m[3], children: [] };
      items.push(cur);
      i++;
    }
    const lis = items.map(it => {
      let inner;
      const task = /^\[( |x|X)\]\s+(.*)$/.exec(it.text);
      if (task) {
        const on = task[1].toLowerCase() === 'x';
        inner = `<span class="memo-task"><input type="checkbox" ${on ? 'checked' : ''} disabled> ${inlineMd(task[2])}</span>`;
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
        i++; // closing fence (or EOF)
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

  /* --- statistics & cursor ------------------------------------------------ */
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

  const relTime = (ts, isZh) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return isZh ? '刚刚' : 'just now';
    if (diff < 3600000) return isZh ? `${Math.floor(diff / 60000)} 分钟前` : `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return isZh ? `${Math.floor(diff / 3600000)} 小时前` : `${Math.floor(diff / 3600000)}h ago`;
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return sameYear ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
      : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  function mount(el, ctx) {
    const isZh = ctx.lang !== 'en';
    const L = (zh, en) => (isZh ? zh : en);

    el.innerHTML = `
      <div class="memo-root">
        <aside class="memo-side">
          <div class="memo-side-head">
            <span class="memo-side-title">${L('笔记', 'Notes')} <b class="memo-count"></b></span>
            <button type="button" class="btn small memo-new" title="${L('新建笔记 (Ctrl+N)', 'New note (Ctrl+N)')}">＋ ${L('新建', 'New')}</button>
          </div>
          <div class="memo-search-wrap">
            <input class="memo-search" type="text" spellcheck="false" placeholder="${L('搜索笔记…', 'Search notes…')}">
          </div>
          <div class="memo-list"></div>
        </aside>
        <div class="memo-main">
          <div class="memo-toolbar">
            <input class="memo-title" type="text" spellcheck="false" placeholder="${L('无标题笔记', 'Untitled note')}">
            <div class="seg memo-mode" role="group">
              <button type="button" data-mode="edit">${L('编辑', 'Edit')}</button>
              <button type="button" data-mode="split">${L('分屏', 'Split')}</button>
              <button type="button" data-mode="preview">${L('预览', 'Preview')}</button>
            </div>
          </div>
          <div class="memo-tools">
            <button type="button" class="memo-fmt" data-fmt="bold" title="Ctrl+B"><b>B</b></button>
            <button type="button" class="memo-fmt" data-fmt="italic" title="Ctrl+I"><i>I</i></button>
            <button type="button" class="memo-fmt" data-fmt="strike" title=""><s>S</s></button>
            <button type="button" class="memo-fmt mono" data-fmt="code" title="">&lt;&gt;</button>
            <button type="button" class="memo-fmt" data-fmt="link" title="">🔗</button>
            <span class="memo-tools-sep"></span>
            <button type="button" class="memo-fmt" data-fmt="h" title="">H</button>
            <button type="button" class="memo-fmt" data-fmt="quote" title="">❝</button>
            <button type="button" class="memo-fmt" data-fmt="ul" title="">• ≡</button>
            <button type="button" class="memo-fmt" data-fmt="ol" title="">1. ≡</button>
            <button type="button" class="memo-fmt" data-fmt="table" title="">⊞</button>
            <span class="memo-tools-sep"></span>
            <button type="button" class="memo-fmt" data-fmt="date" title="">🕐</button>
            <span class="memo-save-state"></span>
          </div>
          <div class="memo-editor-area">
            <textarea class="memo-editor mono" spellcheck="false" placeholder="${L('开始记录… 支持 Markdown', 'Start writing… markdown supported')}"></textarea>
            <div class="memo-preview memo-md"></div>
          </div>
          <div class="memo-statusbar mono">
            <span class="memo-caret"></span>
            <span class="memo-selinfo" hidden></span>
            <span class="grow"></span>
            <span class="memo-totals"></span>
            <span class="memo-lang-badge">Markdown</span>
            <span class="memo-savedot" title=""></span>
          </div>
        </div>
      </div>`;

    const sideList = el.querySelector('.memo-list');
    const searchInput = el.querySelector('.memo-search');
    const countEl = el.querySelector('.memo-count');
    const titleInput = el.querySelector('.memo-title');
    const editor = el.querySelector('.memo-editor');
    const preview = el.querySelector('.memo-preview');
    const editorArea = el.querySelector('.memo-editor-area');
    const modeSeg = el.querySelector('.memo-mode');
    const saveState = el.querySelector('.memo-save-state');
    const savedot = el.querySelector('.memo-savedot');
    const caretEl = el.querySelector('.memo-caret');
    const selinfoEl = el.querySelector('.memo-selinfo');
    const totalsEl = el.querySelector('.memo-totals');
    const tools = el.querySelector('.memo-tools');

    let notes = [];
    let activeId = null;
    let prefs = {};
    let query = '';
    let dirty = false;
    let saveTimer = null;
    let lastSavedAt = 0;
    let deleteArmedId = null;
    let deleteArmTimer = null;

    const activeNote = () => notes.find(n => n.id === activeId) || null;

    /* --- sidebar ------------------------------------------------------------ */
    const excerpt = n => {
      const line = String(n.content || '').split('\n').find(l => l.trim() && !/^#{1,6}\s/.test(l)) || '';
      return line.replace(/^>\s*/, '').replace(/[*_~`#>|]/g, '').trim().slice(0, 40);
    };

    function renderList() {
      sideList.innerHTML = '';
      countEl.textContent = String(notes.length);
      const q = query.trim().toLowerCase();
      const shown = q
        ? notes.filter(n => (n.title + '\n' + n.content).toLowerCase().includes(q))
        : notes;
      if (!shown.length) {
        const empty = document.createElement('div');
        empty.className = 'memo-list-empty';
        empty.textContent = q ? L('没有匹配的笔记', 'no matching notes') : L('还没有笔记，点击「新建」开始', 'no notes yet — hit “New”');
        sideList.appendChild(empty);
        return;
      }
      for (const n of shown) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'memo-item' + (n.id === activeId ? ' on' : '') + (n.pinned ? ' pinned' : '');
        item.dataset.id = n.id;
        item.innerHTML = `
          <span class="memo-item-pin" title="${L('置顶笔记', 'Pinned')}">📌</span>
          <span class="memo-item-body">
            <span class="memo-item-title"></span>
            <span class="memo-item-sub"></span>
          </span>
          <span class="memo-item-ops">
            <span class="memo-item-pinbtn" role="button" tabindex="-1" title="${n.pinned ? L('取消置顶', 'Unpin') : L('置顶', 'Pin')}">${n.pinned ? '⇩' : '📌'}</span>
            <span class="memo-item-del" role="button" tabindex="-1" title="${L('删除', 'Delete')}">🗑</span>
          </span>`;
        item.querySelector('.memo-item-title').textContent = n.title || L('无标题', 'untitled');
        item.querySelector('.memo-item-sub').textContent = `${relTime(n.updatedAt, isZh)} · ${excerpt(n)}`;
        item.addEventListener('click', e => {
          if (e.target.closest('.memo-item-ops')) return;
          if (n.id !== activeId) openNote(n.id);
        });
        item.querySelector('.memo-item-pinbtn').addEventListener('click', async e => {
          e.stopPropagation();
          const res = await ctx.call('togglePin', { id: n.id }).catch(() => null);
          if (res && res.ok) {
            notes = res.notes;
            renderList();
          }
        });
        item.querySelector('.memo-item-del').addEventListener('click', async e => {
          e.stopPropagation();
          if (deleteArmedId !== n.id) {
            deleteArmedId = n.id;
            item.classList.add('armed');
            clearTimeout(deleteArmTimer);
            deleteArmTimer = setTimeout(() => { deleteArmedId = null; item.classList.remove('armed'); }, 2500);
            return;
          }
          clearTimeout(deleteArmTimer);
          deleteArmedId = null;
          const res = await ctx.call('remove', { id: n.id }).catch(() => null);
          if (res && res.ok) {
            notes = res.notes;
            if (activeId === n.id) {
              activeId = res.activeId;
              loadActive(true);
            }
            renderList();
          }
        });
        sideList.appendChild(item);
      }
    }

    /* --- status bar --------------------------------------------------------- */
    function updateStats() {
      const pos = caretPos(editor);
      caretEl.textContent = `Ln ${pos.ln}, Col ${pos.col}`;
      const selText = editor.value.slice(editor.selectionStart, editor.selectionEnd);
      if (selText) {
        const c = countText(selText);
        selinfoEl.hidden = false;
        selinfoEl.textContent = L(
          `已选择 ${c.chars} 个字符 · ${c.words} 词`,
          `${c.chars} chars · ${c.words} words selected`
        );
      } else {
        selinfoEl.hidden = true;
      }
      const t = countText(editor.value);
      totalsEl.textContent = L(`共 ${t.lines} 行 · ${t.chars} 字 · ${t.words} 词`, `${t.lines} lines · ${t.chars} chars · ${t.words} words`);
    }

    /* --- preview ------------------------------------------------------------ */
    function updatePreview() {
      preview.innerHTML = renderMarkdown(editor.value);
    }

    let syncScroll = false;
    editor.addEventListener('scroll', () => {
      if (!syncScroll || modeSeg.dataset.mode !== 'split') return;
      const er = editor.scrollHeight - editor.clientHeight;
      const pr = preview.scrollHeight - preview.clientHeight;
      if (er > 0 && pr > 0) preview.scrollTop = editor.scrollTop / er * pr;
    });

    /* open external links through the host shell, not an Electron window */
    preview.addEventListener('click', e => {
      const a = e.target.closest('a[data-ext]');
      if (a) { e.preventDefault(); ctx.openExternal(a.href); }
    });

    /* --- saving --------------------------------------------------------------- */
    function markSaved() {
      lastSavedAt = Date.now();
      dirty = false;
      const pad = n => String(n).padStart(2, '0');
      const d = new Date();
      saveState.textContent = L('已保存', 'saved');
      savedot.className = 'memo-savedot ok';
      savedot.title = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    function scheduleSave() {
      dirty = true;
      saveState.textContent = L('保存中…', 'saving…');
      savedot.className = 'memo-savedot';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flushSave, 600);
    }

    async function flushSave() {
      clearTimeout(saveTimer);
      saveTimer = null;
      if (!dirty) return;
      const note = activeNote();
      if (!note) { dirty = false; return; }
      const res = await ctx.call('save', { id: note.id, content: editor.value }).catch(() => null);
      if (res && res.ok) {
        // refresh sidebar entry in place (title may auto-derive, order may change)
        const idx = notes.findIndex(n => n.id === note.id);
        if (idx >= 0) notes[idx] = res.note;
        renderList();
        markSaved();
      } else {
        saveState.textContent = L('保存失败', 'save failed');
        savedot.className = 'memo-savedot bad';
      }
    }

    /* --- note switching --------------------------------------------------------- */
    function openNote(id) {
      flushSave().then(() => {
        activeId = id;
        ctx.call('setActive', { id }).catch(() => {});
        loadActive(true);
        renderList();
      });
    }

    function loadActive(focus) {
      const n = activeNote();
      editor.value = n ? n.content : '';
      titleInput.value = n ? n.title : '';
      const disabled = !n;
      editor.disabled = disabled;
      titleInput.disabled = disabled;
      tools.classList.toggle('disabled', disabled);
      dirty = false;
      updatePreview();
      updateStats();
      markSaved();
      if (focus && n) editor.focus();
    }

    /* --- editor behaviours -------------------------------------------------------- */
    function setRange(start, end) {
      editor.focus();
      editor.setSelectionRange(start, end);
      updateStats();
    }

    /* wrap (or unwrap, when exactly surrounded) the selection */
    function wrapSelection(before, after, placeholder) {
      const s = editor.selectionStart;
      const e = editor.selectionEnd;
      const val = editor.value;
      const sel = val.slice(s, e) || placeholder || '';
      if (s >= before.length && e <= val.length - after.length &&
          val.slice(s - before.length, s) === before && val.slice(e, e + after.length) === after &&
          val.slice(s - before.length, e + after.length) === before + val.slice(s, e) + after) {
        // unwrap the identical wrapping already present
        const inner = val.slice(s, e);
        editor.value = val.slice(0, s - before.length) + inner + val.slice(e + after.length);
        setRange(s - before.length, e - before.length);
      } else {
        editor.value = val.slice(0, s) + before + sel + after + val.slice(e);
        setRange(s + before.length, s + before.length + sel.length);
      }
      scheduleSave();
      updatePreview();
    }

    /* toggle a per-line prefix (headings / quote / lists) over the selection */
    function toggleLinePrefix(prefixFn) {
      const s = editor.selectionStart;
      const e = editor.selectionEnd;
      const val = editor.value;
      const ls = val.lastIndexOf('\n', s - 1) + 1;
      let le = val.indexOf('\n', e);
      if (le === -1) le = val.length;
      const block = val.slice(ls, le) || '';
      const lines = block.split('\n');
      const { prefix } = prefixFn(lines[0] || '');
      const all = lines.every(l => l.startsWith(prefix));
      const next = lines.map(l => (all ? l.slice(prefix.length) : prefix + l.replace(/^(#{1,6}\s|>\s|[-*+]\s|\d+\.\s)/, '')));
      editor.value = val.slice(0, ls) + next.join('\n') + val.slice(le);
      setRange(ls, ls + next.join('\n').length);
      scheduleSave();
      updatePreview();
    }

    function insertBlock(text) {
      const s = editor.selectionStart;
      const val = editor.value;
      const pre = s > 0 && val[s - 1] !== '\n' ? '\n\n' : '';
      editor.value = val.slice(0, s) + pre + text + val.slice(editor.selectionEnd);
      setRange(s + pre.length + text.length, s + pre.length + text.length);
      scheduleSave();
      updatePreview();
    }

    function handleTab(e) {
      e.preventDefault();
      const s = editor.selectionStart;
      const epos = editor.selectionEnd;
      const val = editor.value;
      if (s !== epos || e.shiftKey) {
        // indent / outdent whole lines
        const ls = val.lastIndexOf('\n', s - 1) + 1;
        let le = val.indexOf('\n', epos);
        if (le === -1) le = val.length;
        const lines = val.slice(ls, le).split('\n');
        const next = lines.map(l => (e.shiftKey ? l.replace(/^ {1,2}/, '') : '  ' + l));
        editor.value = val.slice(0, ls) + next.join('\n') + val.slice(le);
        setRange(ls, ls + next.join('\n').length);
      } else if (e.shiftKey) {
        const ls = val.lastIndexOf('\n', s - 1) + 1;
        const removed = val.slice(ls, s).match(/ {1,2}$/);
        if (removed) {
          editor.value = val.slice(0, s - removed[0].length) + val.slice(s);
          setRange(s - removed[0].length, s - removed[0].length);
        }
      } else {
        editor.value = val.slice(0, s) + '  ' + val.slice(s);
        setRange(s + 2, s + 2);
      }
      scheduleSave();
      updatePreview();
    }

    /* Enter continues lists (- / * / 1. / - [ ] ) like mainstream editors;
       an empty item terminates the list instead */
    function handleEnter(e) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const s = editor.selectionStart;
      if (s !== editor.selectionEnd) return;
      const val = editor.value;
      const ls = val.lastIndexOf('\n', s - 1) + 1;
      const line = val.slice(ls, s);
      const m = /^(\s*)([-*+]|(\d+)\.)\s+(\[( |x|X)\]\s+)?(.*)$/.exec(line);
      if (!m) return;
      if (!m[6].trim()) {
        // empty item → remove the marker and break out of the list
        e.preventDefault();
        editor.value = val.slice(0, ls) + val.slice(s);
        setRange(ls, ls);
      } else {
        e.preventDefault();
        const marker = m[3] ? `${Number(m[3]) + 1}.` : m[2];
        const task = m[5] !== undefined ? '[ ] ' : '';
        const ins = '\n' + m[1] + marker + ' ' + task;
        editor.value = val.slice(0, s) + ins + val.slice(s);
        setRange(s + ins.length, s + ins.length);
      }
      scheduleSave();
      updatePreview();
    }

    editor.addEventListener('keydown', e => {
      if (e.key === 'Tab') handleTab(e);
      else if (e.key === 'Enter') handleEnter(e);
      else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'b') { e.preventDefault(); wrapSelection('**', '**'); }
      else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'i') { e.preventDefault(); wrapSelection('*', '*'); }
      else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        dirty = true;
        flushSave();
      }
    });

    editor.addEventListener('input', () => { scheduleSave(); updatePreview(); updateStats(); });
    const onSelChange = () => updateStats();
    document.addEventListener('selectionchange', onSelChange);
    editor.addEventListener('click', updateStats);
    editor.addEventListener('keyup', updateStats);

    titleInput.addEventListener('input', () => {
      const n = activeNote();
      if (n) { n.title = titleInput.value; }
      scheduleSave();
      renderList();
    });
    titleInput.addEventListener('change', async () => {
      const n = activeNote();
      if (!n) return;
      const res = await ctx.call('rename', { id: n.id, title: titleInput.value }).catch(() => null);
      if (res && res.ok) {
        const idx = notes.findIndex(x => x.id === n.id);
        if (idx >= 0) notes[idx] = res.note;
        renderList();
      }
    });

    /* --- toolbar ---------------------------------------------------------------- */
    const TOOLBAR_DT = isZh
      ? '| 列一 | 列二 |\n| ---- | ---- |\n|  |  |'
      : '| col1 | col2 |\n| ---- | ---- |\n|  |  |';

    tools.addEventListener('click', e => {
      const b = e.target.closest('button[data-fmt]');
      if (!b || tools.classList.contains('disabled')) return;
      editor.focus();
      switch (b.dataset.fmt) {
        case 'bold': wrapSelection('**', '**'); break;
        case 'italic': wrapSelection('*', '*'); break;
        case 'strike': wrapSelection('~~', '~~'); break;
        case 'code': wrapSelection('`', '`'); break;
        case 'link': wrapSelection('[', '](https://)', L('链接文字', 'link text')); break;
        case 'h': toggleLinePrefix(l => ({ prefix: /^#{1,5}\s/.test(l) ? '#'.repeat(l.match(/^#+/)[0].length + 1) + ' ' : '# ' })); break;
        case 'quote': toggleLinePrefix(() => ({ prefix: '> ' })); break;
        case 'ul': toggleLinePrefix(() => ({ prefix: '- ' })); break;
        case 'ol': toggleLinePrefix(() => ({ prefix: '1. ' })); break;
        case 'table': insertBlock(TOOLBAR_DT); break;
        case 'date': insertBlock(localNow(isZh)); break;
      }
    });

    function localNow(zh) {
      const d = new Date();
      const pad = n => String(n).padStart(2, '0');
      return zh
        ? `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
        : d.toISOString().replace('T', ' ').slice(0, 16);
    }

    /* --- view mode ----------------------------------------------------------------- */
    function setMode(mode) {
      modeSeg.dataset.mode = mode;
      prefs.viewMode = mode;
      ctx.call('setPrefs', { viewMode: mode }).catch(() => {});
      modeSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
      editorArea.dataset.mode = mode;
      syncScroll = mode === 'split';
      if (mode === 'edit') editor.focus();
    }
    modeSeg.addEventListener('click', e => {
      const b = e.target.closest('button[data-mode]');
      if (b) setMode(b.dataset.mode);
    });

    /* --- misc controls ---------------------------------------------------------------- */
    el.querySelector('.memo-new').addEventListener('click', async () => {
      const res = await ctx.call('create', {}).catch(() => null);
      if (res && res.ok) {
        notes = res.notes;
        activeId = res.activeId;
        renderList();
        loadActive(true);
        editor.focus();
      }
    });

    searchInput.addEventListener('input', () => { query = searchInput.value; renderList(); });

    ctx.onEvent('changed', payload => {
      if (payload && Array.isArray(payload.notes)) {
        notes = payload.notes;
        if (!notes.some(n => n.id === activeId)) {
          activeId = payload.activeId || null;
          loadActive(false);
        }
        renderList();
      }
    });

    /* --- boot -------------------------------------------------------------------------- */
    ctx.call('list').then(res => {
      if (!res) return;
      notes = res.notes || [];
      activeId = res.activeId || null;
      prefs = res.prefs || {};
      renderList();
      // pipeline payload ("发送到备忘录") lands as a brand-new note
      const pv = ctx.payload && typeof ctx.payload.value === 'string' && ctx.payload.value.trim() ? ctx.payload.value : '';
      if (pv) {
        ctx.call('create', { content: pv }).then(r => {
          if (r && r.ok) {
            notes = r.notes;
            activeId = r.activeId;
            renderList();
            loadActive(true);
          }
        }).catch(() => loadActive(true));
      } else {
        loadActive(true);
      }
      setMode(['edit', 'split', 'preview'].includes(prefs.viewMode) ? prefs.viewMode : 'split');
    }).catch(() => renderList());

    /* unmount must drop document-level listeners and flush unsaved edits */
    return function cleanup() {
      document.removeEventListener('selectionchange', onSelChange);
      clearTimeout(saveTimer);
      saveTimer = null;
      const n = activeNote();
      if (dirty && n) ctx.call('save', { id: n.id, content: editor.value }).catch(() => {});
    };
  }

  let cleanup = null;
  window.Toolbox.panel({
    mount(el, ctx) { cleanup = mount(el, ctx); },
    unmount() { if (typeof cleanup === 'function') cleanup(); cleanup = null; },
  });
})();
