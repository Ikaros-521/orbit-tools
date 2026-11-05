/* AI Chat settings - skill tab controller (extracted from
   settings-modals.js). Dual CommonJS / Browser export; mounted per-panel via
   the createSkillTab factory so tab-local state stays per-mount. */
(() => {
  function createSkillTab(deps) {
    const {
      PRESET_CHANNELS, btnCancelSkillEdit, btnCloseSkillEdit, btnCreateSkill,
      btnImportSkillFile, btnImportSkillFolder, btnImportSkillUrl, btnNextSkillPage,
      btnPrevSkillPage, btnResetSkills, btnSaveSkill, ctx,
      escapeHtml, getState, inputSearchSkills, inputSkillContent,
      inputSkillDesc, inputSkillFile, inputSkillFolder, inputSkillName,
      inputSkillUrl, onConfigSaved, onPersonasChanged, panelEl,
      skillEditPanel, skillEditTitle, skillImportResult, skillPageInfo,
      skillsCardList, switchSettingsTab, updateState
    } = deps;
    if (!panelEl) return null;

    let editingSkillId = null;
    let skillSearchKeyword = '';
    let skillCurrentPage = 1;
    const skillPageSize = 8;
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


    return { renderSkillsList, closeSkillEditor };
  }

  const exportsObj = { createSkillTab };
  if (typeof window !== 'undefined') {
    window.AiChatSettingsParts = Object.assign(window.AiChatSettingsParts || {}, exportsObj);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})();
