/* AI Chat - Panel Main Coordinator
   Coordinates sessions, message timeline, streaming chunk events, and mounts sub-components:
   - lib/markdown-renderer.js
   - lib/mermaid-renderer.js
   - components/panel-template.js
   - components/task-drawer.js
   - components/prompt-queue.js
   - components/settings-modals.js
   Dual CommonJS / Browser environment export. */
(() => {
  let mdLib = null;
  if (typeof require !== 'undefined') {
    try {
      mdLib = require('./lib/markdown-renderer');
    } catch {}
  }

  const defaultEscapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getAiMarkdown = () => (typeof window !== 'undefined' ? window.AiChatMarkdown : null) || mdLib;

  const escapeHtml = (s) => {
    const lib = getAiMarkdown();
    return lib && lib.escapeHtml ? lib.escapeHtml(s) : defaultEscapeHtml(s);
  };
  const copyToClipboard = async (text) => {
    const lib = getAiMarkdown();
    if (lib && lib.copyToClipboard) return lib.copyToClipboard(text);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      return navigator.clipboard.writeText(text);
    }
  };

  const renderMarkdown = (raw) => {
    const lib = getAiMarkdown();
    return lib && lib.renderMarkdown ? lib.renderMarkdown(raw) : String(raw || '');
  };
  const splitTableRow = (str) => {
    const lib = getAiMarkdown();
    return lib && lib.splitTableRow ? lib.splitTableRow(str) : [];
  };
  const parseTableDelimiterRow = (str) => {
    const lib = getAiMarkdown();
    return lib && lib.parseTableDelimiterRow ? lib.parseTableDelimiterRow(str) : null;
  };
  const extractTasksFromContent = (content) => {
    const lib = getAiMarkdown();
    return lib && lib.extractTasksFromContent ? lib.extractTasksFromContent(content) : [];
  };

  /* --- Dynamic Script Loader for Plugin Dependencies --- */
  function loadScript(src) {
    if (typeof document === 'undefined') return Promise.resolve();
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') return Promise.resolve();
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
      });
    }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => {
        s.dataset.loaded = 'true';
        resolve();
      };
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  function ensureDependencies() {
    if (typeof document === 'undefined') return Promise.resolve();
    const deps = [
      'plugin://ai-chat/lib/markdown-renderer.js',
      'plugin://ai-chat/lib/mermaid-renderer.js',
      'plugin://ai-chat/lib/stream-renderer.js',
      'plugin://ai-chat/lib/hljs-renderer.js',
      'plugin://ai-chat/components/panel-template.js',
      'plugin://ai-chat/components/task-drawer.js',
      'plugin://ai-chat/components/prompt-queue.js',
      'plugin://ai-chat/components/settings/memory-tab.js',
      'plugin://ai-chat/components/settings/persona-tab.js',
      'plugin://ai-chat/components/settings/mcp-tab.js',
      'plugin://ai-chat/components/settings/skill-tab.js',
      'plugin://ai-chat/components/settings/model-tab.js',
      'plugin://ai-chat/components/settings-modals.js',
      'plugin://ai-chat/components/tool-cards.js',
      'plugin://ai-chat/components/message-renderer.js',
      'plugin://ai-chat/components/pills-popovers.js'
    ];
    return Promise.all(deps.map(loadScript));
  }

  // Preload dependencies in browser environment
  if (typeof document !== 'undefined') {
    ensureDependencies().catch(() => {});
  }

  /* --- Panel Mount Controller ---------------------------------------------- */
  async function mount(el, ctx) {
    await ensureDependencies();

    if (window.AiChatPanelTemplate && window.AiChatPanelTemplate.getAiChatTemplate) {
      el.innerHTML = window.AiChatPanelTemplate.getAiChatTemplate();
    }

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
    const contextRingWrap = el.querySelector('#contextRingWrap');
    const contextRingMeter = el.querySelector('#contextRingMeter');
    const contextRingText = el.querySelector('#contextRingText');
    const btnCompactContext = el.querySelector('#btnCompactContext');
    const btnClearSession = el.querySelector('#btnClearSession');
    const btnOpenSettings = el.querySelector('#btnOpenSettings');
    const messagesScroll = el.querySelector('#messagesScroll');
    const pillCot = el.querySelector('#pillCot');
    const pillAgent = el.querySelector('#pillAgent');
    const pillPlan = el.querySelector('#pillPlan');
    const chatInput = el.querySelector('#chatInput');
    const btnSendOrStop = el.querySelector('#btnSendOrStop');
    const btnQueueSend = el.querySelector('#btnQueueSend');
    const btnPlusAttachment = el.querySelector('#btnPlusAttachment');
    const plusPopover = el.querySelector('#plusPopover');
    const btnMenuPickImage = el.querySelector('#btnMenuPickImage');
    const btnMenuPickFile = el.querySelector('#btnMenuPickFile');
    const btnMenuPickFolder = el.querySelector('#btnMenuPickFolder');
    const imageFileInput = el.querySelector('#imageFileInput');
    const promptQueueBar = el.querySelector('#promptQueueBar');
    const inputAttachmentsBar = el.querySelector('#inputAttachmentsBar');
    const aiInputWrap = el.querySelector('.ai-input-wrap');
    const aiInputBox = el.querySelector('.ai-input-box');
    const aiLightboxModal = el.querySelector('#aiLightboxModal');
    const aiLightboxBackdrop = el.querySelector('#aiLightboxBackdrop');
    const btnCloseLightbox = el.querySelector('#btnCloseLightbox');
    const aiLightboxImg = el.querySelector('#aiLightboxImg');
    const aiLightboxCaption = el.querySelector('#aiLightboxCaption');

    // Attachments & Prompt Queue state
    let pendingAttachments = [];
    const sessionPromptQueues = new Map();

    /* --- Message rendering layer (extracted to components/message-renderer.js) --- */
    // 可变会话/流状态经 getter/setter 袋共享给渲染层（声明在其后的 let 依赖惰性求值）
    const rendererState = {};
    Object.defineProperties(rendererState, {
      currentSession:      { get: () => currentSession, set: v => { currentSession = v; }, configurable: true },
      isGenerating:        { get: () => isGenerating, set: v => { isGenerating = v; }, configurable: true },
      currentStreamId:     { get: () => currentStreamId, set: v => { currentStreamId = v; }, configurable: true },
      abortRequested:      { get: () => abortRequested, set: v => { abortRequested = v; }, configurable: true },
      generatingSessionId: { get: () => generatingSessionId, set: v => { generatingSessionId = v; }, configurable: true },
      pendingAttachments:  { get: () => pendingAttachments, set: v => { pendingAttachments = v; }, configurable: true }
    });
    const MessageRendererLib = window.AiChatMessageRenderer;
    const {
      formatFileSize, formatAttachmentContextSnippet, parseDisplayMessage,
      ensureContextPopover, showContextPopover, scheduleHideContextPopover,
      getLateChunkBuf, peekLateChunkBuf, deleteLateChunkBuf,
      getStreamSlot, finalizeStreamSlots, collapseCompletedRounds, markRoundUpTo,
      formatDuration, renderTurnFooter,
      createMessageElement, createCompactionCardElement
    } = MessageRendererLib.createMessageRenderer({
      state: rendererState,
      escapeHtml, renderMarkdown, copyToClipboard,
      chatInput, pillAgent, pillCot,
      autoResizeInput, renderMessages, renderSessionsList,
      setGeneratingState, syncAttachmentsBar, updateHeader, updateSendOrStopButton
    });

    // Agent Approval Mode & Thinking Level DOM
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
    const btnPopoverPrevPage = el.querySelector('#btnPopoverPrevPage');
    const popoverPageText = el.querySelector('#popoverPageText');
    const btnPopoverNextPage = el.querySelector('#btnPopoverNextPage');

    // Model Quick Picker (Chat Footer) DOM
    const btnToggleModelPicker = el.querySelector('#btnToggleModelPicker');
    const modelPopover = el.querySelector('#modelPopover');
    const inputModelQuickSearch = el.querySelector('#inputModelQuickSearch');
    const btnClearModelQuickSearch = el.querySelector('#btnClearModelQuickSearch');
    const modelPopoverList = el.querySelector('#modelPopoverList');
    const btnModelPopoverOpenSettings = el.querySelector('#btnModelPopoverOpenSettings');

    // Agent WorkDir Modal DOM
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

    // App State
    let config = {};
    let personas = [];
    let sessions = [];
    let currentSession = null;
    let memories = [];
    let mcpServers = [];
    let skills = [];
    let searchKeyword = '';
    let popoverPersonaSearch = '';
    let isGenerating = false;
    let currentStreamId = null;
    let abortRequested = false; // 流 id 未到手时点击停止：记住意图，id 到达立即补发
    let generatingSessionId = null;
    let agentMode = 'ask';
    let thinkLevel = 'auto';

    // 统一浮层收拢管理器：关闭全部输入区周边浮层，可选排除当前正在打开的浮层
    function closeAllPopovers(except = null) {
      if (plusPopover && except !== plusPopover) plusPopover.classList.add('hidden');
      if (personaPopover && except !== personaPopover) personaPopover.classList.add('hidden');
      if (agentModePopover && except !== agentModePopover) agentModePopover.classList.add('hidden');
      if (thinkLevelPopover && except !== thinkLevelPopover) thinkLevelPopover.classList.add('hidden');
      if (modelPopover && except !== modelPopover) modelPopover.classList.add('hidden');
    }


    // Initialize Lightbox
    const PromptQueue = window.AiChatPromptQueue;
    const TaskDrawer = window.AiChatTaskDrawer;
    const SettingsModals = window.AiChatSettingsModals;
    const MermaidRenderer = window.AiChatMermaid;
    const HljsRenderer = window.AiChatHljs;
    const ToolCards = window.AiChatToolCards;
    const StreamRendererLib = window.AiChatStreamRenderer;


    const { openLightbox, closeLightbox, disposeLightbox } = PromptQueue.initLightbox({
      modalEl: aiLightboxModal,
      imgEl: aiLightboxImg,
      captionEl: aiLightboxCaption,
      backdropEl: aiLightboxBackdrop,
      closeBtnEl: btnCloseLightbox
    });

    function syncAttachmentsBar() {
      PromptQueue.renderAttachmentsBar({
        container: inputAttachmentsBar,
        pendingAttachments,
        openLightbox,
        onRemove: () => {
          syncAttachmentsBar();
          updateSendOrStopButton();
        },
        escapeHtml
      });
    }

    function syncPromptQueueBar() {
      PromptQueue.renderPromptQueueBar({
        container: promptQueueBar,
        currentSession,
        sessionPromptQueues,
        onRecall: (item) => {
          chatInput.value = item.text || '';
          pendingAttachments = Array.isArray(item.attachments) ? [...item.attachments] : [];
          syncAttachmentsBar();
          autoResizeInput();
          updateSendOrStopButton();
          syncPromptQueueBar();
          chatInput.focus();
        },
        onQueueChanged: () => {
          syncPromptQueueBar();
          updateSendOrStopButton();
        },
        escapeHtml
      });
    }

    function updateSendOrStopButton() {
      PromptQueue.updateSendOrStopButton({
        btnSendOrStop,
        chatInput,
        pendingAttachments,
        isGenerating
      });
      // 生成中显示"排队发送"按钮（steering 之外的补充分发方式）
      if (btnQueueSend) {
        const hasText = !!(chatInput && (chatInput.value.trim() || pendingAttachments.length > 0));
        btnQueueSend.classList.toggle('hidden', !(isGenerating && hasText));
      }
    }

    // 计划模式 pill 与会话状态同步（轻量计划模式）
    function syncPlanPill() {
      if (pillPlan) pillPlan.classList.toggle('active', !!(currentSession && currentSession.planMode));
    }

    // dsh Steering：生成中插话，立即上屏并在下一工具轮边界注入上下文
    async function sendSteerMessage() {
      if (!currentSession || !isGenerating) return false;
      const text = chatInput.value.trim();
      if (!text) return false;
      try {
        const res = await ctx.call('steerMessage', { sessionId: currentSession.id, content: text });
        if (res && res.ok) {
          chatInput.value = '';
          autoResizeInput();
          updateSendOrStopButton();
          return true;
        }
        // 无进行中的流（竞态：刚结束）→ 回退为普通发送
        if (res && res.error && !isGenerating) {
          sendMessage();
          return true;
        }
      } catch {}
      return false;
    }

    let queueDrainTimer = null;
    function setGeneratingState(generating) {
      isGenerating = generating;
      updateSendOrStopButton();
      if (!generating) {
        if (queueDrainTimer) clearTimeout(queueDrainTimer);
        queueDrainTimer = setTimeout(() => {
          queueDrainTimer = null;
          PromptQueue.checkAndTriggerNextQueuedMessage({
            isGenerating,
            currentSession,
            sessionPromptQueues,
            sendMessage,
            onQueueChanged: syncPromptQueueBar
          });
        }, 150);
      }
    }

    function autoResizeInput() {
      if (!chatInput) return;
      chatInput.style.height = 'auto';
      const scrollH = chatInput.scrollHeight || 24;
      const newHeight = Math.max(24, Math.min(scrollH, 180));
      chatInput.style.height = `${newHeight}px`;
    }

    chatInput.addEventListener('input', () => {
      autoResizeInput();
      updateSendOrStopButton();
    });

    // 输入框聚焦时收拢所有浮层，避免任何视觉遮挡
    chatInput.addEventListener('focus', () => {
      closeAllPopovers();
    });

    // 输入框容器点击代理：点击整个输入框盒子的内边距、边框边缘与空白区域，自动转移焦点至输入框
    if (aiInputBox && chatInput) {
      aiInputBox.addEventListener('click', (e) => {
        if (!e.target.closest('#btnSendOrStop')) {
          closeAllPopovers();
          chatInput.focus();
        }
      });
    }

    chatInput.addEventListener('keydown', (e) => {
      // IME 组合中（如中文输入法选词）的 Enter 只确认候选词，不发送消息
      if (e.isComposing) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (isGenerating) {
          // dsh Steering：生成中 Enter=插话（下一工具轮边界生效）；失败再回退排队
          sendSteerMessage().then(steered => {
            if (steered) return;
            PromptQueue.enqueueCurrentInput({
              chatInput,
              pendingAttachments,
              currentSession,
              sessionPromptQueues,
              onAfterEnqueue: () => {
                syncAttachmentsBar();
                autoResizeInput();
                updateSendOrStopButton();
                syncPromptQueueBar();
              }
            });
          });
        } else {
          sendMessage();
        }
      }
    });

    // 排队按钮：生成中把消息排入待发队列（完成自动发出）
    if (btnQueueSend) {
      btnQueueSend.addEventListener('click', () => {
        if (!isGenerating) return;
        PromptQueue.enqueueCurrentInput({
          chatInput,
          pendingAttachments,
          currentSession,
          sessionPromptQueues,
          onAfterEnqueue: () => {
            syncAttachmentsBar();
            autoResizeInput();
            updateSendOrStopButton();
            syncPromptQueueBar();
          }
        });
      });
    }

    // 长按发送键（生成中为停止键）：长按=排队发送，短按保持停止语义
    {
      let pressTimer = null;
      let longPressed = false;
      btnSendOrStop.addEventListener('pointerdown', () => {
        if (!isGenerating) return;
        longPressed = false;
        pressTimer = setTimeout(() => {
          longPressed = true;
          if (chatInput && (chatInput.value.trim() || pendingAttachments.length > 0)) {
            PromptQueue.enqueueCurrentInput({
              chatInput,
              pendingAttachments,
              currentSession,
              sessionPromptQueues,
              onAfterEnqueue: () => {
                syncAttachmentsBar();
                autoResizeInput();
                updateSendOrStopButton();
                syncPromptQueueBar();
              }
            });
          }
        }, 550);
      });
      const cancelLongPress = () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      };
      btnSendOrStop.addEventListener('pointerup', cancelLongPress);
      btnSendOrStop.addEventListener('pointerleave', cancelLongPress);
      btnSendOrStop.addEventListener('click', e => {
        if (longPressed) {
          e.stopImmediatePropagation();
          e.preventDefault();
          longPressed = false;
        }
      }, true);
    }

    // 计划模式开关（轻量版：呈交计划 → 批准转任务清单）
    if (pillPlan) {
      pillPlan.addEventListener('click', async () => {
        if (!currentSession) return;
        const next = !pillPlan.classList.contains('active');
        pillPlan.classList.toggle('active', next);
        try {
          const res = await ctx.call('setSessionPlanMode', { sessionId: currentSession.id, enabled: next });
          if (res && res.ok) {
            currentSession.planMode = !!res.planMode;
            pillPlan.classList.toggle('active', !!res.planMode);
          } else {
            pillPlan.classList.toggle('active', !next);
          }
        } catch {
          pillPlan.classList.toggle('active', !next);
        }
      });
    }

    btnSendOrStop.addEventListener('click', () => {
      if (btnSendOrStop.classList.contains('stop')) {
        if (currentStreamId) {
          ctx.call('abortStream', { streamId: currentStreamId });
          currentStreamId = null;
          generatingSessionId = null;
          setGeneratingState(false);
        } else {
          // sendMessage 的 IPC 往返窗口内流 id 尚未到手：不记意图的话
          // 首次发送的停止键完全无响应，且后续点击会 abort 上一条 stale id
          abortRequested = true;
        }
      } else if (btnSendOrStop.classList.contains('queue')) {
        PromptQueue.enqueueCurrentInput({
          chatInput,
          pendingAttachments,
          currentSession,
          sessionPromptQueues,
          onAfterEnqueue: () => {
            syncAttachmentsBar();
            autoResizeInput();
            updateSendOrStopButton();
            syncPromptQueueBar();
          }
        });
      } else {
        sendMessage();
      }
    });

    // Plus popover attachments
    if (btnPlusAttachment && plusPopover) {
      btnPlusAttachment.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = plusPopover.classList.contains('hidden');
        closeAllPopovers();
        if (willOpen) {
          plusPopover.classList.remove('hidden');
        }
      });
    }

    if (btnMenuPickImage && imageFileInput) {
      btnMenuPickImage.addEventListener('click', () => {
        plusPopover.classList.add('hidden');
        imageFileInput.click();
      });
      imageFileInput.addEventListener('change', (e) => {
        PromptQueue.handleImageFiles(e.target.files, pendingAttachments, () => {
          syncAttachmentsBar();
          updateSendOrStopButton();
        });
        imageFileInput.value = '';
      });
    }

    if (btnMenuPickFile) {
      btnMenuPickFile.addEventListener('click', async () => {
        plusPopover.classList.add('hidden');
        const res = await ctx.call('chooseFiles');
        if (res && res.ok && Array.isArray(res.files)) {
          res.files.forEach(f => {
            if (f.isImage && f.dataUrl) {
              pendingAttachments.push({
                type: 'image',
                id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                name: f.name,
                size: f.size,
                url: f.dataUrl,
                path: f.path
              });
            } else {
              pendingAttachments.push({
                type: 'file',
                id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                name: f.name,
                size: f.size,
                path: f.path,
                content: f.content
              });
            }
          });
          syncAttachmentsBar();
          updateSendOrStopButton();
        }
      });
    }

    if (btnMenuPickFolder) {
      btnMenuPickFolder.addEventListener('click', async () => {
        plusPopover.classList.add('hidden');
        const res = await ctx.call('chooseDirectory');
        if (res && res.ok && res.directory) {
          pendingAttachments.push({
            type: 'directory',
            id: `dir_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: res.directory.name,
            path: res.directory.path
          });
          syncAttachmentsBar();
          updateSendOrStopButton();
        }
      });
    }

    chatInput.addEventListener('paste', (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      let hasImage = false;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            hasImage = true;
            PromptQueue.handleImageFiles([file], pendingAttachments, () => {
              syncAttachmentsBar();
              updateSendOrStopButton();
            });
          }
        }
      }
      if (hasImage) {
        setTimeout(() => {
          autoResizeInput();
          updateSendOrStopButton();
        }, 50);
      }
    });

    if (aiInputWrap) {
      aiInputWrap.addEventListener('dragover', (e) => {
        e.preventDefault();
        aiInputWrap.classList.add('ai-input-drag-over');
      });
      aiInputWrap.addEventListener('dragleave', (e) => {
        if (!aiInputWrap.contains(e.relatedTarget)) {
          aiInputWrap.classList.remove('ai-input-drag-over');
        }
      });
      aiInputWrap.addEventListener('drop', (e) => {
        e.preventDefault();
        aiInputWrap.classList.remove('ai-input-drag-over');
        if (e.dataTransfer && e.dataTransfer.files) {
          PromptQueue.handleImageFiles(e.dataTransfer.files, pendingAttachments, () => {
            syncAttachmentsBar();
            updateSendOrStopButton();
          });
        }
      });
    }

    // Initialize Settings Modals
    const settingsCtrl = SettingsModals.initSettingsModals({
      panelEl: el,
      ctx,
      getState: () => ({ config, personas, memories, mcpServers, skills, currentSession }),
      updateState: (patch) => {
        if (patch.config) config = patch.config;
        if (patch.personas) personas = patch.personas;
        if (patch.memories) memories = patch.memories;
        if (patch.mcpServers) mcpServers = patch.mcpServers;
        if (patch.skills) skills = patch.skills;
      },
      onConfigSaved: (newCfg) => {
        config = newCfg;
        headerModelPill.textContent = config.model;
        updateHeader();
      },
      onPersonasChanged: (newPersonas) => {
        personas = newPersonas;
        renderPersonas();
      },
      escapeHtml
    });

    btnOpenSettings.addEventListener('click', () => {
      settingsCtrl.openSettings('model');
    });

    // Toggle Sidebar
    btnToggleSidebar.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });

    /* --- Input pills & popovers (extracted to components/pills-popovers.js) --- */
    const pillsState = {};
    Object.defineProperties(pillsState, {
      agentMode:     { get: () => agentMode, set: v => { agentMode = v; }, configurable: true },
      thinkLevel:    { get: () => thinkLevel, set: v => { thinkLevel = v; }, configurable: true },
      config:        { get: () => config, set: v => { config = v; }, configurable: true },
      personas:      { get: () => personas, set: v => { personas = v; }, configurable: true },
      currentSession:{ get: () => currentSession, set: v => { currentSession = v; }, configurable: true }
    });
    const {
      updateAgentModeUI, updateThinkLevelUI,
      renderPersonas, updateActivePersonaPill, closeCtrlPopovers
    } = (window.AiChatPillsPopovers).createPillsPopovers({
      state: pillsState,
      escapeHtml, closeAllPopovers, updateHeader, settingsCtrl,
      pillCot, pillAgent,
      btnAgentMode, agentModeIcon, agentModeLabel, agentModePopover, agentAlwaysRow,
      btnThinkLevel, thinkLevelPopover, thinkLevelLabel,
      btnTogglePersonaPicker, personaPopover, currentPersonaTitle, currentPersonaIcon,
      inputPopoverPersonaSearch, btnClearPopoverPersonaSearch,
      popoverPersonaList, btnPopoverPrevPage, btnPopoverNextPage, popoverPageText,
      btnToggleModelPicker, modelPopover, modelPopoverList,
      inputModelQuickSearch, btnClearModelQuickSearch, btnModelPopoverOpenSettings,
      headerModelPill
    });


    // 全局点击监听器：点击非对应浮层区域时自动收拢浮层
    const onDocumentGlobalClickClosePopovers = (e) => {
      const inPlus = e.target.closest && e.target.closest('.ai-plus-menu-wrap');
      const inPersona = e.target.closest && e.target.closest('.ai-persona-picker-wrap');
      const inCtrl = e.target.closest && e.target.closest('.ai-ctrl-popover-wrap');
      const inModel = e.target.closest && e.target.closest('.ai-model-picker-wrap');
      const inAttPopover = e.target.closest && (e.target.closest('.ai-att-popover') || e.target.closest('.ai-msg-att-card'));

      if (!inAttPopover && contextPopoverEl && !contextPopoverEl.classList.contains('hidden')) {
        contextPopoverEl.classList.add('hidden');
      }

      if (!inPlus && plusPopover && !plusPopover.classList.contains('hidden')) {
        plusPopover.classList.add('hidden');
      }
      if (!inPersona && personaPopover && !personaPopover.classList.contains('hidden')) {
        personaPopover.classList.add('hidden');
      }
      if (!inCtrl) {
        closeCtrlPopovers();
      }
      if (!inModel && modelPopover && !modelPopover.classList.contains('hidden')) {
        modelPopover.classList.add('hidden');
      }
    };
    document.addEventListener('click', onDocumentGlobalClickClosePopovers);

    // Sessions List
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
            syncPromptQueueBar();
            updateSendOrStopButton();
            renderMessages();
            renderSessionsList();
            restorePendingLateChunks();
            syncPlanPill();
          }
        });

        item.querySelector('.ai-session-del').addEventListener('click', async (e) => {
          e.stopPropagation();
          sessionPromptQueues.delete(s.id);
          const res = await ctx.call('deleteSession', { id: s.id });
          if (res && res.ok) {
            deleteLateChunkBuf(s.id);
            sessions = res.sessions;
            const next = sessions.find(x => x.id === res.activeSessionId) || sessions[0] || null;
            if (next) {
              const sw = await ctx.call('switchSession', { id: next.id });
              currentSession = sw ? sw.session : null;
            } else {
              currentSession = null;
            }
            updateHeader();
            syncPromptQueueBar();
            updateSendOrStopButton();
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
        pendingAttachments = [];
        syncAttachmentsBar();
        syncPromptQueueBar();
        updateSendOrStopButton();
        renderMessages();
        renderSessionsList();
        chatInput.focus();
      }
    });

    // Rename Session
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

    // Agent Working Directory
    headerWorkDirPill.addEventListener('click', () => {
      if (!currentSession) return;
      const cur = currentSession.workDir || config.agentWorkDir || '';
      workDirCurrentRow.classList.toggle('hidden', !cur);
      workDirCurrentPath.textContent = cur || '';
      workDirCurrentPath.title = cur ? (currentSession.workDir ? cur : `${cur} (默认)`) : '';
      workDirManualRow.classList.add('hidden');
      workDirModalError.classList.add('hidden');
      workDirModalSessionId = currentSession ? currentSession.id : null;
      workDirModal.classList.remove('hidden');
    });

    const closeWorkDirModal = () => workDirModal.classList.add('hidden');
    btnCloseWorkDirModal.addEventListener('click', closeWorkDirModal);
    workDirModal.addEventListener('click', e => { if (e.target === workDirModal) closeWorkDirModal(); });

    // 弹窗不随会话切换关闭：应用时若已切到别的会话，拒绝写入（界面显示的
    // 是旧会话路径，写进新会话等于静默串档）
    let workDirModalSessionId = null;
    const applySessionWorkDir = async dir => {
      if (!currentSession || currentSession.id !== workDirModalSessionId) {
        closeWorkDirModal();
        return;
      }
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

    btnWorkDirReset.addEventListener('click', async () => {
      if (!currentSession || currentSession.id !== workDirModalSessionId) {
        closeWorkDirModal();
        return;
      }
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

    // Clear Session
    btnClearSession.addEventListener('click', async () => {
      if (!currentSession || (currentSession.messages || []).length === 0) return;
      if (isGenerating && generatingSessionId === currentSession.id) {
        alert('正在生成中…');
        return;
      }
      if (confirm('确认清空当前对话的所有记录吗？')) {
        const res = await ctx.call('clearSession', { id: currentSession.id });
        if (res && res.ok) {
          sessionPromptQueues.delete(currentSession.id);
          currentSession.messages = [];
          currentSession.taskList = null;
          currentSession._hiddenTasksMessageId = null;
          currentSession._hideExtractedTasks = false;
          currentSession.totalTokens = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
          updateHeader();
          syncPromptQueueBar();
          updateSendOrStopButton();
          renderMessages();
          renderSessionsList();
        }
      }
    });

    // Context Compaction & Token Usage Calculation
    function calculateCurrentContextTokens(session) {
      if (!session || !Array.isArray(session.messages) || session.messages.length === 0) {
        return 0;
      }

      // Display vs Model Surface Isolation:
      // If the session contains compaction divider cards, only the active context window
      // (from the latest compaction divider onwards) is counted towards the model window!
      let startIdx = 0;
      for (let i = session.messages.length - 1; i >= 0; i--) {
        const m = session.messages[i];
        if (m && (m.role === 'compaction_divider' || m.type === 'compaction_checkpoint')) {
          startIdx = i;
          break;
        }
      }

      const msgs = session.messages.slice(startIdx);
      let lastAsstWithUsageIdx = -1;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant' && msgs[i].usage && (typeof msgs[i].usage.contextTokens === 'number' || typeof msgs[i].usage.promptTokens === 'number')) {
          lastAsstWithUsageIdx = i;
          break;
        }
      }
      function getMessageCharLength(msgItem) {
        if (!msgItem) return 0;
        let len = String(msgItem.content || '').length;
        if (msgItem.role === 'user' && Array.isArray(msgItem.attachments) && msgItem.attachments.length > 0) {
          for (const a of msgItem.attachments) {
            if (a && a.content) len += String(a.content).length + 80;
            else if (a && (a.path || a.name)) len += String(a.path || a.name).length + 60;
          }
        }
        return len;
      }

      if (lastAsstWithUsageIdx !== -1) {
        const baseUsage = msgs[lastAsstWithUsageIdx].usage;
        const baseTokens = (typeof baseUsage.contextTokens === 'number')
          ? baseUsage.contextTokens
          : ((baseUsage.promptTokens || 0) + (baseUsage.completionTokens || 0));
        let trailingChars = 0;
        for (let i = lastAsstWithUsageIdx + 1; i < msgs.length; i++) {
          trailingChars += getMessageCharLength(msgs[i]);
        }
        return baseTokens + Math.ceil(trailingChars / 3.2);
      }
      let totalChars = 0;
      for (const m of msgs) {
        totalChars += getMessageCharLength(m);
      }
      // 历史消息无 usage 时的合理估算：包含系统 Prompt 基础开销及 Agent 工具声明开销
      const isAgent = config && config.enableAgent !== false;
      const baseOverhead = isAgent ? 1800 : 350;
      return Math.max(150, Math.ceil(totalChars / 3.2) + baseOverhead);
    }

    function updateContextProgress() {
      if (!contextRingMeter || !contextRingText) return;
      const maxTokens = (config && Number(config.maxContextTokens)) || 200000;
      if (!currentSession || !Array.isArray(currentSession.messages) || currentSession.messages.length === 0) {
        contextRingMeter.setAttribute('stroke-dasharray', '0, 100');
        contextRingText.textContent = '0%';
        contextRingMeter.classList.remove('warning', 'danger');
        if (contextRingWrap) {
          contextRingWrap.title = `当前上下文: 0 / ${maxTokens.toLocaleString()} tokens (0%)\n【说明】模型单轮工作记忆负载；不同于右上角多轮累计总账\n点击一键压缩上下文`;
        }
        return;
      }

      const currentTokens = calculateCurrentContextTokens(currentSession);
      const rawPct = (currentTokens / maxTokens) * 100;
      const pct = Math.min(100, Math.max(0, Math.round(rawPct)));

      let displayPctText = `${pct}%`;
      let meterDashPct = pct;
      if (currentTokens > 0 && rawPct < 1) {
        displayPctText = '<1%';
        meterDashPct = Math.max(0.8, Number(rawPct.toFixed(1)));
      }

      contextRingMeter.setAttribute('stroke-dasharray', `${meterDashPct}, 100`);
      contextRingText.textContent = displayPctText;

      if (pct >= 85) {
        contextRingMeter.classList.add('danger');
        contextRingMeter.classList.remove('warning');
      } else if (pct >= 60) {
        contextRingMeter.classList.add('warning');
        contextRingMeter.classList.remove('danger');
      } else {
        contextRingMeter.classList.remove('warning', 'danger');
      }

      const pctDetail = rawPct >= 1 ? `${pct}%` : `${rawPct.toFixed(2)}%`;
      if (contextRingWrap) {
        contextRingWrap.title = `当前上下文窗口: ${currentTokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens (${pctDetail})\n【说明】当前单轮发给模型的活跃工作记忆（含系统设定、工具定义及最近上下文）；\n与右上角「会话累计账单」不同，此处反映窗口拥挤度，接近上限时建议压缩\n点击一键压缩上下文`;
      }
    }

    async function triggerCompactContext() {
      if (!currentSession) {
        alert('当前没有活跃的会话');
        return;
      }
      if (isGenerating && generatingSessionId === currentSession.id) {
        alert('当前会话正在生成回复中，请等待生成完毕或中断后再压缩上下文。');
        return;
      }
      const msgs = currentSession.messages || [];
      const userOrAsstMsgs = msgs.filter(m => m.role === 'user' || m.role === 'assistant');
      if (userOrAsstMsgs.length < 2) {
        alert('当前会话历史记录较短，暂无需压缩上下文。');
        return;
      }

      const confirmMsg = '确定要对当前会话进行一键压缩上下文吗？\n\n系统将保留最新对话轮次，把较早的历史对话高密度提炼为结构化摘要，大幅释放模型上下文窗口空间。';
      if (!confirm(confirmMsg)) {
        return;
      }

      if (btnCompactContext) {
        btnCompactContext.disabled = true;
        btnCompactContext.textContent = '压缩中…';
      }
      if (contextRingWrap) {
        contextRingWrap.style.opacity = '0.6';
        contextRingWrap.style.pointerEvents = 'none';
      }

      try {
        const res = await ctx.call('compactContext', { sessionId: currentSession.id });
        if (res && res.ok && res.session) {
          currentSession = res.session;
          const sIdx = sessions.findIndex(s => s.id === currentSession.id);
          if (sIdx !== -1) {
            sessions[sIdx] = currentSession;
          }
          renderMessages();
          updateHeader();
          renderSessionsList();
        } else {
          alert('压缩上下文失败: ' + ((res && res.error) || '未知错误'));
        }
      } catch (err) {
        alert('压缩上下文请求异常: ' + (err.message || String(err)));
      } finally {
        if (btnCompactContext) {
          btnCompactContext.disabled = false;
          btnCompactContext.textContent = '🗜️ 压缩上下文';
        }
        if (contextRingWrap) {
          contextRingWrap.style.opacity = '';
          contextRingWrap.style.pointerEvents = '';
        }
      }
    }

    if (btnCompactContext) {
      btnCompactContext.addEventListener('click', () => {
        triggerCompactContext();
      });
    }

    if (contextRingWrap) {
      contextRingWrap.addEventListener('click', () => {
        triggerCompactContext();
      });
    }

    function updateHeader() {
      if (!currentSession) {
        headerTitle.textContent = '暂无对话';
        sessionUsageBadge.textContent = '0 tokens';
        headerWorkDirPill.textContent = '📁';
        headerWorkDirPill.title = 'Agent 工作目录';
        updateContextProgress();
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

      const currentTokens = calculateCurrentContextTokens(currentSession);
      const tokens = currentSession.totalTokens ? currentSession.totalTokens.totalTokens : 0;
      const cached = currentSession.totalTokens && currentSession.totalTokens.cachedTokens ? currentSession.totalTokens.cachedTokens : 0;

      const maxTokens = (config && Number(config.maxContextTokens)) || 200000;
      const rawPct = (currentTokens / maxTokens) * 100;
      const pct = Math.min(100, Math.max(0, Math.round(rawPct)));
      const pctDetail = rawPct >= 1 ? `${pct}%` : `${rawPct.toFixed(2)}%`;

      sessionUsageBadge.textContent = `${currentTokens.toLocaleString()} tokens`;
      const cacheNote = cached > 0 ? `\n(多轮累计命中缓存: ${cached.toLocaleString()} tokens)` : '';
      const billNote = tokens > 0 ? `\n会话累计总账单: ${tokens.toLocaleString()} tokens` : '';
      sessionUsageBadge.title = `当前活跃上下文: ${currentTokens.toLocaleString()} tokens (${pctDetail})${billNote}${cacheNote}\n【说明】模型单轮推理实际占用的活跃工作记忆；压缩上下文后此数值与百分比将同步下降`;
      updateActivePersonaPill();
      updateContextProgress();
    }

    // Scroll Control
    let autoScrollEnabled = true;
    function isAtBottom(threshold = 48) {
      return (messagesScroll.scrollHeight - messagesScroll.scrollTop - messagesScroll.clientHeight) <= threshold;
    }
    messagesScroll.addEventListener('scroll', () => {
      autoScrollEnabled = isAtBottom(48);
    }, { passive: true });

    // Stop Subprocess Button Listener (delegated)
    messagesScroll.addEventListener('click', async (e) => {
      const stopBtn = e.target.closest('.ai-tool-stop-proc-btn');
      if (stopBtn && !stopBtn.disabled) {
        e.stopPropagation();
        const pid = Number(stopBtn.dataset.pid);
        if (!pid) return;
        stopBtn.disabled = true;
        stopBtn.textContent = '停止中…';
        try {
          const res = await ctx.call('killProcess', { pid });
          if (res && res.ok) {
            const allBtns = messagesScroll.querySelectorAll(`.ai-tool-stop-proc-btn[data-pid="${pid}"]`);
            allBtns.forEach(btn => {
              btn.textContent = '✓ 已停止';
              btn.classList.add('stopped');
              btn.disabled = true;
            });
          } else {
            stopBtn.textContent = '停止失败';
            stopBtn.title = (res && res.error) || '未知错误';
            setTimeout(() => {
              if (!stopBtn.classList.contains('stopped')) {
                stopBtn.textContent = '⏹ 停止进程';
                stopBtn.disabled = false;
              }
            }, 2000);
          }
        } catch (err) {
          stopBtn.textContent = '停止失败';
          stopBtn.title = err.message || String(err);
          setTimeout(() => {
            if (!stopBtn.classList.contains('stopped')) {
              stopBtn.textContent = '⏹ 停止进程';
              stopBtn.disabled = false;
            }
          }, 2000);
        }
      }
    });

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

    function renderTaskCard() {
      TaskDrawer.renderTaskCard({
        panelEl: el,
        messagesScroll,
        currentSession,
        ctx,
        extractTasksFromContent,
        escapeHtml
      });
    }

    // Messages View & Elements
    function renderMessages() {
      messagesScroll.innerHTML = '';
      renderTaskCard();
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
        if (msg.role === 'system' || msg.role === 'tool') return;
        const card = createMessageElement(msg);
        messagesScroll.appendChild(card);
      });

      renderTaskCard();
      scrollToBottom(true);

      // 重建后恢复未决审批/计划评审卡：这些分片不会重发，丢了就只能中断流
      restorePendingLateChunks();
    }


    async function sendMessage(customContent = null, editMessageId = null, customAttachments = null) {
      if (isGenerating) return;
      let text = customContent !== null ? customContent : chatInput.value.trim();
      // != null 同时兜住 undefined：编辑/重发刚发出的纯文本消息时调用方传
      // atts || msg.images 求值为 undefined，attachments 不可迭代直接 TypeError
      const attachments = customAttachments != null ? customAttachments : [...pendingAttachments];
      if ((!text && attachments.length === 0) || !currentSession) return;

      const images = [];
      for (const att of attachments) {
        if (att.type === 'image' || att.url || att.isImage) {
          images.push({
            type: 'image',
            id: att.id,
            name: att.name,
            url: att.url || att.dataUrl
          });
        }
      }

      // Display vs Model Surface Isolation:
      // The user message retains the pure instruction text for clean UI rendering and editing.
      // The model inference layer automatically assembles attached files/directories into the prompt context.

      if (customContent === null) {
        chatInput.value = '';
        pendingAttachments = [];
        syncAttachmentsBar();
        autoResizeInput();
        updateSendOrStopButton();
      }

      setGeneratingState(true);
      generatingSessionId = currentSession.id;

      let userMsg;
      if (editMessageId) {
        const found = currentSession.messages.find(m => m.id === editMessageId);
        if (found) {
          found.content = text;
          if (images.length > 0) found.images = images;
          if (attachments.length > 0) found.attachments = attachments;
          userMsg = found;
          const idx = currentSession.messages.indexOf(found);
          if (idx !== -1) currentSession.messages = currentSession.messages.slice(0, idx + 1);
        }
      }

      if (!userMsg) {
        userMsg = {
          id: 'msg_' + Date.now(),
          role: 'user',
          content: text,
          images: images.length > 0 ? images : undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
          timestamp: Date.now()
        };
        currentSession.messages.push(userMsg);
      }

      const assistantMsg = {
        id: 'msg_asst_' + Date.now(),
        role: 'assistant',
        content: '',
        reasoning: '',
        timestamp: Date.now()
      };
      currentSession.messages.push(assistantMsg);

      renderMessages();
      renderSessionsList();
      updateHeader();

      const enableCot = pillCot.classList.contains('active');
      const enableAgent = pillAgent.classList.contains('active');

      try {
        const res = await ctx.call('sendMessage', {
          sessionId: currentSession.id,
          content: text,
          images: images.length > 0 ? images : undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
          editMessageId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          enableReasoning: enableCot,
          enableAgent
        });

        if (res && res.ok && res.streamId) {
          currentStreamId = res.streamId;
          if (abortRequested) {
            abortRequested = false;
            ctx.call('abortStream', { streamId: currentStreamId });
            currentStreamId = null;
            generatingSessionId = null;
            setGeneratingState(false);
          }
        } else {
          abortRequested = false;
          assistantMsg.content = `❌ 发起流式回复失败: ${(res && res.error) || '未知错误'}`;
          setGeneratingState(false);
          generatingSessionId = null;
          renderMessages();
        }
      } catch (err) {
        abortRequested = false;
        assistantMsg.content = `❌ 请求异常: ${err.message || err}`;
        setGeneratingState(false);
        generatingSessionId = null;
        renderMessages();
      }
    }

    function appendApprovalCard(bubble, payload, chunk, onResolved) {
      let card = bubble ? bubble.querySelector(`.ai-tool-approval[data-approval="${chunk.toolId}"]`) : null;
      if (!card) {
        // dsh: 审批挂接到已流式展示的工具卡上（callId 关联），不渲染第二份参数副本；
        // 工具卡缺失（迟到分片等场景）时回退为独立审批卡
        const toolCard = bubble ? bubble.querySelector(`.ai-tool-card[data-tool="${chunk.toolId}"]`) : null;
        const inlineSlot = toolCard ? toolCard.querySelector('.ai-tool-approval-slot') : null;

        card = document.createElement('div');
        card.className = 'ai-tool-approval';
        card.dataset.approval = chunk.toolId;
        if (inlineSlot) {
          card.classList.add('inline');
          card.innerHTML = `
            <div class="ai-approval-head">
              <div class="ai-approval-title">
                <span class="ai-approval-ico">🔐</span>
                <span>需要批准执行 · 参数见上方「查看调用参数」</span>
              </div>
            </div>
            <div class="ai-approval-actions">
              <button type="button" class="ai-approval-btn allow">✓ 允许执行</button>
              <button type="button" class="ai-approval-btn deny">✗ 拒绝</button>
              <button type="button" class="ai-approval-btn always">允许并记住（本会话）</button>
            </div>
          `;
        } else {
          let argsPretty = chunk.args || '';
          try { argsPretty = JSON.stringify(JSON.parse(chunk.args), null, 2); } catch {}
          card.innerHTML = `
            <div class="ai-approval-head">
              <div class="ai-approval-title">
                <span class="ai-approval-ico">${chunk.toolName === 'dispatch_task_to_ai_ide' ? '🚀' : '🔐'}</span>
                <span>${chunk.toolName === 'dispatch_task_to_ai_ide' ? '请求派发任务至外部 AI IDE / CLI' : `请求执行工具 <strong>${escapeHtml(chunk.toolName)}</strong>`}</span>
              </div>
              <button type="button" class="ai-approval-copy-btn" title="复制参数">📋 复制参数</button>
            </div>
            <pre class="ai-approval-args">${escapeHtml(argsPretty)}</pre>
            <div class="ai-approval-actions">
              <button type="button" class="ai-approval-btn allow">✓ 允许执行</button>
              <button type="button" class="ai-approval-btn deny">✗ 拒绝</button>
              <button type="button" class="ai-approval-btn always">允许并记住（本会话）</button>
            </div>
          `;
          const copyBtn = card.querySelector('.ai-approval-copy-btn');
          if (copyBtn) {
            copyBtn.addEventListener('click', async (e) => {
              e.stopPropagation();
              await copyToClipboard(argsPretty);
              copyBtn.textContent = '✓ 已复制';
              setTimeout(() => { copyBtn.textContent = '📋 复制参数'; }, 1500);
            });
          }
        }
        if (inlineSlot) inlineSlot.appendChild(card);
        else if (bubble) {
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

    // 轻量计划模式评审卡：批准→转任务清单 / 继续规划→带反馈修订（dsh plan review）
    function appendPlanReviewCard(timeline, payload, chunk) {
      if (!timeline || !chunk || !chunk.planId) return;
      let card = timeline.querySelector(`.ai-plan-review[data-plan="${chunk.planId}"]`);
      if (card) return;
      const streamId = payload && payload.streamId;

      card = document.createElement('div');
      card.className = 'ai-plan-review';
      card.dataset.plan = chunk.planId;
      card.innerHTML = `
        <div class="ai-plan-head">
          <span class="ai-plan-ico">📋</span>
          <span class="ai-plan-title">执行计划评审</span>
        </div>
        <div class="ai-plan-body">${renderMarkdown(chunk.markdown || '')}</div>
        <div class="ai-plan-feedback hidden">
          <textarea class="ai-plan-feedback-input" rows="2" placeholder="反馈：哪些步骤需要调整？"></textarea>
        </div>
        <div class="ai-plan-actions">
          <button type="button" class="ai-plan-btn approve">✓ 批准并生成任务清单</button>
          <button type="button" class="ai-plan-btn revise">✎ 继续规划</button>
        </div>
      `;
      timeline.appendChild(card);

      if (HljsRenderer) HljsRenderer.highlightContainer(card);
      if (MermaidRenderer) MermaidRenderer.initMessageDynamicElements(card, { renderMermaid: false, copyToClipboard });

      const actionsEl = card.querySelector('.ai-plan-actions');
      const feedbackWrap = card.querySelector('.ai-plan-feedback');
      const feedbackInput = card.querySelector('.ai-plan-feedback-input');

      // 决议后从缓冲移除：否则 renderMessages 重建会复活一张带批准按钮的
      // 已决议计划卡（再点决议后端只会报已处理）
      const removePlanFromBuf = () => {
        const b = peekLateChunkBuf(payload && payload.sessionId);
        if (b) b.plans = b.plans.filter(pl => pl.chunk.planId !== chunk.planId);
      };

      card.querySelector('.ai-plan-btn.approve').addEventListener('click', async () => {
        try {
          await ctx.call('resolvePlanReview', { streamId, planId: chunk.planId, approved: true });
        } catch {}
        removePlanFromBuf();
        actionsEl.innerHTML = '<span class="ai-plan-status ok">✓ 已批准 · 已生成任务清单，任务面板已更新</span>';
        feedbackWrap.classList.add('hidden');
      });

      const reviseBtn = card.querySelector('.ai-plan-btn.revise');
      reviseBtn.addEventListener('click', async () => {
        if (feedbackWrap.classList.contains('hidden')) {
          feedbackWrap.classList.remove('hidden');
          reviseBtn.textContent = '📤 提交反馈';
          if (feedbackInput) feedbackInput.focus();
          return;
        }
        const feedback = feedbackInput ? feedbackInput.value.trim() : '';
        try {
          await ctx.call('resolvePlanReview', { streamId, planId: chunk.planId, approved: false, feedback });
        } catch {}
        removePlanFromBuf();
        actionsEl.innerHTML = `<span class="ai-plan-status revise">✎ 已反馈${feedback ? '：' + escapeHtml(feedback.slice(0, 80)) : ''} · 等待模型修订计划</span>`;
        feedbackWrap.classList.add('hidden');
      });
    }

    function restorePendingLateChunks() {
      if (!currentSession) return;
      const buf = peekLateChunkBuf(currentSession.id);
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
          const b = peekLateChunkBuf(p.sessionId);
          if (b) b.approvals = b.approvals.filter(ap => ap.chunk.toolId !== p.chunk.toolId);
        });
        if (!bubble) {
          messagesScroll.appendChild(card);
        }
      });
      buf.plans.forEach(p => {
        if (messagesScroll.querySelector(`.ai-plan-review[data-plan="${p.chunk.planId}"]`)) return;
        const msgEl = messagesScroll.querySelector(`.ai-msg[data-id="${p.messageId}"]`);
        const bubble = msgEl ? msgEl.querySelector('.ai-msg-bubble') : null;
        if (bubble) {
          const tl = bubble.querySelector('.ai-bubble-timeline') || bubble;
          appendPlanReviewCard(tl, p, p.chunk);
        }
      });
      if (buf.approvals.length || buf.plans.length) scrollToBottom();
    }

    // Stream Chunk Listener via IPC
    ctx.onEvent('stream-chunk', payload => {
      if (!payload || !payload.chunk) return;
      const { chunk, messageId } = payload;
      const isTerminal = chunk.type === 'complete' || chunk.type === 'aborted' || chunk.type === 'error';

      if (!currentSession || payload.sessionId !== currentSession.id) {
        const buf = getLateChunkBuf(payload.sessionId);
        if (chunk.type === 'tool_approval_request') buf.approvals.push(payload);
        if (chunk.type === 'plan_review_request') buf.plans.push(payload);
        if (isTerminal) buf.terminated = true;
        if (chunk.type === 'task_list' || (isTerminal && chunk.taskList !== undefined)) {
          const targetSess = sessions.find(s => s.id === payload.sessionId);
          if (targetSess) targetSess.taskList = chunk.tasks || chunk.taskList;
        }
        if (isTerminal && generatingSessionId === payload.sessionId) {
          generatingSessionId = null;
          if (isGenerating) setGeneratingState(false);
        }
        return;
      }

      if (isTerminal && generatingSessionId === payload.sessionId) generatingSessionId = null;

      if (chunk.type === 'task_list') {
        currentSession.taskList = Array.isArray(chunk.tasks) ? chunk.tasks : [];
        renderTaskCard();
        return;
      }

      // dsh Steering：插话立即上屏 / 状态回写
      if (chunk.type === 'steered') {
        if (currentSession && Array.isArray(currentSession.messages) && chunk.message) {
          if (!currentSession.messages.some(m => m.id === chunk.message.id)) {
            currentSession.messages.push(chunk.message);
          }
          const steerEl = createMessageElement(chunk.message);
          messagesScroll.appendChild(steerEl);
          scrollToBottom();
        }
        return;
      }
      if (chunk.type === 'steer_consumed' || chunk.type === 'steer_deferred') {
        const stateText = chunk.type === 'steer_consumed' ? '已生效 ✓' : '本轮未消费 · 已入历史';
        for (const sid of chunk.ids || []) {
          const tag = messagesScroll.querySelector(`.ai-msg[data-id="${sid}"] .ai-steer-tag`);
          if (tag) {
            tag.textContent = `🧭 ${stateText}`;
            tag.classList.add(chunk.type === 'steer_consumed' ? 'ok' : 'deferred');
          }
          const localMsg = currentSession && currentSession.messages.find(m => m.id === sid);
          if (localMsg) localMsg.steerState = chunk.type === 'steer_consumed' ? 'consumed' : 'deferred';
        }
        return;
      }

      let msgEl = null;
      if (messageId) {
        msgEl = messagesScroll.querySelector(`.ai-msg[data-id="${messageId}"]`);
        if (!msgEl) {
          const targetMsg = (currentSession.messages || []).find(m => m.id === messageId);
          if (targetMsg) {
            msgEl = createMessageElement(targetMsg);
            messagesScroll.appendChild(msgEl);
          }
        }
      } else if (chunk.type === 'mcp_error') {
        const bubbles = messagesScroll.querySelectorAll('.ai-msg.assistant .ai-msg-bubble');
        msgEl = bubbles.length ? bubbles[bubbles.length - 1].closest('.ai-msg') : null;
      }

      // Robust fallback: messageId 找不到时，只在"末尾 assistant 是空占位"
      // （无正文/无推理/无工具调用，即本流丢联的占位）时重新绑定其 id；
      // 绝不改写无关历史消息的 id——那会让 complete/aborted 的整段回写
      // 覆盖历史回答、后续编辑删除命中错误记录。否则新建占位消息与气泡。
      if (!msgEl) {
        const lastMsg = currentSession?.messages?.[currentSession.messages.length - 1];
        const isVacant = lastMsg && lastMsg.role === 'assistant' &&
          !lastMsg.content && !lastMsg.reasoning &&
          !(Array.isArray(lastMsg.toolCalls) && lastMsg.toolCalls.length);
        if (isVacant && messageId) {
          lastMsg.id = messageId;
          const assistantEls = messagesScroll.querySelectorAll('.ai-msg.assistant');
          if (assistantEls.length > 0) {
            msgEl = assistantEls[assistantEls.length - 1];
            msgEl.dataset.id = messageId;
          }
        }
        if (!msgEl && messageId && currentSession && Array.isArray(currentSession.messages)) {
          const placeholder = {
            id: messageId, role: 'assistant', content: '', contentSteps: [],
            reasoning: '', reasoningSteps: [], usage: null, toolCalls: null,
            toolResults: {}, timestamp: Date.now()
          };
          currentSession.messages.push(placeholder);
          msgEl = createMessageElement(placeholder);
          messagesScroll.appendChild(msgEl);
          scrollToBottom();
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
        // 丢弃该消息的全部增量槽位：清 innerHTML 后槽位若仍被复用，降级
        // 重试的流式正文会写进脱离 DOM 的节点，直到 complete 才可见
        for (const key of [...streamSlots.keys()]) {
          if (key.startsWith(`${messageId}::`)) streamSlots.delete(key);
        }
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
        // dsh 增量渲染：settled 前缀只渲一次，活动尾块按帧合帧重渲，
        // Mermaid/高亮延后到轮次结束时统一执行
        const slot = getStreamSlot(mdBlock, messageId, round);
        if (slot) {
          slot.scheduleUpdate(textToRender);
        } else {
          mdBlock.innerHTML = renderMarkdown(textToRender);
          if (MermaidRenderer) {
            MermaidRenderer.initMessageDynamicElements(mdBlock, { renderMermaid: false, copyToClipboard });
          }
        }
        scrollToBottom();
      } else if (chunk.type === 'tool_calls') {
        let timeline = bubble.querySelector('.ai-bubble-timeline');
        if (!timeline) {
          timeline = document.createElement('div');
          timeline.className = 'ai-bubble-timeline';
          const md = bubble.querySelector('.ai-md-body');
          if (md) bubble.insertBefore(timeline, md); else bubble.appendChild(timeline);
        }

        const activeCot = timeline.querySelector('.ai-cot-box[open]');
        if (activeCot) {
          const sum = activeCot.querySelector('.ai-cot-summary span');
          const r = activeCot.dataset.round;
          if (sum) {
            const prefix = (r && Number(r) > 0) ? `🧠 进一步思考 (第 ${Number(r) + 1} 步)` : '🧠 思考过程';
            sum.textContent = `${prefix} (已完成)`;
          }
          // dsh: 思考过程完成后自动收起，保持时间线聚焦在工具与内容
          activeCot.open = false;
        }

        for (const tc of chunk.toolCalls) {
          if (!timeline.querySelector(`.ai-tool-badge[data-tool="${tc.id}"]`)) {
            const b = ToolCards
              ? ToolCards.createToolCard(tc, { phase: 'streaming' })
              : null;
            if (b) {
              if (tc.round !== undefined && tc.round !== null) b.dataset.round = String(tc.round);
              timeline.appendChild(b);
            }
          }
        }
        scrollToBottom();
      } else if (chunk.type === 'tool_exec_start') {
        // 参数已定稿：升级工具卡为"执行中"并展示可查参数（dsh: 参数事后可查）
        let timeline = bubble.querySelector('.ai-bubble-timeline');
        if (!timeline) {
          timeline = document.createElement('div');
          timeline.className = 'ai-bubble-timeline';
          bubble.appendChild(timeline);
        }
        let minRound = Infinity;
        for (const tc of chunk.toolCalls || []) {
          const card = bubble.querySelector(`.ai-tool-card[data-tool="${tc.id}"]`);
          if (card && ToolCards) ToolCards.applyExecStart(card, tc);
          else if (!card && ToolCards) {
            const c = ToolCards.createToolCard(tc, { phase: 'running' });
            timeline.appendChild(c);
          }
          if (tc.round !== undefined && tc.round !== null) minRound = Math.min(minRound, Number(tc.round));
        }
        if (Number.isFinite(minRound) && minRound > 0) {
          // 下一轮已开始：结算上一轮渲染槽并折叠更早轮次
          markRoundUpTo(timeline, minRound);
          finalizeStreamSlots(bubble, messageId, {});
        }
        scrollToBottom();
      } else if (chunk.type === 'tool_truncated') {
        const note = document.createElement('div');
        note.className = 'ai-tool-truncated-note';
        note.textContent = `⚠️ 工具 ${chunk.toolName || ''} 参数疑似被 max-tokens 截断，已安全丢弃本次调用（模型会重新发起）`;
        const tl = bubble.querySelector('.ai-bubble-timeline');
        if (tl) tl.appendChild(note); else bubble.appendChild(note);
        scrollToBottom();
      } else if (chunk.type === 'status') {
        // dsh 压缩透明化：compaction / overflow 等状态以轻量行内提示呈现
        if (chunk.status === 'compaction_start' || chunk.status === 'compaction_end' || chunk.status === 'overflow_recovery') {
          const note = document.createElement('div');
          note.className = 'ai-status-note';
          note.dataset.status = chunk.status;
          note.textContent = (chunk.status === 'compaction_end' ? '🗜️ ' : '⏳ ') + (chunk.message || chunk.status);
          const tl = bubble.querySelector('.ai-bubble-timeline');
          if (tl) tl.appendChild(note); else bubble.appendChild(note);
          scrollToBottom();
        }
      } else if (chunk.type === 'tool_approval_request') {
        // 同会话也入缓冲：renderMessages 重建（编辑取消/删压缩卡等）会清掉
        // 审批卡，不缓冲的话流挂起等决议却没有任何 UI 入口，只能中断
        getLateChunkBuf(payload.sessionId).approvals.push(payload);
        let timeline = bubble.querySelector('.ai-bubble-timeline') || bubble;
        appendApprovalCard(timeline, payload, chunk, () => {
          const buf = peekLateChunkBuf(payload.sessionId);
          if (buf) buf.approvals = buf.approvals.filter(ap => ap.chunk.toolId !== chunk.toolId);
        });
        scrollToBottom();
      } else if (chunk.type === 'mcp_error') {
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
      } else if (chunk.type === 'plan_review_request') {
        getLateChunkBuf(payload.sessionId).plans.push(payload); // 同会话重渲后可恢复（与审批卡同因）
        const tl = bubble.querySelector('.ai-bubble-timeline') || bubble;
        appendPlanReviewCard(tl, payload, chunk);
        scrollToBottom();
      } else if (chunk.type === 'tool_result') {
        const b = bubble.querySelector(`.ai-tool-badge[data-tool="${chunk.toolId}"]`);
        if (b && ToolCards) {
          ToolCards.applyToolResult(b, chunk.toolName, chunk.result);
          // 停止进程联动：跨消息把同 PID 的停止按钮标记为已停止
          const res = chunk.result || {};
          if (chunk.toolName === 'stop_process' && res.ok && res.pid) {
            const allWithPid = messagesScroll.querySelectorAll(`.ai-tool-stop-proc-btn[data-pid="${res.pid}"]`);
            allWithPid.forEach(btn => {
              btn.textContent = '✓ 已停止';
              btn.classList.add('stopped');
              btn.disabled = true;
            });
          }
          if (HljsRenderer) HljsRenderer.highlightContainer(b);
        }
        scrollToBottom();
      } else if (chunk.type === 'usage') {
        let usageSpan = msgEl.querySelector('.ai-msg-usage');
        if (usageSpan) {
          const cachedText = (chunk.usage && chunk.usage.cachedTokens) ? ` (命中缓存 ${chunk.usage.cachedTokens.toLocaleString()})` : '';
          usageSpan.textContent = `Prompt: ${chunk.usage.promptTokens}${cachedText} · Output: ${chunk.usage.completionTokens} · Total: ${chunk.usage.totalTokens}`;
        }
        if (currentSession && Array.isArray(currentSession.messages)) {
          let m = currentSession.messages.find(x => x.id === messageId);
          if (!m) {
            const assts = currentSession.messages.filter(x => x.role === 'assistant');
            const last = assts.length > 0 ? assts[assts.length - 1] : null;
            // 兜底只认空占位：usage 落到无关历史回答上属于污染
            if (last && !last.content && !last.reasoning) m = last;
          }
          if (m) {
            m.usage = chunk.usage;
          }
        }
        updateContextProgress();
      } else if (chunk.type === 'complete' || chunk.type === 'aborted' || chunk.type === 'error') {
        setGeneratingState(false);
        abortRequested = false; // 流已终态，清掉未消费的中断意图防误杀下一次发送
        currentStreamId = null;
        generatingSessionId = null; // 终态不清会永久 stale，后续守卫组合判断失真
        // 结算全部增量渲染槽：最终 DOM 与历史渲染路径完全一致
        finalizeStreamSlots(bubble, messageId, { deep: true });
        if (MermaidRenderer) {
          MermaidRenderer.initMessageDynamicElements(bubble, { renderMermaid: true, copyToClipboard });
        }
        // 折叠更早轮次（保留最后一轮正文展开）+ CoT 全部收起 + Turn 页脚
        const tlEnd = bubble.querySelector('.ai-bubble-timeline');
        if (tlEnd) {
          const roundNums = Array.from(tlEnd.children)
            .map(el => (el.dataset ? Number(el.dataset.round) : NaN))
            .filter(n => !Number.isNaN(n));
          const maxRound = roundNums.length ? Math.max(...roundNums) : 0;
          collapseCompletedRounds(tlEnd, maxRound);
          if (HljsRenderer) HljsRenderer.highlightContainer(tlEnd);
        }
        renderTurnFooter(bubble, chunk.message || {});
        scrollToBottom();
        if (chunk.message && currentSession && currentSession.messages) {
          let m = currentSession.messages.find(x => x.id === messageId);
          if (!m) {
            const assts = currentSession.messages.filter(x => x.role === 'assistant');
            const last = assts.length > 0 ? assts[assts.length - 1] : null;
            // 兜底只认空占位：整段流式回写落到无关历史回答上等于覆盖用户数据
            if (last && (!last.content || last.id === messageId)) m = last;
          }
          if (m) {
            if (messageId && !m.content) m.id = messageId;
            m.content = chunk.message.content || m.content;
            m.reasoning = chunk.message.reasoning || m.reasoning;
            if (chunk.message.usage) {
              m.usage = chunk.message.usage;
            }
          }
        }
        if (chunk.taskList !== undefined && currentSession) {
          currentSession.taskList = chunk.taskList;
        }
        renderTaskCard();

        // Safety Net: If content was not rendered during streaming chunks, force render it now
        if (chunk.message && chunk.message.content) {
          let timeline = bubble.querySelector('.ai-bubble-timeline');
          if (!timeline) {
            timeline = document.createElement('div');
            timeline.className = 'ai-bubble-timeline';
            bubble.appendChild(timeline);
          }
          let mdBlock = timeline.querySelector('.ai-md-block');
          if (!mdBlock) {
            mdBlock = document.createElement('div');
            mdBlock.className = 'ai-md-block ai-md-body';
            timeline.appendChild(mdBlock);
          }
          if (!mdBlock.textContent.trim()) {
            mdBlock.innerHTML = renderMarkdown(chunk.message.content);
            if (MermaidRenderer) {
              MermaidRenderer.initMessageDynamicElements(mdBlock, { renderMermaid: true, copyToClipboard });
            }
            if (HljsRenderer) HljsRenderer.highlightContainer(mdBlock);
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
          cb.open = false;
        });
        if (chunk.sessionTotalTokens) {
          if (currentSession) currentSession.totalTokens = chunk.sessionTotalTokens;
        }
        updateHeader();
        updateContextProgress();
        if (chunk.type === 'error') {
          const errDiv = document.createElement('div');
          errDiv.style.color = 'var(--red)';
          errDiv.style.marginTop = '6px';
          errDiv.textContent = `❌ ${chunk.error}`;
          bubble.appendChild(errDiv);
        }
      }
    });

    // Boot & Initial Load
    ctx.call('getInitData').then(data => {
      if (!data) return;
      config = data.config || {};
      personas = data.personas || [];
      sessions = data.sessions || [];
      currentSession = data.activeSession || null;
      memories = data.memories || [];
      mcpServers = data.mcpServers || [];
      skills = data.skills || [];

      agentMode = config.agentApprovalMode || 'ask';
      thinkLevel = config.thinkingLevel || 'auto';
      updateAgentModeUI();
      updateThinkLevelUI();
      renderPersonas();
      renderSessionsList();
      updateHeader();
      renderMessages();
      syncPlanPill();

      if (ctx.payload && (typeof ctx.payload === 'string' || ctx.payload.text)) {
        const pv = typeof ctx.payload === 'string' ? ctx.payload : ctx.payload.text;
        chatInput.value = pv;
        autoResizeInput();
      }
    }).catch(() => {});

    return function cleanup() {
      if (contextPopoverEl && contextPopoverEl.parentElement) {
        contextPopoverEl.remove();
        contextPopoverEl = null;
      }
      if (popoverHideTimer) {
        clearTimeout(popoverHideTimer);
        popoverHideTimer = null;
      }
      document.removeEventListener('click', onDocumentGlobalClickClosePopovers);
      if (queueDrainTimer) { clearTimeout(queueDrainTimer); queueDrainTimer = null; }
      if (typeof disposeLightbox === 'function') disposeLightbox();
      if (isGenerating && currentStreamId) {
        ctx.call('abortStream', { streamId: currentStreamId });
      }
    };
  }

  // mount 是异步的（ensureDependencies 加载 9 个脚本）：unmount 可能发生在
  // mount promise resolve 之前，单变量 cleanupFn 会让该实例的清理永久丢失
  //（document 监听 + stream-chunk 订阅泄漏）。用 Set 收集所有实例的清理函数，
  // unmount 时全部执行并清空。
  const cleanupFns = new Set();
  if (typeof window !== 'undefined' && window.Toolbox && window.Toolbox.panel) {
    window.Toolbox.panel({
      mount(el, ctx) {
        mount(el, ctx).then(fn => {
          if (typeof fn === 'function') cleanupFns.add(fn);
        }).catch(() => {});
      },
      unmount() {
        for (const fn of cleanupFns) {
          try { fn(); } catch { /* cleanup 自身异常不阻断其余清理 */ }
        }
        cleanupFns.clear();
      }
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      renderMarkdown,
      splitTableRow,
      parseTableDelimiterRow,
      extractTasksFromContent
    };
  }
})();
