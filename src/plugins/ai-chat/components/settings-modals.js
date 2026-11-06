/* AI Chat - Settings Modals facade
   Owns the settings shell (element lookup, tab switcher, open/close, footer
   save) and wires the per-tab controllers from components/settings/*-tab.js.
   Dual CommonJS / Browser environment export. */
(() => {
  const defaultEscapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function initSettingsModals({
    panelEl,
    ctx,
    getState,
    updateState,
    onConfigSaved,
    onPersonasChanged,
    escapeHtml = defaultEscapeHtml,
    PRESET_CHANNELS = (window.AiChatMarkdown && window.AiChatMarkdown.PRESET_CHANNELS) || []
  }) {
    if (!panelEl) return null;

    // Elements lookup
    const settingsModal = panelEl.querySelector('#settingsModal');
    const settingsModalFooter = panelEl.querySelector('#settingsModalFooter');
    const tabNavModel = panelEl.querySelector('#tabNavModel');
    const tabNavPersonas = panelEl.querySelector('#tabNavPersonas');
    const tabNavMemory = panelEl.querySelector('#tabNavMemory');
    const tabNavExt = panelEl.querySelector('#tabNavExt');
    const paneModelSettings = panelEl.querySelector('#paneModelSettings');
    const panePersonasSettings = panelEl.querySelector('#panePersonasSettings');
    const paneMemorySettings = panelEl.querySelector('#paneMemorySettings');
    const paneExtSettings = panelEl.querySelector('#paneExtSettings');

    // Model elements
    const cfgChannel = panelEl.querySelector('#cfgChannel');
    const btnCreateChannel = panelEl.querySelector('#btnCreateChannel');
    const btnDeleteChannel = panelEl.querySelector('#btnDeleteChannel');
    const chkActiveChannel = panelEl.querySelector('#chkActiveChannel');
    const channelCustomMeta = panelEl.querySelector('#channelCustomMeta');
    const cfgChannelName = panelEl.querySelector('#cfgChannelName');
    const cfgChannelIcon = panelEl.querySelector('#cfgChannelIcon');
    const cfgProtocol = panelEl.querySelector('#cfgProtocol');
    const cfgBaseUrl = panelEl.querySelector('#cfgBaseUrl');
    const cfgApiKey = panelEl.querySelector('#cfgApiKey');
    const btnToggleApiKey = panelEl.querySelector('#btnToggleApiKey');
    const cfgModel = panelEl.querySelector('#cfgModel');
    const inputAddChannelModel = panelEl.querySelector('#inputAddChannelModel');
    const btnAddChannelModel = panelEl.querySelector('#btnAddChannelModel');
    const btnToggleCreateChannel = panelEl.querySelector('#btnToggleCreateChannel');
    const boxCreateChannel = panelEl.querySelector('#boxCreateChannel');
    const selectChannelTemplate = panelEl.querySelector('#selectChannelTemplate');
    const inputCreateChannelName = panelEl.querySelector('#inputCreateChannelName');
    const btnConfirmCreateChannel = panelEl.querySelector('#btnConfirmCreateChannel');
    const btnCancelCreateChannel = panelEl.querySelector('#btnCancelCreateChannel');
    const channelKeyCountBadge = panelEl.querySelector('#channelKeyCountBadge');
    const channelKeysList = panelEl.querySelector('#channelKeysList');
    const inputNewKeyName = panelEl.querySelector('#inputNewKeyName');
    const inputNewKeyValue = panelEl.querySelector('#inputNewKeyValue');
    const btnToggleNewKey = panelEl.querySelector('#btnToggleNewKey');
    const btnAddKey = panelEl.querySelector('#btnAddKey');
    const cfgFallbackModel = panelEl.querySelector('#cfgFallbackModel');
    const cfgTempRange = panelEl.querySelector('#cfgTempRange');
    const cfgTempVal = panelEl.querySelector('#cfgTempVal');
    const cfgMaxContext = panelEl.querySelector('#cfgMaxContext');
    const cfgMaxContextTokens = panelEl.querySelector('#cfgMaxContextTokens');
    const cfgAgentMaxRounds = panelEl.querySelector('#cfgAgentMaxRounds');
    const cfgAgentWorkDir = panelEl.querySelector('#cfgAgentWorkDir');
    const btnPickAgentWorkDir = panelEl.querySelector('#btnPickAgentWorkDir');
    const channelModelChips = panelEl.querySelector('#channelModelChips');
    const btnToggleModelSearch = panelEl.querySelector('#btnToggleModelSearch');
    const modelSearchPanel = panelEl.querySelector('#modelSearchPanel');
    const inputModelSearch = panelEl.querySelector('#inputModelSearch');
    const btnClearModelSearch = panelEl.querySelector('#btnClearModelSearch');
    const modelFilterTabs = panelEl.querySelector('#modelFilterTabs');
    const modelSearchResults = panelEl.querySelector('#modelSearchResults');
    const countChannelModels = panelEl.querySelector('#countChannelModels');
    const countAllModels = panelEl.querySelector('#countAllModels');
    const countRemoteModels = panelEl.querySelector('#countRemoteModels');
    const tabRemoteModels = panelEl.querySelector('#tabRemoteModels');
    const btnFetchModels = panelEl.querySelector('#btnFetchModels');
    const iconFetchSpin = panelEl.querySelector('#iconFetchSpin');
    const btnSyncFetchedModels = panelEl.querySelector('#btnSyncFetchedModels');
    const remoteSyncBar = panelEl.querySelector('#remoteSyncBar');
    const btnCloseSettings = panelEl.querySelector('#btnCloseSettings');
    const btnCancelSettings = panelEl.querySelector('#btnCancelSettings');
    const btnSaveSettings = panelEl.querySelector('#btnSaveSettings');

    // Memory elements
    const memoriesCardList = panelEl.querySelector('#memoriesCardList');
    const memoryCountBadge = panelEl.querySelector('#memoryCountBadge');
    const inputSearchMemories = panelEl.querySelector('#inputSearchMemories');
    const btnCreateMemory = panelEl.querySelector('#btnCreateMemory');
    const memoryEditPanel = panelEl.querySelector('#memoryEditPanel');
    const memoryEditTitle = panelEl.querySelector('#memoryEditTitle');
    const inputMemoryContent = panelEl.querySelector('#inputMemoryContent');
    const selectMemoryScope = panelEl.querySelector('#selectMemoryScope');
    const selectMemoryType = panelEl.querySelector('#selectMemoryType');
    const btnSaveMemoryEdit = panelEl.querySelector('#btnSaveMemoryEdit');
    const btnCloseMemoryEdit = panelEl.querySelector('#btnCloseMemoryEdit');
    const btnCancelMemoryEdit = panelEl.querySelector('#btnCancelMemoryEdit');

    // Personas elements
    const personasCardList = panelEl.querySelector('#personasCardList');
    const inputSearchPersonas = panelEl.querySelector('#inputSearchPersonas');
    const btnCreatePersona = panelEl.querySelector('#btnCreatePersona');
    const btnResetPersonas = panelEl.querySelector('#btnResetPersonas');
    const personaEditPanel = panelEl.querySelector('#personaEditPanel');
    const personaEditTitle = panelEl.querySelector('#personaEditTitle');
    const inputPersonaTitle = panelEl.querySelector('#inputPersonaTitle');
    const inputPersonaIcon = panelEl.querySelector('#inputPersonaIcon');
    const personaTempRange = panelEl.querySelector('#personaTempRange');
    const personaTempVal = panelEl.querySelector('#personaTempVal');
    const inputPersonaPrompt = panelEl.querySelector('#inputPersonaPrompt');
    const btnSavePersona = panelEl.querySelector('#btnSavePersona');
    const btnClosePersonaEdit = panelEl.querySelector('#btnClosePersonaEdit');
    const btnCancelPersonaEdit = panelEl.querySelector('#btnCancelPersonaEdit');
    const quickEmojiList = panelEl.querySelector('#quickEmojiList');
    const personasPagination = panelEl.querySelector('#personasPagination');
    const btnPrevPersonaPage = panelEl.querySelector('#btnPrevPersonaPage');
    const btnNextPersonaPage = panelEl.querySelector('#btnNextPersonaPage');
    const personaPageInfo = panelEl.querySelector('#personaPageInfo');

    // MCP elements
    const mcpServerList = panelEl.querySelector('#mcpServerList');
    const btnCreateMcp = panelEl.querySelector('#btnCreateMcp');
    const btnOpenMcpMarket = panelEl.querySelector('#btnOpenMcpMarket');
    const btnResetMcp = panelEl.querySelector('#btnResetMcp');
    const mcpEditPanel = panelEl.querySelector('#mcpEditPanel');
    const mcpEditTitle = panelEl.querySelector('#mcpEditTitle');
    const inputMcpName = panelEl.querySelector('#inputMcpName');
    const selectMcpTransport = panelEl.querySelector('#selectMcpTransport');
    const grpMcpCommand = panelEl.querySelector('#grpMcpCommand');
    const inputMcpCommand = panelEl.querySelector('#inputMcpCommand');
    const grpMcpArgs = panelEl.querySelector('#grpMcpArgs');
    const inputMcpArgs = panelEl.querySelector('#inputMcpArgs');
    const grpMcpEnv = panelEl.querySelector('#grpMcpEnv');
    const inputMcpEnv = panelEl.querySelector('#inputMcpEnv');
    const grpMcpUrl = panelEl.querySelector('#grpMcpUrl');
    const inputMcpUrl = panelEl.querySelector('#inputMcpUrl');
    const grpMcpApiKey = panelEl.querySelector('#grpMcpApiKey');
    const inputMcpApiKey = panelEl.querySelector('#inputMcpApiKey');
    const chkMcpEnabled = panelEl.querySelector('#chkMcpEnabled');
    const btnTestMcp = panelEl.querySelector('#btnTestMcp');
    const mcpTestResult = panelEl.querySelector('#mcpTestResult');
    const btnSaveMcp = panelEl.querySelector('#btnSaveMcp');
    const btnCloseMcpEdit = panelEl.querySelector('#btnCloseMcpEdit');
    const btnCancelMcpEdit = panelEl.querySelector('#btnCancelMcpEdit');

    // MCP Market elements
    const mcpMarketPanel = panelEl.querySelector('#mcpMarketPanel');
    const btnCloseMcpMarket = panelEl.querySelector('#btnCloseMcpMarket');
    const inputMarketSearch = panelEl.querySelector('#inputMarketSearch');
    const marketCategoriesBar = panelEl.querySelector('#marketCategoriesBar');
    const marketServerList = panelEl.querySelector('#marketServerList');

    // Skills elements
    const skillsCardList = panelEl.querySelector('#skillsCardList');
    const inputSearchSkills = panelEl.querySelector('#inputSearchSkills');
    const btnCreateSkill = panelEl.querySelector('#btnCreateSkill');
    const btnOpenSkillMarket = panelEl.querySelector('#btnOpenSkillMarket');
    const btnResetSkills = panelEl.querySelector('#btnResetSkills');
    const inputSkillUrl = panelEl.querySelector('#inputSkillUrl');
    const btnImportSkillUrl = panelEl.querySelector('#btnImportSkillUrl');
    const btnImportSkillFile = panelEl.querySelector('#btnImportSkillFile');
    const inputSkillFile = panelEl.querySelector('#inputSkillFile');
    const btnImportSkillFolder = panelEl.querySelector('#btnImportSkillFolder');
    const inputSkillFolder = panelEl.querySelector('#inputSkillFolder');
    const skillImportResult = panelEl.querySelector('#skillImportResult');
    const skillMarketPanel = panelEl.querySelector('#skillMarketPanel');
    const btnCloseSkillMarket = panelEl.querySelector('#btnCloseSkillMarket');
    const inputSkillMarketSearch = panelEl.querySelector('#inputSkillMarketSearch');
    const skillMarketCategoriesBar = panelEl.querySelector('#skillMarketCategoriesBar');
    const skillMarketList = panelEl.querySelector('#skillMarketList');
    const skillEditPanel = panelEl.querySelector('#skillEditPanel');
    const skillEditTitle = panelEl.querySelector('#skillEditTitle');
    const selectSkillTemplate = panelEl.querySelector('#selectSkillTemplate');
    const inputSkillName = panelEl.querySelector('#inputSkillName');
    const inputSkillDesc = panelEl.querySelector('#inputSkillDesc');
    const inputSkillContent = panelEl.querySelector('#inputSkillContent');
    const btnSaveSkill = panelEl.querySelector('#btnSaveSkill');
    const btnCloseSkillEdit = panelEl.querySelector('#btnCloseSkillEdit');
    const btnCancelSkillEdit = panelEl.querySelector('#btnCancelSkillEdit');
    const skillsPagination = panelEl.querySelector('#skillsPagination');
    const btnPrevSkillPage = panelEl.querySelector('#btnPrevSkillPage');
    const btnNextSkillPage = panelEl.querySelector('#btnNextSkillPage');
    const skillPageInfo = panelEl.querySelector('#skillPageInfo');

    // Local state for modals

    /* --- Tab Switcher --- */
    function switchSettingsTab(tabName) {
      if (tabNavModel) tabNavModel.classList.toggle('active', tabName === 'model');
      if (tabNavPersonas) tabNavPersonas.classList.toggle('active', tabName === 'personas');
      if (tabNavMemory) tabNavMemory.classList.toggle('active', tabName === 'memory');
      if (tabNavExt) tabNavExt.classList.toggle('active', tabName === 'ext');

      if (paneModelSettings) paneModelSettings.classList.toggle('hidden', tabName !== 'model');
      if (panePersonasSettings) panePersonasSettings.classList.toggle('hidden', tabName !== 'personas');
      if (paneMemorySettings) paneMemorySettings.classList.toggle('hidden', tabName !== 'memory');
      if (paneExtSettings) paneExtSettings.classList.toggle('hidden', tabName !== 'ext');

      if (settingsModalFooter) settingsModalFooter.style.display = tabName === 'model' ? 'flex' : 'none';

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
        if (typeof closeSkillMarket === 'function') closeSkillMarket();
        renderMcpList();
        renderSkillsList();
      }
    }

    if (tabNavModel) tabNavModel.addEventListener('click', () => switchSettingsTab('model'));
    if (tabNavPersonas) tabNavPersonas.addEventListener('click', () => switchSettingsTab('personas'));
    if (tabNavMemory) tabNavMemory.addEventListener('click', () => switchSettingsTab('memory'));
    if (tabNavExt) tabNavExt.addEventListener('click', () => switchSettingsTab('ext'));

    /* --- Tab Controllers (extracted to components/settings/*-tab.js) --- */
    // 各 tab 控制器以工厂装载：tab 内部状态（editingXxx/搜索词/分页）随工厂
    // 实例隔离，重挂载不残留；元素引用与共享回调经同名键注入，函数体与拆分前一致
    const Parts = window.AiChatSettingsParts;
    if (!Parts || !Parts.createMemoryTab) throw new Error('settings tab modules not loaded');
    const { renderMemoriesList, openMemoryEditor, closeMemoryEditor } = Parts.createMemoryTab({
      PRESET_CHANNELS, btnCancelMemoryEdit, btnCloseMemoryEdit, btnCreateMemory, btnSaveMemoryEdit, ctx, escapeHtml, getState, inputMemoryContent, inputSearchMemories, memoriesCardList, memoryCountBadge, memoryEditPanel, memoryEditTitle, onConfigSaved, onPersonasChanged, panelEl, selectMemoryScope, selectMemoryType, switchSettingsTab, updateState
    });
    const { renderPersonasSettingsList, openPersonaEditor, closePersonaEditor } = Parts.createPersonaTab({
      PRESET_CHANNELS, btnCancelPersonaEdit, btnClosePersonaEdit, btnCreatePersona, btnNextPersonaPage, btnPrevPersonaPage, btnResetPersonas, btnSavePersona, ctx, escapeHtml, getState, inputPersonaIcon, inputPersonaPrompt, inputPersonaTitle, inputSearchPersonas, onConfigSaved, onPersonasChanged, panelEl, personaEditPanel, personaEditTitle, personaPageInfo, personaTempRange, personaTempVal, personasCardList, personasPagination, quickEmojiList, switchSettingsTab, updateState
    });
    const { renderMcpList, openMcpEditor, closeMcpEditor } = Parts.createMcpTab({
      PRESET_CHANNELS, btnCancelMcpEdit, btnCloseMcpEdit, btnCloseMcpMarket, btnCreateMcp, btnOpenMcpMarket, btnResetMcp, btnSaveMcp, btnTestMcp, chkMcpEnabled, ctx, escapeHtml, getState, grpMcpApiKey, grpMcpArgs, grpMcpCommand, grpMcpEnv, grpMcpUrl, inputMarketSearch, inputMcpApiKey, inputMcpArgs, inputMcpCommand, inputMcpEnv, inputMcpName, inputMcpUrl, marketCategoriesBar, marketServerList, mcpEditPanel, mcpEditTitle, mcpMarketPanel, mcpServerList, mcpTestResult, onConfigSaved, onPersonasChanged, panelEl, selectMcpTransport, switchSettingsTab, updateState
    });
    const { renderSkillsList, closeSkillEditor, openSkillMarket, closeSkillMarket } = Parts.createSkillTab({
      PRESET_CHANNELS, btnCancelSkillEdit, btnCloseSkillEdit, btnCloseSkillMarket, btnCreateSkill, btnImportSkillFile, btnImportSkillFolder, btnImportSkillUrl, btnNextSkillPage, btnOpenSkillMarket, btnPrevSkillPage, btnResetSkills, btnSaveSkill, ctx, escapeHtml, getState, inputSearchSkills, inputSkillContent, inputSkillDesc, inputSkillFile, inputSkillFolder, inputSkillMarketSearch, inputSkillName, inputSkillUrl, onConfigSaved, onPersonasChanged, panelEl, selectSkillTemplate, skillEditPanel, skillEditTitle, skillImportResult, skillMarketCategoriesBar, skillMarketList, skillMarketPanel, skillPageInfo, skillsCardList, switchSettingsTab, updateState
    });
    const modelTabCtrl = Parts.createModelTab({
      PRESET_CHANNELS, btnClearModelSearch, btnFetchModels, btnToggleApiKey,
      btnToggleModelSearch, cfgApiKey, cfgBaseUrl, cfgChannel,
      cfgModel, cfgProtocol, channelModelChips, countAllModels,
      countChannelModels, countRemoteModels, ctx, escapeHtml,
      getState, iconFetchSpin, inputModelSearch, modelFilterTabs,
      modelSearchPanel, modelSearchResults, onConfigSaved, onPersonasChanged,
      panelEl, switchSettingsTab, tabRemoteModels, updateState,
      btnCreateChannel, btnDeleteChannel, chkActiveChannel, channelCustomMeta,
      cfgChannelName, cfgChannelIcon, inputAddChannelModel, btnAddChannelModel,
      btnSyncFetchedModels, remoteSyncBar,
      btnToggleCreateChannel, boxCreateChannel, selectChannelTemplate,
      inputCreateChannelName, btnConfirmCreateChannel, btnCancelCreateChannel,
      channelKeyCountBadge, channelKeysList, inputNewKeyName, inputNewKeyValue,
      btnToggleNewKey, btnAddKey
    });
    const { renderModelSearchResults, renderChannelChips, getAllPresetModels, initChannels, collectConfig } = modelTabCtrl;


    function openSettings(initialTab = 'model') {
      const state = getState();
      const config = state.config || {};
      switchSettingsTab(initialTab);
      if (typeof initChannels === 'function') {
        initChannels(config);
      } else {
        const chId = config.channel || 'openai';
        if (cfgChannel) cfgChannel.value = PRESET_CHANNELS.some(x => x.id === chId) ? chId : 'custom';
        if (cfgProtocol) cfgProtocol.value = config.protocol || 'openai-chat';
        if (cfgBaseUrl) cfgBaseUrl.value = config.baseUrl || 'https://api.openai.com/v1';
        if (cfgApiKey) {
          cfgApiKey.value = config.apiKey || '';
          cfgApiKey.type = 'password';
        }
        if (cfgModel) cfgModel.value = config.model || 'gpt-4o-mini';
        if (cfgChannel) renderChannelChips(cfgChannel.value);
        renderModelSearchResults();
      }
      if (btnToggleApiKey) {
        btnToggleApiKey.textContent = '👁️';
        btnToggleApiKey.title = '显示密钥';
      }
      if (cfgFallbackModel) cfgFallbackModel.value = config.fallbackModel || '';
      if (cfgTempRange) cfgTempRange.value = config.temperature ?? 0.7;
      if (cfgTempVal) cfgTempVal.textContent = config.temperature ?? 0.7;
      if (cfgMaxContext) cfgMaxContext.value = config.maxContextMessages ?? 16;
      if (cfgMaxContextTokens) cfgMaxContextTokens.value = config.maxContextTokens ?? 200000;
      if (cfgAgentMaxRounds) cfgAgentMaxRounds.value = config.agentMaxRounds ?? 8;
      if (cfgAgentWorkDir) cfgAgentWorkDir.value = config.agentWorkDir || '';
      if (modelSearchPanel) modelSearchPanel.classList.add('hidden');
      if (inputModelSearch) inputModelSearch.value = '';
      if (settingsModal) settingsModal.classList.remove('hidden');
    }

    function closeSettings() {
      if (settingsModal) settingsModal.classList.add('hidden');
    }

    if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettings);
    if (btnCancelSettings) btnCancelSettings.addEventListener('click', closeSettings);

    if (cfgTempRange) {
      cfgTempRange.addEventListener('input', () => {
        if (cfgTempVal) cfgTempVal.textContent = cfgTempRange.value;
      });
    }

    if (btnSaveSettings) {
      btnSaveSettings.addEventListener('click', async () => {
        const modelTabConfig = (typeof collectConfig === 'function')
          ? collectConfig()
          : {
              channel: cfgChannel.value,
              protocol: cfgProtocol.value,
              baseUrl: cfgBaseUrl.value.trim(),
              apiKey: cfgApiKey.value.trim(),
              model: cfgModel.value.trim()
            };
        const patch = {
          fallbackModel: cfgFallbackModel.value.trim(),
          temperature: Number(cfgTempRange.value),
          maxContextMessages: Number(cfgMaxContext.value) || 16,
          maxContextTokens: Math.max(4000, Number(cfgMaxContextTokens ? cfgMaxContextTokens.value : 200000) || 200000),
          agentMaxRounds: Math.min(40, Math.max(1, Number(cfgAgentMaxRounds.value) || 8)),
          agentWorkDir: cfgAgentWorkDir.value.trim(),
          ...modelTabConfig
        };
        const res = await ctx.call('saveConfig', patch);
        if (res && res.ok) {
          updateState({ config: res.config });
          if (typeof onConfigSaved === 'function') onConfigSaved(res.config);
          closeSettings();
        } else {
          alert(`保存失败: ${(res && res.error) || '未知错误'}`);
        }
      });
    }

    if (btnPickAgentWorkDir) {
      btnPickAgentWorkDir.addEventListener('click', async () => {
        const res = await ctx.call('chooseAgentWorkDir', { current: cfgAgentWorkDir.value.trim() });
        if (res && res.ok) cfgAgentWorkDir.value = res.dir;
      });
    }

    return {
      openSettings,
      closeSettings,
      switchSettingsTab,
      renderMemoriesList,
      renderPersonasSettingsList,
      renderMcpList,
      renderSkillsList,
      renderModelSearchResults,
      openSkillMarket,
      closeSkillMarket,
    };
  }

  const exportsObj = {
    initSettingsModals,
  };

  if (typeof window !== 'undefined') {
    window.AiChatSettingsModals = exportsObj;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})();
