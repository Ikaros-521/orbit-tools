/* AI Chat - Markdown & GFM Table Parsing Engine
   Supports GFM tables, fenced code blocks, inline formatting, math, and task checklist extraction.
   Dual CommonJS / Browser environment export. */
(() => {
  const escapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeHref = u => (/^(https?:|#|\/|mailto:)/i.test(u) ? u : '#');

  const PRESET_CHANNELS = [
    {
      id: 'openai',
      name: 'OpenAI (官方)',
      icon: '🟢',
      protocol: 'openai-chat',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o-mini',
      models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini', 'o1-preview', 'o3-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    },
    {
      id: 'deepseek',
      name: 'DeepSeek (深度求索)',
      icon: '🐋',
      protocol: 'openai-chat',
      baseUrl: 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-chat',
      models: ['deepseek-chat', 'deepseek-reasoner'],
    },
    {
      id: 'claude',
      name: 'Anthropic Claude (官方)',
      icon: '🟣',
      protocol: 'claude-messages',
      baseUrl: 'https://api.anthropic.com/v1',
      defaultModel: 'claude-3-7-sonnet-20250219',
      models: ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    },
    {
      id: 'siliconflow',
      name: 'SiliconFlow (硅基流动)',
      icon: '⚡',
      protocol: 'openai-chat',
      baseUrl: 'https://api.siliconflow.cn/v1',
      defaultModel: 'deepseek-ai/DeepSeek-V3',
      models: ['deepseek-ai/DeepSeek-R1', 'deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct', 'Qwen/Qwen2.5-Coder-32B-Instruct', 'meta-llama/Llama-3.3-70B-Instruct', 'THUDM/glm-4-9b-chat'],
    },
    {
      id: 'moonshot',
      name: 'Moonshot (月之暗面 / Kimi)',
      icon: '🌙',
      protocol: 'openai-chat',
      baseUrl: 'https://api.moonshot.cn/v1',
      defaultModel: 'moonshot-v1-8k',
      models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'moonshot-v1-auto'],
    },
    {
      id: 'dashscope',
      name: 'Aliyun (阿里百炼 / 通义千问)',
      icon: '🟠',
      protocol: 'openai-chat',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      defaultModel: 'qwen-plus',
      models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwq-32b', 'deepseek-r1', 'deepseek-v3', 'qwen2.5-coder-32b-instruct'],
    },
    {
      id: 'zhipu',
      name: 'Zhipu GLM (智谱清言)',
      icon: '🧠',
      protocol: 'openai-chat',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      defaultModel: 'glm-4-plus',
      models: ['glm-4-plus', 'glm-4-flash', 'glm-4-air', 'glm-4-long', 'glm-4v-plus', 'glm-zero-preview'],
    },
    {
      id: 'ollama',
      name: 'Ollama (本地私有部署)',
      icon: '🦙',
      protocol: 'openai-chat',
      baseUrl: 'http://localhost:11434/v1',
      defaultModel: 'deepseek-r1:latest',
      models: ['deepseek-r1:latest', 'deepseek-r1:7b', 'deepseek-r1:8b', 'deepseek-r1:14b', 'deepseek-r1:32b', 'qwen2.5:latest', 'qwen2.5:7b', 'qwen2.5-coder:latest', 'llama3.3:latest', 'llama3.1:8b', 'mistral:latest', 'gemma2:latest'],
    },
    {
      id: 'openrouter',
      name: 'OpenRouter (全球模型聚合)',
      icon: '🌐',
      protocol: 'openai-chat',
      baseUrl: 'https://openrouter.ai/api/v1',
      defaultModel: 'deepseek/deepseek-r1',
      models: ['deepseek/deepseek-r1', 'anthropic/claude-3.7-sonnet', 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'openai/o1', 'meta-llama/llama-3.3-70b-instruct', 'google/gemini-2.0-flash-001', 'qwen/qwen-2.5-72b-instruct'],
    },
    {
      id: 'groq',
      name: 'Groq (极速推理)',
      icon: '🚀',
      protocol: 'openai-chat',
      baseUrl: 'https://api.groq.com/openai/v1',
      defaultModel: 'deepseek-r1-distill-llama-70b',
      models: ['deepseek-r1-distill-llama-70b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    },
    {
      id: 'custom',
      name: '自定义渠道 (Custom)',
      icon: '🛠️',
      protocol: 'openai-chat',
      baseUrl: '',
      defaultModel: 'gpt-4o-mini',
      models: [],
    },
  ];

  async function copyToClipboard(text) {
    if (!text) return false;
    let copied = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {}
    if (!copied && typeof window !== 'undefined' && window.host && window.host.writeClipboardText) {
      try {
        await window.host.writeClipboardText(text);
        copied = true;
      } catch {}
    }
    return copied;
  }

  function splitTableRow(rowStr) {
    let raw = rowStr.trim();
    if (raw.startsWith('|')) raw = raw.slice(1);
    if (raw.endsWith('|') && !raw.endsWith('\\|')) raw = raw.slice(0, -1);
    const cells = [];
    let current = '';
    let escaped = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (escaped) {
        current += ch;
        escaped = false;
      } else if (ch === '\\') {
        current += ch;
        escaped = true;
      } else if (ch === '|') {
        cells.push(current.trim().replace(/\\\|/g, '|'));
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim().replace(/\\\|/g, '|'));
    return cells;
  }

  function parseTableDelimiterRow(rowStr) {
    if (!rowStr || !rowStr.includes('-')) return null;
    const cells = splitTableRow(rowStr);
    if (!cells.length) return null;
    const aligns = [];
    for (const cell of cells) {
      const trimmed = cell.trim();
      if (!/^:?-+:?$/.test(trimmed)) return null;
      const left = trimmed.startsWith(':');
      const right = trimmed.endsWith(':');
      if (left && right) aligns.push('center');
      else if (right) aligns.push('right');
      else if (left) aligns.push('left');
      else aligns.push('left');
    }
    return aligns;
  }

  function extractTasksFromContent(content) {
    if (typeof content !== 'string') return [];
    const matches = [];
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*[-*]\s+\[([ xX>/~-])\]\s+(.+)$/);
      if (m) {
        const char = m[1].toLowerCase();
        const isDone = char === 'x';
        const isInProgress = char === '>' || char === '/' || char === '~' || /(?:（|\()(?:进行中|in progress)(?:）|\))/i.test(m[2]);
        const status = isDone ? 'completed' : (isInProgress ? 'in_progress' : 'pending');
        const cleanText = m[2].replace(/\s*(?:（|\()(?:进行中|in progress)(?:）|\))\s*$/i, '').trim();
        matches.push({
          content: cleanText,
          status,
        });
      }
    }
    return matches;
  }

  function renderMarkdown(raw) {
    if (!raw) return '';
    const codeBlocks = [];

    // Extract fenced code blocks (closed)
    let s = String(raw).replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g, (m, lang, code) => {
      codeBlocks.push({ lang: (lang || 'text').trim().toLowerCase(), code, streaming: false });
      return `\u0001${codeBlocks.length - 1}\u0001`;
    });
    // Extract unclosed code block during streaming
    s = s.replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*)$/g, (m, lang, code) => {
      codeBlocks.push({ lang: (lang || 'text').trim().toLowerCase(), code, streaming: true });
      return `\u0001${codeBlocks.length - 1}\u0001`;
    });

    s = escapeHtml(s);

    // Inline formatting
    const inlineCodes = [];
    s = s.replace(/`([^`]+)`/g, (m, c) => { inlineCodes.push(c); return `\u0000${inlineCodes.length - 1}\u0000`; });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) => `<a href="${safeHref(href)}" target="_blank" rel="noopener">${text}</a>`);
    s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // Restore inline codes
    s = s.replace(/\u0000(\d+)\u0000/g, (m, idx) => `<code>${inlineCodes[+idx]}</code>`);

    // Split paragraphs / lists / lines
    const lines = s.split(/\r?\n/);
    const out = [];
    let inList = false;
    let listType = 'ul';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check for code block placeholder
      const cbMatch = /^\u0001(\d+)\u0001$/.exec(trimmed);
      if (cbMatch) {
        if (inList) { out.push(`</${listType}>`); inList = false; }
        const item = codeBlocks[+cbMatch[1]];
        if (item.lang === 'mermaid') {
          const rawCode = item.code.trim();
          const encCode = encodeURIComponent(rawCode);
          out.push(`
            <div class="ai-mermaid-wrap" data-mermaid-code="${encCode}">
              <div class="ai-mermaid-bar">
                <span class="ai-mermaid-badge">📊 Mermaid 图表</span>
                <div class="ai-mermaid-actions">
                  <button type="button" class="ai-mermaid-copy-btn" title="复制 Mermaid 源码">复制代码</button>
                  <button type="button" class="ai-mermaid-toggle-btn" title="查看源码 / 切换图表">查看源码</button>
                </div>
              </div>
              <div class="ai-mermaid-render-area">
                <div class="ai-mermaid-loading">${item.streaming ? '图表生成中…' : '正在渲染图表…'}</div>
              </div>
              <pre class="ai-mermaid-code hidden"><code>${escapeHtml(rawCode)}</code></pre>
            </div>
          `);
        } else {
          out.push(`
            <pre data-lang="${item.lang}"><button type="button" class="ai-code-copy-btn">复制</button><code class="lang-${item.lang}">${escapeHtml(item.code)}</code></pre>
          `);
        }
        continue;
      }

      // Table parsing: check if current line and next line form a valid table header + delimiter
      if (trimmed.includes('|') && i + 1 < lines.length) {
        const nextTrimmed = lines[i + 1].trim();
        const aligns = parseTableDelimiterRow(nextTrimmed);
        if (aligns) {
          if (inList) { out.push(`</${listType}>`); inList = false; }
          const headerCells = splitTableRow(line);
          const colCount = Math.max(headerCells.length, aligns.length);

          let tableHtml = '<div class="ai-table-wrap"><table class="ai-table"><thead><tr>';
          for (let c = 0; c < colCount; c++) {
            const align = aligns[c] || 'left';
            const cellContent = headerCells[c] || '';
            tableHtml += `<th style="text-align:${align}">${cellContent}</th>`;
          }
          tableHtml += '</tr></thead><tbody>';

          // Skip delimiter row
          i += 1;

          // Process subsequent table data rows
          while (i + 1 < lines.length) {
            const rowLine = lines[i + 1];
            const rowTrimmed = rowLine.trim();
            if (!rowTrimmed || !rowTrimmed.includes('|')) break;
            if (/^(#{1,6}\s|```|>\s|\u0001)/.test(rowTrimmed)) break;

            i++;
            const dataCells = splitTableRow(rowLine);
            tableHtml += '<tr>';
            for (let c = 0; c < colCount; c++) {
              const align = aligns[c] || 'left';
              const cellContent = dataCells[c] || '';
              tableHtml += `<td style="text-align:${align}">${cellContent}</td>`;
            }
            tableHtml += '</tr>';
          }

          tableHtml += '</tbody></table></div>';
          out.push(tableHtml);
          continue;
        }
      }

      // Headings
      if (/^###\s+(.*)$/.test(line)) {
        if (inList) { out.push(`</${listType}>`); inList = false; }
        out.push(`<h4>${line.replace(/^###\s+/, '')}</h4>`);
        continue;
      }
      if (/^##\s+(.*)$/.test(line)) {
        if (inList) { out.push(`</${listType}>`); inList = false; }
        out.push(`<h3>${line.replace(/^##\s+/, '')}</h3>`);
        continue;
      }
      if (/^#\s+(.*)$/.test(line)) {
        if (inList) { out.push(`</${listType}>`); inList = false; }
        out.push(`<h2>${line.replace(/^#\s+/, '')}</h2>`);
        continue;
      }

      // Blockquotes
      if (/^>\s+(.*)$/.test(line)) {
        if (inList) { out.push(`</${listType}>`); inList = false; }
        out.push(`<blockquote>${line.replace(/^>\s+/, '')}</blockquote>`);
        continue;
      }

      // Lists
      const ulMatch = /^[-*+]\s+(.*)$/.exec(line);
      const olMatch = /^(\d+)\.\s+(.*)$/.exec(line);
      if (ulMatch || olMatch) {
        const curType = ulMatch ? 'ul' : 'ol';
        const content = ulMatch ? ulMatch[1] : olMatch[2];
        if (!inList || listType !== curType) {
          if (inList) out.push(`</${listType}>`);
          out.push(`<${curType}>`);
          inList = true;
          listType = curType;
        }
        out.push(`<li>${content}</li>`);
        continue;
      }

      if (inList && !trimmed) {
        out.push(`</${listType}>`);
        inList = false;
        continue;
      }

      if (trimmed) {
        out.push(`<p>${line}</p>`);
      }
    }

    if (inList) out.push(`</${listType}>`);
    return out.join('');
  }

  const exportsObj = {
    escapeHtml,
    safeHref,
    splitTableRow,
    parseTableDelimiterRow,
    extractTasksFromContent,
    renderMarkdown,
    copyToClipboard,
    PRESET_CHANNELS,
  };

  if (typeof window !== 'undefined') {
    window.AiChatMarkdown = exportsObj;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})();
