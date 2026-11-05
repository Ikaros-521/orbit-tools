/* json-editor shared utilities (extracted from panel.js):
   samples, Python-to-JSON repair, comment stripper, escape/unescape,
   minify/format, error-location parser, HTML escaper, syntax highlighter
   filter, metadata stats. Pure text processing — no DOM, no panel state. */
(() => {
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
  const JsonUtils = { SAMPLES, fixPythonJson, removeComments, escapeJsonString,
    unescapeJsonString, minifyJson, formatJson, parseErrorLocation, escapeHtml,
    hlFiltered, calcStats };
  if (typeof window !== 'undefined') window.JsonUtils = JsonUtils;
  if (typeof module !== 'undefined' && module.exports) module.exports = JsonUtils;
})();
