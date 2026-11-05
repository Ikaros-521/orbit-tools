/* AI Chat settings - mcp tab controller (extracted from
   settings-modals.js). Dual CommonJS / Browser export; mounted per-panel via
   the createMcpTab factory so tab-local state stays per-mount. */
(() => {
  function createMcpTab(deps) {
    const {
      PRESET_CHANNELS, btnCancelMcpEdit, btnCloseMcpEdit, btnCloseMcpMarket,
      btnCreateMcp, btnOpenMcpMarket, btnResetMcp, btnSaveMcp,
      btnTestMcp, chkMcpEnabled, ctx, escapeHtml,
      getState, grpMcpApiKey, grpMcpArgs, grpMcpCommand,
      grpMcpEnv, grpMcpUrl, inputMarketSearch, inputMcpApiKey,
      inputMcpArgs, inputMcpCommand, inputMcpEnv, inputMcpName,
      inputMcpUrl, marketCategoriesBar, marketServerList, mcpEditPanel,
      mcpEditTitle, mcpMarketPanel, mcpServerList, mcpTestResult,
      onConfigSaved, onPersonasChanged, panelEl, selectMcpTransport,
      switchSettingsTab, updateState
    } = deps;
    if (!panelEl) return null;

    let editingMcpId = null;
    let marketActiveCategory = 'all';
    let marketSearchQuery = '';
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

        async function loadAndRenderMcpMarket() {
      if (!marketServerList) return;
      marketServerList.innerHTML = '<div class="ai-model-empty-tip">正在加载 MCP 市场…</div>';
      try {
        const res = await ctx.call('getMcpMarket', { query: marketSearchQuery, category: marketActiveCategory });
        if (!res || !res.ok) {
          marketServerList.innerHTML = `<div class="ai-model-empty-tip">加载市场失败: ${escapeHtml((res && res.error) || '未知错误')}</div>`;
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
        marketServerList.innerHTML = `<div class="ai-model-empty-tip">市场加载异常: ${escapeHtml(err.message)}</div>`;
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


    return { renderMcpList, openMcpEditor, closeMcpEditor };
  }

  const exportsObj = { createMcpTab };
  if (typeof window !== 'undefined') {
    window.AiChatSettingsParts = Object.assign(window.AiChatSettingsParts || {}, exportsObj);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})();
