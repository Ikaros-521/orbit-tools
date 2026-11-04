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
      'plugin://ai-chat/components/panel-template.js',
      'plugin://ai-chat/components/task-drawer.js',
      'plugin://ai-chat/components/prompt-queue.js',
      'plugin://ai-chat/components/settings-modals.js'
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
    const chatInput = el.querySelector('#chatInput');
    const btnSendOrStop = el.querySelector('#btnSendOrStop');
    const btnPlusAttachment = el.querySelector('#btnPlusAttachment');
    const plusPopover = el.querySelector('#plusPopover');
    const btnMenuPickImage = el.querySelector('#btnMenuPickImage');
    const btnMenuPickFile = el.querySelector('#btnMenuPickFile');
    const btnMenuPickFolder = el.querySelector('#btnMenuPickFolder');
    const imageFileInput = el.querySelector('#imageFileInput');
    const promptQueueBar = el.querySelector('#promptQueueBar');
    const inputAttachmentsBar = el.querySelector('#inputAttachmentsBar');
    const aiInputWrap = el.querySelector('.ai-input-wrap');
    const aiLightboxModal = el.querySelector('#aiLightboxModal');
    const aiLightboxBackdrop = el.querySelector('#aiLightboxBackdrop');
    const btnCloseLightbox = el.querySelector('#btnCloseLightbox');
    const aiLightboxImg = el.querySelector('#aiLightboxImg');
    const aiLightboxCaption = el.querySelector('#aiLightboxCaption');

    // Attachments & Prompt Queue state
    let pendingAttachments = [];
    const sessionPromptQueues = new Map();

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
    let popoverCurrentPage = 1;
    const popoverPageSize = 6;
    let isGenerating = false;
    let currentStreamId = null;
    let generatingSessionId = null;
    let agentMode = 'ask';
    let thinkLevel = 'auto';

    const pendingLateChunks = new Map();
    function getLateChunkBuf(sessionId) {
      let b = pendingLateChunks.get(sessionId);
      if (!b) {
        b = { approvals: [], terminated: false };
        pendingLateChunks.set(sessionId, b);
      }
      return b;
    }

    // Initialize Lightbox
    const PromptQueue = window.AiChatPromptQueue;
    const TaskDrawer = window.AiChatTaskDrawer;
    const SettingsModals = window.AiChatSettingsModals;
    const MermaidRenderer = window.AiChatMermaid;

    const { openLightbox, closeLightbox } = PromptQueue.initLightbox({
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
    }

    function setGeneratingState(generating) {
      isGenerating = generating;
      updateSendOrStopButton();
      if (!generating) {
        setTimeout(() => {
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
      const newHeight = Math.min(chatInput.scrollHeight, 180);
      chatInput.style.height = `${newHeight}px`;
    }

    chatInput.addEventListener('input', () => {
      autoResizeInput();
      updateSendOrStopButton();
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (isGenerating) {
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
      }
    });

    btnSendOrStop.addEventListener('click', () => {
      if (btnSendOrStop.classList.contains('stop')) {
        if (currentStreamId) {
          ctx.call('abortStream', { streamId: currentStreamId });
          setGeneratingState(false);
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
        plusPopover.classList.toggle('hidden');
      });
      document.addEventListener('click', (e) => {
        if (!plusPopover.contains(e.target) && e.target !== btnPlusAttachment) {
          plusPopover.classList.add('hidden');
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

    // CoT & Agent Pills
    pillCot.addEventListener('click', () => {
      pillCot.classList.toggle('active');
      syncThinkLevelPill();
    });
    pillAgent.addEventListener('click', () => {
      pillAgent.classList.toggle('active');
    });

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

    // Persona Selector Popover
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
      if (!currentSession) return;
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

    /* --- Model Quick Picker Controller ---------------------------------- */
    let modelQuickSearchText = '';

    function getPresetChannels() {
      if (typeof window !== 'undefined' && window.AiChatMarkdown && Array.isArray(window.AiChatMarkdown.PRESET_CHANNELS)) {
        return window.AiChatMarkdown.PRESET_CHANNELS;
      }
      try {
        const md = require('./lib/markdown-renderer');
        return md.PRESET_CHANNELS || [];
      } catch {}
      return [];
    }

    function renderModelPopoverList() {
      if (!modelPopoverList) return;
      modelPopoverList.innerHTML = '';
      const presetChannels = getPresetChannels();
      const currChannelId = (config && config.channel) || 'openai';
      const currModel = ((config && config.model) || 'gpt-4o-mini').trim();
      const currentChannel = presetChannels.find(ch => ch.id === currChannelId);

      const q = modelQuickSearchText.trim().toLowerCase();
      if (btnClearModelQuickSearch) {
        btnClearModelQuickSearch.classList.toggle('hidden', !q);
      }

      // 汇总候选列表
      // 1. 当前渠道推荐模型
      const currChannelModels = (currentChannel && currentChannel.models) ? currentChannel.models : [];
      // 2. 其它渠道预设模型（带渠道标志）
      const otherChannelModels = [];
      presetChannels.forEach(ch => {
        if (ch.id === currChannelId) return;
        (ch.models || []).forEach(m => {
          if (!currChannelModels.includes(m) && !otherChannelModels.some(x => x.model === m)) {
            otherChannelModels.push({ model: m, channelName: ch.name.split(' ')[0], icon: ch.icon || '🤖' });
          }
        });
      });

      const matchedCurr = currChannelModels.filter(m => !q || m.toLowerCase().includes(q));
      const matchedOther = otherChannelModels.filter(item => !q || item.model.toLowerCase().includes(q) || item.channelName.toLowerCase().includes(q));

      const totalMatched = matchedCurr.length + matchedOther.length;

      // 如果当前使用的模型既不在当前渠道也不在其他渠道，置顶显示
      if (currModel && !currChannelModels.includes(currModel) && !otherChannelModels.some(x => x.model === currModel)) {
        if (!q || currModel.toLowerCase().includes(q)) {
          const groupTitle = document.createElement('div');
          groupTitle.className = 'ai-model-popover-group-title';
          groupTitle.textContent = '当前自定义模型';
          modelPopoverList.appendChild(groupTitle);

          appendModelItem(currModel, '当前', '✨', true);
        }
      }

      // 渲染当前渠道模型
      if (matchedCurr.length > 0) {
        const groupTitle = document.createElement('div');
        groupTitle.className = 'ai-model-popover-group-title';
        groupTitle.textContent = currentChannel ? `${currentChannel.name.split(' ')[0]} 推荐` : '当前通道推荐';
        modelPopoverList.appendChild(groupTitle);

        matchedCurr.forEach(m => {
          appendModelItem(m, currentChannel ? currentChannel.name.split(' ')[0] : '推荐', (currentChannel && currentChannel.icon) || '⚡', m === currModel);
        });
      }

      // 渲染常用/其它渠道模型
      if (matchedOther.length > 0) {
        const groupTitle = document.createElement('div');
        groupTitle.className = 'ai-model-popover-group-title';
        groupTitle.textContent = '其它预设模型';
        modelPopoverList.appendChild(groupTitle);

        matchedOther.forEach(item => {
          appendModelItem(item.model, item.channelName, item.icon, item.model === currModel);
        });
      }

      // 如果有搜索词且当前搜索词不在已知模型中，提供一键使用自定义模型
      if (q && !currChannelModels.some(m => m.toLowerCase() === q) && !otherChannelModels.some(x => x.model.toLowerCase() === q) && currModel.toLowerCase() !== q) {
        const customOpt = document.createElement('div');
        customOpt.className = 'ai-model-popover-custom-opt';
        customOpt.innerHTML = `<span>➕</span> <span>使用模型 <b>"${escapeHtml(modelQuickSearchText.trim())}"</b></span>`;
        customOpt.addEventListener('click', () => {
          applyQuickModel(modelQuickSearchText.trim());
        });
        modelPopoverList.appendChild(customOpt);
      } else if (totalMatched === 0 && !q) {
        const empty = document.createElement('div');
        empty.className = 'ai-model-empty-tip';
        empty.style.padding = '12px';
        empty.style.textAlign = 'center';
        empty.style.color = 'var(--ink-faint)';
        empty.style.fontSize = '12px';
        empty.textContent = '暂无预设模型，可直接在上方输入模型名称';
        modelPopoverList.appendChild(empty);
      }

      function appendModelItem(modelName, badgeText, icon, isActive) {
        const item = document.createElement('div');
        item.className = 'ai-model-popover-item' + (isActive ? ' active' : '');
        item.title = `切换为 ${modelName}`;
        item.innerHTML = `
          <div class="ai-model-item-main">
            <span class="ai-model-item-icon">${icon}</span>
            <span class="ai-model-item-name">${escapeHtml(modelName)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            ${badgeText ? `<span class="ai-model-item-badge">${escapeHtml(badgeText)}</span>` : ''}
            ${isActive ? '<span class="ai-model-item-check">✓</span>' : ''}
          </div>
        `;
        item.addEventListener('click', () => {
          applyQuickModel(modelName);
        });
        modelPopoverList.appendChild(item);
      }
    }

    async function applyQuickModel(newModel) {
      if (!newModel) return;
      if (modelPopover) modelPopover.classList.add('hidden');
      if (config && config.model === newModel) return;

      try {
        const res = await ctx.call('saveConfig', { model: newModel });
        if (res && res.ok && res.config) {
          config = res.config;
          if (headerModelPill) headerModelPill.textContent = config.model;
          updateHeader();
        } else {
          alert('切换模型失败: ' + ((res && res.error) || '未知错误'));
        }
      } catch (err) {
        alert('切换模型异常: ' + (err.message || String(err)));
      }
    }

    if (btnToggleModelPicker) {
      btnToggleModelPicker.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!modelPopover) return;
        const isHidden = modelPopover.classList.toggle('hidden');
        if (!isHidden) {
          modelQuickSearchText = '';
          if (inputModelQuickSearch) {
            inputModelQuickSearch.value = '';
            inputModelQuickSearch.focus();
          }
          renderModelPopoverList();
        }
      });
    }

    if (inputModelQuickSearch) {
      inputModelQuickSearch.addEventListener('input', () => {
        modelQuickSearchText = inputModelQuickSearch.value;
        renderModelPopoverList();
      });
      inputModelQuickSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const target = modelQuickSearchText.trim();
          if (target) {
            applyQuickModel(target);
          }
        }
      });
    }

    if (btnClearModelQuickSearch) {
      btnClearModelQuickSearch.addEventListener('click', () => {
        modelQuickSearchText = '';
        if (inputModelQuickSearch) {
          inputModelQuickSearch.value = '';
          inputModelQuickSearch.focus();
        }
        renderModelPopoverList();
      });
    }

    if (btnModelPopoverOpenSettings) {
      btnModelPopoverOpenSettings.addEventListener('click', () => {
        if (modelPopover) modelPopover.classList.add('hidden');
        if (typeof settingsCtrl !== 'undefined' && settingsCtrl && settingsCtrl.openSettings) {
          settingsCtrl.openSettings('model');
        } else if (btnOpenSettings) {
          btnOpenSettings.click();
        }
      });
    }

    const onDocumentClickCloseModelPopover = (e) => {
      if (modelPopover && !modelPopover.classList.contains('hidden')) {
        if (!e.target.closest('.ai-model-picker-wrap')) {
          modelPopover.classList.add('hidden');
        }
      }
    };
    document.addEventListener('click', onDocumentClickCloseModelPopover);

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
          }
        });

        item.querySelector('.ai-session-del').addEventListener('click', async (e) => {
          e.stopPropagation();
          sessionPromptQueues.delete(s.id);
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
      const msgs = session.messages;
      let lastAsstWithUsageIdx = -1;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant' && msgs[i].usage && typeof msgs[i].usage.promptTokens === 'number') {
          lastAsstWithUsageIdx = i;
          break;
        }
      }
      if (lastAsstWithUsageIdx !== -1) {
        const baseUsage = msgs[lastAsstWithUsageIdx].usage;
        const baseTokens = (baseUsage.promptTokens || 0) + (baseUsage.completionTokens || 0);
        let trailingChars = 0;
        for (let i = lastAsstWithUsageIdx + 1; i < msgs.length; i++) {
          trailingChars += String(msgs[i].content || '').length;
        }
        return baseTokens + Math.ceil(trailingChars / 3.2);
      }
      let totalChars = 0;
      for (const m of msgs) {
        totalChars += String(m.content || '').length;
      }
      return Math.max(150, Math.ceil(totalChars / 3.2) + 150);
    }

    function updateContextProgress() {
      if (!contextRingMeter || !contextRingText) return;
      const maxTokens = (config && Number(config.maxContextTokens)) || 200000;
      if (!currentSession || !Array.isArray(currentSession.messages) || currentSession.messages.length === 0) {
        contextRingMeter.setAttribute('stroke-dasharray', '0, 100');
        contextRingText.textContent = '0%';
        contextRingMeter.classList.remove('warning', 'danger');
        if (contextRingWrap) {
          contextRingWrap.title = `当前上下文: 0 / ${maxTokens.toLocaleString()} tokens (0%)\n点击一键压缩上下文`;
        }
        return;
      }

      const currentTokens = calculateCurrentContextTokens(currentSession);
      const rawPct = (currentTokens / maxTokens) * 100;
      const pct = Math.min(100, Math.max(0, Math.round(rawPct)));

      contextRingMeter.setAttribute('stroke-dasharray', `${pct}, 100`);
      contextRingText.textContent = `${pct}%`;

      if (pct >= 85) {
        contextRingMeter.classList.add('danger');
        contextRingMeter.classList.remove('warning');
      } else if (pct >= 60) {
        contextRingMeter.classList.add('warning');
        contextRingMeter.classList.remove('danger');
      } else {
        contextRingMeter.classList.remove('warning', 'danger');
      }

      if (contextRingWrap) {
        contextRingWrap.title = `当前上下文: ${currentTokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens (${pct}%)\n点击一键压缩上下文`;
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

      const tokens = currentSession.totalTokens ? currentSession.totalTokens.totalTokens : 0;
      sessionUsageBadge.textContent = `${tokens.toLocaleString()} tokens`;
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
    }

    function createMessageElement(msg) {
      const isUser = msg.role === 'user';
      const msgEl = document.createElement('div');
      msgEl.className = `ai-msg ${isUser ? 'user' : 'assistant'}`;
      msgEl.dataset.id = msg.id;

      const bubble = document.createElement('div');
      bubble.className = 'ai-msg-bubble';

      const toolbar = document.createElement('div');
      toolbar.className = 'ai-msg-toolbar';

      const timeStr = new Date(msg.timestamp || Date.now()).toLocaleTimeString();

      if (isUser) {
        bubble.innerHTML = '';
        if (Array.isArray(msg.images) && msg.images.length > 0) {
          const imgsWrap = document.createElement('div');
          imgsWrap.className = 'ai-msg-images';
          msg.images.forEach((img, idx) => {
            const url = typeof img === 'string' ? img : (img && img.url ? img.url : '');
            if (!url) return;
            const thumb = document.createElement('div');
            thumb.className = 'ai-msg-image-thumb';
            thumb.innerHTML = `<img src="${escapeHtml(url)}" alt="图片 ${idx + 1}" /><span class="ai-msg-image-zoom">🔍</span>`;
            thumb.addEventListener('click', () => openLightbox(url, (img && img.name) || `图片 ${idx + 1}`));
            imgsWrap.appendChild(thumb);
          });
          bubble.appendChild(imgsWrap);
        }
        if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
          const nonImgs = msg.attachments.filter(a => a.type === 'file' || a.type === 'directory');
          if (nonImgs.length > 0) {
            const attWrap = document.createElement('div');
            attWrap.className = 'ai-msg-att-badges';
            nonImgs.forEach(a => {
              const badge = document.createElement('span');
              badge.className = `ai-msg-att-badge ${a.type}`;
              badge.innerHTML = `<span class="ico">${a.type === 'directory' ? '📁' : '📄'}</span> ${escapeHtml(a.name)}`;
              badge.title = a.path || a.name;
              attWrap.appendChild(badge);
            });
            bubble.appendChild(attWrap);
          }
        }
        if (msg.content) {
          const textEl = document.createElement('div');
          textEl.className = 'ai-msg-text';
          textEl.textContent = msg.content;
          bubble.appendChild(textEl);
        }

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
        if (msg.fallbackFrom) {
          const fbBadge = document.createElement('div');
          fbBadge.className = 'ai-msg-fallback-badge';
          fbBadge.textContent = `⚠️ 主模型 [${msg.fallbackFrom}] 异常，已自动降级至备用模型`;
          bubble.appendChild(fbBadge);
        }

        if (msg.isCompacted) {
          const compactBadge = document.createElement('div');
          compactBadge.className = 'ai-compact-badge';
          compactBadge.innerHTML = '<span>🗜️</span> <span>历史上下文压缩检查点</span>';
          bubble.appendChild(compactBadge);
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

          let result = explicitResult !== undefined ? explicitResult : (msg.toolResults ? msg.toolResults[tc.id] : undefined);
          if (result === undefined && tc.result !== undefined) result = tc.result;
          if (result === undefined && currentSession && currentSession.messages) {
            const tm = currentSession.messages.find(m => m.role === 'tool' && m.tool_call_id === tc.id);
            if (tm) result = tm.content;
          }

          let parsedResult = null;
          if (typeof result === 'object' && result !== null) {
            parsedResult = result;
          } else if (typeof result === 'string' && result.trim().startsWith('{')) {
            try { parsedResult = JSON.parse(result); } catch {}
          }

          let stopBtnHtml = '';
          if (parsedResult && parsedResult.background && parsedResult.pid) {
            stopBtnHtml = `<button type="button" class="ai-tool-stop-proc-btn" data-pid="${parsedResult.pid}" title="停止此后台进程树 (PID: ${parsedResult.pid})">⏹ 停止进程</button>`;
          }

          let label;
          if (st === 'denied') {
            label = `<span>✗ 已拒绝:</span> <strong>${escapeHtml(tc.function.name)}</strong>`;
          } else if (parsedResult && parsedResult.background && parsedResult.pid) {
            label = `<span>⚡ 后台运行中 (PID: ${parsedResult.pid}):</span> <strong>${escapeHtml(tc.function.name)}</strong>`;
          } else if (tc.function.name === 'stop_process' && parsedResult && parsedResult.ok) {
            label = `<span>⏹ 已停止进程 (PID: ${parsedResult.pid}):</span> <strong>${escapeHtml(tc.function.name)}</strong>`;
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
          } else if (tc.function.name === 'list_processes') {
            const count = (parsedResult && parsedResult.count !== undefined) ? parsedResult.count : 0;
            label = `<span>📋 进程清单:</span> <strong>共 ${count} 个活跃进程</strong>`;
          } else if (st === 'approved') {
            label = `<span>✓ 已执行 (手动批准):</span> <strong>${escapeHtml(tc.function.name)}</strong>`;
          } else {
            label = `<span>🛠️ 工具调用:</span> <strong>${escapeHtml(tc.function.name)}</strong>`;
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
              ${stopBtnHtml}
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
            const stepCot = rSteps.find(s => s.round === r);
            if (stepCot && stepCot.reasoning) {
              renderSingleCotBox(stepCot.reasoning, r, rSteps.length, timeline);
            }
            const stepContent = cSteps.find(s => s.round === r);
            if (stepContent && stepContent.content && stepContent.content.trim()) {
              renderSingleMdBlock(stepContent.content, r, timeline);
              renderedAnyContent = true;
            }
            const stepTools = allTools.filter(t => (t.round === r || (t.round === undefined && r === 0)) && !renderedToolIds.has(t.id));
            stepTools.forEach(tc => {
              renderSingleToolBadge(tc, undefined, timeline);
              renderedToolIds.add(tc.id);
            });
          });
          allTools.filter(t => !renderedToolIds.has(t.id)).forEach(tc => renderSingleToolBadge(tc, undefined, timeline));

          if (!renderedAnyContent && msg.content && msg.content.trim()) {
            renderSingleMdBlock(msg.content, rounds.length, timeline);
          }
        } else {
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

      msgEl.appendChild(bubble);
      msgEl.appendChild(toolbar);

      // Event listeners for message toolbar
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
            updateHeader();
          }
        });
      }

      const btnEdit = toolbar.querySelector('.btn-tool-edit');
      if (btnEdit) {
        btnEdit.addEventListener('click', () => {
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
          sendMessage(msg.content, msg.id, msg.attachments || msg.images);
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

      if (MermaidRenderer) {
        MermaidRenderer.initMessageDynamicElements(bubble, { renderMermaid: true, copyToClipboard });
      }
      bubble.querySelectorAll('img:not(.ai-attachment-thumb)').forEach(img => {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', () => {
          openLightbox(img.src, img.alt || '查看图片');
        });
      });

      return msgEl;
    }

    async function sendMessage(customContent = null, editMessageId = null, customAttachments = null) {
      if (isGenerating) return;
      let text = customContent !== null ? customContent : chatInput.value.trim();
      const attachments = customAttachments !== null ? customAttachments : [...pendingAttachments];
      if ((!text && attachments.length === 0) || !currentSession) return;

      const images = [];
      const fileContextBlocks = [];
      for (const att of attachments) {
        if (att.type === 'image' || att.url || att.isImage) {
          images.push({
            type: 'image',
            id: att.id,
            name: att.name,
            url: att.url || att.dataUrl
          });
        } else if (att.type === 'file' || att.content !== undefined) {
          fileContextBlocks.push(`### 附件文件: ${att.name || att.path}\n\`\`\`\n${att.content || ''}\n\`\`\``);
        } else if (att.type === 'directory' || att.isDirectory) {
          fileContextBlocks.push(`### 附件文件夹目录: ${att.path || att.name}\n(已关联本地目录供分析与定位)`);
        }
      }

      if (fileContextBlocks.length > 0) {
        const assembledText = `[用户随附文件/目录上下文]:\n${fileContextBlocks.join('\n\n')}\n\n[用户指令]:\n${text || '请基于上述随附文件/目录进行分析。'}`;
        text = assembledText;
      }

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
        } else {
          assistantMsg.content = `❌ 发起流式回复失败: ${(res && res.error) || '未知错误'}`;
          setGeneratingState(false);
          generatingSessionId = null;
          renderMessages();
        }
      } catch (err) {
        assistantMsg.content = `❌ 请求异常: ${err.message || err}`;
        setGeneratingState(false);
        generatingSessionId = null;
        renderMessages();
      }
    }

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
          messagesScroll.appendChild(card);
        }
      });
      if (buf.approvals.length) scrollToBottom();
    }

    // Stream Chunk Listener via IPC
    ctx.onEvent('stream-chunk', payload => {
      if (!payload || !payload.chunk) return;
      const { chunk, messageId } = payload;
      const isTerminal = chunk.type === 'complete' || chunk.type === 'aborted' || chunk.type === 'error';

      if (!currentSession || payload.sessionId !== currentSession.id) {
        const buf = getLateChunkBuf(payload.sessionId);
        if (chunk.type === 'tool_approval_request') buf.approvals.push(payload);
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

      // Robust fallback: If not found by messageId, bind to the latest active assistant bubble
      if (!msgEl) {
        const assistantEls = messagesScroll.querySelectorAll('.ai-msg.assistant');
        if (assistantEls.length > 0) {
          msgEl = assistantEls[assistantEls.length - 1];
          if (messageId && msgEl) {
            msgEl.dataset.id = messageId;
            const lastMsg = currentSession?.messages?.[currentSession.messages.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.id = messageId;
            }
          }
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
        mdBlock.innerHTML = renderMarkdown(textToRender);
        if (MermaidRenderer) {
          MermaidRenderer.initMessageDynamicElements(mdBlock, { renderMermaid: false, copyToClipboard });
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
        }

        for (const tc of chunk.toolCalls) {
          if (!timeline.querySelector(`.ai-tool-badge[data-tool="${tc.id}"]`)) {
            const b = document.createElement('div');
            b.className = 'ai-tool-badge';
            b.dataset.tool = tc.id;
            let title = `<span>🛠️ 工具调用:</span> <strong>${escapeHtml(tc.function.name)}</strong> <span class="ai-tool-badge-status">(参数就绪)</span>`;
            if (tc.function.name === 'dispatch_task_to_ai_ide') {
              let ideName = 'AI IDE';
              try {
                const args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
                if (args && args.target) ideName = args.target;
              } catch {}
              title = `<span>🚀 任务分派:</span> <strong>${escapeHtml(ideName)}</strong> <span class="ai-tool-badge-status">(准备中)</span>`;
            } else if (tc.function.name === 'list_available_ai_ides') {
              title = `<span>🔍 探测本地 AI IDE/CLI:</span> <span class="ai-tool-badge-status">(准备中)</span>`;
            } else if (tc.function.name === 'list_processes') {
              title = `<span>📋 查看后台进程:</span> <span class="ai-tool-badge-status">(准备中)</span>`;
            } else if (tc.function.name === 'stop_process') {
              let pidText = '';
              try {
                const args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
                if (args && args.pid) pidText = `(PID: ${args.pid})`;
              } catch {}
              title = `<span>⏹ 停止后台进程 ${pidText}:</span> <span class="ai-tool-badge-status">(准备中)</span>`;
            }
            b.innerHTML = `
              <div class="ai-tool-badge-head">
                <div class="ai-tool-badge-title">${title}</div>
              </div>
            `;
            timeline.appendChild(b);
          }
        }
        scrollToBottom();
      } else if (chunk.type === 'tool_approval_request') {
        let timeline = bubble.querySelector('.ai-bubble-timeline') || bubble;
        appendApprovalCard(timeline, payload, chunk, () => {
          const buf = pendingLateChunks.get(payload.sessionId);
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
      } else if (chunk.type === 'tool_result') {
        const b = bubble.querySelector(`.ai-tool-badge[data-tool="${chunk.toolId}"]`);
        if (b) {
          let titleHtml = '';
          let stopBtnHtml = '';
          const res = chunk.result || {};
          if (res.denied) {
            b.classList.add('denied');
            titleHtml = `<span>✗ 已拒绝:</span> <strong>${escapeHtml(chunk.toolName)}</strong>`;
          } else if (res.background && res.pid) {
            titleHtml = `<span>⚡ 后台运行中 (PID: ${res.pid}):</span> <strong>${escapeHtml(chunk.toolName)}</strong>`;
            stopBtnHtml = `<button type="button" class="ai-tool-stop-proc-btn" data-pid="${res.pid}" title="停止此后台进程树 (PID: ${res.pid})">⏹ 停止进程</button>`;
          } else if (chunk.toolName === 'stop_process' && res.ok) {
            titleHtml = `<span>⏹ 已停止进程 (PID: ${res.pid}):</span> <strong>${escapeHtml(chunk.toolName)}</strong>`;
            if (res.pid) {
              const allWithPid = messagesScroll.querySelectorAll(`.ai-tool-stop-proc-btn[data-pid="${res.pid}"]`);
              allWithPid.forEach(btn => {
                btn.textContent = '✓ 已停止';
                btn.classList.add('stopped');
                btn.disabled = true;
              });
            }
          } else if (chunk.toolName === 'dispatch_subagent') {
            const res = chunk.result || {};
            const modeLabel = res.mode === 'fork' ? '分叉探索' : '专项派生';
            const role = res.role || '子智能体';
            const state = res.ok ? `完成 (${res.rounds_executed || 1} 轮 · ${res.total_tool_calls || 0} 次工具)` : '失败';
            titleHtml = `<span>🤖 子智能体 [${escapeHtml(role)}] (${modeLabel}):</span> <strong>${state}</strong>`;
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
          } else if (chunk.toolName === 'list_processes') {
            const count = (res.count !== undefined) ? res.count : 0;
            titleHtml = `<span>📋 进程清单:</span> <strong>共 ${count} 个活跃进程</strong>`;
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
              ${stopBtnHtml}
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
        if (MermaidRenderer) {
          MermaidRenderer.initMessageDynamicElements(bubble, { renderMermaid: true, copyToClipboard });
        }
        scrollToBottom();
        if (chunk.message && currentSession && currentSession.messages) {
          let m = currentSession.messages.find(x => x.id === messageId);
          if (!m) {
            const assts = currentSession.messages.filter(x => x.role === 'assistant');
            if (assts.length > 0) m = assts[assts.length - 1];
          }
          if (m) {
            if (messageId) m.id = messageId;
            m.content = chunk.message.content || m.content;
            m.reasoning = chunk.message.reasoning || m.reasoning;
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
          if (currentSession) currentSession.totalTokens = chunk.sessionTotalTokens;
        }
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

      if (ctx.payload && (typeof ctx.payload === 'string' || ctx.payload.text)) {
        const pv = typeof ctx.payload === 'string' ? ctx.payload : ctx.payload.text;
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
      mount(el, ctx) {
        mount(el, ctx).then(fn => { cleanupFn = fn; });
      },
      unmount() {
        if (typeof cleanupFn === 'function') cleanupFn();
        cleanupFn = null;
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
