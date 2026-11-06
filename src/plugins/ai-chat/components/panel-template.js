/* AI Chat - Panel HTML Template
   Static DOM layout for sidebar, messages stream, footer controls, lightbox, settings modal, and workdir modal.
   Dual CommonJS / Browser environment export. */
(() => {
  function getAiChatTemplate() {
    return `
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
              <!-- 【+】附件扩展中心按钮与下拉菜单 -->
              <div class="ai-plus-menu-wrap">
                <button type="button" class="ai-pill-btn plus-btn" id="btnPlusAttachment" title="添加附件 (支持图片、代码/文本文件、文件夹)">
                  <span class="ai-plus-ico">+</span>
                </button>
                <div class="ai-plus-popover hidden" id="plusPopover">
                  <div class="ai-plus-item" id="btnMenuPickImage">
                    <span class="ai-plus-item-ico">🖼️</span>
                    <span class="ai-plus-item-text">
                      <b>添加图片</b>
                      <i>选择图像或截图 (支持多模态视觉分析)</i>
                    </span>
                  </div>
                  <div class="ai-plus-item" id="btnMenuPickFile">
                    <span class="ai-plus-item-ico">📄</span>
                    <span class="ai-plus-item-text">
                      <b>添加文件</b>
                      <i>代码、配置、文档等 (自动提取文本上下文)</i>
                    </span>
                  </div>
                  <div class="ai-plus-item" id="btnMenuPickFolder">
                    <span class="ai-plus-item-ico">📁</span>
                    <span class="ai-plus-item-text">
                      <b>添加文件夹</b>
                      <i>关联本地目录 (供 Agent 工具深度分析)</i>
                    </span>
                  </div>
                </div>
              </div>
              <button class="ai-pill-btn active cot" id="pillCot" title="DeepSeek 深度思考 / Claude Thinking">
                <span>🧠</span> <span>深度思考</span>
              </button>
              <button class="ai-pill-btn active agent" id="pillAgent" title="开启 Agent 工具调用 (支持代码执行与自动生成工作流)">
                <span>🤖</span> <span>Agent 工具</span>
              </button>
              <!-- 计划模式（dsh 轻量版：呈交计划 → 批准转任务清单） -->
              <button class="ai-pill-btn plan" id="pillPlan" title="计划模式：模型先呈交计划供评审，批准后转为任务清单再执行">
                <span>📋</span> <span>计划模式</span>
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

              <input type="file" id="imageFileInput" accept="image/png,image/jpeg,image/webp,image/gif" multiple style="display:none;" />
            </div>

            <!-- 待发送队列看板 -->
            <div class="ai-prompt-queue-bar hidden" id="promptQueueBar"></div>

            <!-- 输入附件预览条 -->
            <div class="ai-input-attachments hidden" id="inputAttachmentsBar"></div>

            <div class="ai-input-box">
              <textarea class="ai-input-textarea" id="chatInput" placeholder="输入消息，Enter 发送（生成中 Enter=插话），Shift+Enter 换行…" rows="1"></textarea>
              <!-- 生成中排队发送（steering 之外的补充分发方式；长按发送键同样排队） -->
              <button type="button" class="ai-btn-action queue hidden" id="btnQueueSend" title="排队发送：当前生成完成后自动发出">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zM12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
                </svg>
              </button>
              <button class="ai-btn-action send" id="btnSendOrStop" title="发送消息">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            </div>
            <!-- 输入框底部：工作目录、技术提示、上下文容量环与压缩操作 -->
            <div class="ai-input-footer">
              <div class="ai-input-footer-left">
                <!-- Agent 工作目录胶囊按钮 -->
                <button type="button" class="ai-footer-workdir-btn" id="headerWorkDirPill" title="Agent 工作目录，点击修改">📁 默认</button>
                <span class="ai-input-hint-inline">Orbit Toolbox AI · 兼容 OpenAI / Claude · 支持流式推理</span>
              </div>
              <div class="ai-input-footer-right">
                <!-- 上下文容量环形进度圈 -->
                <div class="ai-context-ring-wrap" id="contextRingWrap" title="当前上下文用量：点击一键压缩上下文">
                  <svg class="ai-context-ring" viewBox="0 0 36 36">
                    <path class="ai-context-ring-bg"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path class="ai-context-ring-meter" id="contextRingMeter"
                      stroke-dasharray="0, 100"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <span class="ai-context-ring-text" id="contextRingText">0%</span>
                </div>

                <!-- 一键压缩上下文按钮 -->
                <button type="button" class="ai-footer-btn" id="btnCompactContext" title="一键压缩历史上下文，精简 Token 占用">🗜️ 压缩上下文</button>

                <!-- 模型快速选择与直接切换胶囊及下拉浮层 (右下角) -->
                <div class="ai-model-picker-wrap">
                  <button type="button" class="ai-footer-model-btn" id="btnToggleModelPicker" title="当前使用模型，点击直接切换">
                    <span class="ai-model-picker-icon">🤖</span>
                    <span class="ai-model-picker-name" id="headerModelPill">gpt-4o-mini</span>
                    <span class="ai-pill-caret">▾</span>
                  </button>
                  <div class="ai-model-popover hidden" id="modelPopover">
                    <div class="ai-model-popover-header">
                      <span class="ai-search-ico">🔍</span>
                      <input type="text" class="ai-model-popover-search" id="inputModelQuickSearch" placeholder="搜索或输入模型名称…" autocomplete="off">
                      <button type="button" class="ai-model-search-clear hidden" id="btnClearModelQuickSearch">×</button>
                    </div>
                    <!-- 渠道快捷切换标签栏 -->
                    <div class="ai-model-popover-channels" id="modelPopoverChannels"></div>
                    <div class="ai-model-popover-list" id="modelPopoverList"></div>
                    <div class="ai-model-popover-footer">
                      <button type="button" class="ai-model-popover-settings-btn" id="btnModelPopoverOpenSettings">
                        <span>⚙️</span> <span>更多模型与通道设置…</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </footer>
        </main>

        <!-- 全局 Lightbox 大图预览模态框 -->
        <div class="ai-lightbox-modal hidden" id="aiLightboxModal">
          <div class="ai-lightbox-backdrop" id="aiLightboxBackdrop"></div>
          <div class="ai-lightbox-dialog">
            <button type="button" class="ai-lightbox-close" id="btnCloseLightbox" title="关闭大图预览 (Esc)">×</button>
            <div class="ai-lightbox-body">
              <img class="ai-lightbox-img" id="aiLightboxImg" src="" alt="大图预览" />
            </div>
            <div class="ai-lightbox-caption" id="aiLightboxCaption"></div>
          </div>
        </div>

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
                <div class="ai-form-label-row">
                  <label class="ai-form-label">已配置渠道 (Configured Channels)</label>
                  <div class="ai-channel-header-actions">
                    <button type="button" class="ai-btn-text-action" id="btnToggleCreateChannel" title="从预设模版快速创建或自定义渠道">+ 创建渠道</button>
                  </div>
                </div>

                <!-- 创建新渠道下拉/弹层面板 (默认收起隐藏) -->
                <div class="ai-create-channel-box hidden" id="boxCreateChannel">
                  <div class="ai-create-channel-title">➕ 创建新渠道</div>
                  <div class="ai-create-channel-fields">
                    <div class="ai-form-row">
                      <label class="ai-sub-label">选择预设模板</label>
                      <select class="ai-form-select" id="selectChannelTemplate">
                        <option value="deepseek">🐋 DeepSeek (深度求索)</option>
                        <option value="openai">🟢 OpenAI (官方)</option>
                        <option value="claude">🟣 Anthropic Claude (官方)</option>
                        <option value="siliconflow">⚡ SiliconFlow (硅基流动)</option>
                        <option value="moonshot">🌙 Moonshot (月之暗面 / Kimi)</option>
                        <option value="dashscope">🟠 Aliyun (阿里百炼 / 通义千问)</option>
                        <option value="zhipu">🧠 Zhipu GLM (智谱清言)</option>
                        <option value="ollama">🦙 Ollama (本地私有部署)</option>
                        <option value="openrouter">🌐 OpenRouter (全球模型聚合)</option>
                        <option value="groq">🚀 Groq (极速推理)</option>
                        <option value="custom">🛠️ 自定义渠道 (Custom API)</option>
                      </select>
                    </div>
                    <div class="ai-form-row">
                      <label class="ai-sub-label">渠道名称</label>
                      <input type="text" class="ai-form-input" id="inputCreateChannelName" placeholder="如: 公司内网 DeepSeek">
                    </div>
                    <div class="ai-create-channel-actions">
                      <button type="button" class="ai-btn-action-sm secondary" id="btnCancelCreateChannel">取消</button>
                      <button type="button" class="ai-btn-action-sm primary" id="btnConfirmCreateChannel">确定创建</button>
                    </div>
                  </div>
                </div>

                <!-- 渠道选择与右侧紧邻删除操作 -->
                <div class="ai-channel-select-row">
                  <select class="ai-form-select" id="cfgChannel" title="选择要查看或配置的渠道"></select>
                  <button type="button" class="ai-btn-action-delete-ch" id="btnDeleteChannel" title="删除当前选中的渠道">🗑️ 删除此渠道</button>
                </div>
                <div class="ai-channel-active-subrow">
                  <label class="ai-channel-active-checkbox" title="勾选后，当前选中的渠道将作为全局默认对话渠道">
                    <input type="checkbox" id="chkActiveChannel" checked> <span>设为当前使用渠道</span>
                  </label>
                </div>
                <!-- 渠道基础名称/图标配置 -->
                <div class="ai-channel-custom-meta" id="channelCustomMeta">
                  <div class="ai-channel-meta-inputs">
                    <input type="text" class="ai-form-input" id="cfgChannelName" placeholder="渠道显示名称 (如: 我的 DeepSeek)">
                    <input type="text" class="ai-form-input ai-channel-icon-input" id="cfgChannelIcon" placeholder="图标" maxlength="4" style="max-width:70px;text-align:center;">
                  </div>
                </div>
                <span class="ai-form-hint">对话区仅能检索并使用您在此处创建的渠道；未创建的渠道绝不污染模型列表</span>
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

              <!-- 单渠道多密钥管理区 -->
              <div class="ai-form-group">
                <div class="ai-form-label-row">
                  <label class="ai-form-label">API 密钥管理 (支持单渠道多密钥)</label>
                  <span class="ai-form-hint" id="channelKeyCountBadge">已配置 0 个密钥</span>
                </div>
                <div class="ai-channel-keys-wrap">
                  <!-- 密钥列表容器 -->
                  <div class="ai-channel-keys-list" id="channelKeysList"></div>
                  <!-- 添加新密钥输入行 -->
                  <div class="ai-add-key-row">
                    <input type="text" class="ai-form-input ai-add-key-name" id="inputNewKeyName" placeholder="备注 (如: 主密钥 / 备用 Key)">
                    <div class="ai-key-input-wrap" style="flex:2;">
                      <input type="password" class="ai-form-input" id="inputNewKeyValue" placeholder="填入 API Key 密钥 (sk-...)">
                      <button type="button" class="ai-btn-toggle-key" id="btnToggleNewKey" title="显示/隐藏密钥">👁️</button>
                    </div>
                    <button type="button" class="ai-btn-text-action" id="btnAddKey" style="border:1px solid var(--amber);padding:3px 10px;white-space:nowrap;">+ 添加密钥</button>
                  </div>
                </div>
                <!-- 兼容字段：确保外部依赖与测试完全互通 -->
                <input type="hidden" id="cfgApiKey" value="">
                <button type="button" id="btnToggleApiKey" style="display:none;"></button>
                <span class="ai-form-hint">单渠道可添加多个密钥，单选圆钮指定当前生效密钥</span>
              </div>

              <div class="ai-form-group">
                <div class="ai-form-label-row">
                  <label class="ai-form-label">当前渠道模型库 (Models)</label>
                  <button type="button" class="ai-btn-text-action" id="btnFetchModels" title="从 API 在线拉取该渠道可用模型 (GET /v1/models)">
                    <span class="ai-fetch-icon" id="iconFetchSpin">🔄</span> 在线拉取模型
                  </button>
                </div>
                <!-- 渠道已配置的模型 Chips 列表，支持点击设为默认，点击 × 删除 -->
                <div class="ai-channel-models-wrap">
                  <div class="ai-chips-list" id="channelModelChips"></div>
                  <!-- 手动添加模型输入行 -->
                  <div class="ai-add-model-row">
                    <input type="text" class="ai-form-input ai-add-model-input" id="inputAddChannelModel" placeholder="输入新模型标识 (如 claude-3-7-sonnet, deepseek-r1)...">
                    <button type="button" class="ai-btn-text-action" id="btnAddChannelModel" style="border:1px solid var(--amber);padding:3px 10px;">+ 添加模型</button>
                  </div>
                </div>
                <div class="ai-form-label-row" style="margin-top:8px;">
                  <label class="ai-form-label" style="font-size:11.5px;color:var(--ink-dim);">当前默认模型标识 (Default Model)</label>
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
                  <div class="ai-remote-sync-bar hidden" id="remoteSyncBar" style="padding:4px 8px;background:var(--inset);border-radius:var(--r-sm);display:flex;justify-content:flex-end;">
                    <button type="button" class="ai-btn-text-action" id="btnSyncFetchedModels">📥 一键将拉取的全部模型保存至当前渠道</button>
                  </div>
                  <div class="ai-model-results-list" id="modelSearchResults"></div>
                </div>
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
                <label class="ai-form-label">模型最大上下文容量 (Max Context Window)</label>
                <div class="ai-input-with-unit">
                  <input type="number" class="ai-form-input" id="cfgMaxContextTokens" min="4000" max="2000000" step="1000" value="200000">
                  <span class="ai-input-unit">Tokens</span>
                </div>
                <span class="ai-form-hint">单次模型请求支持的最大上下文 Token 窗口上限（默认 200,000，即 200k），用于计算当前上下文容量占用率</span>
              </div>

              <div class="ai-form-group">
                <label class="ai-form-label">Agent 工具调用轮数上限 (Max Tool Rounds)</label>
                <input type="number" class="ai-form-input" id="cfgAgentMaxRounds" min="1" max="40" value="8">
                <span class="ai-form-hint">每次回复中允许「模型调用工具 → 拿到结果继续」的最大循环轮数，超出后强制以纯文本收尾</span>
              </div>

              <div class="ai-form-group">
                <label class="ai-form-label">Agent 默认工作目录</label>
                <div class="ai-workdir-row">
                  <input type="text" class="ai-form-input ai-workdir-input" id="cfgAgentWorkDir" placeholder="留空 = 当前用户目录 (C:\\\\Users\\\\…)">
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
                      <div style="display:flex;align-items:center;gap:8px;">
                        <span class="ai-ext-market-title">🛒 MCP 市场（官方与成熟社区生态）</span>
                        <span class="ai-live-badge">🌐 实时 npm / GitHub 生态</span>
                      </div>
                      <span class="ai-ext-market-subtitle">精选成熟官方预设 + 实时在线全网检索 npm/GitHub MCP 服务，支持一键安装接入本地 Agent</span>
                    </div>
                    <button type="button" class="ai-modal-close" id="btnCloseMcpMarket">×</button>
                  </div>
                  <div class="ai-ext-market-toolbar">
                    <input type="text" class="ai-form-input ai-market-search" id="inputMarketSearch" placeholder="🔍 检索或全网搜索 MCP（例如：Playwright、postgres、sqlite、redis、docker、fetch…）">
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
                    <input type="text" class="ai-form-input" id="inputMcpCommand" placeholder="例如：npx 或 node D:\\mcp-server\\server.js">
                    <span class="ai-form-hint">Windows 下 npx / npm / *.cmd 会自动经 cmd.exe 包装执行</span>
                  </div>
                  <div class="ai-form-group" id="grpMcpArgs">
                    <label class="ai-form-label">启动参数 (每行一个)</label>
                    <textarea class="ai-form-textarea" id="inputMcpArgs" rows="2" placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;E:\\workspace"></textarea>
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
                    <button type="button" class="ai-edit-btn" id="btnOpenSkillMarket" title="精选开源成熟 Agent 技能库">🛒 开源技能库</button>
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

                <!-- 内联开源技能市场与检索面板 -->
                <div class="ai-ext-market-panel hidden" id="skillMarketPanel">
                  <div class="ai-ext-market-head">
                    <div class="ai-ext-market-title-wrap">
                      <div style="display:flex;align-items:center;gap:8px;">
                        <span class="ai-ext-market-title">🛒 开源技能库 (Open-Source Skills)</span>
                        <span class="ai-live-badge">🌐 实时全网生态</span>
                      </div>
                      <span class="ai-ext-market-subtitle">精选官方与 GitHub 实时全网开源 Agent 技能，支持实时搜索、一键安装与基于开源源码创建专属技能</span>
                    </div>
                    <button type="button" class="ai-modal-close" id="btnCloseSkillMarket">×</button>
                  </div>
                  <div class="ai-ext-market-toolbar">
                    <input type="text" class="ai-form-input ai-market-search" id="inputSkillMarketSearch" placeholder="🔍 实时全网检索开源技能（输入例如：docker、vue、python、review、tdd、git、fastapi…）">
                    <div class="ai-market-categories" id="skillMarketCategoriesBar"></div>
                  </div>
                  <div class="ai-market-list" id="skillMarketList"></div>
                </div>

                <!-- 内联技能编辑器 -->
                <div class="ai-ext-editor hidden" id="skillEditPanel">
                  <div class="ai-ext-editor-head">
                    <span id="skillEditTitle">新建技能</span>
                    <button type="button" class="ai-modal-close" id="btnCloseSkillEdit">×</button>
                  </div>
                  <div class="ai-form-group">
                    <label class="ai-form-label">选用开源技能模板 (可选，一键载入开源指令集)</label>
                    <select class="ai-form-select" id="selectSkillTemplate">
                      <option value="">-- 自定义编写 (不使用模板) --</option>
                    </select>
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
                <input type="text" class="ai-form-input" id="inputWorkDirManual" placeholder="粘贴或输入目录路径，如 E:\\Projects\\demo" spellcheck="false">
                <button type="button" class="ai-edit-btn primary" id="btnWorkDirManualOk">确定</button>
              </div>
              <div class="ai-workdir-error hidden" id="workDirModalError"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const exportsObj = {
    getAiChatTemplate,
  };

  if (typeof window !== 'undefined') {
    window.AiChatPanelTemplate = exportsObj;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})();
