/* DeepSeek & OpenAI Style AI Chat Panel Implementation */
(function () {
  'use strict';

  /* --- Markdown Renderer -------------------------------------------------- */
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
      models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini', 'o1-preview', 'o3-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo']
    },
    {
      id: 'deepseek',
      name: 'DeepSeek (深度求索)',
      icon: '🐋',
      protocol: 'openai-chat',
      baseUrl: 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-chat',
      models: ['deepseek-chat', 'deepseek-reasoner']
    },
    {
      id: 'claude',
      name: 'Anthropic Claude (官方)',
      icon: '🟣',
      protocol: 'claude-messages',
      baseUrl: 'https://api.anthropic.com/v1',
      defaultModel: 'claude-3-7-sonnet-20250219',
      models: ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307']
    },
    {
      id: 'siliconflow',
      name: 'SiliconFlow (硅基流动)',
      icon: '⚡',
      protocol: 'openai-chat',
      baseUrl: 'https://api.siliconflow.cn/v1',
      defaultModel: 'deepseek-ai/DeepSeek-V3',
      models: ['deepseek-ai/DeepSeek-R1', 'deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct', 'Qwen/Qwen2.5-Coder-32B-Instruct', 'meta-llama/Llama-3.3-70B-Instruct', 'THUDM/glm-4-9b-chat']
    },
    {
      id: 'moonshot',
      name: 'Moonshot (月之暗面 / Kimi)',
      icon: '🌙',
      protocol: 'openai-chat',
      baseUrl: 'https://api.moonshot.cn/v1',
      defaultModel: 'moonshot-v1-8k',
      models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'moonshot-v1-auto']
    },
    {
      id: 'dashscope',
      name: 'Aliyun (阿里百炼 / 通义千问)',
      icon: '🟠',
      protocol: 'openai-chat',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      defaultModel: 'qwen-plus',
      models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwq-32b', 'deepseek-r1', 'deepseek-v3', 'qwen2.5-coder-32b-instruct']
    },
    {
      id: 'zhipu',
      name: 'Zhipu GLM (智谱清言)',
      icon: '🧠',
      protocol: 'openai-chat',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      defaultModel: 'glm-4-plus',
      models: ['glm-4-plus', 'glm-4-flash', 'glm-4-air', 'glm-4-long', 'glm-4v-plus', 'glm-zero-preview']
    },
    {
      id: 'ollama',
      name: 'Ollama (本地私有部署)',
      icon: '🦙',
      protocol: 'openai-chat',
      baseUrl: 'http://localhost:11434/v1',
      defaultModel: 'deepseek-r1:latest',
      models: ['deepseek-r1:latest', 'deepseek-r1:7b', 'deepseek-r1:8b', 'deepseek-r1:14b', 'deepseek-r1:32b', 'qwen2.5:latest', 'qwen2.5:7b', 'qwen2.5-coder:latest', 'llama3.3:latest', 'llama3.1:8b', 'mistral:latest', 'gemma2:latest']
    },
    {
      id: 'openrouter',
      name: 'OpenRouter (全球模型聚合)',
      icon: '🌐',
      protocol: 'openai-chat',
      baseUrl: 'https://openrouter.ai/api/v1',
      defaultModel: 'deepseek/deepseek-r1',
      models: ['deepseek/deepseek-r1', 'anthropic/claude-3.7-sonnet', 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'openai/o1', 'meta-llama/llama-3.3-70b-instruct', 'google/gemini-2.0-flash-001', 'qwen/qwen-2.5-72b-instruct']
    },
    {
      id: 'groq',
      name: 'Groq (极速推理)',
      icon: '🚀',
      protocol: 'openai-chat',
      baseUrl: 'https://api.groq.com/openai/v1',
      defaultModel: 'deepseek-r1-distill-llama-70b',
      models: ['deepseek-r1-distill-llama-70b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it']
    },
    {
      id: 'custom',
      name: '自定义渠道 (Custom)',
      icon: '🛠️',
      protocol: 'openai-chat',
      baseUrl: '',
      defaultModel: 'gpt-4o-mini',
      models: []
    }
  ];

  async function copyToClipboard(text) {
    if (!text) return false;
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {}
    if (!copied && window.host && window.host.writeClipboardText) {
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
    if (raw.endsWith('|') && !raw.endsWith('\\\|')) raw = raw.slice(0, -1);
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

  /* --- Mermaid Dynamic Loader & Renderer ------------------------------------ */
  let mermaidPromise = null;
  function ensureMermaid() {
    if (window.mermaid) return Promise.resolve(window.mermaid);
    if (mermaidPromise) return mermaidPromise;
    mermaidPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'plugin://ai-chat/vendor/mermaid.min.js';
      script.onload = () => {
        try {
          window.mermaid.initialize({
            startOnLoad: false,
            theme: 'dark',
            securityLevel: 'loose',
            fontFamily: 'inherit',
            flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
            sequence: { useMaxWidth: true },
            gantt: { useMaxWidth: true }
          });
        } catch (e) {
          console.warn('[AI-Chat] Mermaid init warning:', e);
        }
        resolve(window.mermaid);
      };
      script.onerror = err => {
        mermaidPromise = null;
        reject(err || new Error('Failed to load mermaid.min.js'));
      };
      document.head.appendChild(script);
    });
    return mermaidPromise;
  }

  async function renderMermaidInContainer(container) {
    if (!container) return;
    const wraps = container.querySelectorAll('.ai-mermaid-wrap:not([data-rendered="true"])');
    if (!wraps.length) return;

    let mermaid;
    try {
      mermaid = await ensureMermaid();
    } catch (err) {
      wraps.forEach(wrap => {
        const renderArea = wrap.querySelector('.ai-mermaid-render-area');
        const rawPre = wrap.querySelector('.ai-mermaid-code');
        if (renderArea) {
          renderArea.innerHTML = '<div class="ai-mermaid-err">⚠️ 未能加载 Mermaid 渲染引擎，已显示源码</div>';
        }
        if (rawPre) rawPre.classList.remove('hidden');
        const toggleBtn = wrap.querySelector('.ai-mermaid-toggle-btn');
        if (toggleBtn) toggleBtn.textContent = '查看图表';
      });
      return;
    }

    for (const wrap of wraps) {
      const renderArea = wrap.querySelector('.ai-mermaid-render-area');
      const rawPre = wrap.querySelector('.ai-mermaid-code');
      const toggleBtn = wrap.querySelector('.ai-mermaid-toggle-btn');
      const code = decodeURIComponent(wrap.dataset.mermaidCode || '').trim();
      if (!code) continue;

      wrap.dataset.rendered = 'true';
      const chartId = 'mermaid_' + Math.random().toString(36).slice(2, 9);
      try {
        const { svg } = await mermaid.render(chartId, code);
        if (renderArea) {
          renderArea.innerHTML = svg;
        }
      } catch (err) {
        console.warn('[AI-Chat] Mermaid render failed:', err);
        const stray = document.getElementById(chartId) || document.getElementById('d' + chartId);
        if (stray) stray.remove();

        if (renderArea) {
          renderArea.innerHTML = '<div class="ai-mermaid-err">⚠️ Mermaid 语法解析失败，已切换至源码模式</div>';
        }
        if (rawPre) rawPre.classList.remove('hidden');
        if (toggleBtn) toggleBtn.textContent = '查看图表';
      }
    }
  }

  function initMessageDynamicElements(bubble, { renderMermaid = false } = {}) {
    if (!bubble) return;

    // Code copy buttons
    bubble.querySelectorAll('.ai-code-copy-btn:not([data-bound="true"])').forEach(btn => {
      btn.dataset.bound = 'true';
      btn.addEventListener('click', async (e) => {
        const pre = e.target.closest('pre');
        const code = pre ? pre.querySelector('code').textContent : '';
        await copyToClipboard(code);
        btn.textContent = '已复制';
        setTimeout(() => { btn.textContent = '复制'; }, 1200);
      });
    });

    // Mermaid controls
    bubble.querySelectorAll('.ai-mermaid-wrap:not([data-bound="true"])').forEach(wrap => {
      wrap.dataset.bound = 'true';
      const copyBtn = wrap.querySelector('.ai-mermaid-copy-btn');
      const toggleBtn = wrap.querySelector('.ai-mermaid-toggle-btn');
      const rawPre = wrap.querySelector('.ai-mermaid-code');
      const renderArea = wrap.querySelector('.ai-mermaid-render-area');
      const code = decodeURIComponent(wrap.dataset.mermaidCode || '');

      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          await copyToClipboard(code);
          copyBtn.textContent = '已复制';
          setTimeout(() => { copyBtn.textContent = '复制代码'; }, 1200);
        });
      }

      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          const isShowingCode = !rawPre.classList.contains('hidden');
          if (isShowingCode) {
            rawPre.classList.add('hidden');
            renderArea.style.display = '';
            toggleBtn.textContent = '查看源码';
          } else {
            rawPre.classList.remove('hidden');
            renderArea.style.display = 'none';
            toggleBtn.textContent = '查看图表';
          }
        });
      }
    });

    if (renderMermaid) {
      renderMermaidInContainer(bubble);
    }
  }

  /* --- Panel Mount Controller ---------------------------------------------- */
  function mount(el, ctx) {
    el.innerHTML = `
      <div class="ai-root">
        <!-- Sidebar -->
        <aside class="ai-sidebar" id="aiSidebar">
          <div class="ai-sidebar-header">
            <button class="ai-btn-new-chat" id="btnNewChat">
              <span>+</span> <span>新建对话</span>
            </button>
          </div>
          <div class="ai-sidebar-search">
            <input type="text" id="inputSearchSessions" placeholder="搜索历史会话…">
          </div>
          <div class="ai-sessions-list" id="sessionsList"></div>
        </aside>

        <!-- Main Chat Area -->
        <main class="ai-main">
          <!-- Top Header -->
          <header class="ai-header">
            <div class="ai-header-left">
              <button class="ai-btn-toggle-sidebar" id="btnToggleSidebar" title="收起/展开侧边栏">☰</button>
              <span class="ai-header-title" id="headerTitle" title="双击重命名">新对话</span>
              <span class="ai-header-model-pill" id="headerModelPill">gpt-4o-mini</span>
              <span class="ai-header-model-pill ai-header-workdir" id="headerWorkDirPill" title="Agent 工作目录，点击修改">📁</span>
            </div>
            <div class="ai-header-right">
              <span class="ai-usage-badge" id="sessionUsageBadge" title="会话累计 Token 消耗">0 tokens</span>
              <button class="ai-header-btn" id="btnClearSession" title="清空当前会话消息">清空</button>
              <button class="ai-header-btn" id="btnOpenSettings" title="模型与协议设置">⚙️ 设置</button>
            </div>
          </header>

          <!-- Messages Scroll View -->
          <div class="ai-messages-scroll" id="messagesScroll"></div>

          <!-- Bottom Input Area -->
          <footer class="ai-input-wrap">
            <div class="ai-pills-bar">
              <button class="ai-pill-btn active cot" id="pillCot" title="DeepSeek 深度思考 / Claude Thinking">
                <span>🧠</span> <span>深度思考</span>
              </button>
              <button class="ai-pill-btn active agent" id="pillAgent" title="开启 Agent 工具调用 (支持代码执行与自动生成工作流)">
                <span>🤖</span> <span>Agent 工具</span>
              </button>
              <div class="ai-persona-picker-wrap">
                <button type="button" class="ai-pill-btn persona" id="btnTogglePersonaPicker" title="选择或搜索助手人设角色 (支持搜索与分页)">
                  <span id="currentPersonaIcon">✨</span> <span id="currentPersonaTitle">通用助手</span> <span class="ai-pill-arrow">▾</span>
                </button>
                <!-- 弹出式人设搜索与分页浮层 -->
                <div class="ai-persona-popover hidden" id="personaPopover">
                  <div class="ai-persona-popover-header">
                    <span class="ai-search-ico">🔍</span>
                    <input type="text" class="ai-persona-popover-search" id="inputPopoverPersonaSearch" placeholder="搜索人设角色…" autocomplete="off">
                    <button type="button" class="ai-model-search-clear hidden" id="btnClearPopoverPersonaSearch">×</button>
                  </div>
                  <div class="ai-persona-popover-list" id="popoverPersonaList"></div>
                  <div class="ai-persona-popover-footer" id="popoverPersonaPagination">
                    <button type="button" class="ai-popover-page-btn" id="btnPopoverPrevPage">◀</button>
                    <span class="ai-popover-page-text" id="popoverPageText">1 / 1</span>
                    <button type="button" class="ai-popover-page-btn" id="btnPopoverNextPage">▶</button>
                  </div>
                </div>
              </div>

              <!-- Agent 审批档位 (参考 Codex / ZCode 的权限档位) -->
              <div class="ai-ctrl-popover-wrap">
                <button type="button" class="ai-pill-btn mode ask" id="btnAgentMode" title="Agent 审批档位：每次确认 / 自动审核 / 完全访问">
                  <span id="agentModeIcon">🔐</span> <span id="agentModeLabel">每次确认</span> <span class="ai-pill-caret">▾</span>
                </button>
                <div class="ai-ctrl-popover hidden" id="agentModePopover">
                  <div class="ai-ctrl-popover-title">Agent 审批档位</div>
                  <div class="ai-ctrl-opt active" data-mode="ask">
                    <span class="ai-ctrl-opt-ico">🔐</span>
                    <span class="ai-ctrl-opt-txt"><b>每次确认</b><i>每个工具调用都需手动批准后才会执行</i></span>
                  </div>
                  <div class="ai-ctrl-opt" data-mode="auto">
                    <span class="ai-ctrl-opt-ico">📝</span>
                    <span class="ai-ctrl-opt-txt"><b>自动审核</b><i>只读类工具自动执行，脚本与写操作仍需确认</i></span>
                  </div>
                  <div class="ai-ctrl-opt" data-mode="full">
                    <span class="ai-ctrl-opt-ico">🚀</span>
                    <span class="ai-ctrl-opt-txt"><b>完全访问</b><i>全部工具免确认直接执行，请谨慎使用</i></span>
                  </div>
                  <div class="ai-ctrl-always-row hidden" id="agentAlwaysRow"></div>
                </div>
              </div>

              <!-- 思维等级 -->
              <div class="ai-ctrl-popover-wrap">
                <button type="button" class="ai-pill-btn think" id="btnThinkLevel" title="思维等级：控制推理模型的思考深度">
                  <span>🎚️</span> <span id="thinkLevelLabel">思考·跟随默认</span> <span class="ai-pill-caret">▾</span>
                </button>
                <div class="ai-ctrl-popover hidden" id="thinkLevelPopover">
                  <div class="ai-ctrl-popover-title">思维等级 (需开启深度思考)</div>
                  <div class="ai-ctrl-opt active" data-level="auto">
                    <span class="ai-ctrl-opt-ico">⚙️</span>
                    <span class="ai-ctrl-opt-txt"><b>跟随默认</b><i>不额外传参，使用模型默认思考行为</i></span>
                  </div>
                  <div class="ai-ctrl-opt" data-level="low">
                    <span class="ai-ctrl-opt-ico">⚡</span>
                    <span class="ai-ctrl-opt-txt"><b>低</b><i>快速思考，响应更快、Token 消耗更少</i></span>
                  </div>
                  <div class="ai-ctrl-opt" data-level="medium">
                    <span class="ai-ctrl-opt-ico">🧠</span>
                    <span class="ai-ctrl-opt-txt"><b>中</b><i>均衡思考深度，适合大多数任务</i></span>
                  </div>
                  <div class="ai-ctrl-opt" data-level="high">
                    <span class="ai-ctrl-opt-ico">🌟</span>
                    <span class="ai-ctrl-opt-txt"><b>高</b><i>深度推理，适合复杂分析与架构问题</i></span>
                  </div>
                </div>
              </div>
            </div>

            <div class="ai-input-box">
              <textarea class="ai-input-textarea" id="chatInput" placeholder="输入消息，Enter 发送，Shift+Enter 换行…" rows="1"></textarea>
              <button class="ai-btn-action send" id="btnSendOrStop" title="发送消息">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            </div>
            <div class="ai-input-hint">Orbit Toolbox AI · 兼容 OpenAI / Responses / Claude · 支持流式推理</div>
          </footer>
        </main>

        <!-- Settings Modal -->
        <div class="ai-modal-overlay hidden" id="settingsModal">
          <div class="ai-modal-card">
            <div class="ai-modal-header">
              <span class="ai-modal-title">⚙️ AI 设置与管理</span>
              <button class="ai-modal-close" id="btnCloseSettings">×</button>
            </div>

            <!-- 设置选项卡导航 -->
            <div class="ai-modal-nav-tabs" id="settingsNavTabs">
              <button type="button" class="ai-modal-nav-tab active" data-tab="model" id="tabNavModel">⚙️ 模型与渠道</button>
              <button type="button" class="ai-modal-nav-tab" data-tab="personas" id="tabNavPersonas">🎭 人设卡片管理</button>
              <button type="button" class="ai-modal-nav-tab" data-tab="memory" id="tabNavMemory">🧠 记忆库</button>
              <button type="button" class="ai-modal-nav-tab" data-tab="ext" id="tabNavExt">🧩 MCP 与技能</button>
            </div>

            <!-- 板块 1: 模型与渠道配置 -->
            <div class="ai-modal-body ai-tab-pane active" id="paneModelSettings">
              <div class="ai-form-group">
                <label class="ai-form-label">对接渠道 (Channel Preset)</label>
                <select class="ai-form-select" id="cfgChannel"></select>
                <span class="ai-form-hint">选择主流 AI 渠道即可自动配置 Base URL 与推荐模型</span>
              </div>

              <div class="ai-form-group">
                <label class="ai-form-label">对接协议 (Protocol)</label>
                <select class="ai-form-select" id="cfgProtocol">
                  <option value="openai-chat">OpenAI Chat Completions (/v1/chat/completions)</option>
                  <option value="openai-responses">OpenAI Responses API (/v1/responses)</option>
                  <option value="claude-messages">Claude Messages API (/v1/messages)</option>
                </select>
                <span class="ai-form-hint">支持官方 OpenAI、DeepSeek、Moonshot、SiliconFlow、Ollama 及 Claude 协议</span>
              </div>

              <div class="ai-form-group">
                <label class="ai-form-label">API 基础路径 (Base URL)</label>
                <input type="text" class="ai-form-input" id="cfgBaseUrl" placeholder="https://api.openai.com/v1">
              </div>

              <div class="ai-form-group">
                <label class="ai-form-label">API Key 密钥</label>
                <div class="ai-key-input-wrap">
                  <input type="password" class="ai-form-input" id="cfgApiKey" placeholder="sk-...">
                  <button type="button" class="ai-btn-toggle-key" id="btnToggleApiKey" title="显示/隐藏密钥">👁️</button>
                </div>
              </div>

              <div class="ai-form-group">
                <div class="ai-form-label-row">
                  <label class="ai-form-label">模型标识 (Model)</label>
                  <button type="button" class="ai-btn-text-action" id="btnFetchModels" title="从 API 在线拉取该渠道可用模型 (GET /v1/models)">
                    <span class="ai-fetch-icon" id="iconFetchSpin">🔄</span> 在线拉取模型
                  </button>
                </div>
                <div class="ai-model-combobox-wrap">
                  <input type="text" class="ai-form-input" id="cfgModel" placeholder="选择、搜索或输入模型标识…" autocomplete="off">
                  <button type="button" class="ai-btn-open-model-search" id="btnToggleModelSearch" title="展开/收起模型搜索库">🔍</button>
                </div>

                <!-- 展开式模型搜索面板 -->
                <div class="ai-model-search-panel hidden" id="modelSearchPanel">
                  <div class="ai-model-search-header">
                    <span class="ai-search-ico">🔍</span>
                    <input type="text" class="ai-model-search-input" id="inputModelSearch" placeholder="搜索模型 (如 deepseek, r1, claude, 4o, qwen, llama…)" autocomplete="off">
                    <button type="button" class="ai-model-search-clear hidden" id="btnClearModelSearch" title="清空搜索">×</button>
                  </div>
                  <div class="ai-model-filter-tabs" id="modelFilterTabs">
                    <button type="button" class="ai-filter-tab active" data-tab="channel">当前渠道 (<span id="countChannelModels">0</span>)</button>
                    <button type="button" class="ai-filter-tab" data-tab="all">全部预设 (<span id="countAllModels">0</span>)</button>
                    <button type="button" class="ai-filter-tab hidden" data-tab="remote" id="tabRemoteModels">在线拉取 (<span id="countRemoteModels">0</span>)</button>
                  </div>
                  <div class="ai-model-results-list" id="modelSearchResults"></div>
                </div>

                <div class="ai-chips-list" id="channelModelChips"></div>
              </div>

              <div class="ai-form-group">
                <label class="ai-form-label">异常自动降级模型 (Fallback Model - 可选)</label>
                <input type="text" class="ai-form-input" id="cfgFallbackModel" placeholder="例如：deepseek-chat 或 gpt-4o-mini (留空则不开启降级)">
                <span class="ai-form-hint">当主模型遇网络超时、429 超载或 5xx 故障时，将自动切换至备用模型重试</span>
              </div>

              <div class="ai-form-group">
                <label class="ai-form-label">温度 (Temperature): <span id="cfgTempVal">0.7</span></label>
                <input type="range" min="0" max="2" step="0.1" value="0.7" id="cfgTempRange">
                <span class="ai-form-hint">较低值更严谨聚焦，较高值更有创意发散</span>
              </div>

              <div class="ai-form-group">
                <label class="ai-form-label">最大携带上下文轮数 (Max Context Messages)</label>
                <input type="number" class="ai-form-input" id="cfgMaxContext" min="2" max="64" value="16">
              </div>

              <div class="ai-form-group">
                <label class="ai-form-label">Agent 工具调用轮数上限 (Max Tool Rounds)</label>
                <input type="number" class="ai-form-input" id="cfgAgentMaxRounds" min="1" max="40" value="8">
                <span class="ai-form-hint">每次回复中允许「模型调用工具 → 拿到结果继续」的最大循环轮数，超出后强制以纯文本收尾</span>
              </div>

              <div class="ai-form-group">
                <label class="ai-form-label">Agent 默认工作目录</label>
                <div class="ai-workdir-row">
                  <input type="text" class="ai-form-input ai-workdir-input" id="cfgAgentWorkDir" placeholder="留空 = 当前用户目录 (C:\\Users\\…)">
                  <button type="button" class="ai-edit-btn" id="btnPickAgentWorkDir" title="弹出系统目录选择器">📂 选择…</button>
                </div>
                <span class="ai-form-hint">本地助手读写文件与执行命令的根目录，新建会话默认使用；相对路径基于此解析。会话顶栏 📁 可单独覆盖</span>
              </div>
            </div>

            <!-- 板块 3: 记忆库管理 -->
            <div class="ai-modal-body ai-tab-pane hidden" id="paneMemorySettings">
              <div class="ai-personas-header">
                <div class="ai-personas-search-row">
                  <input type="text" class="ai-form-input ai-persona-search-input" id="inputSearchMemories" placeholder="🔍 搜索记忆内容…" autocomplete="off">
                </div>
                <div class="ai-personas-actions">
                  <span class="ai-memory-count" id="memoryCountBadge">0 条</span>
                  <button type="button" class="ai-edit-btn primary" id="btnCreateMemory">+ 新建记忆</button>
                </div>
              </div>
              <span class="ai-form-hint" style="margin-bottom:8px">跨会话长期记忆：发送消息时自动召回相关条目注入上下文；Agent 也会通过 memory_write 自主沉淀用户偏好与项目约定</span>

              <!-- 记忆编辑面板 -->
              <div class="ai-ext-editor hidden" id="memoryEditPanel">
                <div class="ai-ext-editor-head">
                  <span id="memoryEditTitle">新建记忆</span>
                  <button type="button" class="ai-modal-close" id="btnCloseMemoryEdit">×</button>
                </div>
                <div class="ai-form-group">
                  <label class="ai-form-label">记忆内容</label>
                  <textarea class="ai-form-textarea" id="inputMemoryContent" rows="3" placeholder="一句话自包含的记忆，例如：用户偏好用 pnpm 管理依赖、仓库构建命令是 npm run dist…"></textarea>
                </div>
                <div class="ai-form-group">
                  <label class="ai-form-label">作用域</label>
                  <select class="ai-form-select" id="selectMemoryScope">
                    <option value="global">全局（所有会话生效）</option>
                    <option value="project">仅当前会话工作目录的项目</option>
                  </select>
                </div>
                <div class="ai-form-group">
                  <label class="ai-form-label">类型</label>
                  <select class="ai-form-select" id="selectMemoryType">
                    <option value="fact">fact（领域事实）</option>
                    <option value="preference">preference（用户偏好）</option>
                    <option value="project">project（项目约定）</option>
                  </select>
                </div>
                <div class="ai-ext-editor-actions">
                  <button type="button" class="ai-edit-btn" id="btnCancelMemoryEdit">取消</button>
                  <button type="button" class="ai-edit-btn primary" id="btnSaveMemoryEdit">保存记忆</button>
                </div>
              </div>

              <div class="ai-ext-list" id="memoriesCardList"></div>
            </div>

            <!-- 板块 2: 人设卡片管理 -->
            <div class="ai-modal-body ai-tab-pane hidden" id="panePersonasSettings">
              <div class="ai-personas-header">
                <div class="ai-personas-search-row">
                  <input type="text" class="ai-form-input ai-persona-search-input" id="inputSearchPersonas" placeholder="🔍 搜索人设标题或提示词…" autocomplete="off">
                </div>
                <div class="ai-personas-actions">
                  <button type="button" class="ai-btn-text-action" id="btnResetPersonas" title="恢复内置默认的人设">🔄 恢复默认</button>
                  <button type="button" class="ai-edit-btn primary" id="btnCreatePersona">+ 新建人设</button>
                </div>
              </div>

              <!-- 人设卡片列表 -->
              <div class="ai-personas-list" id="personasCardList"></div>

              <!-- 人设列表分页栏 -->
              <div class="ai-pagination" id="personasPagination">
                <button type="button" class="ai-page-btn" id="btnPrevPersonaPage">◀ 上一页</button>
                <span class="ai-page-info" id="personaPageInfo">第 1 / 1 页 (共 0 项)</span>
                <button type="button" class="ai-page-btn" id="btnNextPersonaPage">下一页 ▶</button>
              </div>

              <!-- 内联/模态人设编辑器 (新增或编辑时展开) -->
              <div class="ai-persona-edit-panel hidden" id="personaEditPanel">
                <div class="ai-persona-edit-header">
                  <span class="ai-persona-edit-title" id="personaEditTitle">编辑人设</span>
                  <button type="button" class="ai-modal-close" id="btnClosePersonaEdit">×</button>
                </div>
                <div class="ai-persona-edit-body">
                  <div class="ai-form-group">
                    <label class="ai-form-label">人设标题 (Title)</label>
                    <input type="text" class="ai-form-input" id="inputPersonaTitle" placeholder="例如：前端架构师、Python 调试助手…">
                  </div>
                  <div class="ai-form-group">
                    <label class="ai-form-label">人设图标 Emoji (Icon)</label>
                    <div class="ai-persona-icon-row">
                      <input type="text" class="ai-form-input ai-input-icon" id="inputPersonaIcon" value="✨" maxlength="4">
                      <div class="ai-quick-emojis" id="quickEmojiList">
                        <span class="ai-emoji-pill" data-emoji="✨">✨</span>
                        <span class="ai-emoji-pill" data-emoji="💻">💻</span>
                        <span class="ai-emoji-pill" data-emoji="🌐">🌐</span>
                        <span class="ai-emoji-pill" data-emoji="✍️">✍️</span>
                        <span class="ai-emoji-pill" data-emoji="⚡">⚡</span>
                        <span class="ai-emoji-pill" data-emoji="🎨">🎨</span>
                        <span class="ai-emoji-pill" data-emoji="🔍">🔍</span>
                        <span class="ai-emoji-pill" data-emoji="📊">📊</span>
                        <span class="ai-emoji-pill" data-emoji="🤖">🤖</span>
                        <span class="ai-emoji-pill" data-emoji="🧪">🧪</span>
                      </div>
                    </div>
                  </div>
                  <div class="ai-form-group">
                    <label class="ai-form-label">专属温度 (Temperature): <span id="personaTempVal">0.7</span></label>
                    <input type="range" min="0" max="2" step="0.1" value="0.7" id="personaTempRange">
                  </div>
                  <div class="ai-form-group">
                    <label class="ai-form-label">系统提示词 (System Prompt)</label>
                    <textarea class="ai-persona-prompt-textarea" id="inputPersonaPrompt" placeholder="详细设定该角色的背景、性格、专业技能、约束条件等…" rows="5"></textarea>
                  </div>
                </div>
                <div class="ai-persona-edit-footer">
                  <button type="button" class="ai-edit-btn" id="btnCancelPersonaEdit">取消</button>
                  <button type="button" class="ai-edit-btn primary" id="btnSavePersona">保存人设</button>
                </div>
              </div>
            </div>

            <!-- 板块 3: MCP 服务器与技能 -->
            <div class="ai-modal-body ai-tab-pane hidden" id="paneExtSettings">

              <!-- MCP 服务器 -->
              <div class="ai-ext-section">
                <div class="ai-ext-head">
                  <div class="ai-ext-head-txt">
                    <span class="ai-ext-title">🔌 MCP 服务器</span>
                    <span class="ai-ext-hint">接入 Model Context Protocol 工具生态；已启用服务器的工具会自动注入 Agent，并受审批档位管控 (MCP 工具视为高危)</span>
                  </div>
                  <div class="ai-ext-head-btns">
                    <button type="button" class="ai-edit-btn" id="btnOpenMcpMarket">🛒 检索 MCP 市场</button>
                    <button type="button" class="ai-edit-btn" id="btnResetMcp" title="恢复内置默认预设（含 Playwright）">↺ 恢复预设</button>
                    <button type="button" class="ai-edit-btn primary" id="btnCreateMcp">+ 添加服务器</button>
                  </div>
                </div>
                <div class="ai-ext-list" id="mcpServerList"></div>

                <!-- 内联 MCP 市场与检索面板 -->
                <div class="ai-ext-market-panel hidden" id="mcpMarketPanel">
                  <div class="ai-ext-market-head">
                    <div class="ai-ext-market-title-wrap">
                      <span class="ai-ext-market-title">🛒 MCP 市场（官方与成熟社区生态）</span>
                      <span class="ai-ext-market-subtitle">精选开箱即用的 GitHub / npm 成熟 MCP 服务，支持一键安装接入本地 Agent</span>
                    </div>
                    <button type="button" class="ai-modal-close" id="btnCloseMcpMarket">×</button>
                  </div>
                  <div class="ai-ext-market-toolbar">
                    <input type="text" class="ai-form-input ai-market-search" id="inputMarketSearch" placeholder="🔍 检索 MCP 市场（例如：Playwright、网页抓取、文件系统、数据库…）">
                    <div class="ai-market-categories" id="marketCategoriesBar"></div>
                  </div>
                  <div class="ai-market-list" id="marketServerList"></div>
                </div>

                <!-- 内联 MCP 编辑器 -->
                <div class="ai-ext-editor hidden" id="mcpEditPanel">
                  <div class="ai-ext-editor-head">
                    <span id="mcpEditTitle">添加 MCP 服务器</span>
                    <button type="button" class="ai-modal-close" id="btnCloseMcpEdit">×</button>
                  </div>
                  <div class="ai-form-group">
                    <label class="ai-form-label">名称</label>
                    <input type="text" class="ai-form-input" id="inputMcpName" placeholder="例如：filesystem、github、puppeteer">
                  </div>
                  <div class="ai-form-group">
                    <label class="ai-form-label">传输方式</label>
                    <select class="ai-form-select" id="selectMcpTransport">
                      <option value="stdio">stdio (本地子进程)</option>
                      <option value="http">HTTP (Streamable HTTP)</option>
                    </select>
                  </div>
                  <div class="ai-form-group" id="grpMcpCommand">
                    <label class="ai-form-label">启动命令</label>
                    <input type="text" class="ai-form-input" id="inputMcpCommand" placeholder="例如：npx 或 node D:\mcp-server\server.js">
                    <span class="ai-form-hint">Windows 下 npx / npm / *.cmd 会自动经 cmd.exe 包装执行</span>
                  </div>
                  <div class="ai-form-group" id="grpMcpArgs">
                    <label class="ai-form-label">启动参数 (每行一个)</label>
                    <textarea class="ai-form-textarea" id="inputMcpArgs" rows="2" placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;E:\workspace"></textarea>
                  </div>
                  <div class="ai-form-group" id="grpMcpEnv">
                    <label class="ai-form-label">环境变量 (每行 KEY=VALUE，可选)</label>
                    <textarea class="ai-form-textarea" id="inputMcpEnv" rows="2" placeholder="GITHUB_TOKEN=ghp_xxx"></textarea>
                  </div>
                  <div class="ai-form-group hidden" id="grpMcpUrl">
                    <label class="ai-form-label">服务器 URL</label>
                    <input type="text" class="ai-form-input" id="inputMcpUrl" placeholder="https://example.com/mcp">
                  </div>
                  <div class="ai-form-group hidden" id="grpMcpApiKey">
                    <label class="ai-form-label">Bearer Token (可选)</label>
                    <input type="password" class="ai-form-input" id="inputMcpApiKey" placeholder="留空表示无需鉴权">
                  </div>
                  <label class="ai-ext-check"><input type="checkbox" id="chkMcpEnabled" checked> 启用该服务器 (Agent 发消息时自动连接)</label>
                  <div class="ai-ext-test-row">
                    <button type="button" class="ai-edit-btn" id="btnTestMcp">⚡ 测试连接</button>
                    <span class="ai-ext-test-result" id="mcpTestResult"></span>
                  </div>
                  <div class="ai-persona-edit-footer">
                    <button type="button" class="ai-edit-btn" id="btnCancelMcpEdit">取消</button>
                    <button type="button" class="ai-edit-btn primary" id="btnSaveMcp">保存服务器</button>
                  </div>
                </div>
              </div>

              <!-- 技能 -->
              <div class="ai-ext-section">
                <div class="ai-ext-head">
                  <div class="ai-ext-head-txt">
                    <span class="ai-ext-title">🧠 技能 (Skills)</span>
                    <span class="ai-ext-hint">任务级指令包（标准结构：&lt;技能名&gt;/SKILL.md）：Agent 通过 list_skills / read_skill 工具按需加载并遵循执行</span>
                  </div>
                  <div class="ai-personas-actions">
                    <button type="button" class="ai-btn-text-action" id="btnResetSkills" title="恢复内置默认技能">🔄 恢复默认</button>
                    <button type="button" class="ai-edit-btn primary" id="btnCreateSkill">+ 新建技能</button>
                  </div>
                </div>
                <!-- 技能导入工具栏：GitHub 下载 / 本地文件 -->
                <div class="ai-skill-import-row">
                  <input type="text" class="ai-form-input ai-skill-url-input" id="inputSkillUrl" placeholder="⬇ 粘贴 GitHub 技能仓库 / 目录链接（递归导入其中全部 SKILL.md）或任意 .md 文件地址…" autocomplete="off">
                  <button type="button" class="ai-edit-btn" id="btnImportSkillUrl" title="仓库/目录链接会递归查找 SKILL.md（每个 SKILL.md 导入为一个技能，README 等文档不导入）">⬇ 下载导入</button>
                  <button type="button" class="ai-edit-btn" id="btnImportSkillFile" title="选择本地 .md 文件导入">📂 本地导入</button>
                  <input type="file" id="inputSkillFile" class="hidden" accept=".md,.markdown,.txt" multiple>
                  <button type="button" class="ai-edit-btn" id="btnImportSkillFolder" title="选择文件夹：递归导入其中所有 SKILL.md（没有 SKILL.md 时才导入普通 .md 文档）">📁 文件夹导入</button>
                  <input type="file" id="inputSkillFolder" class="hidden" webkitdirectory>
                </div>
                <div class="ai-ext-import-result hidden" id="skillImportResult"></div>
                <div class="ai-personas-search-row">
                  <input type="text" class="ai-form-input ai-persona-search-input" id="inputSearchSkills" placeholder="🔍 搜索技能名称或简介…" autocomplete="off">
                </div>
                <div class="ai-ext-list" id="skillsCardList"></div>
                <!-- 技能分页栏 -->
                <div class="ai-pagination" id="skillsPagination">
                  <button type="button" class="ai-page-btn" id="btnPrevSkillPage">◀ 上一页</button>
                  <span class="ai-page-info" id="skillPageInfo">第 1 / 1 页 (共 0 项)</span>
                  <button type="button" class="ai-page-btn" id="btnNextSkillPage">下一页 ▶</button>
                </div>

                <!-- 内联技能编辑器 -->
                <div class="ai-ext-editor hidden" id="skillEditPanel">
                  <div class="ai-ext-editor-head">
                    <span id="skillEditTitle">新建技能</span>
                    <button type="button" class="ai-modal-close" id="btnCloseSkillEdit">×</button>
                  </div>
                  <div class="ai-form-group">
                    <label class="ai-form-label">技能名称</label>
                    <input type="text" class="ai-form-input" id="inputSkillName" placeholder="例如：API 文档撰写规范、SQL 优化指南">
                  </div>
                  <div class="ai-form-group">
                    <label class="ai-form-label">技能简介 (供模型判断何时使用)</label>
                    <input type="text" class="ai-form-input" id="inputSkillDesc" placeholder="一句话说明该技能适用的任务场景">
                  </div>
                  <div class="ai-form-group">
                    <label class="ai-form-label">技能内容 (Markdown 指令集)</label>
                    <textarea class="ai-form-textarea ai-skill-content" id="inputSkillContent" rows="8" placeholder="用 Markdown 写清楚该技能的方法论、步骤、约束与输出格式，模型读取后会严格遵循执行…"></textarea>
                  </div>
                  <div class="ai-persona-edit-footer">
                    <button type="button" class="ai-edit-btn" id="btnCancelSkillEdit">取消</button>
                    <button type="button" class="ai-edit-btn primary" id="btnSaveSkill">保存技能</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="ai-modal-footer" id="settingsModalFooter">
              <button class="ai-edit-btn" id="btnCancelSettings">取消</button>
              <button class="ai-edit-btn primary" id="btnSaveSettings">保存配置</button>
            </div>
          </div>
        </div>

        <!-- Agent Work Dir Picker Modal -->
        <div class="ai-modal-overlay ai-workdir-modal hidden" id="workDirModal">
          <div class="ai-modal-card ai-workdir-card">
            <div class="ai-modal-header">
              <span class="ai-modal-title">📁 Agent 工作目录</span>
              <button class="ai-modal-close" id="btnCloseWorkDirModal">×</button>
            </div>
            <div class="ai-workdir-body">
              <div class="ai-workdir-current hidden" id="workDirCurrentRow">
                <span class="ai-workdir-current-label">当前</span>
                <span class="ai-workdir-current-path" id="workDirCurrentPath"></span>
              </div>
              <p class="ai-workdir-desc">本地助手读写文件与执行命令均基于此目录解析相对路径。</p>
              <div class="ai-workdir-actions">
                <button type="button" class="ai-edit-btn primary" id="btnWorkDirPick">📂 选择目录…</button>
                <button type="button" class="ai-edit-btn" id="btnWorkDirManual">✏️ 手动输入</button>
                <button type="button" class="ai-edit-btn" id="btnWorkDirReset">↩️ 恢复默认</button>
              </div>
              <div class="ai-workdir-manual hidden" id="workDirManualRow">
                <input type="text" class="ai-form-input" id="inputWorkDirManual" placeholder="粘贴或输入目录路径，如 E:\Projects\demo" spellcheck="false">
                <button type="button" class="ai-edit-btn primary" id="btnWorkDirManualOk">确定</button>
              </div>
              <div class="ai-workdir-error hidden" id="workDirModalError"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    // DOM references
    const sidebar = el.querySelector('#aiSidebar');
    const btnToggleSidebar = el.querySelector('#btnToggleSidebar');
    const btnNewChat = el.querySelector('#btnNewChat');
    const inputSearchSessions = el.querySelector('#inputSearchSessions');
    const sessionsList = el.querySelector('#sessionsList');
    const headerTitle = el.querySelector('#headerTitle');
    const headerModelPill = el.querySelector('#headerModelPill');
    const headerWorkDirPill = el.querySelector('#headerWorkDirPill');
    const sessionUsageBadge = el.querySelector('#sessionUsageBadge');
    const btnClearSession = el.querySelector('#btnClearSession');
    const btnOpenSettings = el.querySelector('#btnOpenSettings');
    const messagesScroll = el.querySelector('#messagesScroll');
    const pillCot = el.querySelector('#pillCot');
    const pillAgent = el.querySelector('#pillAgent');
    const chatInput = el.querySelector('#chatInput');
    const btnSendOrStop = el.querySelector('#btnSendOrStop');

    // Agent Approval Mode & Thinking Level Popover DOM
    const btnAgentMode = el.querySelector('#btnAgentMode');
    const agentModeIcon = el.querySelector('#agentModeIcon');
    const agentModeLabel = el.querySelector('#agentModeLabel');
    const agentModePopover = el.querySelector('#agentModePopover');
    const agentAlwaysRow = el.querySelector('#agentAlwaysRow');
    const btnThinkLevel = el.querySelector('#btnThinkLevel');
    const thinkLevelLabel = el.querySelector('#thinkLevelLabel');
    const thinkLevelPopover = el.querySelector('#thinkLevelPopover');

    // Persona Popover (Chat Footer) DOM
    const btnTogglePersonaPicker = el.querySelector('#btnTogglePersonaPicker');
    const currentPersonaIcon = el.querySelector('#currentPersonaIcon');
    const currentPersonaTitle = el.querySelector('#currentPersonaTitle');
    const personaPopover = el.querySelector('#personaPopover');
    const inputPopoverPersonaSearch = el.querySelector('#inputPopoverPersonaSearch');
    const btnClearPopoverPersonaSearch = el.querySelector('#btnClearPopoverPersonaSearch');
    const popoverPersonaList = el.querySelector('#popoverPersonaList');
    const popoverPersonaPagination = el.querySelector('#popoverPersonaPagination');
    const btnPopoverPrevPage = el.querySelector('#btnPopoverPrevPage');
    const popoverPageText = el.querySelector('#popoverPageText');
    const btnPopoverNextPage = el.querySelector('#btnPopoverNextPage');

    // Settings Modal DOM
    const settingsModal = el.querySelector('#settingsModal');
    const btnCloseSettings = el.querySelector('#btnCloseSettings');
    const btnCancelSettings = el.querySelector('#btnCancelSettings');
    const btnSaveSettings = el.querySelector('#btnSaveSettings');
    const cfgChannel = el.querySelector('#cfgChannel');
    const cfgProtocol = el.querySelector('#cfgProtocol');
    const cfgBaseUrl = el.querySelector('#cfgBaseUrl');
    const cfgApiKey = el.querySelector('#cfgApiKey');
    const btnToggleApiKey = el.querySelector('#btnToggleApiKey');
    const cfgModel = el.querySelector('#cfgModel');
    const cfgFallbackModel = el.querySelector('#cfgFallbackModel');
    const btnFetchModels = el.querySelector('#btnFetchModels');
    const iconFetchSpin = el.querySelector('#iconFetchSpin');
    const btnToggleModelSearch = el.querySelector('#btnToggleModelSearch');
    const modelSearchPanel = el.querySelector('#modelSearchPanel');
    const inputModelSearch = el.querySelector('#inputModelSearch');
    const btnClearModelSearch = el.querySelector('#btnClearModelSearch');
    const modelFilterTabs = el.querySelector('#modelFilterTabs');
    const tabRemoteModels = el.querySelector('#tabRemoteModels');
    const countChannelModels = el.querySelector('#countChannelModels');
    const countAllModels = el.querySelector('#countAllModels');
    const countRemoteModels = el.querySelector('#countRemoteModels');
    const modelSearchResults = el.querySelector('#modelSearchResults');
    const channelModelChips = el.querySelector('#channelModelChips');
    const cfgTempRange = el.querySelector('#cfgTempRange');
    const cfgTempVal = el.querySelector('#cfgTempVal');
    const cfgMaxContext = el.querySelector('#cfgMaxContext');
    const cfgAgentMaxRounds = el.querySelector('#cfgAgentMaxRounds');
    const cfgAgentWorkDir = el.querySelector('#cfgAgentWorkDir');
    const btnPickAgentWorkDir = el.querySelector('#btnPickAgentWorkDir');

    // Agent Work Dir Picker Modal DOM
    const workDirModal = el.querySelector('#workDirModal');
    const btnCloseWorkDirModal = el.querySelector('#btnCloseWorkDirModal');
    const workDirCurrentRow = el.querySelector('#workDirCurrentRow');
    const workDirCurrentPath = el.querySelector('#workDirCurrentPath');
    const btnWorkDirPick = el.querySelector('#btnWorkDirPick');
    const btnWorkDirManual = el.querySelector('#btnWorkDirManual');
    const btnWorkDirReset = el.querySelector('#btnWorkDirReset');
    const workDirManualRow = el.querySelector('#workDirManualRow');
    const inputWorkDirManual = el.querySelector('#inputWorkDirManual');
    const btnWorkDirManualOk = el.querySelector('#btnWorkDirManualOk');
    const workDirModalError = el.querySelector('#workDirModalError');

    // Settings Tabs & Personas Management DOM
    const tabNavModel = el.querySelector('#tabNavModel');
    const tabNavPersonas = el.querySelector('#tabNavPersonas');
    const tabNavMemory = el.querySelector('#tabNavMemory');
    const paneModelSettings = el.querySelector('#paneModelSettings');
    const panePersonasSettings = el.querySelector('#panePersonasSettings');
    const paneMemorySettings = el.querySelector('#paneMemorySettings');

    // Memory library DOM
    const inputSearchMemories = el.querySelector('#inputSearchMemories');
    const memoryCountBadge = el.querySelector('#memoryCountBadge');
    const btnCreateMemory = el.querySelector('#btnCreateMemory');
    const memoriesCardList = el.querySelector('#memoriesCardList');
    const memoryEditPanel = el.querySelector('#memoryEditPanel');
    const memoryEditTitle = el.querySelector('#memoryEditTitle');
    const btnCloseMemoryEdit = el.querySelector('#btnCloseMemoryEdit');
    const inputMemoryContent = el.querySelector('#inputMemoryContent');
    const selectMemoryScope = el.querySelector('#selectMemoryScope');
    const selectMemoryType = el.querySelector('#selectMemoryType');
    const btnCancelMemoryEdit = el.querySelector('#btnCancelMemoryEdit');
    const btnSaveMemoryEdit = el.querySelector('#btnSaveMemoryEdit');
    const settingsModalFooter = el.querySelector('#settingsModalFooter');
    const inputSearchPersonas = el.querySelector('#inputSearchPersonas');
    const btnResetPersonas = el.querySelector('#btnResetPersonas');
    const btnCreatePersona = el.querySelector('#btnCreatePersona');
    const personasCardList = el.querySelector('#personasCardList');
    const personasPagination = el.querySelector('#personasPagination');
    const btnPrevPersonaPage = el.querySelector('#btnPrevPersonaPage');
    const personaPageInfo = el.querySelector('#personaPageInfo');
    const btnNextPersonaPage = el.querySelector('#btnNextPersonaPage');
    const personaEditPanel = el.querySelector('#personaEditPanel');
    const personaEditTitle = el.querySelector('#personaEditTitle');
    const btnClosePersonaEdit = el.querySelector('#btnClosePersonaEdit');
    const inputPersonaTitle = el.querySelector('#inputPersonaTitle');
    const inputPersonaIcon = el.querySelector('#inputPersonaIcon');
    const quickEmojiList = el.querySelector('#quickEmojiList');
    const personaTempVal = el.querySelector('#personaTempVal');
    const personaTempRange = el.querySelector('#personaTempRange');
    const inputPersonaPrompt = el.querySelector('#inputPersonaPrompt');
    const btnCancelPersonaEdit = el.querySelector('#btnCancelPersonaEdit');
    const btnSavePersona = el.querySelector('#btnSavePersona');

    // MCP & Skills Tab DOM
    const tabNavExt = el.querySelector('#tabNavExt');
    const paneExtSettings = el.querySelector('#paneExtSettings');
    const btnOpenMcpMarket = el.querySelector('#btnOpenMcpMarket');
    const btnResetMcp = el.querySelector('#btnResetMcp');
    const btnCreateMcp = el.querySelector('#btnCreateMcp');
    const mcpServerList = el.querySelector('#mcpServerList');
    const mcpMarketPanel = el.querySelector('#mcpMarketPanel');
    const btnCloseMcpMarket = el.querySelector('#btnCloseMcpMarket');
    const inputMarketSearch = el.querySelector('#inputMarketSearch');
    const marketCategoriesBar = el.querySelector('#marketCategoriesBar');
    const marketServerList = el.querySelector('#marketServerList');
    const mcpEditPanel = el.querySelector('#mcpEditPanel');
    const mcpEditTitle = el.querySelector('#mcpEditTitle');
    const btnCloseMcpEdit = el.querySelector('#btnCloseMcpEdit');
    const inputMcpName = el.querySelector('#inputMcpName');
    const selectMcpTransport = el.querySelector('#selectMcpTransport');
    const grpMcpCommand = el.querySelector('#grpMcpCommand');
    const inputMcpCommand = el.querySelector('#inputMcpCommand');
    const grpMcpArgs = el.querySelector('#grpMcpArgs');
    const inputMcpArgs = el.querySelector('#inputMcpArgs');
    const grpMcpEnv = el.querySelector('#grpMcpEnv');
    const inputMcpEnv = el.querySelector('#inputMcpEnv');
    const grpMcpUrl = el.querySelector('#grpMcpUrl');
    const inputMcpUrl = el.querySelector('#inputMcpUrl');
    const grpMcpApiKey = el.querySelector('#grpMcpApiKey');
    const inputMcpApiKey = el.querySelector('#inputMcpApiKey');
    const chkMcpEnabled = el.querySelector('#chkMcpEnabled');
    const btnTestMcp = el.querySelector('#btnTestMcp');
    const mcpTestResult = el.querySelector('#mcpTestResult');
    const btnCancelMcpEdit = el.querySelector('#btnCancelMcpEdit');
    const btnSaveMcp = el.querySelector('#btnSaveMcp');
    const btnResetSkills = el.querySelector('#btnResetSkills');
    const btnCreateSkill = el.querySelector('#btnCreateSkill');
    const skillsCardList = el.querySelector('#skillsCardList');
    const skillEditPanel = el.querySelector('#skillEditPanel');
    const skillEditTitle = el.querySelector('#skillEditTitle');
    const btnCloseSkillEdit = el.querySelector('#btnCloseSkillEdit');
    const inputSkillName = el.querySelector('#inputSkillName');
    const inputSkillDesc = el.querySelector('#inputSkillDesc');
    const inputSkillContent = el.querySelector('#inputSkillContent');
    const btnCancelSkillEdit = el.querySelector('#btnCancelSkillEdit');
    const btnSaveSkill = el.querySelector('#btnSaveSkill');
    const inputSkillUrl = el.querySelector('#inputSkillUrl');
    const btnImportSkillUrl = el.querySelector('#btnImportSkillUrl');
    const btnImportSkillFile = el.querySelector('#btnImportSkillFile');
    const inputSkillFile = el.querySelector('#inputSkillFile');
    const btnImportSkillFolder = el.querySelector('#btnImportSkillFolder');
    const inputSkillFolder = el.querySelector('#inputSkillFolder');
    const skillImportResult = el.querySelector('#skillImportResult');
    const inputSearchSkills = el.querySelector('#inputSearchSkills');
    const btnPrevSkillPage = el.querySelector('#btnPrevSkillPage');
    const skillPageInfo = el.querySelector('#skillPageInfo');
    const btnNextSkillPage = el.querySelector('#btnNextSkillPage');

    // State
    let config = {};
    let personas = [];
    let sessions = [];
    let currentSession = null;
    let currentStreamId = null;
    let isGenerating = false;
    // Session that owns the currently running stream. Terminal chunks are matched
    // against this so the composer unlocks even if the user switched sessions.
    let generatingSessionId = null;
    // Chunks that arrived for a session other than the one on screen, keyed by
    // sessionId: { approvals: payload[], terminated: boolean }
    const pendingLateChunks = new Map();
    let searchKeyword = '';
    let remoteModels = [];
    let activeModelTab = 'channel';
    let editingPersonaId = null;
    let agentMode = 'ask'; // 'ask' | 'auto' | 'full'
    let thinkLevel = 'auto'; // 'auto' | 'low' | 'medium' | 'high'
    let skills = [];
    let mcpServers = [];
    let editingMcpId = null;
    let editingSkillId = null;
    let skillSearchKeyword = '';
    let skillCurrentPage = 1;
    const skillPageSize = 5;
    let memories = [];
    let editingMemoryId = null;
    let memorySearchKeyword = '';

    // Personas Search & Pagination State
    let personaSearchKeyword = '';
    let personaCurrentPage = 1;
    const personaPageSize = 4;

    let popoverPersonaSearch = '';
    let popoverCurrentPage = 1;
    const popoverPageSize = 4;

    /* --- Auto Resize Textarea --------------------------------------------- */
    function autoResizeInput() {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(180, Math.max(24, chatInput.scrollHeight)) + 'px';
    }
    chatInput.addEventListener('input', autoResizeInput);

    /* --- Toggle Sidebar --------------------------------------------------- */
    btnToggleSidebar.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });

    /* --- CoT & Agent Pills ------------------------------------------------ */
    pillCot.addEventListener('click', () => {
      pillCot.classList.toggle('active');
      syncThinkLevelPill();
    });
    pillAgent.addEventListener('click', () => {
      pillAgent.classList.toggle('active');
    });

    /* --- Agent Approval Mode & Thinking Level ------------------------------ */
    const AGENT_MODES = {
      ask: { icon: '🔐', label: '每次确认', cls: 'ask' },
      auto: { icon: '📝', label: '自动审核', cls: 'auto' },
      full: { icon: '🚀', label: '完全访问', cls: 'full' }
    };
    const THINK_LEVEL_LABELS = {
      auto: '思考·跟随默认',
      low: '思考·低',
      medium: '思考·中',
      high: '思考·高'
    };

    function updateAgentModeUI() {
      const m = AGENT_MODES[agentMode] || AGENT_MODES.ask;
      agentModeIcon.textContent = m.icon;
      agentModeLabel.textContent = m.label;
      btnAgentMode.className = `ai-pill-btn mode ${m.cls}`;
      agentModePopover.querySelectorAll('.ai-ctrl-opt').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.mode === agentMode);
      });
    }

    function updateThinkLevelUI() {
      thinkLevelLabel.textContent = THINK_LEVEL_LABELS[thinkLevel] || THINK_LEVEL_LABELS.auto;
      thinkLevelPopover.querySelectorAll('.ai-ctrl-opt').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.level === thinkLevel);
      });
      syncThinkLevelPill();
    }

    function syncThinkLevelPill() {
      const cotOn = pillCot.classList.contains('active');
      btnThinkLevel.classList.toggle('dimmed', !cotOn);
      btnThinkLevel.title = cotOn
        ? '思维等级：控制推理模型的思考深度'
        : '当前不生效：开启「深度思考」后思维等级才会应用';
    }

    function renderAlwaysAllowRow() {
      const list = (currentSession && currentSession.alwaysAllowTools) || [];
      if (!list.length) {
        agentAlwaysRow.classList.add('hidden');
        agentAlwaysRow.innerHTML = '';
        return;
      }
      agentAlwaysRow.classList.remove('hidden');
      agentAlwaysRow.innerHTML = `
        <span class="ai-ctrl-always-txt">本会话免确认：${list.map(t => escapeHtml(t)).join('、')}</span>
        <button type="button" class="ai-ctrl-reset-link">重置授权</button>
      `;
      agentAlwaysRow.querySelector('.ai-ctrl-reset-link').addEventListener('click', async () => {
        if (!currentSession) return;
        const res = await ctx.call('resetSessionApprovals', { sessionId: currentSession.id });
        if (res && res.ok) {
          currentSession.alwaysAllowTools = [];
          renderAlwaysAllowRow();
        }
      });
    }

    function closeCtrlPopovers() {
      agentModePopover.classList.add('hidden');
      thinkLevelPopover.classList.add('hidden');
    }

    btnAgentMode.addEventListener('click', () => {
      const willOpen = agentModePopover.classList.contains('hidden');
      closeCtrlPopovers();
      if (willOpen) {
        renderAlwaysAllowRow();
        agentModePopover.classList.remove('hidden');
      }
    });

    btnThinkLevel.addEventListener('click', () => {
      const willOpen = thinkLevelPopover.classList.contains('hidden');
      closeCtrlPopovers();
      if (willOpen) thinkLevelPopover.classList.remove('hidden');
    });

    // Click outside the popover wraps closes them. Capture phase: sibling pill
    // handlers (e.g. persona picker) call stopPropagation, which would starve a
    // bubble-phase listener of the event.
    el.addEventListener('click', e => {
      if (!e.target.closest('.ai-ctrl-popover-wrap')) closeCtrlPopovers();
    }, true);

    agentModePopover.querySelectorAll('.ai-ctrl-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        agentMode = opt.dataset.mode;
        updateAgentModeUI();
        closeCtrlPopovers();
        ctx.call('saveConfig', { agentApprovalMode: agentMode });
      });
    });

    thinkLevelPopover.querySelectorAll('.ai-ctrl-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        thinkLevel = opt.dataset.level;
        updateThinkLevelUI();
        closeCtrlPopovers();
        ctx.call('saveConfig', { thinkingLevel: thinkLevel });
      });
    });

    /* --- Personas Selector Popover (Chat Footer) --------------------------- */
    function updateActivePersonaPill() {
      const activePersonaId = (currentSession && currentSession.personaId) || 'general';
      const p = personas.find(x => x.id === activePersonaId) || personas[0];
      if (p) {
        currentPersonaIcon.textContent = p.icon || '✨';
        currentPersonaTitle.textContent = p.title;
      }
    }

    function renderPopoverPersonas() {
      const q = popoverPersonaSearch.trim().toLowerCase();
      btnClearPopoverPersonaSearch.classList.toggle('hidden', !q);

      const filtered = q
        ? personas.filter(p => (p.title || '').toLowerCase().includes(q) || (p.prompt || '').toLowerCase().includes(q))
        : personas;

      const totalPages = Math.max(1, Math.ceil(filtered.length / popoverPageSize));
      if (popoverCurrentPage > totalPages) popoverCurrentPage = totalPages;
      if (popoverCurrentPage < 1) popoverCurrentPage = 1;

      popoverPageText.textContent = `${popoverCurrentPage} / ${totalPages}`;
      btnPopoverPrevPage.disabled = popoverCurrentPage <= 1;
      btnPopoverNextPage.disabled = popoverCurrentPage >= totalPages;

      const start = (popoverCurrentPage - 1) * popoverPageSize;
      const pageItems = filtered.slice(start, start + popoverPageSize);

      popoverPersonaList.innerHTML = '';
      if (pageItems.length === 0) {
        const empty = document.createElement('div');
        empty.style.padding = '12px 8px';
        empty.style.textAlign = 'center';
        empty.style.fontSize = '11.5px';
        empty.style.color = 'var(--ink-faint)';
        empty.textContent = q ? `未搜到包含 "${q}" 的人设` : '暂无人设';
        popoverPersonaList.appendChild(empty);
        return;
      }

      const activeId = (currentSession && currentSession.personaId) || 'general';
      pageItems.forEach(p => {
        const item = document.createElement('div');
        item.className = 'ai-popover-persona-item' + (p.id === activeId ? ' selected' : '');
        item.innerHTML = `
          <span class="ai-popover-persona-icon">${escapeHtml(p.icon || '✨')}</span>
          <div class="ai-popover-persona-content">
            <span class="ai-popover-persona-title">${escapeHtml(p.title)} <span style="font-weight:normal;opacity:0.6;font-size:10px;">(T: ${escapeHtml(p.temperature ?? 0.7)})</span></span>
            <span class="ai-popover-persona-desc">${escapeHtml(p.prompt || '')}</span>
          </div>
        `;
        item.addEventListener('click', async () => {
          // A persona applies to a session; without one there is nothing to persist.
          if (!currentSession) return;
          personaPopover.classList.add('hidden');
          try {
            const res = await ctx.call('set_session_persona', { sessionId: currentSession.id, personaId: p.id });
            if (res && res.ok) {
              if (res.activeSession) currentSession = res.activeSession;
              updateActivePersonaPill();
            } else {
              alert(`切换人设失败: ${(res && res.error) || '未知错误'}`);
            }
          } catch (err) {
            alert(`切换人设失败: ${(err && err.message) || err}`);
          }
        });
        popoverPersonaList.appendChild(item);
      });
    }

    btnTogglePersonaPicker.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!currentSession) return; // no session to attach a persona to
      const isHidden = personaPopover.classList.toggle('hidden');
      if (!isHidden) {
        popoverPersonaSearch = '';
        inputPopoverPersonaSearch.value = '';
        popoverCurrentPage = 1;
        renderPopoverPersonas();
        inputPopoverPersonaSearch.focus();
      }
    });

    inputPopoverPersonaSearch.addEventListener('input', () => {
      popoverPersonaSearch = inputPopoverPersonaSearch.value;
      popoverCurrentPage = 1;
      renderPopoverPersonas();
    });

    btnClearPopoverPersonaSearch.addEventListener('click', () => {
      popoverPersonaSearch = '';
      inputPopoverPersonaSearch.value = '';
      popoverCurrentPage = 1;
      renderPopoverPersonas();
      inputPopoverPersonaSearch.focus();
    });

    btnPopoverPrevPage.addEventListener('click', () => {
      if (popoverCurrentPage > 1) {
        popoverCurrentPage--;
        renderPopoverPersonas();
      }
    });

    btnPopoverNextPage.addEventListener('click', () => {
      popoverCurrentPage++;
      renderPopoverPersonas();
    });

    const onDocumentClickClosePersona = (e) => {
      if (!personaPopover.classList.contains('hidden')) {
        if (!e.target.closest('.ai-persona-picker-wrap')) {
          personaPopover.classList.add('hidden');
        }
      }
    };
    document.addEventListener('click', onDocumentClickClosePersona);

    function renderPersonas() {
      updateActivePersonaPill();
      renderPopoverPersonas();
    }

    /* --- Sessions List ---------------------------------------------------- */
    function renderSessionsList() {
      sessionsList.innerHTML = '';
      const q = searchKeyword.trim().toLowerCase();
      const filtered = q ? sessions.filter(s => (s.title || '').toLowerCase().includes(q)) : sessions;

      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.style.padding = '12px';
        empty.style.fontSize = '12px';
        empty.style.color = 'var(--ink-faint)';
        empty.textContent = q ? '未找到相关对话' : '暂无会话';
        sessionsList.appendChild(empty);
        return;
      }

      filtered.forEach(s => {
        const item = document.createElement('div');
        item.className = 'ai-session-item' + (currentSession && currentSession.id === s.id ? ' active' : '');
        item.innerHTML = `
          <span class="ai-session-text" title="${escapeHtml(s.title)}">${escapeHtml(s.title || '新对话')}</span>
          <div class="ai-session-meta">
            <span class="ai-session-badge">${s.messageCount || 0}</span>
            <button class="ai-session-del" title="删除会话">×</button>
          </div>
        `;

        item.addEventListener('click', async (e) => {
          if (e.target.closest('.ai-session-del')) return;
          if (currentSession && currentSession.id === s.id) return;
          const res = await ctx.call('switchSession', { id: s.id });
          if (res && res.ok) {
            currentSession = res.session;
            updateHeader();
            renderMessages();
            renderSessionsList();
            // Re-mount approval cards / generating state for chunks that
            // arrived while this session was in the background.
            restorePendingLateChunks();
          }
        });

        item.querySelector('.ai-session-del').addEventListener('click', async (e) => {
          e.stopPropagation();
          const res = await ctx.call('deleteSession', { id: s.id });
          if (res && res.ok) {
            pendingLateChunks.delete(s.id);
            sessions = res.sessions;
            const next = sessions.find(x => x.id === res.activeSessionId) || sessions[0] || null;
            if (next) {
              const sw = await ctx.call('switchSession', { id: next.id });
              currentSession = sw ? sw.session : null;
            } else {
              currentSession = null;
            }
            updateHeader();
            renderMessages();
            renderSessionsList();
            restorePendingLateChunks();
          }
        });

        sessionsList.appendChild(item);
      });
    }

    inputSearchSessions.addEventListener('input', () => {
      searchKeyword = inputSearchSessions.value;
      renderSessionsList();
    });

    btnNewChat.addEventListener('click', async () => {
      const activePersonaId = (currentSession && currentSession.personaId) || 'general';
      const res = await ctx.call('createSession', { personaId: activePersonaId });
      if (res && res.ok) {
        sessions.unshift({
          id: res.session.id,
          title: res.session.title,
          personaId: res.session.personaId,
          messageCount: 0
        });
        currentSession = res.session;
        updateHeader();
        renderMessages();
        renderSessionsList();
        chatInput.focus();
      }
    });

    /* --- Rename Session --------------------------------------------------- */
    headerTitle.addEventListener('dblclick', async () => {
      if (!currentSession) return;
      const newTitle = prompt('修改会话名称:', currentSession.title || '');
      if (newTitle && newTitle.trim()) {
        const res = await ctx.call('renameSession', { id: currentSession.id, title: newTitle.trim() });
        if (res && res.ok) {
          currentSession.title = res.session.title;
          updateHeader();
          const found = sessions.find(x => x.id === currentSession.id);
          if (found) found.title = currentSession.title;
          renderSessionsList();
        }
      }
    });

    /* --- Agent Working Directory ------------------------------------------- */
    headerWorkDirPill.addEventListener('click', () => {
      if (!currentSession) return;
      const cur = currentSession.workDir || config.agentWorkDir || '';
      workDirCurrentRow.classList.toggle('hidden', !cur);
      workDirCurrentPath.textContent = cur || '';
      workDirCurrentPath.title = cur ? (currentSession.workDir ? cur : `${cur} (默认)`) : '';
      workDirManualRow.classList.add('hidden');
      workDirModalError.classList.add('hidden');
      workDirModal.classList.remove('hidden');
    });

    const closeWorkDirModal = () => workDirModal.classList.add('hidden');
    btnCloseWorkDirModal.addEventListener('click', closeWorkDirModal);
    workDirModal.addEventListener('click', e => { if (e.target === workDirModal) closeWorkDirModal(); });

    const applySessionWorkDir = async dir => {
      const res = await ctx.call('setSessionWorkDir', { sessionId: currentSession.id, dir });
      if (res && res.ok) {
        currentSession.workDir = res.workDir;
        updateHeader();
        closeWorkDirModal();
      } else {
        workDirModalError.textContent = `设置失败: ${(res && res.error) || '未知错误'}`;
        workDirModalError.classList.remove('hidden');
      }
    };

    btnWorkDirPick.addEventListener('click', async () => {
      const res = await ctx.call('chooseAgentWorkDir', { current: currentSession?.workDir || '' });
      if (res && res.ok) await applySessionWorkDir(res.dir);
    });

    btnWorkDirManual.addEventListener('click', () => {
      workDirManualRow.classList.toggle('hidden');
      if (!workDirManualRow.classList.contains('hidden')) {
        inputWorkDirManual.value = currentSession.workDir || '';
        inputWorkDirManual.focus();
      }
    });

    const submitManualWorkDir = async () => {
      const dir = inputWorkDirManual.value.trim();
      if (!dir) {
        workDirModalError.textContent = '路径不能为空；如需恢复默认请点「恢复默认」';
        workDirModalError.classList.remove('hidden');
        return;
      }
      await applySessionWorkDir(dir);
    };
    btnWorkDirManualOk.addEventListener('click', submitManualWorkDir);
    inputWorkDirManual.addEventListener('keydown', e => { if (e.key === 'Enter') submitManualWorkDir(); });

    // Clear the per-session override -> fall back to the configured default dir
    btnWorkDirReset.addEventListener('click', async () => {
      const res = await ctx.call('setSessionWorkDir', { sessionId: currentSession.id, dir: '' });
      if (res && res.ok) {
        currentSession.workDir = '';
        updateHeader();
        closeWorkDirModal();
      } else {
        workDirModalError.textContent = `恢复失败: ${(res && res.error) || '未知错误'}`;
        workDirModalError.classList.remove('hidden');
      }
    });

    /* --- Clear Session ---------------------------------------------------- */
    btnClearSession.addEventListener('click', async () => {
      if (!currentSession || (currentSession.messages || []).length === 0) return;
      if (isGenerating && generatingSessionId === currentSession.id) {
        alert('正在生成中…');
        return;
      }
      if (confirm('确认清空当前对话的所有记录吗？')) {
        const res = await ctx.call('clearSession', { id: currentSession.id });
        if (res && res.ok) {
          currentSession.messages = [];
          currentSession.totalTokens = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
          updateHeader();
          renderMessages();
          renderSessionsList();
        }
      }
    });

    /* --- Update Header ---------------------------------------------------- */
    function updateHeader() {
      if (!currentSession) {
        headerTitle.textContent = '暂无对话';
        sessionUsageBadge.textContent = '0 tokens';
        headerWorkDirPill.textContent = '📁';
        headerWorkDirPill.title = 'Agent 工作目录';
        return;
      }
      headerTitle.textContent = currentSession.title || '新对话';
      headerModelPill.textContent = config.model || 'gpt-4o-mini';

      const wd = currentSession.workDir || '';
      const effectiveDefault = config.agentWorkDir || '';
      if (wd) {
        headerWorkDirPill.textContent = `📁 ${wd.length <= 30 ? wd : wd.split(/[\\/]/).slice(-2).join('/')}`;
        headerWorkDirPill.title = `Agent 工作目录: ${wd} (点击修改)`;
      } else {
        headerWorkDirPill.textContent = effectiveDefault ? `📁 ${effectiveDefault.length <= 30 ? effectiveDefault : effectiveDefault.split(/[\\/]/).slice(-2).join('/')}` : '📁 默认';
        headerWorkDirPill.title = effectiveDefault
          ? `Agent 工作目录 (默认): ${effectiveDefault} (点击修改)`
          : 'Agent 工作目录: 未单独设置，使用系统用户目录 (点击修改)';
      }

      const tokens = currentSession.totalTokens ? currentSession.totalTokens.totalTokens : 0;
      sessionUsageBadge.textContent = `${tokens.toLocaleString()} tokens`;
      updateActivePersonaPill();
    }

    /* --- Scroll Control ---------------------------------------------------- */
    let autoScrollEnabled = true;

    function isAtBottom(threshold = 48) {
      return (messagesScroll.scrollHeight - messagesScroll.scrollTop - messagesScroll.clientHeight) <= threshold;
    }

    messagesScroll.addEventListener('scroll', () => {
      autoScrollEnabled = isAtBottom(48);
    }, { passive: true });

    function scrollToBottom(force = false) {
      if (force) {
        autoScrollEnabled = true;
        messagesScroll.scrollTop = messagesScroll.scrollHeight;
        return;
      }
      if (autoScrollEnabled) {
        messagesScroll.scrollTop = messagesScroll.scrollHeight;
      }
    }

    /* Session task plan card: pinned as the first child of the message list,
       refreshed live by task_list chunks and on every renderMessages pass. */
    function renderTaskCard() {
      const existing = messagesScroll.querySelector('#aiTaskCard');
      const tasks = currentSession && Array.isArray(currentSession.taskList) ? currentSession.taskList : null;
      if (!tasks || tasks.length === 0) {
        if (existing) existing.remove();
        return;
      }
      let card = existing;
      if (!card) {
        card = document.createElement('div');
        card.id = 'aiTaskCard';
        card.className = 'ai-task-card';
        messagesScroll.insertBefore(card, messagesScroll.firstChild);
      }
      const done = tasks.filter(t => t.status === 'completed').length;
      const icon = t => (t.status === 'completed' ? '✅' : (t.status === 'in_progress' ? '🔵' : '⚪'));
      card.innerHTML = `
        <div class="ai-task-card-head">
          <span class="ai-task-card-title">📋 任务清单</span>
          <span class="ai-task-card-progress">${done}/${tasks.length}</span>
          <button type="button" class="ai-task-card-clear" title="收起清单">×</button>
        </div>
        <div class="ai-task-list">
          ${tasks.map(t => `<div class="ai-task-item ${t.status}"><span class="ai-task-ico">${icon(t)}</span><span class="ai-task-text">${escapeHtml(t.content)}</span></div>`).join('')}
        </div>
      `;
      card.querySelector('.ai-task-card-clear').addEventListener('click', async () => {
        if (!currentSession) return;
        const res = await ctx.call('clearTaskList', { sessionId: currentSession.id });
        if (res && res.ok) {
          currentSession.taskList = null;
          renderTaskCard();
        }
      });
    }

    function renderMessages() {
      messagesScroll.innerHTML = '';
      if (!currentSession || !Array.isArray(currentSession.messages) || currentSession.messages.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'ai-empty-prompt';
        empty.innerHTML = `
          <span class="ai-empty-icon">🤖</span>
          <div class="ai-empty-title">随时开始您的智能对话</div>
          <div class="ai-empty-desc">支持深度思考 (CoT) · 代码执行 · 复杂数据加工 · 自动生成并保存工作流</div>
          <div class="ai-empty-quick-list">
            <div class="ai-empty-quick-item" data-prompt="请为我编写一个自动美化剪贴板 JSON 并通知的工作流">⚡ 让 Agent 自动生成一个【JSON 美化并通知】工作流</div>
            <div class="ai-empty-quick-item" data-prompt="请帮我分析一下第一性原理与 KISS 原则在软件架构中的应用">💡 深度探讨第一性原理与架构设计</div>
            <div class="ai-empty-quick-item" data-prompt="用 JavaScript 写一个高精度素数生成器并分析时间复杂度">💻 编写 JavaScript 算法代码并评测</div>
          </div>
        `;
        empty.querySelectorAll('.ai-empty-quick-item').forEach(it => {
          it.addEventListener('click', () => {
            chatInput.value = it.dataset.prompt;
            sendMessage();
          });
        });
        messagesScroll.appendChild(empty);
        return;
      }

      currentSession.messages.forEach(msg => {
        if (msg.role === 'system' || msg.role === 'tool') return; // hidden or nested inside assistant
        const card = createMessageElement(msg);
        messagesScroll.appendChild(card);
      });

      renderTaskCard();
      scrollToBottom(true);
    }

    function createMessageElement(msg) {
      const isUser = msg.role === 'user';
      const el = document.createElement('div');
      el.className = `ai-msg ${isUser ? 'user' : 'assistant'}`;
      el.dataset.id = msg.id;

      const bubble = document.createElement('div');
      bubble.className = 'ai-msg-bubble';

      const toolbar = document.createElement('div');
      toolbar.className = 'ai-msg-toolbar';

      const timeStr = new Date(msg.timestamp || Date.now()).toLocaleTimeString();

      if (isUser) {
        bubble.textContent = msg.content;

        // Combined single toolbar: [编辑] [重发] [复制] [删除] [时间]
        toolbar.innerHTML = `
          <button type="button" class="ai-msg-tool-btn btn-tool-edit" title="编辑消息内容">
            <span>✏️</span> <span>编辑</span>
          </button>
          <button type="button" class="ai-msg-tool-btn btn-tool-resend" title="重新发送并生成回复">
            <span>🔄</span> <span>重发</span>
          </button>
          <button type="button" class="ai-msg-tool-btn btn-tool-copy" title="复制消息文本">
            <span>📋</span> <span>复制</span>
          </button>
          <button type="button" class="ai-msg-tool-btn btn-tool-del" title="删除此消息">
            <span>🗑️</span> <span>删除</span>
          </button>
          <span class="ai-msg-meta">${timeStr}</span>
        `;
      } else {
        // Fallback Model Badge (if invoked fallback)
        if (msg.fallbackFrom) {
          const fbBadge = document.createElement('div');
          fbBadge.className = 'ai-msg-fallback-badge';
          fbBadge.textContent = `⚠️ 主模型 [${msg.fallbackFrom}] 异常，已自动降级至备用模型`;
          bubble.appendChild(fbBadge);
        }

        const formatToolResultForDisplay = (res) => {
          if (res === null || res === undefined) return '(无执行结果)';
          if (typeof res === 'string') return res;
          if (typeof res === 'object') {
            if (Array.isArray(res.content)) {
              const texts = res.content.map(c => (c && c.text) ? c.text : JSON.stringify(c)).filter(Boolean);
              if (texts.length > 0) return texts.join('\n');
            }
            if (res.stdout !== undefined || res.stderr !== undefined) {
              let out = '';
              if (res.stdout) out += res.stdout;
              if (res.stderr) out += (out ? '\n[stderr]\n' : '') + res.stderr;
              if (res.exitCode !== undefined) out += `\n[退出码: ${res.exitCode}]`;
              return out || '(无控制台输出)';
            }
            if (res.result !== undefined) {
              return typeof res.result === 'object' ? JSON.stringify(res.result, null, 2) : String(res.result);
            }
            return JSON.stringify(res, null, 2);
          }
          return String(res);
        };

        const timeline = document.createElement('div');
        timeline.className = 'ai-bubble-timeline';
        bubble.appendChild(timeline);

        const renderSingleToolBadge = (tc, explicitResult, container = timeline) => {
          const statusMap = msg.toolStatus || {};
          const st = statusMap[tc.id];
          const toolBadge = document.createElement('div');
          toolBadge.className = 'ai-tool-badge' + (st === 'denied' ? ' denied' : '');
          let label;
          if (st === 'denied') {
            label = `<span>✗ 已拒绝:</span> <strong>${escapeHtml(tc.function.name)}</strong>`;
          } else if (tc.function.name === 'dispatch_task_to_ai_ide') {
            let ideName = 'AI IDE';
            try {
              const args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
              if (args && args.target) ideName = args.target;
            } catch {}
            label = `<span>🚀 任务分派:</span> <strong>${escapeHtml(ideName)}</strong> ${st === 'approved' ? '(已批准)' : ''}`;
          } else if (tc.function.name.startsWith('mcp__Playwright__') || tc.function.name.startsWith('mcp__playwright__')) {
            const op = tc.function.name.replace(/^mcp__[Pp]laywright__/, '');
            label = `<span>🌐 Playwright 浏览器自动化:</span> <strong>${escapeHtml(op)}</strong> ${st === 'approved' ? '(已批准)' : ''}`;
          } else if (tc.function.name === 'list_available_ai_ides') {
            label = `<span>🔍 本地 AI 环境探测</span>`;
          } else if (st === 'approved') {
            label = `<span>✓ 已执行 (手动批准):</span> <strong>${escapeHtml(tc.function.name)}</strong>`;
          } else {
            label = `<span>🛠️ 工具调用:</span> <strong>${escapeHtml(tc.function.name)}</strong>`;
          }
          // Attach result if available
          let result = explicitResult !== undefined ? explicitResult : (msg.toolResults ? msg.toolResults[tc.id] : undefined);
          if (result === undefined && tc.result !== undefined) result = tc.result;
          if (result === undefined && currentSession && currentSession.messages) {
            const tm = currentSession.messages.find(m => m.role === 'tool' && m.tool_call_id === tc.id);
            if (tm) result = tm.content;
          }

          let resultHtml = '';
          if (result !== undefined && result !== null && st !== 'denied') {
            const formatted = formatToolResultForDisplay(result);
            const previewLen = formatted.length > 1024 ? `(${(formatted.length / 1024).toFixed(1)} KB)` : `(${formatted.length} 字符)`;
            resultHtml = `
              <details class="ai-tool-result-details">
                <summary class="ai-tool-result-summary">
                  <span>📋 查看执行结果</span>
                  <span style="opacity:0.6;font-size:10px;">${previewLen} ▾</span>
                </summary>
                <pre class="ai-tool-result-pre"><code>${escapeHtml(formatted)}</code></pre>
              </details>
            `;
          }

          toolBadge.innerHTML = `
            <div class="ai-tool-badge-head">
              <div class="ai-tool-badge-title">${label}</div>
            </div>
            ${resultHtml}
          `;
          (container || timeline || bubble).appendChild(toolBadge);
        };

        const renderSingleCotBox = (text, roundIdx = 0, totalSteps = 1, container = timeline) => {
          if (!text || !text.trim()) return;
          const cotBox = document.createElement('details');
          cotBox.className = 'ai-cot-box';
          cotBox.open = false;
          const title = totalSteps <= 1 ? '🧠 思考过程' : (roundIdx === 0 ? '🧠 思考过程' : `🧠 进一步思考 (第 ${roundIdx + 1} 步)`);
          cotBox.innerHTML = `
            <summary class="ai-cot-summary">
              <span>${title}</span>
            </summary>
            <div class="ai-cot-body">${escapeHtml(text)}</div>
          `;
          (container || timeline || bubble).appendChild(cotBox);
        };

        const renderSingleMdBlock = (text, roundIdx = 0, container = timeline) => {
          if (!text || !text.trim()) return;
          const mdBlock = document.createElement('div');
          mdBlock.className = 'ai-md-block ai-md-body';
          mdBlock.dataset.round = String(roundIdx);
          mdBlock.innerHTML = renderMarkdown(text);
          (container || timeline || bubble).appendChild(mdBlock);
        };

        const hasStepData = (Array.isArray(msg.reasoningSteps) && msg.reasoningSteps.length > 0) ||
                            (Array.isArray(msg.contentSteps) && msg.contentSteps.length > 0);

        if (hasStepData) {
          // Render strictly in chronological order by round: Cot -> Content -> Tools
          const allTools = Array.isArray(msg.toolCalls) ? [...msg.toolCalls] : [];
          const renderedToolIds = new Set();
          const rSteps = Array.isArray(msg.reasoningSteps) ? msg.reasoningSteps : [];
          const cSteps = Array.isArray(msg.contentSteps) ? msg.contentSteps : [];

          const rounds = Array.from(new Set([
            ...rSteps.map(s => s.round),
            ...cSteps.map(s => s.round),
            ...allTools.map(t => (t.round !== undefined ? t.round : 0))
          ])).sort((a, b) => a - b);

          let renderedAnyContent = false;
          rounds.forEach(r => {
            // 1. Thinking step
            const stepCot = rSteps.find(s => s.round === r);
            if (stepCot && stepCot.reasoning) {
              renderSingleCotBox(stepCot.reasoning, r, rSteps.length, timeline);
            }
            // 2. Content step for this round
            const stepContent = cSteps.find(s => s.round === r);
            if (stepContent && stepContent.content && stepContent.content.trim()) {
              renderSingleMdBlock(stepContent.content, r, timeline);
              renderedAnyContent = true;
            }
            // 3. Tool calls triggered in this round
            const stepTools = allTools.filter(t => (t.round === r || (t.round === undefined && r === 0)) && !renderedToolIds.has(t.id));
            stepTools.forEach(tc => {
              renderSingleToolBadge(tc, undefined, timeline);
              renderedToolIds.add(tc.id);
            });
          });
          // Render any leftover tools
          allTools.filter(t => !renderedToolIds.has(t.id)).forEach(tc => renderSingleToolBadge(tc, undefined, timeline));

          // If no contentSteps rendered, fallback to msg.content
          if (!renderedAnyContent && msg.content && msg.content.trim()) {
            renderSingleMdBlock(msg.content, rounds.length, timeline);
          }
        } else {
          // Fallback compatibility for legacy messages
          if (msg.reasoning) renderSingleCotBox(msg.reasoning, 0, 1, timeline);
          if (Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
            msg.toolCalls.forEach(tc => renderSingleToolBadge(tc, undefined, timeline));
          }
          if (msg.content && msg.content.trim()) {
            renderSingleMdBlock(msg.content, 0, timeline);
          }
        }

        let usageText = '';
        if (msg.usage) {
          usageText = `Prompt: ${msg.usage.promptTokens} · Output: ${msg.usage.completionTokens} · Total: ${msg.usage.totalTokens}`;
        }

        // Assistant toolbar: [复制回答] [重新生成] [删除] [用量] [时间]
        toolbar.innerHTML = `
          <button type="button" class="ai-msg-tool-btn btn-tool-copy" title="复制完整回答文本">
            <span>📋</span> <span>复制回答</span>
          </button>
          <button type="button" class="ai-msg-tool-btn btn-tool-regen" title="重新生成回复">
            <span>🔄</span> <span>重新生成</span>
          </button>
          <button type="button" class="ai-msg-tool-btn btn-tool-del" title="删除此消息">
            <span>🗑️</span> <span>删除</span>
          </button>
          <span class="ai-msg-meta ai-msg-usage">${usageText}</span>
          <span class="ai-msg-meta ai-msg-time">${timeStr}</span>
        `;
      }

      el.appendChild(bubble);
      el.appendChild(toolbar);

      // Event Listeners for unified toolbar
      const btnCopy = toolbar.querySelector('.btn-tool-copy');
      if (btnCopy) {
        btnCopy.addEventListener('click', async () => {
          const curMsg = (currentSession && currentSession.messages)
            ? (currentSession.messages.find(m => m.id === msg.id) || msg)
            : msg;
          const textToCopy = curMsg.content || '';
          await copyToClipboard(textToCopy);
          const origHtml = btnCopy.innerHTML;
          btnCopy.innerHTML = '<span>✓</span> <span>已复制</span>';
          btnCopy.classList.add('success');
          setTimeout(() => {
            btnCopy.innerHTML = origHtml;
            btnCopy.classList.remove('success');
          }, 1500);
        });
      }

      const btnDel = toolbar.querySelector('.btn-tool-del');
      if (btnDel) {
        btnDel.addEventListener('click', async () => {
          if (isGenerating && currentSession && generatingSessionId === currentSession.id) {
            alert('正在生成中…');
            return;
          }
          const res = await ctx.call('deleteMessage', { sessionId: currentSession.id, messageId: msg.id });
          if (res && res.ok) {
            currentSession = res.session;
            renderMessages();
            renderSessionsList();
          }
        });
      }

      const btnEdit = toolbar.querySelector('.btn-tool-edit');
      if (btnEdit) {
        btnEdit.addEventListener('click', () => {
          // Switch bubble to inline edit box
          bubble.innerHTML = `
            <div class="ai-edit-box">
              <textarea class="ai-edit-textarea">${escapeHtml(msg.content)}</textarea>
              <div class="ai-edit-actions">
                <button class="ai-edit-btn cancel">取消</button>
                <button class="ai-edit-btn primary save">保存并重新生成</button>
              </div>
            </div>
          `;
          const ta = bubble.querySelector('.ai-edit-textarea');
          ta.focus();
          bubble.querySelector('.cancel').addEventListener('click', () => renderMessages());
          bubble.querySelector('.save').addEventListener('click', () => {
            const val = ta.value.trim();
            if (val) {
              sendMessage(val, msg.id);
            }
          });
        });
      }

      const btnResend = toolbar.querySelector('.btn-tool-resend');
      if (btnResend) {
        btnResend.addEventListener('click', () => {
          sendMessage(msg.content, msg.id);
        });
      }

      const btnRegen = toolbar.querySelector('.btn-tool-regen');
      if (btnRegen) {
        btnRegen.addEventListener('click', () => {
          const idx = currentSession.messages.findIndex(m => m.id === msg.id);
          if (idx > 0) {
            const prevUserMsg = currentSession.messages[idx - 1];
            if (prevUserMsg && prevUserMsg.role === 'user') {
              sendMessage(prevUserMsg.content, prevUserMsg.id);
            }
          }
        });
      }

      // Code block copy buttons & Mermaid rendering
      initMessageDynamicElements(bubble, { renderMermaid: true });

      return el;
    }

    /* --- Send / Stop Message ---------------------------------------------- */
    function setGeneratingState(generating) {
      isGenerating = generating;
      if (generating) {
        btnSendOrStop.className = 'ai-btn-action stop';
        btnSendOrStop.title = '中断生成';
        btnSendOrStop.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>`;
      } else {
        btnSendOrStop.className = 'ai-btn-action send';
        btnSendOrStop.title = '发送消息';
        btnSendOrStop.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;
      }
    }

    async function sendMessage(customContent = null, editMessageId = null) {
      if (isGenerating) return;
      const text = customContent !== null ? customContent : chatInput.value.trim();
      if (!text || !currentSession) return;

      chatInput.value = '';
      autoResizeInput();
      setGeneratingState(true);
      scrollToBottom(true);

      const streamId = `stream_${Date.now()}`;
      currentStreamId = streamId;
      generatingSessionId = currentSession.id;
      const prevBuf = pendingLateChunks.get(currentSession.id);
      if (prevBuf) prevBuf.terminated = false;

      const res = await ctx.call('sendMessage', {
        sessionId: currentSession.id,
        content: text,
        editMessageId,
        streamId,
        enableReasoning: pillCot.classList.contains('active'),
        enableAgent: pillAgent.classList.contains('active'),
        agentApprovalMode: agentMode,
        thinkingLevel: pillCot.classList.contains('active') ? thinkLevel : 'auto'
      });

      if (!res || !res.ok) {
        setGeneratingState(false);
        alert(res ? res.error : '发送失败');
        return;
      }

      // Sync active session state and render
      const sRes = await ctx.call('getInitData');
      if (sRes && sRes.activeSession) {
        currentSession = sRes.activeSession;
        sessions = sRes.sessions || [];
        updateHeader();
        renderMessages();
        renderSessionsList();
      }
    }

    btnSendOrStop.addEventListener('click', () => {
      if (isGenerating && currentStreamId) {
        ctx.call('abortStream', { streamId: currentStreamId });
        setGeneratingState(false);
      } else {
        sendMessage();
      }
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return; // IME composition in progress
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    /* --- Stream Chunk Listener via IPC ------------------------------------ */
    function getLateChunkBuf(sessionId) {
      let buf = pendingLateChunks.get(sessionId);
      if (!buf) {
        buf = { approvals: [], terminated: false };
        pendingLateChunks.set(sessionId, buf);
      }
      return buf;
    }

    // Builds (once) and mounts the tool approval card. Shared by the live chunk
    // path and the late-chunk restore path so buffered approvals can be
    // re-rendered after a session switch. `onResolved` fires when the user
    // answers the card (used to drop it from the pending-late-chunks buffer).
    function appendApprovalCard(bubble, payload, chunk, onResolved) {
      let card = bubble ? bubble.querySelector(`.ai-tool-approval[data-approval="${chunk.toolId}"]`) : null;
      if (!card) {
        card = document.createElement('div');
        card.className = 'ai-tool-approval';
        card.dataset.approval = chunk.toolId;
        let argsPretty = chunk.args || '';
        try { argsPretty = JSON.stringify(JSON.parse(chunk.args), null, 2); } catch {}
        card.innerHTML = `
          <div class="ai-approval-head">
            <span class="ai-approval-ico">${chunk.toolName === 'dispatch_task_to_ai_ide' ? '🚀' : '🔐'}</span>
            <span>${chunk.toolName === 'dispatch_task_to_ai_ide' ? '请求派发任务至外部 AI IDE / CLI' : `请求执行工具 <strong>${escapeHtml(chunk.toolName)}</strong>`}</span>
          </div>
          <pre class="ai-approval-args">${escapeHtml(argsPretty)}</pre>
          <div class="ai-approval-actions">
            <button type="button" class="ai-approval-btn allow">✓ 允许执行</button>
            <button type="button" class="ai-approval-btn deny">✗ 拒绝</button>
            <button type="button" class="ai-approval-btn always">允许并记住（本会话）</button>
          </div>
        `;
        if (bubble) {
          const badge = bubble.querySelector(`.ai-tool-badge[data-tool="${chunk.toolId}"]`);
          if (badge) badge.insertAdjacentElement('afterend', card);
          else bubble.appendChild(card);
        }
        card.querySelectorAll('.ai-approval-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const approved = !btn.classList.contains('deny');
            const alwaysAllow = btn.classList.contains('always');
            card.querySelectorAll('.ai-approval-btn').forEach(b => { b.disabled = true; });
            ctx.call('resolveToolApproval', {
              streamId: payload.streamId || currentStreamId,
              toolCallId: chunk.toolId,
              approved,
              alwaysAllow
            });
            if (typeof onResolved === 'function') onResolved();
          });
        });
      }
      return card;
    }

    // Called after switching back to a session: re-mount approval cards that
    // arrived while another session was on screen, and clear stale generating
    // UI if that session's stream already terminated while hidden.
    function restorePendingLateChunks() {
      if (!currentSession) return;
      const buf = pendingLateChunks.get(currentSession.id);
      if (!buf) return;

      if (buf.terminated && generatingSessionId === currentSession.id) {
        generatingSessionId = null;
        if (isGenerating) setGeneratingState(false);
      }

      buf.approvals.forEach(p => {
        if (messagesScroll.querySelector(`.ai-tool-approval[data-approval="${p.chunk.toolId}"]`)) return;
        const msgEl = messagesScroll.querySelector(`.ai-msg[data-id="${p.messageId}"]`);
        const bubble = msgEl ? msgEl.querySelector('.ai-msg-bubble') : null;
        const card = appendApprovalCard(bubble, p, p.chunk, () => {
          const b = pendingLateChunks.get(p.sessionId);
          if (b) b.approvals = b.approvals.filter(ap => ap.chunk.toolId !== p.chunk.toolId);
        });
        if (!bubble) {
          // Originating message not in the list; show the card at the end.
          messagesScroll.appendChild(card);
        }
      });
      if (buf.approvals.length) scrollToBottom();
    }

    ctx.onEvent('stream-chunk', payload => {
      if (!payload || !payload.chunk) return;
      const { chunk, messageId } = payload;
      const isTerminal = chunk.type === 'complete' || chunk.type === 'aborted' || chunk.type === 'error';

      if (!currentSession || payload.sessionId !== currentSession.id) {
        // The chunk belongs to a session that is not on screen. Buffer it so
        // nothing is lost: the backend emits tool_approval_request exactly once
        // and waits forever, and a terminal chunk must still release the
        // composer lock of the session that is actually generating.
        const buf = getLateChunkBuf(payload.sessionId);
        if (chunk.type === 'tool_approval_request') buf.approvals.push(payload);
        if (isTerminal) buf.terminated = true;
        if (isTerminal && generatingSessionId === payload.sessionId) {
          generatingSessionId = null;
          if (isGenerating) setGeneratingState(false);
        }
        return;
      }

      if (isTerminal && generatingSessionId === payload.sessionId) generatingSessionId = null;

      // Task list updates render into the session-scoped card — resolve them
      // before the message-element lookup so a race with the placeholder mount
      // can never drop the update.
      if (chunk.type === 'task_list') {
        currentSession.taskList = Array.isArray(chunk.tasks) ? chunk.tasks : [];
        renderTaskCard();
        return;
      }

      let msgEl = null;
      if (messageId) {
        msgEl = messagesScroll.querySelector(`.ai-msg[data-id="${messageId}"]`);
        if (!msgEl) {
          // Message element not yet mounted, refresh messages
          const targetMsg = (currentSession.messages || []).find(m => m.id === messageId);
          if (targetMsg) {
            msgEl = createMessageElement(targetMsg);
            messagesScroll.appendChild(msgEl);
          }
        }
      } else if (chunk.type === 'mcp_error') {
        // mcp_error chunks carry no messageId: attach the notice to the
        // streaming assistant message if one is on screen.
        const bubbles = messagesScroll.querySelectorAll('.ai-msg.assistant .ai-msg-bubble');
        msgEl = bubbles.length ? bubbles[bubbles.length - 1].closest('.ai-msg') : null;
      }
      if (!msgEl) return;
      const bubble = msgEl.querySelector('.ai-msg-bubble');

      if (chunk.type === 'fallback') {
        let fbBadge = bubble.querySelector('.ai-msg-fallback-badge');
        if (!fbBadge) {
          fbBadge = document.createElement('div');
          fbBadge.className = 'ai-msg-fallback-badge';
          bubble.insertBefore(fbBadge, bubble.firstChild);
        }
        fbBadge.textContent = `⚠️ 主模型 [${chunk.fromModel}] 请求异常，已自动为您降级至 [${chunk.toModel}]`;
        const mdBody = bubble.querySelector('.ai-md-body');
        if (mdBody) mdBody.innerHTML = '';
        scrollToBottom();
      } else if (chunk.type === 'reasoning') {
        let timeline = bubble.querySelector('.ai-bubble-timeline');
        if (!timeline) {
          timeline = document.createElement('div');
          timeline.className = 'ai-bubble-timeline';
          const md = bubble.querySelector('.ai-md-body');
          if (md) bubble.insertBefore(timeline, md); else bubble.appendChild(timeline);
        }

        const round = typeof chunk.round === 'number' ? chunk.round : 0;
        let cotBox = timeline.querySelector(`.ai-cot-box[data-round="${round}"]`);
        if (!cotBox) {
          cotBox = document.createElement('details');
          cotBox.className = 'ai-cot-box';
          cotBox.dataset.round = String(round);
          cotBox.open = true;
          const title = round === 0 ? '🧠 思考中…' : `🧠 进一步思考 (第 ${round + 1} 步)…`;
          cotBox.innerHTML = `
            <summary class="ai-cot-summary">
              <span>${title}</span>
            </summary>
            <div class="ai-cot-body"></div>
          `;
          // Append chronologically to the timeline
          timeline.appendChild(cotBox);
        }
        const body = cotBox.querySelector('.ai-cot-body');
        if (body) body.textContent = chunk.reasoning;
        scrollToBottom();
      } else if (chunk.type === 'content') {
        let timeline = bubble.querySelector('.ai-bubble-timeline');
        if (!timeline) {
          timeline = document.createElement('div');
          timeline.className = 'ai-bubble-timeline';
          bubble.appendChild(timeline);
        }

        const round = typeof chunk.round === 'number' ? chunk.round : 0;
        const textToRender = (chunk.roundContent !== undefined) ? chunk.roundContent : chunk.content;

        let mdBlock = timeline.querySelector(`.ai-md-block[data-round="${round}"]`);
        if (!mdBlock) {
          mdBlock = document.createElement('div');
          mdBlock.className = 'ai-md-block ai-md-body';
          mdBlock.dataset.round = String(round);
          timeline.appendChild(mdBlock);
        }
        mdBlock.innerHTML = renderMarkdown(textToRender);
        initMessageDynamicElements(mdBlock, { renderMermaid: false });
        scrollToBottom();
      } else if (chunk.type === 'tool_calls') {
        let timeline = bubble.querySelector('.ai-bubble-timeline');
        if (!timeline) {
          timeline = document.createElement('div');
          timeline.className = 'ai-bubble-timeline';
          const md = bubble.querySelector('.ai-md-body');
          if (md) bubble.insertBefore(timeline, md); else bubble.appendChild(timeline);
        }

        // Close current in-progress thinking box when tools start
        const activeCot = timeline.querySelector('.ai-cot-box[open]');
        if (activeCot) {
          const sum = activeCot.querySelector('.ai-cot-summary span');
          const r = activeCot.dataset.round;
          if (sum) {
            const prefix = (r && Number(r) > 0) ? `🧠 进一步思考 (第 ${Number(r) + 1} 步)` : '🧠 思考过程';
            sum.textContent = `${prefix} (已完成)`;
          }
        }

        for (const tc of chunk.toolCalls) {
          if (!timeline.querySelector(`.ai-tool-badge[data-tool="${tc.id}"]`)) {
            const b = document.createElement('div');
            b.className = 'ai-tool-badge';
            b.dataset.tool = tc.id;
            let title = `<span>🛠️ 工具调用:</span> <strong>${escapeHtml(tc.function.name)}</strong> (参数就绪)`;
            if (tc.function.name === 'dispatch_task_to_ai_ide') {
              let ideName = 'AI IDE';
              try {
                const args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
                if (args && args.target) ideName = args.target;
              } catch {}
              title = `<span>🚀 任务分派:</span> <strong>${escapeHtml(ideName)}</strong> (准备中)`;
            } else if (tc.function.name === 'list_available_ai_ides') {
              title = `<span>🔍 探测本地 AI IDE/CLI:</span> (准备中)`;
            }
            b.innerHTML = title;
            // Append chronologically to timeline (directly below the thinking box)
            timeline.appendChild(b);
          }
        }
        scrollToBottom();
      } else if (chunk.type === 'tool_approval_request') {
        // Approval card: suspend execution until the user answers (tier: 每次确认/自动审核高危)
        let timeline = bubble.querySelector('.ai-bubble-timeline') || bubble;
        appendApprovalCard(timeline, payload, chunk, () => {
          const buf = pendingLateChunks.get(payload.sessionId);
          if (buf) buf.approvals = buf.approvals.filter(ap => ap.chunk.toolId !== chunk.toolId);
        });
        scrollToBottom();
      } else if (chunk.type === 'mcp_error') {
        // Backend-side MCP failure mid-stream: show a subdued inline notice.
        const note = document.createElement('div');
        note.style.color = 'var(--amber)';
        note.style.marginTop = '6px';
        note.style.fontSize = '11.5px';
        note.textContent = `⚠️ MCP 工具异常: ${chunk.message || '未知错误'}`;
        bubble.appendChild(note);
        scrollToBottom();
      } else if (chunk.type === 'tool_approval_result') {
        const card = bubble.querySelector(`.ai-tool-approval[data-approval="${chunk.toolId}"]`);
        if (card) {
          const actions = card.querySelector('.ai-approval-actions');
          if (actions) {
            const status = document.createElement('div');
            status.className = `ai-approval-status ${chunk.approved ? 'ok' : 'denied'}`;
            status.textContent = chunk.approved ? '✓ 已允许，正在执行…' : '✗ 已拒绝该工具调用';
            actions.replaceWith(status);
          }
        }
      } else if (chunk.type === 'tool_result') {
        const b = bubble.querySelector(`.ai-tool-badge[data-tool="${chunk.toolId}"]`);
        if (b) {
          let titleHtml = '';
          if (chunk.result && chunk.result.denied) {
            b.classList.add('denied');
            titleHtml = `<span>✗ 已拒绝:</span> <strong>${escapeHtml(chunk.toolName)}</strong>`;
          } else if (chunk.toolName === 'dispatch_task_to_ai_ide') {
            const res = chunk.result || {};
            const ide = res.targetName || res.target || '外部 AI';
            const mode = res.mode === 'headless' ? '批处理' : (res.mode === 'terminal' ? '终端' : 'IDE窗口');
            const state = res.ok ? '成功' : '失败';
            titleHtml = `<span>🚀 任务已派发至:</span> <strong>${escapeHtml(ide)}</strong> <span style="opacity:0.85">(${mode}·${state})</span>`;
          } else if (chunk.toolName.startsWith('mcp__Playwright__') || chunk.toolName.startsWith('mcp__playwright__')) {
            const op = chunk.toolName.replace(/^mcp__[Pp]laywright__/, '');
            titleHtml = `<span>🌐 Playwright 执行完成:</span> <strong>${escapeHtml(op)}</strong>`;
          } else if (chunk.toolName === 'list_available_ai_ides') {
            const count = (chunk.result && chunk.result.count !== undefined) ? chunk.result.count : 0;
            titleHtml = `<span>🔍 本地 AI 环境探测:</span> <strong>已找到 ${count} 个可用工具</strong>`;
          } else {
            titleHtml = `<span>✓ 工具已执行:</span> <strong>${escapeHtml(chunk.toolName)}</strong>`;
          }

          let detailsHtml = '';
          if (chunk.result && !chunk.result.denied) {
            const formatForDisplay = (res) => {
              if (res === null || res === undefined) return '(无执行结果)';
              if (typeof res === 'string') return res;
              if (typeof res === 'object') {
                if (Array.isArray(res.content)) {
                  const texts = res.content.map(c => (c && c.text) ? c.text : JSON.stringify(c)).filter(Boolean);
                  if (texts.length > 0) return texts.join('\n');
                }
                if (res.stdout !== undefined || res.stderr !== undefined) {
                  let out = '';
                  if (res.stdout) out += res.stdout;
                  if (res.stderr) out += (out ? '\n[stderr]\n' : '') + res.stderr;
                  if (res.exitCode !== undefined) out += `\n[退出码: ${res.exitCode}]`;
                  return out || '(无控制台输出)';
                }
                if (res.result !== undefined) {
                  return typeof res.result === 'object' ? JSON.stringify(res.result, null, 2) : String(res.result);
                }
                return JSON.stringify(res, null, 2);
              }
              return String(res);
            };
            const formatted = formatForDisplay(chunk.result);
            const previewLen = formatted.length > 1024 ? `(${(formatted.length / 1024).toFixed(1)} KB)` : `(${formatted.length} 字符)`;
            detailsHtml = `
              <details class="ai-tool-result-details">
                <summary class="ai-tool-result-summary">
                  <span>📋 查看执行结果</span>
                  <span style="opacity:0.6;font-size:10px;">${previewLen} ▾</span>
                </summary>
                <pre class="ai-tool-result-pre"><code>${escapeHtml(formatted)}</code></pre>
              </details>
            `;
          }

          b.innerHTML = `
            <div class="ai-tool-badge-head">
              <div class="ai-tool-badge-title">${titleHtml}</div>
            </div>
            ${detailsHtml}
          `;
        }
        scrollToBottom();
      } else if (chunk.type === 'usage') {
        let usageSpan = msgEl.querySelector('.ai-msg-usage');
        if (usageSpan) {
          usageSpan.textContent = `Prompt: ${chunk.usage.promptTokens} · Output: ${chunk.usage.completionTokens} · Total: ${chunk.usage.totalTokens}`;
        }
      } else if (chunk.type === 'complete' || chunk.type === 'aborted' || chunk.type === 'error') {
        setGeneratingState(false);
        initMessageDynamicElements(bubble, { renderMermaid: true });
        scrollToBottom();
        if (chunk.message && currentSession && currentSession.messages) {
          const m = currentSession.messages.find(x => x.id === messageId);
          if (m) {
            m.content = chunk.message.content || m.content;
            m.reasoning = chunk.message.reasoning || m.reasoning;
          }
        }
        const cotBoxes = bubble.querySelectorAll('.ai-cot-box');
        cotBoxes.forEach(cb => {
          const sum = cb.querySelector('.ai-cot-summary span');
          const r = cb.dataset.round;
          if (sum) {
            const prefix = (r && Number(r) > 0) ? `🧠 进一步思考 (第 ${Number(r) + 1} 步)` : '🧠 思考过程';
            sum.textContent = `${prefix} (已完成)`;
          }
        });
        if (chunk.sessionTotalTokens) {
          sessionUsageBadge.textContent = `${chunk.sessionTotalTokens.totalTokens.toLocaleString()} tokens`;
        }
        if (chunk.type === 'error') {
          const errDiv = document.createElement('div');
          errDiv.style.color = 'var(--red)';
          errDiv.style.marginTop = '6px';
          errDiv.textContent = `❌ ${chunk.error}`;
          bubble.appendChild(errDiv);
        }
      }
    });

    /* --- Settings Modal Controller ---------------------------------------- */
    PRESET_CHANNELS.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.textContent = ch.name;
      cfgChannel.appendChild(opt);
    });

    /* --- Settings Tabs (Model & Personas & Memory) --- */
    function switchSettingsTab(tabName) {
      tabNavModel.classList.toggle('active', tabName === 'model');
      tabNavPersonas.classList.toggle('active', tabName === 'personas');
      tabNavMemory.classList.toggle('active', tabName === 'memory');
      tabNavExt.classList.toggle('active', tabName === 'ext');
      paneModelSettings.classList.toggle('hidden', tabName !== 'model');
      panePersonasSettings.classList.toggle('hidden', tabName !== 'personas');
      paneMemorySettings.classList.toggle('hidden', tabName !== 'memory');
      paneExtSettings.classList.toggle('hidden', tabName !== 'ext');
      settingsModalFooter.style.display = tabName === 'model' ? 'flex' : 'none';
      if (tabName === 'personas') {
        closePersonaEditor();
        renderPersonasSettingsList();
      }
      if (tabName === 'memory') {
        closeMemoryEditor();
        renderMemoriesList();
      }
      if (tabName === 'ext') {
        closeMcpEditor();
        closeSkillEditor();
        renderMcpList();
        renderSkillsList();
      }
    }

    tabNavModel.addEventListener('click', () => switchSettingsTab('model'));
    tabNavPersonas.addEventListener('click', () => switchSettingsTab('personas'));
    tabNavMemory.addEventListener('click', () => switchSettingsTab('memory'));
    tabNavExt.addEventListener('click', () => switchSettingsTab('ext'));

    /* --- Memory Library Controller --- */
    const MEMORY_TYPE_LABELS = { fact: '事实', preference: '偏好', project: '项目' };

    function shortDirLabel(dir) {
      const parts = String(dir || '').replace(/\\/g, '/').split('/').filter(Boolean);
      return parts.length ? `…/${parts[parts.length - 1]}` : String(dir || '');
    }

    function renderMemoriesList() {
      memoriesCardList.innerHTML = '';
      const q = memorySearchKeyword.trim().toLowerCase();
      const filtered = q ? memories.filter(m => (m.content || '').toLowerCase().includes(q)) : memories;
      memoryCountBadge.textContent = `${memories.length} 条`;

      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'ai-model-empty-tip';
        empty.textContent = q ? `未找到匹配 "${q}" 的记忆` : '记忆库为空：可在对话中让助手「记住这个偏好」，或点右上角手动新建';
        memoriesCardList.appendChild(empty);
        return;
      }

      filtered.forEach(m => {
        const card = document.createElement('div');
        card.className = 'ai-memory-card';
        const scopeLabel = m.scope === 'global' ? '🌐 全局' : `📁 ${shortDirLabel(m.scope)}`;
        const typeLabel = MEMORY_TYPE_LABELS[m.type] || m.type;
        const time = new Date(m.updatedAt || Date.now()).toLocaleString();
        card.innerHTML = `
          <div class="ai-memory-card-head">
            <span class="ai-memory-scope">${escapeHtml(scopeLabel)}</span>
            <span class="ai-memory-type">${escapeHtml(typeLabel)}</span>
            ${m.source === 'agent' ? '<span class="ai-memory-src" title="由 Agent 自主写入">🤖</span>' : ''}
            <span class="ai-memory-actions">
              <button type="button" class="ai-persona-card-btn edit" title="编辑">✏️</button>
              <button type="button" class="ai-persona-card-btn del" title="删除">🗑️</button>
            </span>
          </div>
          <div class="ai-memory-content">${escapeHtml(m.content)}</div>
          <div class="ai-memory-meta">${escapeHtml(time)}</div>
        `;
        card.querySelector('.ai-memory-actions .edit').addEventListener('click', () => openMemoryEditor(m));
        card.querySelector('.ai-memory-actions .del').addEventListener('click', async () => {
          if (!confirm('删除这条记忆？')) return;
          const res = await ctx.call('deleteMemory', { id: m.id });
          if (res && res.ok) {
            memories = res.memories;
            renderMemoriesList();
          }
        });
        memoriesCardList.appendChild(card);
      });
    }

    function openMemoryEditor(m) {
      editingMemoryId = m ? m.id : null;
      memoryEditTitle.textContent = m ? '编辑记忆' : '新建记忆';
      inputMemoryContent.value = m ? m.content : '';
      selectMemoryScope.value = m && m.scope !== 'global' ? 'project' : 'global';
      selectMemoryType.value = m ? (m.type || 'fact') : 'fact';
      memoryEditPanel.classList.remove('hidden');
    }

    function closeMemoryEditor() {
      editingMemoryId = null;
      memoryEditPanel.classList.add('hidden');
    }

    btnCreateMemory.addEventListener('click', () => openMemoryEditor(null));
    btnCloseMemoryEdit.addEventListener('click', closeMemoryEditor);
    btnCancelMemoryEdit.addEventListener('click', closeMemoryEditor);
    inputSearchMemories.addEventListener('input', () => {
      memorySearchKeyword = inputSearchMemories.value;
      renderMemoriesList();
    });

    btnSaveMemoryEdit.addEventListener('click', async () => {
      const content = inputMemoryContent.value.trim();
      if (!content) { alert('记忆内容不能为空'); return; }
      let scope = 'global';
      if (selectMemoryScope.value === 'project') {
        scope = (currentSession && currentSession.workDir) || config.agentWorkDir || '';
        if (!scope) {
          alert('当前没有可用的项目工作目录：请先在会话顶栏 📁 设置工作目录');
          return;
        }
      }
      const res = await ctx.call('saveMemory', {
        id: editingMemoryId || undefined,
        content,
        type: selectMemoryType.value,
        scope
      });
      if (res && res.ok) {
        memories = res.memories;
        closeMemoryEditor();
        renderMemoriesList();
      } else {
        alert(`保存失败: ${(res && res.error) || '未知错误'}`);
      }
    });

    /* --- Personas Management Controller --- */
    function renderPersonasSettingsList() {
      personasCardList.innerHTML = '';
      const q = personaSearchKeyword.trim().toLowerCase();
      const filtered = q
        ? personas.filter(p => (p.title || '').toLowerCase().includes(q) || (p.prompt || '').toLowerCase().includes(q))
        : personas;

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / personaPageSize));
      if (personaCurrentPage > totalPages) personaCurrentPage = totalPages;
      if (personaCurrentPage < 1) personaCurrentPage = 1;

      personaPageInfo.textContent = `第 ${personaCurrentPage} / ${totalPages} 页 (共 ${total} 项)`;
      btnPrevPersonaPage.disabled = personaCurrentPage <= 1;
      btnNextPersonaPage.disabled = personaCurrentPage >= totalPages;

      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'ai-model-empty-tip';
        empty.textContent = q ? `未找到匹配 "${q}" 的人设卡片` : '暂无人设卡片，点击右上角新建';
        personasCardList.appendChild(empty);
        return;
      }

      const start = (personaCurrentPage - 1) * personaPageSize;
      const pageItems = filtered.slice(start, start + personaPageSize);

      pageItems.forEach(p => {
        const card = document.createElement('div');
        card.className = 'ai-persona-card';
        card.innerHTML = `
          <div class="ai-persona-card-header">
            <div class="ai-persona-card-info">
              <span class="ai-persona-card-icon">${escapeHtml(p.icon || '✨')}</span>
              <span class="ai-persona-card-title">${escapeHtml(p.title || '未命名')}</span>
              <span class="ai-persona-card-temp">T: ${escapeHtml(p.temperature ?? 0.7)}</span>
            </div>
            <div class="ai-persona-card-btns">
              <button type="button" class="ai-persona-card-btn edit" data-id="${p.id}" title="编辑人设">✏️ 编辑</button>
              <button type="button" class="ai-persona-card-btn del" data-id="${p.id}" title="删除人设">🗑️ 删除</button>
            </div>
          </div>
          <div class="ai-persona-card-prompt">${escapeHtml(p.prompt || '(未设置提示词)')}</div>
        `;

        card.querySelector('.ai-persona-card-btn.edit').addEventListener('click', () => {
          openPersonaEditor(p);
        });

        card.querySelector('.ai-persona-card-btn.del').addEventListener('click', async () => {
          if (personas.length <= 1) {
            alert('必须保留至少一个人设角色，无法删除');
            return;
          }
          if (!confirm(`确定要删除人设「${p.title}」吗？`)) return;
          const res = await ctx.call('deletePersona', { id: p.id });
          if (res && res.ok) {
            personas = res.personas;
            renderPersonas();
            renderPersonasSettingsList();
          } else {
            alert(`删除失败: ${(res && res.error) || '未知错误'}`);
          }
        });

        personasCardList.appendChild(card);
      });
    }

    inputSearchPersonas.addEventListener('input', () => {
      personaSearchKeyword = inputSearchPersonas.value;
      personaCurrentPage = 1;
      renderPersonasSettingsList();
    });

    btnPrevPersonaPage.addEventListener('click', () => {
      if (personaCurrentPage > 1) {
        personaCurrentPage--;
        renderPersonasSettingsList();
      }
    });

    btnNextPersonaPage.addEventListener('click', () => {
      personaCurrentPage++;
      renderPersonasSettingsList();
    });

    function openPersonaEditor(p) {
      if (p) {
        editingPersonaId = p.id;
        personaEditTitle.textContent = `编辑人设: ${p.title}`;
        inputPersonaTitle.value = p.title || '';
        inputPersonaIcon.value = p.icon || '✨';
        personaTempRange.value = p.temperature ?? 0.7;
        personaTempVal.textContent = p.temperature ?? 0.7;
        inputPersonaPrompt.value = p.prompt || '';
      } else {
        editingPersonaId = null;
        personaEditTitle.textContent = '新建人设卡片';
        inputPersonaTitle.value = '';
        inputPersonaIcon.value = '✨';
        personaTempRange.value = 0.7;
        personaTempVal.textContent = '0.7';
        inputPersonaPrompt.value = '';
      }
      personasCardList.classList.add('hidden');
      personasPagination.classList.add('hidden');
      personaEditPanel.classList.remove('hidden');
      inputPersonaTitle.focus();
    }

    function closePersonaEditor() {
      personaEditPanel.classList.add('hidden');
      personasCardList.classList.remove('hidden');
      personasPagination.classList.remove('hidden');
      editingPersonaId = null;
    }

    btnClosePersonaEdit.addEventListener('click', closePersonaEditor);
    btnCancelPersonaEdit.addEventListener('click', closePersonaEditor);

    personaTempRange.addEventListener('input', () => {
      personaTempVal.textContent = personaTempRange.value;
    });

    quickEmojiList.querySelectorAll('.ai-emoji-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        inputPersonaIcon.value = pill.dataset.emoji;
      });
    });

    btnCreatePersona.addEventListener('click', () => {
      openPersonaEditor(null);
    });

    btnResetPersonas.addEventListener('click', async () => {
      if (!confirm('确定要恢复默认的人设卡片吗？自定义新增的人设将被重置。')) return;
      const res = await ctx.call('resetPersonas');
      if (res && res.ok) {
        personas = res.personas;
        closePersonaEditor();
        renderPersonas();
        renderPersonasSettingsList();
      }
    });

    btnSavePersona.addEventListener('click', async () => {
      const title = inputPersonaTitle.value.trim();
      if (!title) {
        alert('请输入人设标题');
        inputPersonaTitle.focus();
        return;
      }
      const patch = {
        id: editingPersonaId,
        title,
        icon: inputPersonaIcon.value.trim() || '✨',
        temperature: Number(personaTempRange.value),
        prompt: inputPersonaPrompt.value.trim()
      };
      const res = await ctx.call('savePersona', patch);
      if (res && res.ok) {
        personas = res.personas;
        closePersonaEditor();
        renderPersonas();
        renderPersonasSettingsList();
      } else {
        alert(`保存失败: ${(res && res.error) || '未知错误'}`);
      }
    });

    /* --- MCP Servers Controller ------------------------------------------- */
    function mcpTargetText(s) {
      if (s.transport === 'http') return s.url || '';
      return [s.command, ...(s.args || [])].filter(Boolean).join(' ');
    }

    function renderMcpList() {
      mcpServerList.innerHTML = '';
      if (!mcpServers.length) {
        const empty = document.createElement('div');
        empty.className = 'ai-model-empty-tip';
        empty.textContent = '尚未配置 MCP 服务器，点击右上角添加（如 npx -y @modelcontextprotocol/server-filesystem）';
        mcpServerList.appendChild(empty);
        return;
      }
      mcpServers.forEach(s => {
        const card = document.createElement('div');
        card.className = 'ai-mcp-card';
        card.innerHTML = `
          <div class="ai-mcp-card-head">
            <span class="ai-mcp-ico">${s.transport === 'http' ? '🌐' : '🖥️'}</span>
            <div class="ai-mcp-card-info">
              <span class="ai-mcp-name">${escapeHtml(s.name)}${(s.isPreset || s.id === 'preset-playwright') ? ' <span class="ai-preset-tag">内置</span>' : ''}</span>
              <span class="ai-mcp-target" title="${escapeHtml(s.desc || mcpTargetText(s))}">${escapeHtml(mcpTargetText(s))}</span>
            </div>
            <span class="ai-mcp-badge ${s.enabled === false ? 'off' : ''}">${s.enabled === false ? '已停用' : '已启用'}</span>
            <div class="ai-persona-card-btns">
              <button type="button" class="ai-persona-card-btn edit">✏️ 编辑</button>
              <button type="button" class="ai-persona-card-btn del">🗑️ 删除</button>
            </div>
          </div>
        `;
        card.querySelector('.edit').addEventListener('click', () => openMcpEditor(s));
        card.querySelector('.del').addEventListener('click', async () => {
          if (!confirm(`确定删除 MCP 服务器「${s.name}」吗？`)) return;
          const res = await ctx.call('deleteMcpServer', { id: s.id });
          if (res && res.ok) {
            mcpServers = res.mcpServers;
            renderMcpList();
          }
        });
        mcpServerList.appendChild(card);
      });
    }

    function syncMcpTransportGroups() {
      const isHttp = selectMcpTransport.value === 'http';
      grpMcpCommand.classList.toggle('hidden', isHttp);
      grpMcpArgs.classList.toggle('hidden', isHttp);
      grpMcpEnv.classList.toggle('hidden', isHttp);
      grpMcpUrl.classList.toggle('hidden', !isHttp);
      grpMcpApiKey.classList.toggle('hidden', !isHttp);
    }

    function parseKeyValueLines(text) {
      const env = {};
      String(text || '').split(/\r?\n/).forEach(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return;
        const eq = t.indexOf('=');
        if (eq > 0) env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
      });
      return env;
    }

    function buildMcpFormCfg(withId) {
      return {
        ...(withId && editingMcpId ? { id: editingMcpId } : {}),
        name: inputMcpName.value.trim(),
        transport: selectMcpTransport.value,
        command: inputMcpCommand.value.trim(),
        args: inputMcpArgs.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean),
        env: parseKeyValueLines(inputMcpEnv.value),
        url: inputMcpUrl.value.trim(),
        apiKey: inputMcpApiKey.value.trim(),
        enabled: chkMcpEnabled.checked
      };
    }

    function openMcpEditor(s) {
      editingMcpId = s ? s.id : null;
      mcpEditTitle.textContent = s ? `编辑服务器: ${s.name}` : '添加 MCP 服务器';
      inputMcpName.value = s ? s.name : '';
      selectMcpTransport.value = s ? (s.transport || 'stdio') : 'stdio';
      inputMcpCommand.value = s ? (s.command || '') : '';
      inputMcpArgs.value = s ? (s.args || []).join('\n') : '';
      inputMcpEnv.value = s ? Object.entries(s.env || {}).map(([k, v]) => `${k}=${v}`).join('\n') : '';
      inputMcpUrl.value = s ? (s.url || '') : '';
      inputMcpApiKey.value = s ? (s.apiKey || '') : '';
      chkMcpEnabled.checked = s ? s.enabled !== false : true;
      mcpTestResult.textContent = '';
      mcpTestResult.className = 'ai-ext-test-result';
      syncMcpTransportGroups();
      if (mcpMarketPanel) mcpMarketPanel.classList.add('hidden');
      mcpServerList.classList.add('hidden');
      mcpEditPanel.classList.remove('hidden');
      inputMcpName.focus();
    }

    function closeMcpEditor() {
      mcpEditPanel.classList.add('hidden');
      mcpServerList.classList.remove('hidden');
      editingMcpId = null;
    }

    btnCreateMcp.addEventListener('click', () => openMcpEditor(null));
    btnCloseMcpEdit.addEventListener('click', closeMcpEditor);
    btnCancelMcpEdit.addEventListener('click', closeMcpEditor);
    selectMcpTransport.addEventListener('change', syncMcpTransportGroups);

    btnTestMcp.addEventListener('click', async () => {
      if (!inputMcpName.value.trim()) {
        mcpTestResult.textContent = '请先填写服务器名称';
        mcpTestResult.className = 'ai-ext-test-result err';
        return;
      }
      btnTestMcp.disabled = true;
      mcpTestResult.textContent = '连接中…';
      mcpTestResult.className = 'ai-ext-test-result';
      try {
        const res = await ctx.call('testMcpServer', { server: buildMcpFormCfg(true) });
        if (res && res.ok) {
          mcpTestResult.textContent = `✓ 连接成功，发现 ${res.toolCount} 个工具: ${(res.tools || []).slice(0, 6).join(', ')}${res.toolCount > 6 ? ' …' : ''}`;
          mcpTestResult.className = 'ai-ext-test-result ok';
        } else {
          mcpTestResult.textContent = `✗ 连接失败: ${(res && res.error) || '未知错误'}`;
          mcpTestResult.className = 'ai-ext-test-result err';
        }
      } finally {
        btnTestMcp.disabled = false;
      }
    });

    btnSaveMcp.addEventListener('click', async () => {
      const res = await ctx.call('saveMcpServer', { server: buildMcpFormCfg(true) });
      if (res && res.ok) {
        mcpServers = res.mcpServers;
        closeMcpEditor();
        renderMcpList();
      } else {
        alert(`保存失败: ${(res && res.error) || '未知错误'}`);
      }
    });

    /* --- MCP Market Controller ---------------------------------------------- */
    let marketActiveCategory = 'all';
    let marketSearchQuery = '';

    async function loadAndRenderMcpMarket() {
      marketServerList.innerHTML = '<div class="ai-model-empty-tip">正在加载 MCP 市场…</div>';
      try {
        const res = await ctx.call('getMcpMarket', { query: marketSearchQuery, category: marketActiveCategory });
        if (!res || !res.ok) {
          marketServerList.innerHTML = `<div class="ai-model-empty-tip">加载市场失败: ${(res && res.error) || '未知错误'}</div>`;
          return;
        }

        // Render categories
        marketCategoriesBar.innerHTML = '';
        (res.categories || []).forEach(cat => {
          const catBtn = document.createElement('button');
          catBtn.type = 'button';
          catBtn.className = 'ai-market-cat-btn' + (marketActiveCategory === cat.id ? ' active' : '');
          catBtn.textContent = cat.label;
          catBtn.addEventListener('click', () => {
            marketActiveCategory = cat.id;
            loadAndRenderMcpMarket();
          });
          marketCategoriesBar.appendChild(catBtn);
        });

        // Render market items
        marketServerList.innerHTML = '';
        const items = res.items || [];
        if (items.length === 0) {
          marketServerList.innerHTML = '<div class="ai-model-empty-tip">未找到匹配的 MCP 服务</div>';
          return;
        }

        const catIcons = {
          browser: '🌐',
          dev: '💻',
          search: '🔍',
          data: '🗄️',
          system: '⚙️'
        };

        items.forEach(item => {
          const card = document.createElement('div');
          card.className = 'ai-market-card';
          const cmdPreview = `${item.command} ${(item.args || []).join(' ')}`;
          card.innerHTML = `
            <div class="ai-market-card-top">
              <div class="ai-market-info-col">
                <span class="ai-market-card-ico">${catIcons[item.category] || '🔌'}</span>
                <div class="ai-market-name-row">
                  <span class="ai-market-card-name">${escapeHtml(item.name)}</span>
                  ${item.official ? '<span class="ai-market-official-badge">Official</span>' : '<span class="ai-market-community-badge">Community</span>'}
                  ${item.repoUrl ? '<a href="#" class="ai-market-repo-link" title="在 GitHub 查看">GitHub ↗</a>' : ''}
                </div>
              </div>
              <button type="button" class="ai-market-btn ${item.installed ? 'installed' : 'install'}" ${item.installed ? 'disabled' : ''}>
                ${item.installed ? '✓ 已添加' : '+ 一键安装'}
              </button>
            </div>
            <div class="ai-market-card-desc">${escapeHtml(item.desc || '')}</div>
            <div class="ai-market-card-cmd" title="启动命令预览">${escapeHtml(cmdPreview)}</div>
          `;

          if (item.repoUrl) {
            const link = card.querySelector('.ai-market-repo-link');
            if (link) {
              link.addEventListener('click', e => {
                e.preventDefault();
                if (window.Toolbox && window.Toolbox.openExternal) {
                  window.Toolbox.openExternal(item.repoUrl);
                } else {
                  window.open(item.repoUrl, '_blank');
                }
              });
            }
          }

          const btn = card.querySelector('.ai-market-btn.install');
          if (btn) {
            btn.addEventListener('click', async () => {
              btn.disabled = true;
              btn.textContent = '安装中…';
              try {
                const addRes = await ctx.call('installMarketMcp', { marketId: item.id });
                if (addRes && addRes.ok) {
                  mcpServers = addRes.mcpServers;
                  btn.className = 'ai-market-btn installed';
                  btn.textContent = '✓ 已添加';
                  renderMcpList();
                } else {
                  alert(`安装失败: ${(addRes && addRes.error) || '未知错误'}`);
                  btn.disabled = false;
                  btn.textContent = '+ 一键安装';
                }
              } catch (e) {
                alert(`安装出错: ${e.message}`);
                btn.disabled = false;
                btn.textContent = '+ 一键安装';
              }
            });
          }

          marketServerList.appendChild(card);
        });
      } catch (err) {
        marketServerList.innerHTML = `<div class="ai-model-empty-tip">市场加载异常: ${err.message}</div>`;
      }
    }

    function openMcpMarket() {
      mcpEditPanel.classList.add('hidden');
      mcpServerList.classList.add('hidden');
      mcpMarketPanel.classList.remove('hidden');
      loadAndRenderMcpMarket();
    }

    function closeMcpMarket() {
      mcpMarketPanel.classList.add('hidden');
      mcpServerList.classList.remove('hidden');
    }

    if (btnOpenMcpMarket) btnOpenMcpMarket.addEventListener('click', openMcpMarket);
    if (btnCloseMcpMarket) btnCloseMcpMarket.addEventListener('click', closeMcpMarket);

    let marketSearchTimer = null;
    if (inputMarketSearch) {
      inputMarketSearch.addEventListener('input', e => {
        clearTimeout(marketSearchTimer);
        marketSearchTimer = setTimeout(() => {
          marketSearchQuery = e.target.value.trim();
          loadAndRenderMcpMarket();
        }, 200);
      });
    }

    if (btnResetMcp) {
      btnResetMcp.addEventListener('click', async () => {
        if (!confirm('确定将 MCP 服务器恢复为内置默认预设（含官方 Playwright）吗？')) return;
        const res = await ctx.call('resetMcpServers');
        if (res && res.ok) {
          mcpServers = res.mcpServers;
          renderMcpList();
        }
      });
    }

    /* --- Skills Controller (search + pagination + import) ------------------- */
    function renderSkillsList() {
      skillsCardList.innerHTML = '';
      const q = skillSearchKeyword.trim().toLowerCase();
      const filtered = q
        ? skills.filter(sk => (sk.name || '').toLowerCase().includes(q) || (sk.desc || '').toLowerCase().includes(q))
        : skills;

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / skillPageSize));
      if (skillCurrentPage > totalPages) skillCurrentPage = totalPages;
      if (skillCurrentPage < 1) skillCurrentPage = 1;

      skillPageInfo.textContent = `第 ${skillCurrentPage} / ${totalPages} 页 (共 ${total} 项)`;
      btnPrevSkillPage.disabled = skillCurrentPage <= 1;
      btnNextSkillPage.disabled = skillCurrentPage >= totalPages;

      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'ai-model-empty-tip';
        empty.textContent = q ? `未找到匹配 "${q}" 的技能` : '暂无技能，点击右上角新建、下载导入或恢复默认';
        skillsCardList.appendChild(empty);
        return;
      }

      const start = (skillCurrentPage - 1) * skillPageSize;
      filtered.slice(start, start + skillPageSize).forEach(sk => {
        const card = document.createElement('div');
        card.className = 'ai-skill-card';
        card.innerHTML = `
          <div class="ai-mcp-card-head">
            <span class="ai-mcp-ico">🧠</span>
            <div class="ai-mcp-card-info">
              <span class="ai-mcp-name" title="${escapeHtml(sk.source || '内置 / 手动创建')}">${escapeHtml(sk.name)}</span>
              <span class="ai-mcp-target" title="${escapeHtml(sk.desc || '')}">${escapeHtml(sk.desc || '(未设置简介)')}</span>
            </div>
            <div class="ai-persona-card-btns">
              <button type="button" class="ai-persona-card-btn edit">✏️ 编辑</button>
              <button type="button" class="ai-persona-card-btn del">🗑️ 删除</button>
            </div>
          </div>
        `;
        card.querySelector('.edit').addEventListener('click', () => {
          editingSkillId = sk.id;
          skillEditTitle.textContent = `编辑技能: ${sk.name}`;
          inputSkillName.value = sk.name || '';
          inputSkillDesc.value = sk.desc || '';
          inputSkillContent.value = sk.content || '';
          skillsCardList.classList.add('hidden');
          skillEditPanel.classList.remove('hidden');
          inputSkillName.focus();
        });
        card.querySelector('.del').addEventListener('click', async () => {
          if (!confirm(`确定删除技能「${sk.name}」吗？`)) return;
          const res = await ctx.call('deleteSkill', { id: sk.id });
          if (res && res.ok) {
            skills = res.skills;
            renderSkillsList();
          }
        });
        skillsCardList.appendChild(card);
      });
    }

    let skillImportResultTimer = null;
    function showSkillImportResult(text, cls) {
      clearTimeout(skillImportResultTimer);
      skillImportResult.textContent = text;
      skillImportResult.className = `ai-ext-import-result ${cls || ''}`;
      if (cls === 'ok') {
        skillImportResultTimer = setTimeout(() => skillImportResult.classList.add('hidden'), 6000);
      }
    }

    // one-line summary shared by URL / file / folder imports
    function describeImportResult(prefix, res) {
      let t = `✓ ${prefix}：新增 ${res.imported} 个`;
      if (Array.isArray(res.names) && res.names.length) t += `（${res.names.join('、')}）`;
      if (res.skipped) t += `，跳过同名 ${res.skipped} 个`;
      if (res.failed) t += `，下载失败 ${res.failed} 个`;
      if (res.overflow) t += `，超出数量上限 ${res.overflow} 个未下载`;
      if (res.truncated) t += '（仓库过大，扫描结果可能不完整）';
      return t;
    }

    inputSearchSkills.addEventListener('input', () => {
      skillSearchKeyword = inputSearchSkills.value;
      skillCurrentPage = 1;
      renderSkillsList();
    });

    btnPrevSkillPage.addEventListener('click', () => {
      if (skillCurrentPage > 1) {
        skillCurrentPage--;
        renderSkillsList();
      }
    });

    btnNextSkillPage.addEventListener('click', () => {
      skillCurrentPage++;
      renderSkillsList();
    });

    btnImportSkillUrl.addEventListener('click', async () => {
      const url = inputSkillUrl.value.trim();
      if (!url) {
        showSkillImportResult('请先粘贴技能链接 (GitHub 文件 / 目录 / 仓库主页，或任意 .md 地址)', 'err');
        inputSkillUrl.focus();
        return;
      }
      btnImportSkillUrl.disabled = true;
      showSkillImportResult('⬇ 下载中，请稍候…', '');
      try {
        const res = await ctx.call('importSkillFromUrl', { url });
        if (res && res.ok) {
          skills = res.skills;
          skillCurrentPage = 1;
          renderSkillsList();
          showSkillImportResult(describeImportResult('导入完成', res), 'ok');
          if (res.imported > 0) inputSkillUrl.value = '';
        } else {
          showSkillImportResult(`✗ ${(res && res.error) || '导入失败'}`, 'err');
        }
      } finally {
        btnImportSkillUrl.disabled = false;
      }
    });

    btnImportSkillFile.addEventListener('click', () => inputSkillFile.click());
    // f.text() always decodes UTF-8, which turns GBK-encoded .txt files into
    // mojibake (U+FFFD). Try UTF-8 first; if it contains replacement
    // characters, retry as GBK and prefer whichever decodes cleanly
    // (UTF-8 wins ties). .md/.markdown are UTF-8 by convention.
    async function readSkillFileText(f) {
      if (!/\.txt$/i.test(f.name)) return f.text();
      const buf = await f.arrayBuffer();
      const utf8 = new TextDecoder('utf-8').decode(buf);
      if (!utf8.includes('\uFFFD')) return utf8;
      try {
        const gbk = new TextDecoder('gbk').decode(buf);
        if (!gbk.includes('\uFFFD')) return gbk;
      } catch {}
      return utf8;
    }
    inputSkillFile.addEventListener('change', async () => {
      const files = [...(inputSkillFile.files || [])];
      inputSkillFile.value = '';
      if (!files.length) return;
      showSkillImportResult(`📂 读取 ${files.length} 个文件中…`, '');
      try {
        const items = [];
        for (const f of files) {
          items.push({ filename: f.name, content: await readSkillFileText(f) });
        }
        const res = await ctx.call('importSkills', { items });
        if (res && res.ok) {
          skills = res.skills;
          skillCurrentPage = 1;
          renderSkillsList();
          showSkillImportResult(describeImportResult('本地导入完成', res), 'ok');
        } else {
          showSkillImportResult(`✗ ${(res && res.error) || '导入失败'}`, 'err');
        }
      } catch (err) {
        showSkillImportResult(`✗ 读取文件失败: ${err.message || err}`, 'err');
      }
    });

    // folder pick: group by path first (SKILL.md dirs win; plain docs only as
    // fallback), then read just the chosen files
    btnImportSkillFolder.addEventListener('click', () => inputSkillFolder.click());
    inputSkillFolder.addEventListener('change', async () => {
      const files = [...(inputSkillFolder.files || [])];
      inputSkillFolder.value = '';
      if (!files.length) return;
      try {
        const mdFiles = files.filter(f => /\.(md|markdown|txt)$/i.test(f.name));
        if (!mdFiles.length) {
          showSkillImportResult('✗ 所选文件夹中没有 .md / .txt 文件', 'err');
          return;
        }
        const byPath = new Map(mdFiles.map(f => [f.webkitRelativePath || f.name, f]));
        const pick = await ctx.call('pickLocalSkillFiles', { paths: [...byPath.keys()] });
        const chosen = (pick && pick.skills && pick.skills.length) ? pick.skills : (pick && pick.fallback) || [];
        if (!chosen.length) {
          showSkillImportResult('✗ 未找到 SKILL.md（标准技能为 <技能名>/SKILL.md 结构），也没有可导入的普通 .md 文档', 'err');
          return;
        }
        showSkillImportResult(`📂 读取 ${chosen.length} 个文件中…`, '');
        const items = [];
        for (const p of chosen) {
          const f = byPath.get(p);
          if (f) items.push({ filename: p, content: await readSkillFileText(f) });
        }
        const res = await ctx.call('importSkills', { items });
        if (res && res.ok) {
          skills = res.skills;
          skillCurrentPage = 1;
          renderSkillsList();
          showSkillImportResult(describeImportResult(pick.skills.length ? '文件夹技能导入完成' : '文件夹导入完成', res), 'ok');
        } else {
          showSkillImportResult(`✗ ${(res && res.error) || '导入失败'}`, 'err');
        }
      } catch (err) {
        showSkillImportResult(`✗ 读取文件夹失败: ${err.message || err}`, 'err');
      }
    });

    function closeSkillEditor() {
      skillEditPanel.classList.add('hidden');
      skillsCardList.classList.remove('hidden');
      editingSkillId = null;
    }

    btnCreateSkill.addEventListener('click', () => {
      editingSkillId = null;
      skillEditTitle.textContent = '新建技能';
      inputSkillName.value = '';
      inputSkillDesc.value = '';
      inputSkillContent.value = '';
      skillsCardList.classList.add('hidden');
      skillEditPanel.classList.remove('hidden');
      inputSkillName.focus();
    });
    btnCloseSkillEdit.addEventListener('click', closeSkillEditor);
    btnCancelSkillEdit.addEventListener('click', closeSkillEditor);

    btnResetSkills.addEventListener('click', async () => {
      if (!confirm('确定恢复内置默认技能吗？当前全部技能（含自定义）将被重置为内置默认。')) return;
      const res = await ctx.call('resetSkills');
      if (res && res.ok) {
        skills = res.skills;
        closeSkillEditor();
        renderSkillsList();
      }
    });

    btnSaveSkill.addEventListener('click', async () => {
      const name = inputSkillName.value.trim();
      const content = inputSkillContent.value.trim();
      if (!name) { alert('请输入技能名称'); inputSkillName.focus(); return; }
      if (!content) { alert('请输入技能内容'); inputSkillContent.focus(); return; }
      const res = await ctx.call('saveSkill', {
        id: editingSkillId,
        name,
        desc: inputSkillDesc.value.trim(),
        content
      });
      if (res && res.ok) {
        skills = res.skills;
        closeSkillEditor();
        renderSkillsList();
      } else {
        alert(`保存失败: ${(res && res.error) || '未知错误'}`);
      }
    });

    function getAllPresetModels() {
      const all = [];
      const seen = new Set();
      const currCh = PRESET_CHANNELS.find(x => x.id === cfgChannel.value);
      if (currCh && currCh.models) {
        currCh.models.forEach(m => {
          if (!seen.has(m)) {
            seen.add(m);
            all.push({ id: m, badge: currCh.name.split(' ')[0], channelId: currCh.id, isRemote: false });
          }
        });
      }
      PRESET_CHANNELS.forEach(ch => {
        if (ch.id === cfgChannel.value) return;
        (ch.models || []).forEach(m => {
          if (!seen.has(m)) {
            seen.add(m);
            all.push({ id: m, badge: ch.name.split(' ')[0], channelId: ch.id, isRemote: false });
          }
        });
      });
      return all;
    }

    function renderModelSearchResults() {
      const kw = (inputModelSearch.value || '').trim().toLowerCase();
      btnClearModelSearch.classList.toggle('hidden', !kw);

      const currCh = PRESET_CHANNELS.find(x => x.id === cfgChannel.value);
      const currChModels = (currCh && currCh.models) || [];
      const allPreset = getAllPresetModels();

      countChannelModels.textContent = currChModels.length;
      countAllModels.textContent = allPreset.length;
      countRemoteModels.textContent = remoteModels.length;

      let candidates = [];
      if (kw) {
        const pool = (activeModelTab === 'remote')
          ? remoteModels.map(m => ({ id: m, badge: '在线', isRemote: true }))
          : (activeModelTab === 'channel')
            ? currChModels.map(m => ({ id: m, badge: currCh ? currCh.name.split(' ')[0] : '渠道', isRemote: false }))
            : allPreset.concat(remoteModels.map(m => ({ id: m, badge: '在线', isRemote: true })));

        candidates = pool.filter(item => item.id.toLowerCase().includes(kw));
      } else {
        if (activeModelTab === 'remote') {
          candidates = remoteModels.map(m => ({ id: m, badge: '在线', isRemote: true }));
        } else if (activeModelTab === 'channel') {
          candidates = currChModels.map(m => ({ id: m, badge: currCh ? currCh.name.split(' ')[0] : '渠道', isRemote: false }));
        } else {
          candidates = allPreset;
        }
      }

      modelSearchResults.innerHTML = '';
      if (candidates.length === 0) {
        const tip = document.createElement('div');
        tip.className = 'ai-model-empty-tip';
        if (activeModelTab === 'remote' && remoteModels.length === 0) {
          tip.innerHTML = '尚未拉取在线模型，请点击上方「<b>🔄 在线拉取模型</b>」按钮';
        } else if (kw) {
          tip.innerHTML = `未搜到包含 "<b>${escapeHtml(kw)}</b>" 的模型<br><span style="opacity:0.7">可直接在输入框手动填入自定义模型名称</span>`;
        } else {
          tip.textContent = '暂无预设模型，可直接在上方输入';
        }
        modelSearchResults.appendChild(tip);
        return;
      }

      candidates.forEach(item => {
        const div = document.createElement('div');
        div.className = `ai-model-item ${item.isRemote ? 'remote' : ''} ${cfgModel.value.trim() === item.id ? 'selected' : ''}`;
        div.dataset.model = item.id;
        div.title = `点击选用: ${item.id}`;

        let nameHtml = escapeHtml(item.id);
        if (kw) {
          const idx = item.id.toLowerCase().indexOf(kw);
          if (idx !== -1) {
            const before = escapeHtml(item.id.slice(0, idx));
            const match = escapeHtml(item.id.slice(idx, idx + kw.length));
            const after = escapeHtml(item.id.slice(idx + kw.length));
            nameHtml = `${before}<span style="color:var(--amber);text-decoration:underline;font-weight:600">${match}</span>${after}`;
          }
        }

        div.innerHTML = `
          <span class="ai-model-name">${nameHtml}</span>
          <span class="ai-model-badge">${escapeHtml(item.badge || '')}</span>
        `;

        div.addEventListener('click', () => {
          cfgModel.value = item.id;
          modelSearchPanel.classList.add('hidden');
        });
        modelSearchResults.appendChild(div);
      });
    }

    // Model Filter Tab switcher
    modelFilterTabs.querySelectorAll('.ai-filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        modelFilterTabs.querySelectorAll('.ai-filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeModelTab = tab.dataset.tab;
        renderModelSearchResults();
      });
    });

    inputModelSearch.addEventListener('input', () => {
      renderModelSearchResults();
    });

    btnClearModelSearch.addEventListener('click', () => {
      inputModelSearch.value = '';
      inputModelSearch.focus();
      renderModelSearchResults();
    });

    btnToggleModelSearch.addEventListener('click', () => {
      const isHidden = modelSearchPanel.classList.toggle('hidden');
      if (!isHidden) {
        inputModelSearch.value = '';
        renderModelSearchResults();
        inputModelSearch.focus();
      }
    });

    cfgModel.addEventListener('focus', () => {
      if (modelSearchPanel.classList.contains('hidden')) {
        modelSearchPanel.classList.remove('hidden');
        inputModelSearch.value = cfgModel.value.trim();
        renderModelSearchResults();
      }
    });

    btnFetchModels.addEventListener('click', async () => {
      const baseUrl = cfgBaseUrl.value.trim();
      if (!baseUrl) {
        alert('请先填写 API 基础路径 (Base URL)');
        cfgBaseUrl.focus();
        return;
      }
      btnFetchModels.disabled = true;
      iconFetchSpin.classList.add('spinning');
      try {
        const res = await ctx.call('fetchModels', {
          protocol: cfgProtocol.value,
          baseUrl,
          apiKey: cfgApiKey.value.trim()
        });
        if (res && res.ok && Array.isArray(res.models)) {
          remoteModels = res.models;
          tabRemoteModels.classList.remove('hidden');
          countRemoteModels.textContent = remoteModels.length;
          modelFilterTabs.querySelectorAll('.ai-filter-tab').forEach(t => t.classList.remove('active'));
          tabRemoteModels.classList.add('active');
          activeModelTab = 'remote';
          modelSearchPanel.classList.remove('hidden');
          inputModelSearch.value = '';
          renderModelSearchResults();
        } else {
          alert(`拉取模型失败: ${(res && res.error) || '未知错误'}`);
        }
      } catch (err) {
        alert(`拉取模型异常: ${err.message || err}`);
      } finally {
        btnFetchModels.disabled = false;
        iconFetchSpin.classList.remove('spinning');
      }
    });

    function renderChannelChips(channelId) {
      channelModelChips.innerHTML = '';
      const ch = PRESET_CHANNELS.find(x => x.id === channelId);
      if (!ch || !ch.models || ch.models.length === 0) return;
      ch.models.slice(0, 5).forEach(m => {
        const chip = document.createElement('span');
        chip.className = 'ai-chip';
        chip.textContent = m;
        chip.title = `点击选用 ${m}`;
        chip.addEventListener('click', () => {
          cfgModel.value = m;
        });
        channelModelChips.appendChild(chip);
      });
    }

    cfgChannel.addEventListener('change', () => {
      const ch = PRESET_CHANNELS.find(x => x.id === cfgChannel.value);
      if (ch) {
        // Remote models were fetched from the previous endpoint; drop them so
        // the 在线拉取 tab never lists stale models after a channel switch.
        if (remoteModels.length) {
          remoteModels = [];
          tabRemoteModels.classList.add('hidden');
          if (activeModelTab === 'remote') {
            activeModelTab = 'channel';
            modelFilterTabs.querySelectorAll('.ai-filter-tab').forEach(t => {
              t.classList.toggle('active', t.dataset.tab === activeModelTab);
            });
          }
        }
        if (ch.baseUrl) cfgBaseUrl.value = ch.baseUrl;
        if (ch.protocol) cfgProtocol.value = ch.protocol;
        if (ch.defaultModel) cfgModel.value = ch.defaultModel;
        renderChannelChips(ch.id);
        renderModelSearchResults();
      }
    });

    btnToggleApiKey.addEventListener('click', () => {
      if (cfgApiKey.type === 'password') {
        cfgApiKey.type = 'text';
        btnToggleApiKey.textContent = '🙈';
        btnToggleApiKey.title = '隐藏密钥';
      } else {
        cfgApiKey.type = 'password';
        btnToggleApiKey.textContent = '👁️';
        btnToggleApiKey.title = '显示密钥';
      }
    });

    btnOpenSettings.addEventListener('click', () => {
      switchSettingsTab('model');
      const chId = config.channel || 'openai';
      cfgChannel.value = PRESET_CHANNELS.some(x => x.id === chId) ? chId : 'custom';
      cfgProtocol.value = config.protocol || 'openai-chat';
      cfgBaseUrl.value = config.baseUrl || 'https://api.openai.com/v1';
      cfgApiKey.value = config.apiKey || '';
      cfgApiKey.type = 'password';
      btnToggleApiKey.textContent = '👁️';
      btnToggleApiKey.title = '显示密钥';
      cfgModel.value = config.model || 'gpt-4o-mini';
      cfgFallbackModel.value = config.fallbackModel || '';
      cfgTempRange.value = config.temperature ?? 0.7;
      cfgTempVal.textContent = config.temperature ?? 0.7;
      cfgMaxContext.value = config.maxContextMessages ?? 16;
      cfgAgentMaxRounds.value = config.agentMaxRounds ?? 8;
      cfgAgentWorkDir.value = config.agentWorkDir || '';
      modelSearchPanel.classList.add('hidden');
      inputModelSearch.value = '';
      renderChannelChips(cfgChannel.value);
      renderModelSearchResults();
      settingsModal.classList.remove('hidden');
    });

    const closeSettings = () => settingsModal.classList.add('hidden');
    btnCloseSettings.addEventListener('click', closeSettings);
    btnCancelSettings.addEventListener('click', closeSettings);

    cfgTempRange.addEventListener('input', () => {
      cfgTempVal.textContent = cfgTempRange.value;
    });

    btnSaveSettings.addEventListener('click', async () => {
      const patch = {
        channel: cfgChannel.value,
        protocol: cfgProtocol.value,
        baseUrl: cfgBaseUrl.value.trim(),
        apiKey: cfgApiKey.value.trim(),
        model: cfgModel.value.trim(),
        fallbackModel: cfgFallbackModel.value.trim(),
        temperature: Number(cfgTempRange.value),
        maxContextMessages: Number(cfgMaxContext.value) || 16,
        agentMaxRounds: Math.min(40, Math.max(1, Number(cfgAgentMaxRounds.value) || 8)),
        agentWorkDir: cfgAgentWorkDir.value.trim()
      };
      const res = await ctx.call('saveConfig', patch);
      if (res && res.ok) {
        config = res.config;
        headerModelPill.textContent = config.model;
        updateHeader(); // default work dir may have changed -> refresh 📁 pill fallback
        closeSettings();
      } else {
        alert(`保存失败: ${(res && res.error) || '未知错误'}`);
      }
    });

    btnPickAgentWorkDir.addEventListener('click', async () => {
      const res = await ctx.call('chooseAgentWorkDir', { current: cfgAgentWorkDir.value.trim() });
      if (res && res.ok) cfgAgentWorkDir.value = res.dir;
    });

    /* --- Boot & Initial Load ---------------------------------------------- */
    ctx.call('getInitData').then(data => {
      if (!data) return;
      config = data.config || {};
      personas = data.personas || [];
      skills = data.skills || [];
      mcpServers = data.mcpServers || [];
      memories = data.memories || [];
      sessions = data.sessions || [];
      currentSession = data.activeSession || null;

      pillCot.classList.toggle('active', !!config.enableReasoning);
      pillAgent.classList.toggle('active', !!config.enableAgent);

      agentMode = config.agentApprovalMode || 'ask';
      thinkLevel = config.thinkingLevel || 'auto';
      updateAgentModeUI();
      updateThinkLevelUI();

      renderPersonas();
      updateHeader();
      renderSessionsList();
      renderMessages();

      // If payload passed from smart peek or pipeline ("发送到 AI 对话")
      const pv = ctx.payload && typeof ctx.payload.value === 'string' && ctx.payload.value.trim() ? ctx.payload.value : '';
      if (pv) {
        chatInput.value = pv;
        autoResizeInput();
      }
    }).catch(() => {});

    return function cleanup() {
      document.removeEventListener('click', onDocumentClickClosePersona);
      if (isGenerating && currentStreamId) {
        ctx.call('abortStream', { streamId: currentStreamId });
      }
    };
  }

  let cleanupFn = null;
  if (typeof window !== 'undefined' && window.Toolbox && window.Toolbox.panel) {
    window.Toolbox.panel({
    mount(el, ctx) { cleanupFn = mount(el, ctx); },
    unmount() { if (typeof cleanupFn === 'function') cleanupFn(); cleanupFn = null; }
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderMarkdown, splitTableRow, parseTableDelimiterRow };
  }
})();

