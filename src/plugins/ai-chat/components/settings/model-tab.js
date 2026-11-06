/* AI Chat settings - model tab controller (extracted from
   settings-modals.js). Dual CommonJS / Browser export; mounted per-panel via
   the createModelTab factory so tab-local state stays per-mount. */
(() => {
  function createModelTab(deps) {
    const {
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
    } = deps;
    if (!panelEl) return null;

    let channels = [];
    let selectedChannelId = 'openai';
    let activeChannelId = 'openai';
    let remoteModels = [];
    let activeModelTab = 'channel';

    function maskKey(key) {
      if (!key) return '';
      if (key.length <= 8) return '••••••••';
      return key.slice(0, 4) + '••••' + key.slice(-4);
    }

    function normalizeChannel(ch) {
      if (!ch || typeof ch !== 'object') return null;
      const apiKeys = Array.isArray(ch.apiKeys) ? ch.apiKeys.map(k => ({
        id: String(k.id || ('k_' + Math.random().toString(36).slice(2, 8))),
        name: String(k.name || '默认密钥'),
        key: String(k.key || '')
      })) : [];

      if (apiKeys.length === 0 && ch.apiKey) {
        apiKeys.push({
          id: 'k_default_' + Math.random().toString(36).slice(2, 6),
          name: '默认密钥',
          key: String(ch.apiKey)
        });
      }

      let activeKeyId = ch.activeKeyId || (apiKeys[0] && apiKeys[0].id) || '';
      if (activeKeyId && !apiKeys.some(k => k.id === activeKeyId)) {
        activeKeyId = (apiKeys[0] && apiKeys[0].id) || '';
      }
      const activeObj = apiKeys.find(k => k.id === activeKeyId) || apiKeys[0];
      const activeKeyValue = activeObj ? activeObj.key : (ch.apiKey || '');

      return {
        id: String(ch.id || ('ch_' + Date.now().toString(36))),
        name: String(ch.name || '未命名渠道'),
        icon: ch.icon || '🤖',
        protocol: ch.protocol || 'openai-chat',
        baseUrl: ch.baseUrl || '',
        apiKeys,
        activeKeyId,
        apiKey: activeKeyValue,
        defaultModel: ch.defaultModel || (Array.isArray(ch.models) && ch.models[0]) || 'gpt-4o-mini',
        models: Array.isArray(ch.models) ? [...ch.models] : ['gpt-4o-mini'],
        isPreset: !!ch.isPreset,
        templateId: ch.templateId || ch.id
      };
    }

    function buildDefaultChannels() {
      const presets = Array.isArray(PRESET_CHANNELS) ? PRESET_CHANNELS : [];
      const ds = presets.find(p => p.id === 'deepseek') || presets[0];
      if (ds) {
        return [normalizeChannel({
          id: ds.id,
          name: ds.name,
          icon: ds.icon,
          protocol: ds.protocol,
          baseUrl: ds.baseUrl,
          apiKey: '',
          defaultModel: ds.defaultModel || (ds.models && ds.models[0]) || '',
          models: Array.isArray(ds.models) ? [...ds.models] : [],
          isPreset: true,
          templateId: ds.id
        })];
      }
      return [normalizeChannel({
        id: 'openai',
        name: 'OpenAI (官方)',
        icon: '🟢',
        protocol: 'openai-chat',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        defaultModel: 'gpt-4o-mini',
        models: ['gpt-4o-mini', 'gpt-4o'],
        isPreset: true,
        templateId: 'openai'
      })];
    }

    function initChannels(config) {
      const cfg = config || (getState && getState().config) || {};
      if (Array.isArray(cfg.channels) && cfg.channels.length > 0) {
        channels = cfg.channels.map(normalizeChannel).filter(Boolean);
      } else {
        channels = buildDefaultChannels();
        const prevCh = channels.find(c => c.id === (cfg.channel || 'openai')) || channels[0];
        if (prevCh) {
          if (cfg.apiKey) {
            prevCh.apiKey = cfg.apiKey;
            if (!prevCh.apiKeys.length) {
              prevCh.apiKeys = [{ id: 'k_init', name: '默认密钥', key: cfg.apiKey }];
              prevCh.activeKeyId = 'k_init';
            }
          }
          if (cfg.baseUrl) prevCh.baseUrl = cfg.baseUrl;
          if (cfg.protocol) prevCh.protocol = cfg.protocol;
          if (cfg.model) prevCh.defaultModel = cfg.model;
        }
      }
      if (channels.length === 0) {
        channels = buildDefaultChannels();
      }
      activeChannelId = cfg.activeChannelId || cfg.channel || channels[0].id;
      if (!channels.some(c => c.id === activeChannelId)) {
        activeChannelId = channels[0].id;
      }
      selectedChannelId = activeChannelId;
      if (boxCreateChannel) boxCreateChannel.classList.add('hidden');

      renderChannelDropdown();
      loadChannelToForm(selectedChannelId);
    }

    function renderChannelDropdown() {
      if (!cfgChannel) return;
      cfgChannel.innerHTML = '';
      channels.forEach(ch => {
        const opt = document.createElement('option');
        opt.value = ch.id;
        const isActive = (ch.id === activeChannelId);
        opt.textContent = `${ch.icon || '🤖'} ${ch.name}${isActive ? ' (当前使用)' : ''}`;
        cfgChannel.appendChild(opt);
      });
      cfgChannel.value = selectedChannelId;
    }

    function commitCurrentFormToChannel() {
      const ch = channels.find(c => c.id === selectedChannelId);
      if (!ch) return;
      if (cfgBaseUrl) ch.baseUrl = cfgBaseUrl.value.trim();
      if (cfgProtocol) ch.protocol = cfgProtocol.value;
      if (cfgModel) ch.defaultModel = cfgModel.value.trim();
      if (cfgChannelName) ch.name = cfgChannelName.value.trim() || ch.name;
      if (cfgChannelIcon) ch.icon = cfgChannelIcon.value.trim() || ch.icon;

      // 同步当前激活 Key
      const activeKeyObj = (ch.apiKeys || []).find(k => k.id === ch.activeKeyId) || (ch.apiKeys && ch.apiKeys[0]);
      ch.apiKey = activeKeyObj ? activeKeyObj.key : (cfgApiKey ? cfgApiKey.value.trim() : '');
      if (cfgApiKey) cfgApiKey.value = ch.apiKey;

      if (chkActiveChannel && chkActiveChannel.checked) {
        activeChannelId = ch.id;
      }
    }

    function renderChannelKeys(ch) {
      if (!channelKeysList) return;
      channelKeysList.innerHTML = '';
      const keys = Array.isArray(ch.apiKeys) ? ch.apiKeys : [];
      if (channelKeyCountBadge) {
        channelKeyCountBadge.textContent = `已配置 ${keys.length} 个密钥`;
      }

      if (keys.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'ai-empty-keys-note';
        emptyDiv.style.padding = '8px 10px';
        emptyDiv.style.color = 'var(--ink-faint)';
        emptyDiv.style.fontSize = '12px';
        emptyDiv.style.textAlign = 'center';
        emptyDiv.style.background = 'var(--inset)';
        emptyDiv.style.borderRadius = 'var(--r-sm)';
        emptyDiv.textContent = '暂无配置密钥，请在下方输入并点击添加';
        channelKeysList.appendChild(emptyDiv);
        return;
      }

      keys.forEach(k => {
        const isActive = (k.id === ch.activeKeyId);
        const card = document.createElement('div');
        card.className = `ai-channel-key-card ${isActive ? 'active' : ''}`;

        const leftDiv = document.createElement('div');
        leftDiv.className = 'ai-key-info';

        const radioWrap = document.createElement('label');
        radioWrap.className = 'ai-key-radio-wrap';
        radioWrap.title = '单选设为当前激活使用的密钥';

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `channel_active_key_${ch.id}`;
        radio.value = k.id;
        radio.checked = isActive;
        radio.addEventListener('change', () => {
          ch.activeKeyId = k.id;
          ch.apiKey = k.key;
          if (cfgApiKey) cfgApiKey.value = k.key;
          renderChannelKeys(ch);
        });

        const nameSpan = document.createElement('span');
        nameSpan.className = 'ai-key-name';
        nameSpan.textContent = k.name || '默认密钥';

        radioWrap.appendChild(radio);
        radioWrap.appendChild(nameSpan);

        const valSpan = document.createElement('span');
        valSpan.className = 'ai-key-masked-text';
        valSpan.textContent = maskKey(k.key);
        valSpan.title = '密钥脱敏保护';

        leftDiv.appendChild(radioWrap);
        leftDiv.appendChild(valSpan);

        const rightDiv = document.createElement('div');
        rightDiv.className = 'ai-key-actions';

        let isRevealed = false;
        const btnView = document.createElement('button');
        btnView.type = 'button';
        btnView.className = 'ai-btn-text-action';
        btnView.title = '查看完整密钥';
        btnView.textContent = '👁️';
        btnView.addEventListener('click', (e) => {
          e.stopPropagation();
          isRevealed = !isRevealed;
          valSpan.textContent = isRevealed ? (k.key || '(空)') : maskKey(k.key);
          btnView.textContent = isRevealed ? '🙈' : '👁️';
          btnView.title = isRevealed ? '隐藏密钥' : '查看完整密钥';
        });

        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'ai-btn-text-action text-danger';
        btnDel.title = '删除此密钥';
        btnDel.textContent = '🗑️';
        btnDel.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!confirm(`确定删除密钥「${k.name}」吗？`)) return;
          ch.apiKeys = ch.apiKeys.filter(item => item.id !== k.id);
          if (ch.activeKeyId === k.id) {
            ch.activeKeyId = (ch.apiKeys[0] && ch.apiKeys[0].id) || '';
            const nextKey = ch.apiKeys.find(item => item.id === ch.activeKeyId);
            ch.apiKey = nextKey ? nextKey.key : '';
          }
          if (cfgApiKey) cfgApiKey.value = ch.apiKey || '';
          renderChannelKeys(ch);
        });

        rightDiv.appendChild(btnView);
        rightDiv.appendChild(btnDel);

        card.appendChild(leftDiv);
        card.appendChild(rightDiv);
        channelKeysList.appendChild(card);
      });
    }

    function loadChannelToForm(chId) {
      const ch = channels.find(c => c.id === chId) || channels[0];
      if (!ch) return;
      selectedChannelId = ch.id;
      if (cfgChannel) cfgChannel.value = ch.id;
      if (cfgProtocol) cfgProtocol.value = ch.protocol || 'openai-chat';
      if (cfgBaseUrl) cfgBaseUrl.value = ch.baseUrl || '';

      const activeKeyObj = (ch.apiKeys || []).find(k => k.id === ch.activeKeyId) || (ch.apiKeys && ch.apiKeys[0]);
      ch.apiKey = activeKeyObj ? activeKeyObj.key : (ch.apiKey || '');
      if (cfgApiKey) cfgApiKey.value = ch.apiKey;

      if (cfgModel) cfgModel.value = ch.defaultModel || (ch.models && ch.models[0]) || '';
      if (chkActiveChannel) chkActiveChannel.checked = (ch.id === activeChannelId);

      if (cfgChannelName) cfgChannelName.value = ch.name || '';
      if (cfgChannelIcon) cfgChannelIcon.value = ch.icon || '';

      if (btnDeleteChannel) {
        const canDelete = channels.length > 1;
        btnDeleteChannel.disabled = !canDelete;
        const displayName = (ch.name || '当前渠道').trim();
        const shortName = displayName.length > 8 ? displayName.slice(0, 8) + '…' : displayName;
        btnDeleteChannel.textContent = `🗑️ 删除「${shortName}」`;
        btnDeleteChannel.title = canDelete ? `删除当前下拉选中的「${displayName}」渠道` : '必须保留至少一个已配置渠道';
      }

      remoteModels = [];
      if (tabRemoteModels) tabRemoteModels.classList.add('hidden');
      if (remoteSyncBar) remoteSyncBar.classList.add('hidden');
      if (activeModelTab === 'remote') activeModelTab = 'channel';

      renderChannelKeys(ch);
      renderChannelChips(ch.id);
      renderModelSearchResults();
    }

    function renderChannelChips(chId) {
      if (!channelModelChips) return;
      channelModelChips.innerHTML = '';
      const ch = channels.find(x => x.id === chId);
      if (!ch || !ch.models || ch.models.length === 0) {
        const empty = document.createElement('span');
        empty.style.fontSize = '11px';
        empty.style.color = 'var(--ink-faint)';
        empty.textContent = '本渠道暂无模型，请在下方添加或在线拉取';
        channelModelChips.appendChild(empty);
        return;
      }
      const currentSelectedModel = (cfgModel ? cfgModel.value : ch.defaultModel || '').trim();
      ch.models.forEach(m => {
        const chip = document.createElement('span');
        const isSelected = (m === currentSelectedModel);
        chip.className = `ai-chip ${isSelected ? 'active' : ''}`;
        chip.style.display = 'inline-flex';
        chip.style.alignItems = 'center';
        chip.style.gap = '4px';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = m;
        nameSpan.title = `点击设为默认使用模型: ${m}`;
        nameSpan.style.cursor = 'pointer';
        nameSpan.addEventListener('click', () => {
          cfgModel.value = m;
          ch.defaultModel = m;
          renderChannelChips(ch.id);
          renderModelSearchResults();
        });
        chip.appendChild(nameSpan);

        const delBtn = document.createElement('span');
        delBtn.textContent = '×';
        delBtn.title = `从本渠道移除模型 ${m}`;
        delBtn.style.cursor = 'pointer';
        delBtn.style.marginLeft = '2px';
        delBtn.style.opacity = '0.6';
        delBtn.style.fontWeight = 'bold';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          ch.models = ch.models.filter(x => x !== m);
          if (cfgModel.value === m) {
            cfgModel.value = ch.models[0] || '';
            ch.defaultModel = cfgModel.value;
          }
          renderChannelChips(ch.id);
          renderModelSearchResults();
        });
        chip.appendChild(delBtn);

        channelModelChips.appendChild(chip);
      });
    }

    function getAllPresetModels() {
      const all = [];
      const seen = new Set();
      const list = (Array.isArray(PRESET_CHANNELS) && PRESET_CHANNELS.length > 0)
        ? PRESET_CHANNELS
        : channels;
      list.forEach(ch => {
        (ch.models || []).forEach(m => {
          if (!seen.has(m)) {
            seen.add(m);
            all.push({ id: m, badge: (ch.name || '').split(' ')[0], channelId: ch.id, isRemote: false });
          }
        });
      });
      return all;
    }

    function applySelectedModel(modelName) {
      if (!modelName) return;
      const target = modelName.trim();
      if (!target) return;
      if (cfgModel) cfgModel.value = target;
      if (inputModelSearch) inputModelSearch.value = target;
      const currCh = channels.find(x => x.id === selectedChannelId);
      if (currCh) {
        currCh.defaultModel = target;
        if (!currCh.models.includes(target)) {
          currCh.models.push(target);
          renderChannelChips(currCh.id);
        }
      }
      if (modelSearchPanel) modelSearchPanel.classList.add('hidden');
    }

    function renderModelSearchResults() {
      if (!modelSearchResults) return;
      const kw = (inputModelSearch ? inputModelSearch.value : '').trim().toLowerCase();
      if (btnClearModelSearch) btnClearModelSearch.classList.toggle('hidden', !kw);

      const currCh = channels.find(x => x.id === selectedChannelId);
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
            ? currChModels.map(m => ({ id: m, badge: currCh ? (currCh.name || '').split(' ')[0] : '渠道', isRemote: false }))
            : allPreset.concat(remoteModels.map(m => ({ id: m, badge: '在线', isRemote: true })));

        candidates = pool.filter(item => item.id.toLowerCase().includes(kw));

        // 如果在当前渠道 Tab 没搜到，但预设模型库有匹配，自动呈现预设匹配项供用户快速选用
        if (candidates.length === 0 && activeModelTab === 'channel') {
          const cross = allPreset.filter(item => item.id.toLowerCase().includes(kw));
          if (cross.length > 0) {
            candidates = cross;
          }
        }
      } else {
        if (activeModelTab === 'remote') {
          candidates = remoteModels.map(m => ({ id: m, badge: '在线', isRemote: true }));
        } else if (activeModelTab === 'channel') {
          candidates = currChModels.map(m => ({ id: m, badge: currCh ? (currCh.name || '').split(' ')[0] : '渠道', isRemote: false }));
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
          tip.innerHTML = `未在已知库搜到 "<b>${escapeHtml(kw)}</b>"<br><span style="color:var(--amber);text-decoration:underline;cursor:pointer;font-weight:600;">👉 按 Enter 或点击此处：直接选用并加入当前渠道</span>`;
          tip.style.cursor = 'pointer';
          tip.addEventListener('click', () => {
            applySelectedModel(kw);
          });
        } else {
          tip.textContent = '暂无模型，可直接在上方输入添加';
        }
        modelSearchResults.appendChild(tip);
        return;
      }

      candidates.forEach(item => {
        const div = document.createElement('div');
        div.className = `ai-model-item ${item.isRemote ? 'remote' : ''} ${(cfgModel ? cfgModel.value.trim() : '') === item.id ? 'selected' : ''}`;
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
          <div style="display:flex;align-items:center;gap:6px;">
            ${item.isRemote ? '<button type="button" class="ai-btn-text-action btn-add-remote-to-ch" title="将此在线模型加入本渠道" style="font-size:10.5px;padding:1px 5px;">+ 加入本渠道</button>' : ''}
            <span class="ai-model-badge">${escapeHtml(item.badge || '')}</span>
          </div>
        `;

        const addRemoteBtn = div.querySelector('.btn-add-remote-to-ch');
        if (addRemoteBtn) {
          addRemoteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currCh) {
              if (!currCh.models.includes(item.id)) {
                currCh.models.push(item.id);
                renderChannelChips(currCh.id);
                renderModelSearchResults();
              }
            }
          });
        }

        div.addEventListener('click', () => {
          applySelectedModel(item.id);
        });
        modelSearchResults.appendChild(div);
      });
    }

    // Add manual model
    if (btnAddChannelModel && inputAddChannelModel) {
      const doAddModel = () => {
        const val = inputAddChannelModel.value.trim();
        if (!val) return;
        const ch = channels.find(x => x.id === selectedChannelId);
        if (ch) {
          if (!ch.models.includes(val)) {
            ch.models.push(val);
          }
          if (!cfgModel.value) {
            cfgModel.value = val;
            ch.defaultModel = val;
          }
          renderChannelChips(ch.id);
          renderModelSearchResults();
        }
        inputAddChannelModel.value = '';
      };
      btnAddChannelModel.addEventListener('click', doAddModel);
      inputAddChannelModel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doAddModel();
        }
      });
    }

    // Add API Key
    if (btnAddKey && inputNewKeyValue) {
      const doAddKey = () => {
        const val = inputNewKeyValue.value.trim();
        if (!val) {
          alert('请输入有效 API Key 密钥');
          inputNewKeyValue.focus();
          return;
        }
        const ch = channels.find(x => x.id === selectedChannelId);
        if (!ch) return;
        if (!Array.isArray(ch.apiKeys)) ch.apiKeys = [];
        const nameVal = (inputNewKeyName ? inputNewKeyName.value.trim() : '') || `密钥 ${ch.apiKeys.length + 1}`;
        const newKeyObj = {
          id: 'k_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
          name: nameVal,
          key: val
        };
        ch.apiKeys.push(newKeyObj);
        if (!ch.activeKeyId || ch.apiKeys.length === 1) {
          ch.activeKeyId = newKeyObj.id;
          ch.apiKey = newKeyObj.key;
          if (cfgApiKey) cfgApiKey.value = newKeyObj.key;
        }
        inputNewKeyValue.value = '';
        if (inputNewKeyName) inputNewKeyName.value = '';
        renderChannelKeys(ch);
      };
      btnAddKey.addEventListener('click', doAddKey);
      inputNewKeyValue.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doAddKey();
        }
      });
    }

    // Toggle new key input visibility
    if (btnToggleNewKey && inputNewKeyValue) {
      btnToggleNewKey.addEventListener('click', () => {
        if (inputNewKeyValue.type === 'password') {
          inputNewKeyValue.type = 'text';
          btnToggleNewKey.textContent = '🙈';
        } else {
          inputNewKeyValue.type = 'password';
          btnToggleNewKey.textContent = '👁️';
        }
      });
    }

    // Toggle Create Channel Panel
    if (btnToggleCreateChannel && boxCreateChannel) {
      btnToggleCreateChannel.addEventListener('click', () => {
        const isHidden = boxCreateChannel.classList.toggle('hidden');
        if (!isHidden) {
          if (selectChannelTemplate && inputCreateChannelName && !inputCreateChannelName.value) {
            const opt = selectChannelTemplate.options[selectChannelTemplate.selectedIndex];
            inputCreateChannelName.value = opt ? opt.text.replace(/^[^\w\s\u4e00-\u9fa5]+/, '').trim() : '';
          }
          if (inputCreateChannelName) inputCreateChannelName.focus();
        }
      });
    }

    if (selectChannelTemplate && inputCreateChannelName) {
      selectChannelTemplate.addEventListener('change', () => {
        const opt = selectChannelTemplate.options[selectChannelTemplate.selectedIndex];
        if (opt) {
          inputCreateChannelName.value = opt.text.replace(/^[^\w\s\u4e00-\u9fa5]+/, '').trim();
        }
      });
    }

    if (btnCancelCreateChannel && boxCreateChannel) {
      btnCancelCreateChannel.addEventListener('click', () => {
        boxCreateChannel.classList.add('hidden');
      });
    }

    // Confirm Create Channel
    if (btnConfirmCreateChannel) {
      btnConfirmCreateChannel.addEventListener('click', () => {
        commitCurrentFormToChannel();
        const tplId = selectChannelTemplate ? selectChannelTemplate.value : 'custom';
        const presets = Array.isArray(PRESET_CHANNELS) ? PRESET_CHANNELS : [];
        const tpl = presets.find(p => p.id === tplId);

        const enteredName = (inputCreateChannelName ? inputCreateChannelName.value.trim() : '');
        const defaultName = tpl ? tpl.name : '自定义渠道 ' + (channels.length + 1);
        const finalName = enteredName || defaultName;

        const newId = (tplId === 'custom' ? 'custom' : tplId) + '_' + Date.now().toString(36);
        const newCh = normalizeChannel({
          id: newId,
          name: finalName,
          icon: (tpl && tpl.icon) || '🛠️',
          protocol: (tpl && tpl.protocol) || 'openai-chat',
          baseUrl: (tpl && tpl.baseUrl) || '',
          apiKey: '',
          apiKeys: [],
          activeKeyId: '',
          defaultModel: (tpl && (tpl.defaultModel || (tpl.models && tpl.models[0]))) || 'gpt-4o-mini',
          models: (tpl && Array.isArray(tpl.models)) ? [...tpl.models] : ['gpt-4o-mini'],
          isPreset: false,
          templateId: tplId
        });

        channels.push(newCh);
        selectedChannelId = newId;
        if (boxCreateChannel) boxCreateChannel.classList.add('hidden');
        if (inputCreateChannelName) inputCreateChannelName.value = '';

        renderChannelDropdown();
        loadChannelToForm(newId);
        if (cfgBaseUrl && !newCh.baseUrl) cfgBaseUrl.focus();
      });
    }

    // Delete channel
    if (btnDeleteChannel) {
      btnDeleteChannel.addEventListener('click', () => {
        const ch = channels.find(c => c.id === selectedChannelId);
        if (!ch) return;
        if (channels.length <= 1) {
          alert('必须保留至少一个已配置渠道');
          return;
        }
        if (!confirm(`确定要删除当前下拉选中的渠道「${ch.name}」吗？\n删除后该渠道及其密钥配置将被移除。`)) return;

        channels = channels.filter(c => c.id !== ch.id);
        if (activeChannelId === ch.id) {
          activeChannelId = channels[0].id;
        }
        selectedChannelId = channels[0].id;
        renderChannelDropdown();
        loadChannelToForm(selectedChannelId);
      });
    }

    // Sync all fetched models
    if (btnSyncFetchedModels) {
      btnSyncFetchedModels.addEventListener('click', () => {
        const ch = channels.find(c => c.id === selectedChannelId);
        if (!ch || !remoteModels.length) return;
        const set = new Set(ch.models || []);
        remoteModels.forEach(m => set.add(m));
        ch.models = Array.from(set);
        renderChannelChips(ch.id);
        renderModelSearchResults();
        alert(`已成功将 ${remoteModels.length} 个在线模型同步至「${ch.name}」！`);
      });
    }

    // Switch channel in dropdown
    if (cfgChannel) {
      cfgChannel.addEventListener('change', () => {
        commitCurrentFormToChannel();
        loadChannelToForm(cfgChannel.value);
      });
    }

    if (chkActiveChannel) {
      chkActiveChannel.addEventListener('change', () => {
        if (chkActiveChannel.checked) {
          activeChannelId = selectedChannelId;
        }
        renderChannelDropdown();
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
      inputModelSearch.addEventListener('input', () => {
        renderModelSearchResults();
      });
      inputModelSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const kw = (inputModelSearch ? inputModelSearch.value : '').trim();
          if (kw) {
            const firstItem = modelSearchResults ? modelSearchResults.querySelector('.ai-model-item') : null;
            const modelToApply = (firstItem && firstItem.dataset && firstItem.dataset.model) ? firstItem.dataset.model : kw;
            applySelectedModel(modelToApply);
          }
        } else if (e.key === 'Escape') {
          if (modelSearchPanel) modelSearchPanel.classList.add('hidden');
        }
      });
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
          renderModelSearchResults();
        }
      });
      cfgModel.addEventListener('input', () => {
        const val = cfgModel.value.trim();
        const currCh = channels.find(x => x.id === selectedChannelId);
        if (currCh && val) {
          currCh.defaultModel = val;
        }
        if (modelSearchPanel && modelSearchPanel.classList.contains('hidden')) {
          modelSearchPanel.classList.remove('hidden');
        }
        if (inputModelSearch) {
          inputModelSearch.value = cfgModel.value;
        }
        renderModelSearchResults();
      });
      cfgModel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = cfgModel.value.trim();
          if (val) {
            applySelectedModel(val);
          }
        } else if (e.key === 'Escape') {
          if (modelSearchPanel) modelSearchPanel.classList.add('hidden');
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
          const ch = channels.find(c => c.id === selectedChannelId);
          const apiKeyToUse = (ch && ch.apiKey) || (cfgApiKey ? cfgApiKey.value.trim() : '');
          const res = await ctx.call('fetchModels', {
            protocol: cfgProtocol.value,
            baseUrl,
            apiKey: apiKeyToUse
          });
          if (res && res.ok && Array.isArray(res.models)) {
            remoteModels = res.models;
            if (tabRemoteModels) tabRemoteModels.classList.remove('hidden');
            if (remoteSyncBar) remoteSyncBar.classList.remove('hidden');
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

    function collectConfig() {
      commitCurrentFormToChannel();
      const activeCh = channels.find(c => c.id === activeChannelId) || channels[0];
      return {
        channels,
        activeChannelId,
        channel: activeCh ? activeCh.id : selectedChannelId,
        protocol: activeCh ? activeCh.protocol : cfgProtocol.value,
        baseUrl: activeCh ? activeCh.baseUrl : cfgBaseUrl.value.trim(),
        apiKey: activeCh ? activeCh.apiKey : (cfgApiKey ? cfgApiKey.value.trim() : ''),
        apiKeys: activeCh ? activeCh.apiKeys : [],
        activeKeyId: activeCh ? activeCh.activeKeyId : '',
        model: activeCh ? (activeCh.defaultModel || (activeCh.models && activeCh.models[0]) || '') : cfgModel.value.trim()
      };
    }

    return {
      initChannels,
      collectConfig,
      renderModelSearchResults,
      renderChannelChips,
      getAllPresetModels,
      getAllConfiguredModels: getAllPresetModels
    };
  }

  const exportsObj = { createModelTab };
  if (typeof window !== 'undefined') {
    window.AiChatSettingsParts = Object.assign(window.AiChatSettingsParts || {}, exportsObj);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})();
