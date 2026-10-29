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

  function renderMarkdown(raw) {
    if (!raw) return '';
    const codeBlocks = [];
    // Extract fenced code blocks
    let s = String(raw).replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g, (m, lang, code) => {
      codeBlocks.push({ lang: lang || 'text', code });
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
    const lines = s.split('\n');
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
        out.push(`
          <pre data-lang="${item.lang}"><button type="button" class="ai-code-copy-btn">复制</button><code class="lang-${item.lang}">${escapeHtml(item.code)}</code></pre>
        `);
        continue;
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

            <div class="ai-modal-footer" id="settingsModalFooter">
              <button class="ai-edit-btn" id="btnCancelSettings">取消</button>
              <button class="ai-edit-btn primary" id="btnSaveSettings">保存配置</button>
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
    const sessionUsageBadge = el.querySelector('#sessionUsageBadge');
    const btnClearSession = el.querySelector('#btnClearSession');
    const btnOpenSettings = el.querySelector('#btnOpenSettings');
    const messagesScroll = el.querySelector('#messagesScroll');
    const pillCot = el.querySelector('#pillCot');
    const pillAgent = el.querySelector('#pillAgent');
    const chatInput = el.querySelector('#chatInput');
    const btnSendOrStop = el.querySelector('#btnSendOrStop');

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

    // Settings Tabs & Personas Management DOM
    const tabNavModel = el.querySelector('#tabNavModel');
    const tabNavPersonas = el.querySelector('#tabNavPersonas');
    const paneModelSettings = el.querySelector('#paneModelSettings');
    const panePersonasSettings = el.querySelector('#panePersonasSettings');
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

    // State
    let config = {};
    let personas = [];
    let sessions = [];
    let currentSession = null;
    let currentStreamId = null;
    let isGenerating = false;
    let searchKeyword = '';
    let remoteModels = [];
    let activeModelTab = 'channel';
    let editingPersonaId = null;

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
    });
    pillAgent.addEventListener('click', () => {
      pillAgent.classList.toggle('active');
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
            <span class="ai-popover-persona-title">${escapeHtml(p.title)} <span style="font-weight:normal;opacity:0.6;font-size:10px;">(T: ${p.temperature ?? 0.7})</span></span>
            <span class="ai-popover-persona-desc">${escapeHtml(p.prompt || '')}</span>
          </div>
        `;
        item.addEventListener('click', () => {
          if (currentSession) {
            currentSession.personaId = p.id;
          }
          updateActivePersonaPill();
          personaPopover.classList.add('hidden');
        });
        popoverPersonaList.appendChild(item);
      });
    }

    btnTogglePersonaPicker.addEventListener('click', (e) => {
      e.stopPropagation();
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

    document.addEventListener('click', (e) => {
      if (!personaPopover.classList.contains('hidden')) {
        if (!e.target.closest('.ai-persona-picker-wrap')) {
          personaPopover.classList.add('hidden');
        }
      }
    });

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
          }
        });

        item.querySelector('.ai-session-del').addEventListener('click', async (e) => {
          e.stopPropagation();
          const res = await ctx.call('deleteSession', { id: s.id });
          if (res && res.ok) {
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

    /* --- Clear Session ---------------------------------------------------- */
    btnClearSession.addEventListener('click', async () => {
      if (!currentSession || (currentSession.messages || []).length === 0) return;
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
        return;
      }
      headerTitle.textContent = currentSession.title || '新对话';
      headerModelPill.textContent = config.model || 'gpt-4o-mini';

      const tokens = currentSession.totalTokens ? currentSession.totalTokens.totalTokens : 0;
      sessionUsageBadge.textContent = `${tokens.toLocaleString()} tokens`;
      updateActivePersonaPill();
    }

    /* --- Render Messages -------------------------------------------------- */
    function scrollToBottom() {
      messagesScroll.scrollTop = messagesScroll.scrollHeight;
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

      scrollToBottom();
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

        // CoT Reasoning Box
        if (msg.reasoning) {
          const cotBox = document.createElement('details');
          cotBox.className = 'ai-cot-box';
          cotBox.open = false;
          cotBox.innerHTML = `
            <summary class="ai-cot-summary">
              <span>🧠 思考过程</span>
            </summary>
            <div class="ai-cot-body">${escapeHtml(msg.reasoning)}</div>
          `;
          bubble.appendChild(cotBox);
        }

        // Tool Calls badge
        if (Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
          msg.toolCalls.forEach(tc => {
            const toolBadge = document.createElement('div');
            toolBadge.className = 'ai-tool-badge';
            toolBadge.innerHTML = `<span>🛠️ 工具调用:</span> <strong>${escapeHtml(tc.function.name)}</strong>`;
            bubble.appendChild(toolBadge);
          });
        }

        // Markdown Body
        const mdBody = document.createElement('div');
        mdBody.className = 'ai-md-body';
        mdBody.innerHTML = renderMarkdown(msg.content);
        bubble.appendChild(mdBody);

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

      // Code block copy buttons
      bubble.querySelectorAll('.ai-code-copy-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const pre = e.target.closest('pre');
          const code = pre ? pre.querySelector('code').textContent : '';
          await copyToClipboard(code);
          btn.textContent = '已复制';
          setTimeout(() => { btn.textContent = '复制'; }, 1200);
        });
      });

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

      const streamId = `stream_${Date.now()}`;
      currentStreamId = streamId;

      const res = await ctx.call('sendMessage', {
        sessionId: currentSession.id,
        content: text,
        editMessageId,
        streamId,
        enableReasoning: pillCot.classList.contains('active'),
        enableAgent: pillAgent.classList.contains('active')
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
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    /* --- Stream Chunk Listener via IPC ------------------------------------ */
    ctx.onEvent('stream-chunk', payload => {
      if (!payload || !currentSession || payload.sessionId !== currentSession.id) return;
      const { chunk, messageId } = payload;
      if (!chunk) return;

      let msgEl = messagesScroll.querySelector(`.ai-msg[data-id="${messageId}"]`);
      if (!msgEl) {
        // Message element not yet mounted, refresh messages
        const targetMsg = (currentSession.messages || []).find(m => m.id === messageId);
        if (targetMsg) {
          msgEl = createMessageElement(targetMsg);
          messagesScroll.appendChild(msgEl);
        }
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
        let cotBox = bubble.querySelector('.ai-cot-box');
        if (!cotBox) {
          cotBox = document.createElement('details');
          cotBox.className = 'ai-cot-box';
          cotBox.open = true;
          cotBox.innerHTML = `
            <summary class="ai-cot-summary">
              <span>🧠 思考中…</span>
            </summary>
            <div class="ai-cot-body"></div>
          `;
          bubble.insertBefore(cotBox, bubble.firstChild);
        }
        const body = cotBox.querySelector('.ai-cot-body');
        if (body) body.textContent = chunk.reasoning;
        scrollToBottom();
      } else if (chunk.type === 'content') {
        let mdBody = bubble.querySelector('.ai-md-body');
        if (!mdBody) {
          mdBody = document.createElement('div');
          mdBody.className = 'ai-md-body';
          bubble.appendChild(mdBody);
        }
        mdBody.innerHTML = renderMarkdown(chunk.content);
        // Code block copy buttons
        mdBody.querySelectorAll('.ai-code-copy-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const pre = e.target.closest('pre');
            const code = pre ? pre.querySelector('code').textContent : '';
            await copyToClipboard(code);
            btn.textContent = '已复制';
            setTimeout(() => { btn.textContent = '复制'; }, 1200);
          });
        });
        scrollToBottom();
      } else if (chunk.type === 'tool_calls') {
        for (const tc of chunk.toolCalls) {
          if (!bubble.querySelector(`.ai-tool-badge[data-tool="${tc.id}"]`)) {
            const b = document.createElement('div');
            b.className = 'ai-tool-badge';
            b.dataset.tool = tc.id;
            b.innerHTML = `<span>🛠️ 工具调用:</span> <strong>${escapeHtml(tc.function.name)}</strong> (参数就绪)`;
            bubble.appendChild(b);
          }
        }
        scrollToBottom();
      } else if (chunk.type === 'tool_result') {
        const b = bubble.querySelector(`.ai-tool-badge[data-tool="${chunk.toolId}"]`);
        if (b) {
          b.innerHTML = `<span>✓ 工具已执行:</span> <strong>${escapeHtml(chunk.toolName)}</strong> <span style="opacity:0.7">(已捕获结果)</span>`;
        }
        scrollToBottom();
      } else if (chunk.type === 'usage') {
        let usageSpan = msgEl.querySelector('.ai-msg-usage');
        if (usageSpan) {
          usageSpan.textContent = `Prompt: ${chunk.usage.promptTokens} · Output: ${chunk.usage.completionTokens} · Total: ${chunk.usage.totalTokens}`;
        }
      } else if (chunk.type === 'complete' || chunk.type === 'aborted' || chunk.type === 'error') {
        setGeneratingState(false);
        if (chunk.message && currentSession && currentSession.messages) {
          const m = currentSession.messages.find(x => x.id === messageId);
          if (m) {
            m.content = chunk.message.content || m.content;
            m.reasoning = chunk.message.reasoning || m.reasoning;
          }
        }
        const cotBox = bubble.querySelector('.ai-cot-box');
        if (cotBox) {
          const sum = cotBox.querySelector('.ai-cot-summary span');
          if (sum) sum.textContent = '🧠 思考过程 (已完成)';
        }
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

    /* --- Settings Tabs (Model & Personas) --- */
    function switchSettingsTab(tabName) {
      tabNavModel.classList.toggle('active', tabName === 'model');
      tabNavPersonas.classList.toggle('active', tabName === 'personas');
      paneModelSettings.classList.toggle('hidden', tabName !== 'model');
      panePersonasSettings.classList.toggle('hidden', tabName !== 'personas');
      settingsModalFooter.style.display = tabName === 'model' ? 'flex' : 'none';
      if (tabName === 'personas') {
        closePersonaEditor();
        renderPersonasSettingsList();
      }
    }

    tabNavModel.addEventListener('click', () => switchSettingsTab('model'));
    tabNavPersonas.addEventListener('click', () => switchSettingsTab('personas'));

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
              <span class="ai-persona-card-temp">T: ${p.temperature ?? 0.7}</span>
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
        maxContextMessages: Number(cfgMaxContext.value) || 16
      };
      const res = await ctx.call('saveConfig', patch);
      if (res && res.ok) {
        config = res.config;
        headerModelPill.textContent = config.model;
        closeSettings();
      }
    });

    /* --- Boot & Initial Load ---------------------------------------------- */
    ctx.call('getInitData').then(data => {
      if (!data) return;
      config = data.config || {};
      personas = data.personas || [];
      sessions = data.sessions || [];
      currentSession = data.activeSession || null;

      pillCot.classList.toggle('active', !!config.enableReasoning);
      pillAgent.classList.toggle('active', !!config.enableAgent);

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
      if (isGenerating && currentStreamId) {
        ctx.call('abortStream', { streamId: currentStreamId });
      }
    };
  }

  let cleanupFn = null;
  window.Toolbox.panel({
    mount(el, ctx) { cleanupFn = mount(el, ctx); },
    unmount() { if (typeof cleanupFn === 'function') cleanupFn(); cleanupFn = null; }
  });
})();
