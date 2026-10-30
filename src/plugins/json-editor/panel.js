/* json-editor panel — pure renderer logic, zero backend required.
   Features:
   - Real-time JSON syntax checking & precise error line/col pinpointing
   - Robust Python output (dict/tuple/True/False/None/single quotes) to valid JSON repair engine
   - 1-click JSON Minify (compress to 1 line) & Beautify (format with 2/4 spaces)
   - Left-side interactive collapsible Key-Value Tree (expand/collapse all, levels, JSONPath copy, search/filter)
   - 1-click String Escape & Unescape
   - 1-click Comment Removal (//, /* * /, #) with strict string-safety
*/
(function () {
  'use strict';

  /* --- Samples ----------------------------------------------------------- */
  const SAMPLES = {
    standard: JSON.stringify({
      appName: "Orbit Toolbox",
      version: "1.0.0",
      enabled: true,
      author: {
        name: "Ikaros-521",
        email: "327209194@qq.com",
        links: ["https://github.com/Ikaros-521/orbit-tools"]
      },
      features: [
        { id: "json-editor", name: "JSON 编辑器", active: true, rating: 5.0 },
        { id: "codec-lab", name: "编码转换", active: true, rating: 4.8 },
        { id: "mirror-hub", name: "镜像源切换", active: true, rating: 4.9 }
      ],
      settings: {
        theme: "dark",
        fontSize: 13,
        autoFormat: true,
        backup: null
      }
    }, null, 2),

    python: `{
  'name': 'Orbit Tools API',
  'is_active': True,
  'debug_mode': False,
  'empty_value': None,
  'tags': ('developer', 'desktop', 'electron', 'toolbox'),
  'server_config': {
    'host': '127.0.0.1',
    'port': 8080,
    'workers': 4,
    'timeout': None,
  },
  'metrics': {
    'requests': 10240,
    'error_rate': 0.0012,
    'latency_ms': [12.5, 18.2, 14.0,],
  },
  'notes': 'He said: "Python dicts are handy", but it\\'s not valid JSON!',
  # Python comment here
  /* C-style comment here */
  // Line comment here
}`
  };

  /* --- Python-to-JSON Repair Engine -------------------------------------- */
  function fixPythonJson(raw) {
    if (!raw || !raw.trim()) return { text: raw, fixes: 0 };
    let fixes = 0;
    let s = raw;

    // 1. Remove python byte prefixes: b'...' or b"..."
    s = s.replace(/\bb(['"])/g, (m, g1) => { fixes++; return g1; });

    // 2. Character-by-character scan for string literals & keyword transformations
    let out = '';
    let i = 0;
    const len = s.length;

    while (i < len) {
      const ch = s[i];

      // Single-quoted string literal in Python: '...'
      if (ch === "'") {
        fixes++;
        out += '"';
        i++;
        while (i < len) {
          const c = s[i];
          if (c === '\\') {
            const next = s[i + 1];
            if (next === "'") {
              // \' in python single quote becomes literal ' in json double quote
              out += "'";
              i += 2;
            } else if (next === '"') {
              // \" in python becomes \"
              out += '\\"';
              i += 2;
            } else {
              out += '\\' + (next || '');
              i += 2;
            }
          } else if (c === '"') {
            // Unescaped double quote inside single-quoted string must be escaped in JSON
            out += '\\"';
            i++;
          } else if (c === "'") {
            // End of single-quoted string
            out += '"';
            i++;
            break;
          } else if (c === '\n') {
            out += '\\n';
            i++;
          } else if (c === '\r') {
            out += '\\r';
            i++;
          } else if (c === '\t') {
            out += '\\t';
            i++;
          } else {
            out += c;
            i++;
          }
        }
        continue;
      }

      // Double-quoted string literal: "..."
      if (ch === '"') {
        out += '"';
        i++;
        while (i < len) {
          const c = s[i];
          if (c === '\\') {
            out += '\\' + (s[i + 1] || '');
            i += 2;
          } else if (c === '"') {
            out += '"';
            i++;
            break;
          } else {
            out += c;
            i++;
          }
        }
        continue;
      }

      // Check comments outside strings: #, //, /*
      if (ch === '#') {
        fixes++;
        while (i < len && s[i] !== '\n') i++;
        continue;
      }
      if (ch === '/' && s[i + 1] === '/') {
        fixes++;
        while (i < len && s[i] !== '\n') i++;
        continue;
      }
      if (ch === '/' && s[i + 1] === '*') {
        fixes++;
        i += 2;
        while (i < len && !(s[i] === '*' && s[i + 1] === '/')) i++;
        i += 2;
        continue;
      }

      // Outside strings: convert tuple parentheses (1, 2) to [1, 2]
      if (ch === '(') {
        out += '[';
        fixes++;
        i++;
        continue;
      }
      if (ch === ')') {
        out += ']';
        fixes++;
        i++;
        continue;
      }

      out += ch;
      i++;
    }

    // 3. Replace Python constants with JSON equivalents — only OUTSIDE string
    // literals (by step 2 all strings are double-quoted), so values like
    // "True story" / "x, y: z" survive untouched. The string alternative is
    // matched first and passed through as-is.
    const replaceOutsideStrings = (pattern, to) => {
      out = out.replace(new RegExp(`"(?:[^"\\\\]|\\\\.)*"|(${pattern.source})`, 'g'), (m, g1) => {
        if (g1 === undefined) return m; // a string literal
        fixes++;
        return to;
      });
    };
    replaceOutsideStrings(/\bTrue\b/, 'true');
    replaceOutsideStrings(/\bFalse\b/, 'false');
    replaceOutsideStrings(/\bNone\b/, 'null');
    replaceOutsideStrings(/\bNaN\b|\bnan\b/, 'null');
    replaceOutsideStrings(/\bInfinity\b|\binf\b/, 'null');
    replaceOutsideStrings(/-Infinity\b|-inf\b/, 'null');

    // 4. Wrap unquoted object keys: { name: 123 } -> { "name": 123 }
    //    (string-aware for the same reason as step 3)
    out = out.replace(/"(?:[^"\\]|\\.)*"|(([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$-]*)\s*:)/g, (m, keyMatch, p1, p2) => {
      if (keyMatch === undefined) return m; // a string literal — already quoted
      fixes++;
      return `${p1}"${p2}":`;
    });

    // 5. Remove trailing commas before } or ]
    out = out.replace(/,\s*([}\]])/g, (match, p1) => {
      fixes++;
      return p1;
    });

    return { text: out, fixes };
  }

  /* --- String-Safe Comment Stripper -------------------------------------- */
  function removeComments(raw) {
    if (!raw) return { text: raw, count: 0 };
    let count = 0;
    let out = '';
    let i = 0;
    const len = raw.length;

    while (i < len) {
      const ch = raw[i];

      // String literal: preserve completely
      if (ch === '"' || ch === "'") {
        const quote = ch;
        out += quote;
        i++;
        while (i < len) {
          const c = raw[i];
          if (c === '\\') {
            out += '\\' + (raw[i + 1] || '');
            i += 2;
          } else if (c === quote) {
            out += quote;
            i++;
            break;
          } else {
            out += c;
            i++;
          }
        }
        continue;
      }

      // Single line comment: //
      if (ch === '/' && raw[i + 1] === '/') {
        count++;
        while (i < len && raw[i] !== '\n') i++;
        continue;
      }

      // Multi-line comment: /* ... */
      if (ch === '/' && raw[i + 1] === '*') {
        count++;
        i += 2;
        while (i < len && !(raw[i] === '*' && raw[i + 1] === '/')) i++;
        i += 2;
        continue;
      }

      // Hash comment: # ...
      if (ch === '#') {
        count++;
        while (i < len && raw[i] !== '\n') i++;
        continue;
      }

      out += ch;
      i++;
    }

    return { text: out, count };
  }

  /* --- Escape & Unescape ------------------------------------------------- */
  function escapeJsonString(text) {
    if (!text) return '';
    return JSON.stringify(text);
  }

  function unescapeJsonString(text) {
    if (!text) return '';
    const trimmed = text.trim();
    // If enclosed in double quotes, standard JSON string parse
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // Fallback
      }
    }
    // Manual unescape — single pass, so an escaped backslash followed by n
    // (\\n) correctly yields the two chars "\n" instead of being re-processed
    // into a real newline by a later rule
    let unescaped = '';
    for (let k = 0; k < trimmed.length; k++) {
      const c = trimmed[k];
      if (c === '\\' && k + 1 < trimmed.length) {
        const n = trimmed[k + 1];
        if (n === '"' || n === "'" || n === '\\') { unescaped += n; k++; }
        else if (n === 'n') { unescaped += '\n'; k++; }
        else if (n === 'r') { unescaped += '\r'; k++; }
        else if (n === 't') { unescaped += '\t'; k++; }
        else unescaped += c;
      } else {
        unescaped += c;
      }
    }
    return unescaped;
  }

  /* --- Minify ------------------------------------------------------------ */
  function minifyJson(text) {
    const cleaned = removeComments(text).text;
    const parsed = JSON.parse(cleaned);
    return JSON.stringify(parsed);
  }

  /* --- Format ------------------------------------------------------------ */
  function formatJson(text, indent = 2) {
    const cleaned = removeComments(text).text;
    const parsed = JSON.parse(cleaned);
    return JSON.stringify(parsed, null, indent);
  }

  /* --- Parse Line and Column from Error ---------------------------------- */
  function parseErrorLocation(text, err) {
    let line = 1, col = 1, pos = -1;
    const msg = String(err && err.message ? err.message : err);

    // Check "at position 123"
    const posMatch = msg.match(/at position (\d+)/i);
    if (posMatch) {
      pos = parseInt(posMatch[1], 10);
    }

    // Check "line 2 column 5"
    const lineColMatch = msg.match(/line (\d+) column (\d+)/i);
    if (lineColMatch) {
      line = parseInt(lineColMatch[1], 10);
      col = parseInt(lineColMatch[2], 10);
    } else if (pos >= 0 && pos <= text.length) {
      const sub = text.slice(0, pos);
      const lines = sub.split('\n');
      line = lines.length;
      col = lines[lines.length - 1].length + 1;
    }

    return { line, col, pos, message: msg };
  }

  /* --- HTML Escaper ------------------------------------------------------ */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* Escape FIRST, then wrap filter hits with the highlight span — inserting
     the span into raw text would let pasted content inject arbitrary HTML. */
  function hlFiltered(text, filter) {
    const safe = escapeHtml(text);
    if (!filter || !text.toLowerCase().includes(filter)) return safe;
    const escFilter = escapeHtml(filter).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    return safe.replace(new RegExp(`(${escFilter})`, 'gi'), '<span class="je-highlight">$1</span>');
  }

  /* --- Metadata stats calculator ----------------------------------------- */
  function calcStats(data) {
    let nodeCount = 0;
    let maxDepth = 0;

    function walk(val, depth) {
      nodeCount++;
      if (depth > maxDepth) maxDepth = depth;
      if (val !== null && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (const item of val) walk(item, depth + 1);
        } else {
          for (const k of Object.keys(val)) walk(val[k], depth + 1);
        }
      }
    }

    walk(data, 1);
    return { nodeCount, maxDepth };
  }

  /* --- Mount Panel ------------------------------------------------------- */
  function mount(el, ctx) {
    const isZh = ctx.lang !== 'en';
    let currentLayout = 'split'; // 'split' | 'code' | 'tree'
    let lastParsedData = null;
    let toastTimer = null;
    let debounceTimer = null;
    let lastErrorLoc = null;

    el.innerHTML = `
      <div class="je-root">
        <!-- Toolbar -->
        <div class="je-toolbar">
          <button type="button" class="btn" data-act="format" title="格式化展开 (2格缩进)">${isZh ? '格式化' : 'Format'}</button>
          <button type="button" class="btn" data-act="minify" title="单行压缩">${isZh ? '单行压缩' : 'Minify'}</button>
          <button type="button" class="btn" data-act="fixPython" title="快速将 Python 字典/元组/True/False/None 转换为合法 JSON">${isZh ? 'Python转JSON' : 'Fix Python'}</button>
          <button type="button" class="btn" data-act="cleanComments" title="清除 //、/* */ 与 # 注释">${isZh ? '去注释' : 'Clean Comments'}</button>
          
          <span class="sep"></span>

          <button type="button" class="btn ghost" data-act="escape" title="转义为字符串">${isZh ? '转义' : 'Escape'}</button>
          <button type="button" class="btn ghost" data-act="unescape" title="反转义字符串">${isZh ? '反转义' : 'Unescape'}</button>

          <span class="sep"></span>

          <div class="seg" id="jeLayoutSeg">
            <button type="button" data-layout="split" aria-pressed="true">${isZh ? '分屏' : 'Split'}</button>
            <button type="button" data-layout="code" aria-pressed="false">${isZh ? '代码' : 'Code'}</button>
            <button type="button" data-layout="tree" aria-pressed="false">${isZh ? '树状' : 'Tree'}</button>
          </div>

          <span class="grow"></span>

          <button type="button" class="btn ghost" data-act="loadSample">${isZh ? '示例' : 'Sample'}</button>
          <button type="button" class="btn ghost" data-act="loadPythonSample">${isZh ? 'Python示例' : 'Py Sample'}</button>
          <button type="button" class="btn ghost" data-act="copyAll">${isZh ? '复制' : 'Copy'}</button>
          <button type="button" class="btn ghost" data-act="clear">${isZh ? '清空' : 'Clear'}</button>
        </div>

        <!-- Status Bar -->
        <div class="je-status-bar">
          <div class="je-status-left">
            <span class="je-status-tag ok" id="jeStatusTag">✓ ${isZh ? '就绪' : 'Ready'}</span>
            <span class="je-status-msg" id="jeStatusMsg">${isZh ? '请输入或粘贴 JSON 内容' : 'Paste or type JSON'}</span>
          </div>
          <div class="je-status-meta" id="jeStatusMeta">0 ${isZh ? '字' : 'chars'}</div>
        </div>

        <!-- Workbench Body -->
        <div class="je-body" data-layout="split" id="jeBody">
          <!-- Left: Tree View -->
          <div class="je-tree-pane">
            <div class="je-tree-head">
              <span class="je-tree-title">${isZh ? '键值树' : 'Tree'}</span>
              <input type="text" class="je-tree-filter" id="jeTreeFilter" placeholder="${isZh ? '过滤键 / 值…' : 'filter nodes…'}" spellcheck="false" />
              <div class="je-tree-actions">
                <button type="button" class="je-tree-btn" data-tree-act="expandAll" title="${isZh ? '全部展开' : 'Expand All'}">${isZh ? '展开' : 'Expand'}</button>
                <button type="button" class="je-tree-btn" data-tree-act="collapseAll" title="${isZh ? '全部折叠' : 'Collapse All'}">${isZh ? '折叠' : 'Collapse'}</button>
                <button type="button" class="je-tree-btn" data-tree-act="level1" title="${isZh ? '展开至第 1 层' : 'Level 1'}">L1</button>
                <button type="button" class="je-tree-btn" data-tree-act="level2" title="${isZh ? '展开至第 2 层' : 'Level 2'}">L2</button>
              </div>
            </div>
            <div class="je-tree-body" id="jeTreeBody">
              <div class="je-tree-empty">${isZh ? '暂无数据，在右侧输入有效 JSON 即可生成键值树' : 'No data. Type valid JSON on the right to see tree.'}</div>
            </div>
          </div>

          <!-- Right: Code Editor -->
          <div class="je-code-pane">
            <div class="je-code-editor-wrap">
              <div class="je-gutter" id="jeGutter">
                <span class="je-gutter-line">1</span>
              </div>
              <textarea class="je-ta" id="jeTa" spellcheck="false" placeholder="${isZh ? '在此输入或粘贴 JSON / Python 字典内容…' : 'Type or paste JSON or Python dict here…'}"></textarea>
            </div>
          </div>
        </div>

        <!-- Float Toast -->
        <div class="je-toast" id="jeToast"></div>
      </div>
    `;

    // Elements
    const ta = el.querySelector('#jeTa');
    const gutter = el.querySelector('#jeGutter');
    const jeBody = el.querySelector('#jeBody');
    const treeBody = el.querySelector('#jeTreeBody');
    const treeFilter = el.querySelector('#jeTreeFilter');
    const statusTag = el.querySelector('#jeStatusTag');
    const statusMsg = el.querySelector('#jeStatusMsg');
    const statusMeta = el.querySelector('#jeStatusMeta');
    const toastEl = el.querySelector('#jeToast');
    const layoutSeg = el.querySelector('#jeLayoutSeg');

    // Show toast message
    function showToast(msg) {
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1500);
    }

    // Update Gutter line numbers
    function updateGutter(errLine = -1) {
      const lineCount = Math.max(1, (ta.value.match(/\n/g) || []).length + 1);
      let html = '';
      for (let l = 1; l <= lineCount; l++) {
        const isErr = (l === errLine);
        html += `<span class="je-gutter-line${isErr ? ' err-line' : ''}">${l}</span>`;
      }
      gutter.innerHTML = html;
    }

    // Sync scroll
    ta.addEventListener('scroll', () => {
      gutter.scrollTop = ta.scrollTop;
    });

    // Jump to line and column
    function jumpToLineCol(line, col, pos = -1) {
      ta.focus();
      if (pos >= 0 && pos <= ta.value.length) {
        ta.setSelectionRange(pos, pos + 1);
      } else {
        const lines = ta.value.split('\n');
        let cursor = 0;
        for (let l = 1; l < line && l <= lines.length; l++) {
          cursor += lines[l - 1].length + 1;
        }
        cursor += Math.max(0, col - 1);
        ta.setSelectionRange(cursor, cursor);
      }
      // Scroll into view
      const lineHeight = 19.2;
      ta.scrollTop = Math.max(0, (line - 3) * lineHeight);
      gutter.scrollTop = ta.scrollTop;
    }

    // Set layout
    function setLayout(mode) {
      currentLayout = mode;
      jeBody.setAttribute('data-layout', mode);
      layoutSeg.querySelectorAll('button').forEach(b => {
        b.setAttribute('aria-pressed', String(b.dataset.layout === mode));
      });
      if (mode !== 'code' && lastParsedData) {
        renderTree(lastParsedData, treeFilter.value.trim().toLowerCase());
      }
    }

    layoutSeg.addEventListener('click', e => {
      const b = e.target.closest('button[data-layout]');
      if (b) setLayout(b.dataset.layout);
    });

    /* --- Interactive Tree Rendering --------------------------------------- */
    function buildNodeHtml(key, value, path, depth, filter) {
      const isRoot = (key === null);
      const isArr = Array.isArray(value);
      const isObj = (value !== null && typeof value === 'object' && !isArr);
      const isCollapsible = isArr || isObj;
      const count = isArr ? value.length : isObj ? Object.keys(value).length : 0;

      // Filter matching
      let matchesSelf = false;
      if (filter) {
        if (key !== null && String(key).toLowerCase().includes(filter)) matchesSelf = true;
        if (!isCollapsible && String(value).toLowerCase().includes(filter)) matchesSelf = true;
      }

      let rowHtml = `<div class="je-node-row" data-path="${escapeHtml(path)}">`;

      // Fold toggle or placeholder
      if (isCollapsible) {
        rowHtml += `<span class="je-fold-toggle" data-action="toggle">▼</span>`;
      } else {
        rowHtml += `<span class="je-fold-placeholder"></span>`;
      }

      // Key name
      if (!isRoot) {
        const keyDisplay = String(key);
        rowHtml += `<span class="je-key">"${hlFiltered(keyDisplay, filter)}"</span><span class="je-colon">:</span>`;
      }

      // Value
      if (isObj) {
        rowHtml += `<span class="je-val-badge" data-action="toggle">{ ${count} }</span>`;
      } else if (isArr) {
        rowHtml += `<span class="je-val-badge" data-action="toggle">[ ${count} ]</span>`;
      } else if (typeof value === 'string') {
        rowHtml += `<span class="je-val-string">"${hlFiltered(String(value), filter)}"</span>`;
      } else if (typeof value === 'number') {
        rowHtml += `<span class="je-val-number">${value}</span>`;
      } else if (typeof value === 'boolean') {
        rowHtml += `<span class="je-val-boolean">${value}</span>`;
      } else if (value === null) {
        rowHtml += `<span class="je-val-null">null</span>`;
      }

      // Action buttons (hover)
      rowHtml += `
        <div class="je-node-actions">
          <button type="button" class="je-node-act-btn" data-node-copy="path" title="${isZh ? '复制 JSONPath' : 'Copy JSONPath'}">Path</button>
          <button type="button" class="je-node-act-btn" data-node-copy="val" title="${isZh ? '复制当前值' : 'Copy Value'}">${isZh ? '值' : 'Val'}</button>
        </div>
      `;

      rowHtml += `</div>`;

      // Children
      let childrenHtml = '';
      let hasChildMatch = false;

      if (isCollapsible) {
        childrenHtml += `<div class="je-children" data-depth="${depth}">`;
        if (isArr) {
          for (let idx = 0; idx < value.length; idx++) {
            const childPath = path ? `${path}[${idx}]` : `[${idx}]`;
            const child = buildNodeHtml(idx, value[idx], childPath, depth + 1, filter);
            if (child.matched) hasChildMatch = true;
            childrenHtml += child.html;
          }
        } else {
          for (const k of Object.keys(value)) {
            const childPath = path ? `${path}.${k}` : k;
            const child = buildNodeHtml(k, value[k], childPath, depth + 1, filter);
            if (child.matched) hasChildMatch = true;
            childrenHtml += child.html;
          }
        }
        childrenHtml += `</div>`;
      }

      const matched = (!filter) || matchesSelf || hasChildMatch;
      const hideNode = filter && !matched;

      const nodeStyle = hideNode ? 'style="display:none;"' : '';
      return {
        matched,
        html: `<div class="je-node" ${nodeStyle}>${rowHtml}${childrenHtml}</div>`
      };
    }

    function renderTree(data, filter = '') {
      if (data === null || data === undefined) {
        treeBody.innerHTML = `<div class="je-tree-empty">${isZh ? '暂无数据' : 'No data'}</div>`;
        return;
      }
      const built = buildNodeHtml(null, data, '$', 0, filter);
      treeBody.innerHTML = built.html || `<div class="je-tree-empty">${isZh ? '未找到匹配节点' : 'No matches found'}</div>`;

      // If search filter applied, ensure all matching children branches are unfolded
      if (filter) {
        treeBody.querySelectorAll('.je-children').forEach(c => c.classList.remove('folded'));
        treeBody.querySelectorAll('.je-fold-toggle').forEach(t => t.textContent = '▼');
      }
    }

    // Tree click events (fold/unfold, copy path, copy value)
    treeBody.addEventListener('click', async e => {
      // Fold toggle
      const toggle = e.target.closest('[data-action="toggle"]');
      if (toggle) {
        const node = toggle.closest('.je-node');
        const children = node.querySelector(':scope > .je-children');
        const arrow = node.querySelector(':scope > .je-node-row > .je-fold-toggle');
        if (children) {
          const isFolded = children.classList.toggle('folded');
          if (arrow) arrow.textContent = isFolded ? '▶' : '▼';
        }
        return;
      }

      // Copy Path
      const btnPath = e.target.closest('[data-node-copy="path"]');
      if (btnPath) {
        const row = btnPath.closest('.je-node-row');
        const p = row.dataset.path || '$';
        await navigator.clipboard.writeText(p);
        showToast(`${isZh ? '已复制 Path: ' : 'Copied Path: '} ${p}`);
        return;
      }

      // Copy Value
      const btnVal = e.target.closest('[data-node-copy="val"]');
      if (btnVal) {
        const row = btnVal.closest('.je-node-row');
        const p = row.dataset.path;
        try {
          const val = getValueByPath(lastParsedData, p);
          const textToCopy = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
          await navigator.clipboard.writeText(textToCopy);
          showToast(isZh ? '已复制当前节点值' : 'Value copied');
        } catch {
          showToast(isZh ? '复制失败' : 'Copy failed');
        }
        return;
      }
    });

    // Helper: get value from parsed data by JSONPath
    function getValueByPath(obj, path) {
      if (!path || path === '$') return obj;
      // Strip leading $. or $
      let clean = path.replace(/^\$\.?/, '');
      // Match properties and array indexes: foo, [0], bar
      const tokens = clean.match(/[^.[\]]+|\[\d+\]/g) || [];
      let cur = obj;
      for (const tok of tokens) {
        if (tok.startsWith('[') && tok.endsWith(']')) {
          const idx = parseInt(tok.slice(1, -1), 10);
          cur = cur[idx];
        } else {
          cur = cur[tok];
        }
        if (cur === undefined) break;
      }
      return cur;
    }

    // Tree Level and Expand/Collapse buttons
    el.querySelector('.je-tree-head').addEventListener('click', e => {
      const b = e.target.closest('button[data-tree-act]');
      if (!b) return;
      const act = b.dataset.treeAct;
      if (act === 'expandAll') {
        treeBody.querySelectorAll('.je-children').forEach(c => c.classList.remove('folded'));
        treeBody.querySelectorAll('.je-fold-toggle').forEach(t => t.textContent = '▼');
        showToast(isZh ? '已全部展开' : 'Expanded all');
      } else if (act === 'collapseAll') {
        treeBody.querySelectorAll('.je-children').forEach(c => c.classList.add('folded'));
        treeBody.querySelectorAll('.je-fold-toggle').forEach(t => t.textContent = '▶');
        showToast(isZh ? '已全部折叠' : 'Collapsed all');
      } else if (act === 'level1') {
        treeBody.querySelectorAll('.je-children').forEach(c => {
          const depth = parseInt(c.dataset.depth || '0', 10);
          const node = c.closest('.je-node');
          const toggle = node ? node.querySelector(':scope > .je-node-row > .je-fold-toggle') : null;
          if (depth >= 1) {
            c.classList.add('folded');
            if (toggle) toggle.textContent = '▶';
          } else {
            c.classList.remove('folded');
            if (toggle) toggle.textContent = '▼';
          }
        });
        showToast(isZh ? '折叠至第 1 层' : 'Folded to level 1');
      } else if (act === 'level2') {
        treeBody.querySelectorAll('.je-children').forEach(c => {
          const depth = parseInt(c.dataset.depth || '0', 10);
          const node = c.closest('.je-node');
          const toggle = node ? node.querySelector(':scope > .je-node-row > .je-fold-toggle') : null;
          if (depth >= 2) {
            c.classList.add('folded');
            if (toggle) toggle.textContent = '▶';
          } else {
            c.classList.remove('folded');
            if (toggle) toggle.textContent = '▼';
          }
        });
        showToast(isZh ? '折叠至第 2 层' : 'Folded to level 2');
      }
    });

    // Tree search filter
    treeFilter.addEventListener('input', () => {
      if (lastParsedData) {
        renderTree(lastParsedData, treeFilter.value.trim().toLowerCase());
      }
    });

    /* --- Validation & Parsing ---------------------------------------------- */
    function runValidation() {
      const text = ta.value;
      const trimmed = text.trim();
      statusMeta.textContent = `${text.length} ${isZh ? '字' : 'chars'} · ${text.split('\n').length} ${isZh ? '行' : 'lines'}`;

      if (!trimmed) {
        statusTag.className = 'je-status-tag ok';
        statusTag.textContent = `✓ ${isZh ? '就绪' : 'Ready'}`;
        statusMsg.textContent = isZh ? '请输入或粘贴 JSON 内容' : 'Paste or type JSON';
        lastParsedData = null;
        lastErrorLoc = null;
        updateGutter(-1);
        treeBody.innerHTML = `<div class="je-tree-empty">${isZh ? '暂无数据，在右侧输入有效 JSON 即可生成键值树' : 'No data.'}</div>`;
        return;
      }

      try {
        const parsed = JSON.parse(trimmed);
        lastParsedData = parsed;
        lastErrorLoc = null;
        updateGutter(-1);

        const stats = calcStats(parsed);
        const bytes = new Blob([text]).size;
        const sizeStr = bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;

        statusTag.className = 'je-status-tag ok';
        statusTag.textContent = `✓ ${isZh ? '语法正确' : 'Valid JSON'}`;
        statusMsg.textContent = `${stats.nodeCount} ${isZh ? '个节点' : 'nodes'} · ${sizeStr} · ${isZh ? '最大深度' : 'depth'} ${stats.maxDepth}`;

        if (currentLayout !== 'code') {
          renderTree(parsed, treeFilter.value.trim().toLowerCase());
        }
      } catch (err) {
        const loc = parseErrorLocation(trimmed, err);
        lastErrorLoc = loc;
        updateGutter(loc.line);

        statusTag.className = 'je-status-tag err';
        statusTag.textContent = `✕ ${isZh ? '第 ' + loc.line + ' 行第 ' + loc.col + ' 列语法错误' : 'Syntax error at L' + loc.line + ':C' + loc.col}`;
        statusMsg.textContent = `${loc.message} (${isZh ? '点击标签跳转错误' : 'click tag to jump'})`;

        // If tree is empty, show error prompt
        if (!lastParsedData) {
          treeBody.innerHTML = `
            <div class="je-tree-empty" style="color:var(--red);">
              ✕ ${isZh ? 'JSON 语法错误，修正后将自动呈现键值树' : 'Invalid JSON. Fix syntax to view tree.'}<br>
              <span style="font-size:11px;opacity:0.8;">${escapeHtml(loc.message)}</span>
            </div>
          `;
        }
      }
    }

    // Debounced input listener
    ta.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runValidation, 150);
    });

    // Click error tag to jump
    statusTag.addEventListener('click', () => {
      if (lastErrorLoc) {
        jumpToLineCol(lastErrorLoc.line, lastErrorLoc.col, lastErrorLoc.pos);
        showToast(isZh ? `已定位至第 ${lastErrorLoc.line} 行` : `Jumped to line ${lastErrorLoc.line}`);
      }
    });

    // Tab key handling in Textarea (indent 2 spaces, shift+tab unindent)
    ta.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const val = ta.value;

        if (!e.shiftKey) {
          // Insert 2 spaces
          ta.value = val.substring(0, start) + '  ' + val.substring(end);
          ta.selectionStart = ta.selectionEnd = start + 2;
        } else {
          // Unindent
          const lines = val.substring(0, start).split('\n');
          const currentLine = lines[lines.length - 1];
          if (currentLine.startsWith('  ')) {
            const lineStart = start - currentLine.length;
            ta.value = val.substring(0, lineStart) + currentLine.slice(2) + val.substring(start);
            ta.selectionStart = ta.selectionEnd = Math.max(0, start - 2);
          }
        }
        runValidation();
      }
    });

    /* --- Toolbar Operations ------------------------------------------------ */
    el.querySelector('.je-toolbar').addEventListener('click', async e => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const act = b.dataset.act;

      // 1. Format (Expand)
      if (act === 'format') {
        if (!ta.value.trim()) return;
        try {
          ta.value = formatJson(ta.value, 2);
          runValidation();
          showToast(isZh ? '✓ 已格式化展开' : 'Formatted');
        } catch (err) {
          // Try Python repair first if direct parse fails
          const repaired = fixPythonJson(ta.value);
          try {
            ta.value = formatJson(repaired.text, 2);
            runValidation();
            showToast(isZh ? `✓ 自动纠错并格式化展开 (${repaired.fixes} 处)` : 'Repaired & formatted');
          } catch {
            showToast(isZh ? '格式化失败: ' + err.message : 'Format error');
          }
        }
      }

      // 2. Minify (Single Line Compress)
      else if (act === 'minify') {
        if (!ta.value.trim()) return;
        try {
          const oldLen = ta.value.length;
          ta.value = minifyJson(ta.value);
          runValidation();
          const newLen = ta.value.length;
          const ratio = oldLen > 0 ? Math.round((1 - newLen / oldLen) * 100) : 0;
          showToast(isZh ? `✓ 已压缩为单行 (体积缩减 ${ratio}%)` : `Minified (-${ratio}%)`);
        } catch (err) {
          showToast(isZh ? '压缩失败: ' + err.message : 'Minify error');
        }
      }

      // 3. Fix Python output to JSON
      else if (act === 'fixPython') {
        if (!ta.value.trim()) return;
        const res = fixPythonJson(ta.value);
        ta.value = res.text;
        try {
          // Format after repair
          ta.value = formatJson(ta.value, 2);
        } catch {
          // Keep text as is if still not 100% valid
        }
        runValidation();
        showToast(isZh ? `✓ 已修复 ${res.fixes} 处 Python 格式差异` : `Repaired ${res.fixes} Python syntax items`);
      }

      // 4. Clean comments
      else if (act === 'cleanComments') {
        if (!ta.value.trim()) return;
        const res = removeComments(ta.value);
        ta.value = res.text;
        runValidation();
        showToast(isZh ? `✓ 已去除 ${res.count} 处注释` : `Removed ${res.count} comments`);
      }

      // 5. Escape
      else if (act === 'escape') {
        if (!ta.value) return;
        ta.value = escapeJsonString(ta.value);
        runValidation();
        showToast(isZh ? '✓ 已转义为字符串' : 'Escaped string');
      }

      // 6. Unescape
      else if (act === 'unescape') {
        if (!ta.value) return;
        ta.value = unescapeJsonString(ta.value);
        try {
          ta.value = formatJson(ta.value, 2);
        } catch {
          // Keep raw unescaped string
        }
        runValidation();
        showToast(isZh ? '✓ 已完成反转义' : 'Unescaped');
      }

      // 7. Load Standard Sample
      else if (act === 'loadSample') {
        ta.value = SAMPLES.standard;
        runValidation();
        showToast(isZh ? '✓ 已加载标准 JSON 示例' : 'Sample loaded');
      }

      // 8. Load Python Sample
      else if (act === 'loadPythonSample') {
        ta.value = SAMPLES.python;
        runValidation();
        showToast(isZh ? '✓ 已加载 Python 字典输出示例' : 'Python sample loaded');
      }

      // 9. Copy all
      else if (act === 'copyAll') {
        if (!ta.value) return;
        await navigator.clipboard.writeText(ta.value);
        showToast(isZh ? '✓ 已复制全部内容到剪贴板' : 'Copied to clipboard');
      }

      // 10. Clear
      else if (act === 'clear') {
        ta.value = '';
        runValidation();
        ta.focus();
        showToast(isZh ? '已清空' : 'Cleared');
      }
    });

    // Initial setup: support incoming pipeline payload or standard sample
    if (ctx && ctx.payload && (typeof ctx.payload.value === 'string' || typeof ctx.payload === 'string')) {
      const incoming = typeof ctx.payload === 'string' ? ctx.payload : ctx.payload.value;
      const fileLabel = (ctx.payload && ctx.payload.name) ? `「${ctx.payload.name}」` : (isZh ? '传输数据' : 'pipeline data');
      ta.value = incoming;
      try { ta.value = formatJson(incoming, 2); } catch { /* keep raw */ }
      showToast(isZh ? `✓ 已载入${fileLabel}` : `Loaded ${fileLabel}`);
    } else {
      ta.value = SAMPLES.standard;
    }
    runValidation();
    ta.focus();
  }

  window.Toolbox.panel({ mount });
})();
