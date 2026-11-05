/* AI Chat settings - skill tab controller (extracted from
   settings-modals.js). Dual CommonJS / Browser export; mounted per-panel via
   the createSkillTab factory so tab-local state stays per-mount. */
(() => {
  function createSkillTab(deps) {
    const {
      PRESET_CHANNELS, btnCancelSkillEdit, btnCloseSkillEdit, btnCloseSkillMarket,
      btnCreateSkill, btnImportSkillFile, btnImportSkillFolder, btnImportSkillUrl,
      btnNextSkillPage, btnOpenSkillMarket, btnPrevSkillPage, btnResetSkills,
      btnSaveSkill, ctx, escapeHtml, getState, inputSearchSkills,
      inputSkillContent, inputSkillDesc, inputSkillFile, inputSkillFolder,
      inputSkillMarketSearch, inputSkillName, inputSkillUrl, onConfigSaved,
      onPersonasChanged, panelEl, selectSkillTemplate, skillEditPanel,
      skillEditTitle, skillImportResult, skillMarketCategoriesBar, skillMarketList,
      skillMarketPanel, skillPageInfo, skillsCardList, switchSettingsTab, updateState
    } = deps;
    if (!panelEl) return null;

    let editingSkillId = null;
    let skillSearchKeyword = '';
    let skillCurrentPage = 1;
    const skillPageSize = 8;

    let skillMarketActiveCategory = 'all';
    let skillMarketSearchQuery = '';
    let cachedMarketCatalog = [];

    const catIcons = {
      dev: '💻',
      qa: '🧪',
      prompt: '📝',
      workflow: '🚀',
      security: '🔍'
    };

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
        empty.textContent = q ? `未找到匹配 "${q}" 的技能` : '暂无技能，可点击右上角「🛒 开源技能库」一键安装或「+ 新建技能」';
        skillsCardList.appendChild(empty);
        return;
      }

      const start = (skillCurrentPage - 1) * skillPageSize;
      filtered.slice(start, start + skillPageSize).forEach(sk => {
        const card = document.createElement('div');
        card.className = 'ai-skill-card';

        let sourceBadge = '';
        if (sk.source) {
          if (sk.source.startsWith('market:')) {
            sourceBadge = '<span class="ai-skill-source-badge">开源预设</span>';
          } else if (sk.source.startsWith('template:')) {
            sourceBadge = '<span class="ai-skill-source-badge">模板衍生</span>';
          } else if (sk.source.startsWith('http')) {
            sourceBadge = '<span class="ai-skill-source-badge">远程导入</span>';
          }
        }

        card.innerHTML = `
          <div class="ai-mcp-card-head">
            <span class="ai-mcp-ico">🧠</span>
            <div class="ai-mcp-card-info">
              <span class="ai-mcp-name" title="${escapeHtml(sk.source || '内置 / 手动创建')}">${escapeHtml(sk.name)}${sourceBadge}</span>
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
          if (selectSkillTemplate) selectSkillTemplate.value = '';
          if (inputSkillName) inputSkillName.value = sk.name || '';
          if (inputSkillDesc) inputSkillDesc.value = sk.desc || '';
          if (inputSkillContent) inputSkillContent.value = sk.content || '';
          if (skillsCardList) skillsCardList.classList.add('hidden');
          if (skillMarketPanel) skillMarketPanel.classList.add('hidden');
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

    /* --- Open Source Skills Market Controller --- */

    async function ensureMarketCatalogLoaded() {
      if (cachedMarketCatalog.length > 0) return cachedMarketCatalog;
      try {
        const res = await ctx.call('searchLiveSkills', { query: '', category: 'all', limit: 30 });
        if (res && res.ok && Array.isArray(res.items)) {
          cachedMarketCatalog = res.items;
          populateSkillTemplateDropdown();
        }
      } catch {}
      return cachedMarketCatalog;
    }

    function populateSkillTemplateDropdown() {
      if (!selectSkillTemplate) return;
      const currentVal = selectSkillTemplate.value;
      selectSkillTemplate.innerHTML = '<option value="">-- 自定义编写 (不使用模板) --</option>';
      for (const it of cachedMarketCatalog) {
        const opt = document.createElement('option');
        opt.value = it.id;
        const repoPrefix = it.repo ? `[${it.repo.split('/')[0]}] ` : '';
        opt.textContent = `${repoPrefix}${it.name} - ${(it.desc || '').slice(0, 32)}`;
        selectSkillTemplate.appendChild(opt);
      }
      selectSkillTemplate.value = currentVal || '';
    }

    async function loadAndRenderSkillMarket() {
      if (!skillMarketList) return;
      skillMarketList.innerHTML = '<div class="ai-model-empty-tip">🌐 正在全网实时检索开源技能生态（GitHub / 权威技能库）…</div>';

      try {
        const res = await ctx.call('searchLiveSkills', { query: skillMarketSearchQuery, category: skillMarketActiveCategory, limit: 30 });
        if (!res || !res.ok) {
          skillMarketList.innerHTML = `<div class="ai-model-empty-tip">开源技能库加载失败: ${escapeHtml((res && res.error) || '未知错误')}</div>`;
          return;
        }

        cachedMarketCatalog = res.items || [];
        populateSkillTemplateDropdown();

        if (skillMarketCategoriesBar && Array.isArray(res.categories)) {
          skillMarketCategoriesBar.innerHTML = '';
          res.categories.forEach(cat => {
            const catBtn = document.createElement('button');
            catBtn.type = 'button';
            catBtn.className = 'ai-market-cat-btn' + (skillMarketActiveCategory === cat.id ? ' active' : '');
            catBtn.textContent = cat.label;
            catBtn.addEventListener('click', () => {
              skillMarketActiveCategory = cat.id;
              loadAndRenderSkillMarket();
            });
            skillMarketCategoriesBar.appendChild(catBtn);
          });
        }

        skillMarketList.innerHTML = '';
        if (!res.items || res.items.length === 0) {
          skillMarketList.innerHTML = '<div class="ai-model-empty-tip">未找到匹配的开源技能，可尝试更换关键词或分类</div>';
          return;
        }

        res.items.forEach(item => {
          const card = document.createElement('div');
          card.className = 'ai-market-card';

          const icon = catIcons[item.category] || '🧠';
          const repoLink = item.sourceUrl
            ? `<a href="#" class="ai-market-repo-link" title="在 GitHub 查看源码与项目">GitHub ↗</a>`
            : '';

          const starsBadge = item.stars
            ? `<span class="ai-market-stars-badge" title="GitHub Stars">★ ${item.stars >= 1000 ? Math.round(item.stars / 1000) + 'k' : item.stars}</span>`
            : '';

          const repoBadge = item.repo
            ? `<span class="ai-market-repo-badge" title="所属开源仓库">${escapeHtml(item.repo)}</span>`
            : '';

          const typeBadge = item.official
            ? '<span class="ai-market-official-badge">Official</span>'
            : (item.sourceType === 'curated'
              ? '<span class="ai-market-official-badge">精选预设</span>'
              : '<span class="ai-market-community-badge">GitHub 开源</span>');

          card.innerHTML = `
            <div class="ai-market-card-top">
              <div class="ai-market-info-col">
                <span class="ai-market-card-ico">${icon}</span>
                <div class="ai-market-name-row">
                  <span class="ai-market-card-name">${escapeHtml(item.name)}</span>
                  ${starsBadge}
                  ${repoBadge}
                  ${typeBadge}
                  ${repoLink}
                </div>
              </div>
              <div class="ai-market-btn-group">
                <button type="button" class="ai-market-btn secondary btn-preview-skill" title="实时拉取并预览此开源技能 Markdown 内容">👁️ 预览</button>
                <button type="button" class="ai-market-btn secondary btn-use-template" title="从 GitHub 实时抓取该技能源码作为模板，可自由调整后保存为你的技能">✨ 基于此创建</button>
                <button type="button" class="ai-market-btn ${item.installed ? 'installed' : 'install'}" ${item.installed ? 'disabled' : ''}>
                  ${item.installed ? '✓ 已安装' : '⬇️ 一键安装'}
                </button>
              </div>
            </div>
            <div class="ai-market-card-desc">${escapeHtml(item.desc || '')}</div>
            <div class="ai-market-preview-box hidden"></div>
          `;

          const link = card.querySelector('.ai-market-repo-link');
          if (link && item.sourceUrl) {
            link.addEventListener('click', e => {
              e.preventDefault();
              if (ctx.openExternal) ctx.openExternal(item.sourceUrl);
            });
          }

          const previewBox = card.querySelector('.ai-market-preview-box');
          const btnPreview = card.querySelector('.btn-preview-skill');
          if (btnPreview && previewBox) {
            btnPreview.addEventListener('click', async () => {
              if (!previewBox.classList.contains('hidden')) {
                previewBox.classList.add('hidden');
                btnPreview.textContent = '👁️ 预览';
                return;
              }

              previewBox.classList.remove('hidden');
              btnPreview.textContent = '收起预览';

              if (item.content) {
                previewBox.textContent = item.content;
                return;
              }

              previewBox.textContent = '⏳ 正在从 GitHub 实时拉取最新 Markdown 源码…';
              try {
                const det = await ctx.call('fetchRemoteSkillDetail', { target: item });
                if (det && det.ok) {
                  item.content = det.content;
                  previewBox.textContent = det.content;
                } else {
                  previewBox.textContent = `✗ 获取内容失败: ${(det && det.error) || '未知错误'}`;
                }
              } catch (err) {
                previewBox.textContent = `✗ 抓取异常: ${err.message || err}`;
              }
            });
          }

          const btnUseTemplate = card.querySelector('.btn-use-template');
          if (btnUseTemplate) {
            btnUseTemplate.addEventListener('click', async () => {
              btnUseTemplate.disabled = true;
              btnUseTemplate.textContent = '⏳ 拉取中…';
              try {
                await openSkillEditorWithTemplate(item);
              } finally {
                btnUseTemplate.disabled = false;
                btnUseTemplate.textContent = '✨ 基于此创建';
              }
            });
          }

          const btnInstall = card.querySelector('.ai-market-btn.install');
          if (btnInstall) {
            btnInstall.addEventListener('click', async () => {
              btnInstall.disabled = true;
              btnInstall.textContent = '⏳ 下载安装中…';
              try {
                let addRes;
                if (item.sourceType === 'curated') {
                  addRes = await ctx.call('installMarketSkill', { marketId: item.id });
                } else {
                  addRes = await ctx.call('installRemoteSkill', { target: item });
                }

                if (addRes && addRes.ok) {
                  btnInstall.className = 'ai-market-btn installed';
                  btnInstall.textContent = '✓ 已安装';
                  updateState({ skills: addRes.skills });
                  renderSkillsList();
                  showSkillImportResult(`✓ 成功安装开源技能「${item.name}」`, 'ok');
                } else {
                  btnInstall.disabled = false;
                  btnInstall.textContent = '⬇️ 一键安装';
                  alert(`安装失败: ${(addRes && addRes.error) || '未知错误'}`);
                }
              } catch (err) {
                btnInstall.disabled = false;
                btnInstall.textContent = '⬇️ 一键安装';
                alert(`安装异常: ${err.message || err}`);
              }
            });
          }

          skillMarketList.appendChild(card);
        });
      } catch (err) {
        skillMarketList.innerHTML = `<div class="ai-model-empty-tip">开源技能库异常: ${escapeHtml(err.message)}</div>`;
      }
    }

    function openSkillMarket() {
      if (skillEditPanel) skillEditPanel.classList.add('hidden');
      if (skillsCardList) skillsCardList.classList.add('hidden');
      if (skillMarketPanel) skillMarketPanel.classList.remove('hidden');
      loadAndRenderSkillMarket();
    }

    function closeSkillMarket() {
      if (skillMarketPanel) skillMarketPanel.classList.add('hidden');
      if (skillsCardList) skillsCardList.classList.remove('hidden');
    }

    async function openSkillEditorWithTemplate(item) {
      editingSkillId = null;
      let name = item.name || '';
      let desc = item.desc || '';
      let content = item.content || '';

      if (!content) {
        showSkillImportResult('⏳ 正在从 GitHub 实时拉取最新 Markdown 源码…', '');
        try {
          const det = await ctx.call('fetchRemoteSkillDetail', { target: item });
          if (det && det.ok) {
            name = det.name || name;
            desc = det.desc || desc;
            content = det.content || content;
            item.content = content;
          }
        } catch {}
      }

      if (skillEditTitle) skillEditTitle.textContent = `基于开源技能创建: ${name}`;
      if (selectSkillTemplate) selectSkillTemplate.value = item.id || '';
      if (inputSkillName) inputSkillName.value = name;
      if (inputSkillDesc) inputSkillDesc.value = desc;
      if (inputSkillContent) inputSkillContent.value = content;

      if (skillMarketPanel) skillMarketPanel.classList.add('hidden');
      if (skillsCardList) skillsCardList.classList.add('hidden');
      if (skillEditPanel) skillEditPanel.classList.remove('hidden');
      if (inputSkillName) inputSkillName.focus();
    }

    if (btnOpenSkillMarket) btnOpenSkillMarket.addEventListener('click', openSkillMarket);
    if (btnCloseSkillMarket) btnCloseSkillMarket.addEventListener('click', closeSkillMarket);

    let skillMarketSearchTimer = null;
    if (inputSkillMarketSearch) {
      inputSkillMarketSearch.addEventListener('input', e => {
        clearTimeout(skillMarketSearchTimer);
        skillMarketSearchTimer = setTimeout(() => {
          skillMarketSearchQuery = e.target.value.trim();
          loadAndRenderSkillMarket();
        }, 300);
      });
    }

    if (selectSkillTemplate) {
      selectSkillTemplate.addEventListener('change', async () => {
        const selectedId = selectSkillTemplate.value;
        if (!selectedId) return;
        const item = cachedMarketCatalog.find(x => x.id === selectedId);
        if (item) {
          if (!inputSkillName.value || !editingSkillId) inputSkillName.value = item.name;
          if (!inputSkillDesc.value || !editingSkillId) inputSkillDesc.value = item.desc;
          if (item.content) {
            inputSkillContent.value = item.content;
          } else {
            inputSkillContent.placeholder = '⏳ 正在从 GitHub 实时拉取最新 Markdown 源码…';
            try {
              const det = await ctx.call('fetchRemoteSkillDetail', { target: item });
              if (det && det.ok) {
                item.content = det.content;
                inputSkillContent.value = det.content || '';
              }
            } catch {}
          }
        }
      });
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
      if (selectSkillTemplate) selectSkillTemplate.value = '';
      editingSkillId = null;
    }

    if (btnCreateSkill) {
      btnCreateSkill.addEventListener('click', async () => {
        editingSkillId = null;
        if (skillEditTitle) skillEditTitle.textContent = '新建技能';
        if (selectSkillTemplate) selectSkillTemplate.value = '';
        if (inputSkillName) inputSkillName.value = '';
        if (inputSkillDesc) inputSkillDesc.value = '';
        if (inputSkillContent) inputSkillContent.value = '';
        if (skillsCardList) skillsCardList.classList.add('hidden');
        if (skillMarketPanel) skillMarketPanel.classList.add('hidden');
        if (skillEditPanel) skillEditPanel.classList.remove('hidden');
        ensureMarketCatalogLoaded();
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

    // Preload market catalog for fast dropdown & market opening
    ensureMarketCatalogLoaded();

    return { renderSkillsList, closeSkillEditor, openSkillMarket, closeSkillMarket };
  }

  const exportsObj = { createSkillTab };
  if (typeof window !== 'undefined') {
    window.AiChatSettingsParts = Object.assign(window.AiChatSettingsParts || {}, exportsObj);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})();
