/* AI Chat - Settings Modals Component
   Manages the settings dialog and its sub-tabs:
   - Model Settings & Preset/Remote Model Search
   - Personas Management
   - Long-term Memory Library
   - MCP Servers & Presets
   - MCP Market Explorer
   - Skills Manager & GitHub/Directory Import
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
    const cfgProtocol = panelEl.querySelector('#cfgProtocol');
    const cfgBaseUrl = panelEl.querySelector('#cfgBaseUrl');
    const cfgApiKey = panelEl.querySelector('#cfgApiKey');
    const btnToggleApiKey = panelEl.querySelector('#btnToggleApiKey');
    const cfgModel = panelEl.querySelector('#cfgModel');
    const cfgFallbackModel = panelEl.querySelector('#cfgFallbackModel');
    const cfgTempRange = panelEl.querySelector('#cfgTempRange');
    const cfgTempVal = panelEl.querySelector('#cfgTempVal');
    const cfgMaxContext = panelEl.querySelector('#cfgMaxContext');
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
    const btnResetSkills = panelEl.querySelector('#btnResetSkills');
    const inputSkillUrl = panelEl.querySelector('#inputSkillUrl');
    const btnImportSkillUrl = panelEl.querySelector('#btnImportSkillUrl');
    const btnImportSkillFile = panelEl.querySelector('#btnImportSkillFile');
    const inputSkillFile = panelEl.querySelector('#inputSkillFile');
    const btnImportSkillFolder = panelEl.querySelector('#btnImportSkillFolder');
    const inputSkillFolder = panelEl.querySelector('#inputSkillFolder');
    const skillImportResult = panelEl.querySelector('#skillImportResult');
    const skillEditPanel = panelEl.querySelector('#skillEditPanel');
    const skillEditTitle = panelEl.querySelector('#skillEditTitle');
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
    let remoteModels = [];
    let activeModelTab = 'all';
    let editingMemoryId = null;
    let memorySearchKeyword = '';
    let editingPersonaId = null;
    let personaSearchKeyword = '';
    let personaCurrentPage = 1;
    const personaPageSize = 8;
    let editingMcpId = null;
    let marketActiveCategory = 'all';
    let marketSearchQuery = '';
    let editingSkillId = null;
    let skillSearchKeyword = '';
    let skillCurrentPage = 1;
    const skillPageSize = 8;

    // Populate channels dropdown once
    if (cfgChannel && cfgChannel.options.length <= 1) {
      PRESET_CHANNELS.forEach(ch => {
        const opt = document.createElement('option');
        opt.value = ch.id;
        opt.textContent = ch.name;
        cfgChannel.appendChild(opt);
      });
    }

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
        renderMcpList();
        renderSkillsList();
      }
    }

    if (tabNavModel) tabNavModel.addEventListener('click', () => switchSettingsTab('model'));
    if (tabNavPersonas) tabNavPersonas.addEventListener('click', () => switchSettingsTab('personas'));
    if (tabNavMemory) tabNavMemory.addEventListener('click', () => switchSettingsTab('memory'));
    if (tabNavExt) tabNavExt.addEventListener('click', () => switchSettingsTab('ext'));

    /* --- Memory Controller --- */
    const MEMORY_TYPE_LABELS = { fact: '事实', preference: '偏好', project: '项目' };
    function shortDirLabel(dir) {
      const parts = String(dir || '').replace(/\\/g, '/').split('/').filter(Boolean);
      return parts.length ? `…/${parts[parts.length - 1]}` : String(dir || '');
    }

    function renderMemoriesList() {
      if (!memoriesCardList) return;
      const state = getState();
      const memories = state.memories || [];
      memoriesCardList.innerHTML = '';
      const q = memorySearchKeyword.trim().toLowerCase();
      const filtered = q ? memories.filter(m => (m.content || '').toLowerCase().includes(q)) : memories;
      if (memoryCountBadge) memoryCountBadge.textContent = `${memories.length} 条`;

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
            updateState({ memories: res.memories });
            renderMemoriesList();
          }
        });
        memoriesCardList.appendChild(card);
      });
    }

    function openMemoryEditor(m) {
      editingMemoryId = m ? m.id : null;
      if (memoryEditTitle) memoryEditTitle.textContent = m ? '编辑记忆' : '新建记忆';
      if (inputMemoryContent) inputMemoryContent.value = m ? m.content : '';
      if (selectMemoryScope) selectMemoryScope.value = m && m.scope !== 'global' ? 'project' : 'global';
      if (selectMemoryType) selectMemoryType.value = m ? (m.type || 'fact') : 'fact';
      if (memoryEditPanel) memoryEditPanel.classList.remove('hidden');
    }

    function closeMemoryEditor() {
      editingMemoryId = null;
      if (memoryEditPanel) memoryEditPanel.classList.add('hidden');
    }

    if (btnCreateMemory) btnCreateMemory.addEventListener('click', () => openMemoryEditor(null));
    if (btnCloseMemoryEdit) btnCloseMemoryEdit.addEventListener('click', closeMemoryEditor);
    if (btnCancelMemoryEdit) btnCancelMemoryEdit.addEventListener('click', closeMemoryEditor);
    if (inputSearchMemories) {
      inputSearchMemories.addEventListener('input', () => {
        memorySearchKeyword = inputSearchMemories.value;
        renderMemoriesList();
      });
    }

    if (btnSaveMemoryEdit) {
      btnSaveMemoryEdit.addEventListener('click', async () => {
        const content = inputMemoryContent.value.trim();
        if (!content) { alert('记忆内容不能为空'); return; }
        const state = getState();
        let scope = 'global';
        if (selectMemoryScope.value === 'project') {
          scope = (state.currentSession && state.currentSession.workDir) || (state.config && state.config.agentWorkDir) || '';
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
          updateState({ memories: res.memories });
          closeMemoryEditor();
          renderMemoriesList();
        } else {
          alert(`保存失败: ${(res && res.error) || '未知错误'}`);
        }
      });
    }

    /* --- Personas Controller --- */
    function renderPersonasSettingsList() {
      if (!personasCardList) return;
      const state = getState();
      const personas = state.personas || [];
      personasCardList.innerHTML = '';
      const q = personaSearchKeyword.trim().toLowerCase();
      const filtered = q
        ? personas.filter(p => (p.title || '').toLowerCase().includes(q) || (p.prompt || '').toLowerCase().includes(q))
        : personas;

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / personaPageSize));
      if (personaCurrentPage > totalPages) personaCurrentPage = totalPages;
      if (personaCurrentPage < 1) personaCurrentPage = 1;

      if (personaPageInfo) personaPageInfo.textContent = `第 ${personaCurrentPage} / ${totalPages} 页 (共 ${total} 项)`;
      if (btnPrevPersonaPage) btnPrevPersonaPage.disabled = personaCurrentPage <= 1;
      if (btnNextPersonaPage) btnNextPersonaPage.disabled = personaCurrentPage >= totalPages;

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

        card.querySelector('.ai-persona-card-btn.edit').addEventListener('click', () => openPersonaEditor(p));
        card.querySelector('.ai-persona-card-btn.del').addEventListener('click', async () => {
          const currentP = getState().personas || [];
          if (currentP.length <= 1) {
            alert('必须保留至少一个人设角色，无法删除');
            return;
          }
          if (!confirm(`确定要删除人设「${p.title}」吗？`)) return;
          const res = await ctx.call('deletePersona', { id: p.id });
          if (res && res.ok) {
            updateState({ personas: res.personas });
            if (typeof onPersonasChanged === 'function') onPersonasChanged(res.personas);
            renderPersonasSettingsList();
          } else {
            alert(`删除失败: ${(res && res.error) || '未知错误'}`);
          }
        });

        personasCardList.appendChild(card);
      });
    }

    if (inputSearchPersonas) {
      inputSearchPersonas.addEventListener('input', () => {
        personaSearchKeyword = inputSearchPersonas.value;
        personaCurrentPage = 1;
        renderPersonasSettingsList();
      });
    }

    if (btnPrevPersonaPage) {
      btnPrevPersonaPage.addEventListener('click', () => {
        if (personaCurrentPage > 1) {
          personaCurrentPage--;
          renderPersonasSettingsList();
        }
      });
    }

    if (btnNextPersonaPage) {
      btnNextPersonaPage.addEventListener('click', () => {
        personaCurrentPage++;
        renderPersonasSettingsList();
      });
    }

    function openPersonaEditor(p) {
      if (p) {
        editingPersonaId = p.id;
        if (personaEditTitle) personaEditTitle.textContent = `编辑人设: ${p.title}`;
        if (inputPersonaTitle) inputPersonaTitle.value = p.title || '';
        if (inputPersonaIcon) inputPersonaIcon.value = p.icon || '✨';
        if (personaTempRange) personaTempRange.value = p.temperature ?? 0.7;
        if (personaTempVal) personaTempVal.textContent = p.temperature ?? 0.7;
        if (inputPersonaPrompt) inputPersonaPrompt.value = p.prompt || '';
      } else {
        editingPersonaId = null;
        if (personaEditTitle) personaEditTitle.textContent = '新建人设卡片';
        if (inputPersonaTitle) inputPersonaTitle.value = '';
        if (inputPersonaIcon) inputPersonaIcon.value = '✨';
        if (personaTempRange) personaTempRange.value = 0.7;
        if (personaTempVal) personaTempVal.textContent = '0.7';
        if (inputPersonaPrompt) inputPersonaPrompt.value = '';
      }
      if (personasCardList) personasCardList.classList.add('hidden');
      if (personasPagination) personasPagination.classList.add('hidden');
      if (personaEditPanel) personaEditPanel.classList.remove('hidden');
      if (inputPersonaTitle) inputPersonaTitle.focus();
    }

    function closePersonaEditor() {
      if (personaEditPanel) personaEditPanel.classList.add('hidden');
      if (personasCardList) personasCardList.classList.remove('hidden');
      if (personasPagination) personasPagination.classList.remove('hidden');
      editingPersonaId = null;
    }

    if (btnClosePersonaEdit) btnClosePersonaEdit.addEventListener('click', closePersonaEditor);
    if (btnCancelPersonaEdit) btnCancelPersonaEdit.addEventListener('click', closePersonaEditor);

    if (personaTempRange) {
      personaTempRange.addEventListener('input', () => {
        if (personaTempVal) personaTempVal.textContent = personaTempRange.value;
      });
    }

    if (quickEmojiList) {
      quickEmojiList.querySelectorAll('.ai-emoji-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          if (inputPersonaIcon) inputPersonaIcon.value = pill.dataset.emoji;
        });
      });
    }

    if (btnCreatePersona) btnCreatePersona.addEventListener('click', () => openPersonaEditor(null));

    if (btnResetPersonas) {
      btnResetPersonas.addEventListener('click', async () => {
        if (!confirm('确定要恢复默认的人设卡片吗？自定义新增的人设将被重置。')) return;
        const res = await ctx.call('resetPersonas');
        if (res && res.ok) {
          updateState({ personas: res.personas });
          closePersonaEditor();
          if (typeof onPersonasChanged === 'function') onPersonasChanged(res.personas);
          renderPersonasSettingsList();
        }
      });
    }

    if (btnSavePersona) {
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
          updateState({ personas: res.personas });
          closePersonaEditor();
          if (typeof onPersonasChanged === 'function') onPersonasChanged(res.personas);
          renderPersonasSettingsList();
        } else {
          alert(`保存失败: ${(res && res.error) || '未知错误'}`);
        }
      });
    }

    /* --- MCP Servers Controller --- */
    function mcpTargetText(s) {
      if (s.transport === 'http') return s.url || '';
      return [s.command, ...(s.args || [])].filter(Boolean).join(' ');
    }

    function renderMcpList() {
      if (!mcpServerList) return;
      const mcpServers = (getState().mcpServers) || [];
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
            updateState({ mcpServers: res.mcpServers });
            renderMcpList();
          }
        });
        mcpServerList.appendChild(card);
      });
    }

    function syncMcpTransportGroups() {
      const isHttp = selectMcpTransport.value === 'http';
      if (grpMcpCommand) grpMcpCommand.classList.toggle('hidden', isHttp);
      if (grpMcpArgs) grpMcpArgs.classList.toggle('hidden', isHttp);
      if (grpMcpEnv) grpMcpEnv.classList.toggle('hidden', isHttp);
      if (grpMcpUrl) grpMcpUrl.classList.toggle('hidden', !isHttp);
      if (grpMcpApiKey) grpMcpApiKey.classList.toggle('hidden', !isHttp);
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
      if (mcpEditTitle) mcpEditTitle.textContent = s ? `编辑服务器: ${s.name}` : '添加 MCP 服务器';
      if (inputMcpName) inputMcpName.value = s ? s.name : '';
      if (selectMcpTransport) selectMcpTransport.value = s ? (s.transport || 'stdio') : 'stdio';
      if (inputMcpCommand) inputMcpCommand.value = s ? (s.command || '') : '';
      if (inputMcpArgs) inputMcpArgs.value = s ? (s.args || []).join('\n') : '';
      if (inputMcpEnv) inputMcpEnv.value = s ? Object.entries(s.env || {}).map(([k, v]) => `${k}=${v}`).join('\n') : '';
      if (inputMcpUrl) inputMcpUrl.value = s ? (s.url || '') : '';
      if (inputMcpApiKey) inputMcpApiKey.value = s ? (s.apiKey || '') : '';
      if (chkMcpEnabled) chkMcpEnabled.checked = s ? s.enabled !== false : true;
      if (mcpTestResult) {
        mcpTestResult.textContent = '';
        mcpTestResult.className = 'ai-ext-test-result';
      }
      syncMcpTransportGroups();
      if (mcpMarketPanel) mcpMarketPanel.classList.add('hidden');
      if (mcpServerList) mcpServerList.classList.add('hidden');
      if (mcpEditPanel) mcpEditPanel.classList.remove('hidden');
      if (inputMcpName) inputMcpName.focus();
    }

    function closeMcpEditor() {
      if (mcpEditPanel) mcpEditPanel.classList.add('hidden');
      if (mcpServerList) mcpServerList.classList.remove('hidden');
      editingMcpId = null;
    }

    if (btnCreateMcp) btnCreateMcp.addEventListener('click', () => openMcpEditor(null));
    if (btnCloseMcpEdit) btnCloseMcpEdit.addEventListener('click', closeMcpEditor);
    if (btnCancelMcpEdit) btnCancelMcpEdit.addEventListener('click', closeMcpEditor);
    if (selectMcpTransport) selectMcpTransport.addEventListener('change', syncMcpTransportGroups);

    if (btnTestMcp) {
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
    }

    if (btnSaveMcp) {
      btnSaveMcp.addEventListener('click', async () => {
        const res = await ctx.call('saveMcpServer', { server: buildMcpFormCfg(true) });
        if (res && res.ok) {
          updateState({ mcpServers: res.mcpServers });
          closeMcpEditor();
          renderMcpList();
        } else {
          alert(`保存失败: ${(res && res.error) || '未知错误'}`);
        }
      });
    }

    /* --- MCP Market Controller --- */
    async function loadAndRenderMcpMarket() {
      if (!marketServerList) return;
      marketServerList.innerHTML = '<div class="ai-model-empty-tip">正在加载 MCP 市场…</div>';
      try {
        const res = await ctx.call('getMcpMarket', { query: marketSearchQuery, category: marketActiveCategory });
        if (!res || !res.ok) {
          marketServerList.innerHTML = `<div class="ai-model-empty-tip">加载市场失败: ${(res && res.error) || '未知错误'}</div>`;
          return;
        }

        if (marketCategoriesBar) {
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
        }

        marketServerList.innerHTML = '';
        const items = res.items || [];
        if (items.length === 0) {
          marketServerList.innerHTML = '<div class="ai-model-empty-tip">未找到匹配的 MCP 服务</div>';
          return;
        }

        const catIcons = { browser: '🌐', dev: '💻', search: '🔍', data: '🗄️', system: '⚙️' };

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
                  updateState({ mcpServers: addRes.mcpServers });
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
      if (mcpEditPanel) mcpEditPanel.classList.add('hidden');
      if (mcpServerList) mcpServerList.classList.add('hidden');
      if (mcpMarketPanel) mcpMarketPanel.classList.remove('hidden');
      loadAndRenderMcpMarket();
    }

    function closeMcpMarket() {
      if (mcpMarketPanel) mcpMarketPanel.classList.add('hidden');
      if (mcpServerList) mcpServerList.classList.remove('hidden');
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
          updateState({ mcpServers: res.mcpServers });
          renderMcpList();
        }
      });
    }

    /* --- Skills Controller --- */
    function renderSkillsList() {
      if (!skillsCardList) return;
      const skills = (getState().skills) || [];
      skillsCardList.innerHTML = '';
      const q = skillSearchKeyword.trim().toLowerCase();
      const filtered = q
        ? skills.filter(sk => (sk.name || '').toLowerCase().includes(q) || (sk.desc || '').toLowerCase().includes(q))
        : skills;

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / skillPageSize));
      if (skillCurrentPage > totalPages) skillCurrentPage = totalPages;
      if (skillCurrentPage < 1) skillCurrentPage = 1;

      if (skillPageInfo) skillPageInfo.textContent = `第 ${skillCurrentPage} / ${totalPages} 页 (共 ${total} 项)`;
      if (btnPrevSkillPage) btnPrevSkillPage.disabled = skillCurrentPage <= 1;
      if (btnNextSkillPage) btnNextSkillPage.disabled = skillCurrentPage >= totalPages;

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
          if (skillEditTitle) skillEditTitle.textContent = `编辑技能: ${sk.name}`;
          if (inputSkillName) inputSkillName.value = sk.name || '';
          if (inputSkillDesc) inputSkillDesc.value = sk.desc || '';
          if (inputSkillContent) inputSkillContent.value = sk.content || '';
          if (skillsCardList) skillsCardList.classList.add('hidden');
          if (skillEditPanel) skillEditPanel.classList.remove('hidden');
          if (inputSkillName) inputSkillName.focus();
        });
        card.querySelector('.del').addEventListener('click', async () => {
          if (!confirm(`确定删除技能「${sk.name}」吗？`)) return;
          const res = await ctx.call('deleteSkill', { id: sk.id });
          if (res && res.ok) {
            updateState({ skills: res.skills });
            renderSkillsList();
          }
        });
        skillsCardList.appendChild(card);
      });
    }

    let skillImportResultTimer = null;
    function showSkillImportResult(text, cls) {
      if (!skillImportResult) return;
      clearTimeout(skillImportResultTimer);
      skillImportResult.textContent = text;
      skillImportResult.className = `ai-ext-import-result ${cls || ''}`;
      if (cls === 'ok') {
        skillImportResultTimer = setTimeout(() => skillImportResult.classList.add('hidden'), 6000);
      }
    }

    function describeImportResult(prefix, res) {
      let t = `✓ ${prefix}：新增 ${res.imported} 个`;
      if (Array.isArray(res.names) && res.names.length) t += `（${res.names.join('、')}）`;
      if (res.skipped) t += `，跳过同名 ${res.skipped} 个`;
      if (res.failed) t += `，下载失败 ${res.failed} 个`;
      if (res.overflow) t += `，超出数量上限 ${res.overflow} 个未下载`;
      if (res.truncated) t += '（仓库过大，扫描结果可能不完整）';
      return t;
    }

    if (inputSearchSkills) {
      inputSearchSkills.addEventListener('input', () => {
        skillSearchKeyword = inputSearchSkills.value;
        skillCurrentPage = 1;
        renderSkillsList();
      });
    }

    if (btnPrevSkillPage) {
      btnPrevSkillPage.addEventListener('click', () => {
        if (skillCurrentPage > 1) {
          skillCurrentPage--;
          renderSkillsList();
        }
      });
    }

    if (btnNextSkillPage) {
      btnNextSkillPage.addEventListener('click', () => {
        skillCurrentPage++;
        renderSkillsList();
      });
    }

    if (btnImportSkillUrl) {
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
            updateState({ skills: res.skills });
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
    }

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

    if (btnImportSkillFile && inputSkillFile) {
      btnImportSkillFile.addEventListener('click', () => inputSkillFile.click());
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
            updateState({ skills: res.skills });
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
    }

    if (btnImportSkillFolder && inputSkillFolder) {
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
            updateState({ skills: res.skills });
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
    }

    function closeSkillEditor() {
      if (skillEditPanel) skillEditPanel.classList.add('hidden');
      if (skillsCardList) skillsCardList.classList.remove('hidden');
      editingSkillId = null;
    }

    if (btnCreateSkill) {
      btnCreateSkill.addEventListener('click', () => {
        editingSkillId = null;
        if (skillEditTitle) skillEditTitle.textContent = '新建技能';
        if (inputSkillName) inputSkillName.value = '';
        if (inputSkillDesc) inputSkillDesc.value = '';
        if (inputSkillContent) inputSkillContent.value = '';
        if (skillsCardList) skillsCardList.classList.add('hidden');
        if (skillEditPanel) skillEditPanel.classList.remove('hidden');
        if (inputSkillName) inputSkillName.focus();
      });
    }
    if (btnCloseSkillEdit) btnCloseSkillEdit.addEventListener('click', closeSkillEditor);
    if (btnCancelSkillEdit) btnCancelSkillEdit.addEventListener('click', closeSkillEditor);

    if (btnResetSkills) {
      btnResetSkills.addEventListener('click', async () => {
        if (!confirm('确定恢复内置默认技能吗？当前全部技能（含自定义）将被重置为内置默认。')) return;
        const res = await ctx.call('resetSkills');
        if (res && res.ok) {
          updateState({ skills: res.skills });
          closeSkillEditor();
          renderSkillsList();
        }
      });
    }

    if (btnSaveSkill) {
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
          updateState({ skills: res.skills });
          closeSkillEditor();
          renderSkillsList();
        } else {
          alert(`保存失败: ${(res && res.error) || '未知错误'}`);
        }
      });
    }

    /* --- Model Tab Controller --- */
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
      if (!modelSearchResults) return;
      const kw = (inputModelSearch ? inputModelSearch.value : '').trim().toLowerCase();
      if (btnClearModelSearch) btnClearModelSearch.classList.toggle('hidden', !kw);

      const currCh = PRESET_CHANNELS.find(x => x.id === cfgChannel.value);
      const currChModels = (currCh && currCh.models) || [];
      const allPreset = getAllPresetModels();

      if (countChannelModels) countChannelModels.textContent = currChModels.length;
      if (countAllModels) countAllModels.textContent = allPreset.length;
      if (countRemoteModels) countRemoteModels.textContent = remoteModels.length;

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
          if (modelSearchPanel) modelSearchPanel.classList.add('hidden');
        });
        modelSearchResults.appendChild(div);
      });
    }

    if (modelFilterTabs) {
      modelFilterTabs.querySelectorAll('.ai-filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          modelFilterTabs.querySelectorAll('.ai-filter-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          activeModelTab = tab.dataset.tab;
          renderModelSearchResults();
        });
      });
    }

    if (inputModelSearch) {
      inputModelSearch.addEventListener('input', () => renderModelSearchResults());
    }

    if (btnClearModelSearch) {
      btnClearModelSearch.addEventListener('click', () => {
        inputModelSearch.value = '';
        inputModelSearch.focus();
        renderModelSearchResults();
      });
    }

    if (btnToggleModelSearch && modelSearchPanel) {
      btnToggleModelSearch.addEventListener('click', () => {
        const isHidden = modelSearchPanel.classList.toggle('hidden');
        if (!isHidden) {
          inputModelSearch.value = '';
          renderModelSearchResults();
          inputModelSearch.focus();
        }
      });
    }

    if (cfgModel) {
      cfgModel.addEventListener('focus', () => {
        if (modelSearchPanel && modelSearchPanel.classList.contains('hidden')) {
          modelSearchPanel.classList.remove('hidden');
          if (inputModelSearch) inputModelSearch.value = cfgModel.value.trim();
          renderModelSearchResults();
        }
      });
    }

    if (btnFetchModels) {
      btnFetchModels.addEventListener('click', async () => {
        const baseUrl = cfgBaseUrl.value.trim();
        if (!baseUrl) {
          alert('请先填写 API 基础路径 (Base URL)');
          cfgBaseUrl.focus();
          return;
        }
        btnFetchModels.disabled = true;
        if (iconFetchSpin) iconFetchSpin.classList.add('spinning');
        try {
          const res = await ctx.call('fetchModels', {
            protocol: cfgProtocol.value,
            baseUrl,
            apiKey: cfgApiKey.value.trim()
          });
          if (res && res.ok && Array.isArray(res.models)) {
            remoteModels = res.models;
            if (tabRemoteModels) tabRemoteModels.classList.remove('hidden');
            if (countRemoteModels) countRemoteModels.textContent = remoteModels.length;
            if (modelFilterTabs) {
              modelFilterTabs.querySelectorAll('.ai-filter-tab').forEach(t => t.classList.remove('active'));
            }
            if (tabRemoteModels) tabRemoteModels.classList.add('active');
            activeModelTab = 'remote';
            if (modelSearchPanel) modelSearchPanel.classList.remove('hidden');
            if (inputModelSearch) inputModelSearch.value = '';
            renderModelSearchResults();
          } else {
            alert(`拉取模型失败: ${(res && res.error) || '未知错误'}`);
          }
        } catch (err) {
          alert(`拉取模型异常: ${err.message || err}`);
        } finally {
          btnFetchModels.disabled = false;
          if (iconFetchSpin) iconFetchSpin.classList.remove('spinning');
        }
      });
    }

    function renderChannelChips(channelId) {
      if (!channelModelChips) return;
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

    if (cfgChannel) {
      cfgChannel.addEventListener('change', () => {
        const ch = PRESET_CHANNELS.find(x => x.id === cfgChannel.value);
        if (ch) {
          if (remoteModels.length) {
            remoteModels = [];
            if (tabRemoteModels) tabRemoteModels.classList.add('hidden');
            if (activeModelTab === 'remote') {
              activeModelTab = 'channel';
              if (modelFilterTabs) {
                modelFilterTabs.querySelectorAll('.ai-filter-tab').forEach(t => {
                  t.classList.toggle('active', t.dataset.tab === activeModelTab);
                });
              }
            }
          }
          if (ch.baseUrl) cfgBaseUrl.value = ch.baseUrl;
          if (ch.protocol) cfgProtocol.value = ch.protocol;
          if (ch.defaultModel) cfgModel.value = ch.defaultModel;
          renderChannelChips(ch.id);
          renderModelSearchResults();
        }
      });
    }

    if (btnToggleApiKey) {
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
    }

    function openSettings(initialTab = 'model') {
      const state = getState();
      const config = state.config || {};
      switchSettingsTab(initialTab);
      const chId = config.channel || 'openai';
      if (cfgChannel) cfgChannel.value = PRESET_CHANNELS.some(x => x.id === chId) ? chId : 'custom';
      if (cfgProtocol) cfgProtocol.value = config.protocol || 'openai-chat';
      if (cfgBaseUrl) cfgBaseUrl.value = config.baseUrl || 'https://api.openai.com/v1';
      if (cfgApiKey) {
        cfgApiKey.value = config.apiKey || '';
        cfgApiKey.type = 'password';
      }
      if (btnToggleApiKey) {
        btnToggleApiKey.textContent = '👁️';
        btnToggleApiKey.title = '显示密钥';
      }
      if (cfgModel) cfgModel.value = config.model || 'gpt-4o-mini';
      if (cfgFallbackModel) cfgFallbackModel.value = config.fallbackModel || '';
      if (cfgTempRange) cfgTempRange.value = config.temperature ?? 0.7;
      if (cfgTempVal) cfgTempVal.textContent = config.temperature ?? 0.7;
      if (cfgMaxContext) cfgMaxContext.value = config.maxContextMessages ?? 16;
      if (cfgAgentMaxRounds) cfgAgentMaxRounds.value = config.agentMaxRounds ?? 8;
      if (cfgAgentWorkDir) cfgAgentWorkDir.value = config.agentWorkDir || '';
      if (modelSearchPanel) modelSearchPanel.classList.add('hidden');
      if (inputModelSearch) inputModelSearch.value = '';
      if (cfgChannel) renderChannelChips(cfgChannel.value);
      renderModelSearchResults();
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
