/* Workflows Visual Canvas - Execution Runner & Lifecycle Controller
   Manages workflow run dispatch, console logging, autosave, selector sync, and test API bridge. */
(() => {
  window.OrbitWorkflows = window.OrbitWorkflows || {};

  let wfAutosaveTimer = null;
  let wfAutosaveTarget = null; // 调度时捕获的工作流对象：防抖期间切换工作流也不会把编辑写到别的工作流头上

  function logToWfConsole(ctx, msg) {
    const { els } = ctx;
    if (!els.wfConsoleBody) return;
    const ts = new Date().toLocaleTimeString();
    els.wfConsoleBody.textContent = `[${ts}] ${msg}\n` + els.wfConsoleBody.textContent;
  }

  function runWfAutosaveNow(ctx) {
    const target = wfAutosaveTarget;
    wfAutosaveTarget = null;
    if (wfAutosaveTimer) { clearTimeout(wfAutosaveTimer); wfAutosaveTimer = null; }
    if (!target) return Promise.resolve();
    return window.host.saveWorkflow(target)
      .then(list => {
        ctx.state.workflows = list;
        renderWorkflowSelector(ctx);
      })
      .catch(() => { /* keep editing; 保存 button still works */ });
  }

  function scheduleWfAutosave(ctx) {
    const { state } = ctx;
    wfAutosaveTarget = ctx.getCurrentWorkflow();
    clearTimeout(wfAutosaveTimer);
    wfAutosaveTimer = setTimeout(() => { runWfAutosaveNow(ctx); }, 500);
  }

  function renderWorkflowMeta(ctx) {
    const { els } = ctx;
    if (!els.wfNameInput) return;
    const currentWorkflow = ctx.getCurrentWorkflow();
    const has = !!currentWorkflow;
    els.wfNameInput.disabled = !has;
    els.wfDescInput.disabled = !has;
    els.wfEnabledToggle.disabled = !has;
    els.wfNameInput.value = has ? (currentWorkflow.name || '') : '';
    els.wfDescInput.value = has ? (currentWorkflow.desc || '') : '';
    els.wfEnabledToggle.checked = has ? currentWorkflow.enabled !== false : false;
  }

  function renderWorkflowSelector(ctx) {
    const { els, state } = ctx;
    if (!els.wfSelect) return;
    els.wfSelect.innerHTML = '';
    (state.workflows || []).forEach(wf => {
      const opt = document.createElement('option');
      opt.value = wf.id;
      opt.textContent = `${wf.name} (${(wf.nodes || []).length} 节点)`;
      if (wf.id === state.currentWorkflowId) opt.selected = true;
      els.wfSelect.appendChild(opt);
    });
  }

  function loadCurrentWorkflow(ctx) {
    const { state, wfCanvas } = ctx;
    // 切换前把上一个工作流挂起的自动保存立即冲盘，否则防抖回调会保存到
    // （未变更的）新工作流，旧工作流的最后一次编辑从未落盘
    runWfAutosaveNow(ctx);
    let currentWorkflow = (state.workflows || []).find(w => w.id === state.currentWorkflowId);
    if (!currentWorkflow && state.workflows && state.workflows.length > 0) {
      currentWorkflow = state.workflows[0];
      state.currentWorkflowId = currentWorkflow.id;
    }
    ctx.setCurrentWorkflow(currentWorkflow);

    const wfHistory = window.OrbitWorkflows.wfHistory;
    if (wfHistory && wfHistory.wfId !== state.currentWorkflowId) {
      wfHistory.undo = [];
      wfHistory.redo = [];
      wfHistory.wfId = state.currentWorkflowId || null;
    }
    ctx.cancelDraftConnection();
    wfCanvas.selectedEdgeId = null;
    ctx.applyCanvasTransform();
    ctx.renderWorkflowCanvas();
    renderWorkflowMeta(ctx);
    ctx.updateWfUndoButtons();
  }

  async function initWorkflowsView(ctx) {
    const { state } = ctx;
    if (!window.host || !window.host.listWorkflows) return;
    if (state.workflowsInited) {
      ctx.renderWorkflowLib();
      return;
    }
    state.workflowsInited = true;
    state.workflows = await window.host.listWorkflows().catch(() => []);
    if (state.workflows.length > 0 && !state.currentWorkflowId) {
      state.currentWorkflowId = state.workflows[0].id;
    }
    renderWorkflowSelector(ctx);
    ctx.renderWorkflowLib();
    loadCurrentWorkflow(ctx);
    setTimeout(() => { ctx.fitWorkflowCanvas(); }, 40);
  }

  async function selectWorkflow(ctx, id) {
    const { state } = ctx;
    if (!window.host || !window.host.listWorkflows) return;
    if (!state.workflows.length || !state.workflows.some(w => w.id === id)) {
      state.workflows = await window.host.listWorkflows().catch(() => state.workflows);
      state.workflowsInited = true;
    }
    if (!state.workflows.some(w => w.id === id)) return;
    state.currentWorkflowId = id;
    renderWorkflowSelector(ctx);
    loadCurrentWorkflow(ctx);
    setTimeout(() => { ctx.fitWorkflowCanvas(); }, 40);
  }

  async function runCurrentWorkflow(ctx) {
    const { els, state } = ctx;
    const currentWorkflow = ctx.getCurrentWorkflow();
    if (!currentWorkflow) return;
    const testInputVal = els.wfTestInput ? els.wfTestInput.value.trim() : '';
    let initialPayload;
    if (testInputVal) {
      initialPayload = { type: 'text/plain', value: testInputVal };
      logToWfConsole(ctx, `▶ 使用输入框测试数据执行 [${currentWorkflow.name}]…`);
    } else {
      const clip = await window.host.readClipboardText().catch(() => '');
      if (clip && clip.trim()) {
        initialPayload = { type: 'text/plain', value: clip };
        logToWfConsole(ctx, `▶ 输入框为空，已改用剪贴板内容 (${clip.length} 字符) 执行 [${currentWorkflow.name}]…`);
      } else {
        initialPayload = { type: 'text/plain', value: '' };
        logToWfConsole(ctx, `▶ 输入框与剪贴板均为空，以空数据执行 [${currentWorkflow.name}]…`);
      }
    }

    const edgeGroups = els.wfSvgLayer ? els.wfSvgLayer.querySelectorAll('.wf-edge-group') : [];
    edgeGroups.forEach(g => g.classList.add('active'));

    try {
      state.workflows = await window.host.saveWorkflow(currentWorkflow);
      renderWorkflowSelector(ctx);
      const res = await window.host.runWorkflow(currentWorkflow.id, initialPayload);
      if (els.wfSvgLayer) {
        els.wfSvgLayer.querySelectorAll('.wf-edge-group.active').forEach(g => g.classList.remove('active'));
      }

      if (res.ok) {
        const totalMs = (res.logs || []).reduce((acc, l) => acc + (l.duration || 0), 0);
        logToWfConsole(ctx, `✓ 工作流执行成功！总耗时: ${totalMs}ms`);
        (res.logs || []).forEach(l => {
          if (!l.ok) logToWfConsole(ctx, `  ├─ ❌ 节点 [${l.title}]: ${l.error || '执行失败'}`);
          else logToWfConsole(ctx, `  ├─ ${l.skipped ? '⏭' : '✓'} 节点 [${l.title}]: ${l.summary || 'OK'}${l.duration ? ` (${l.duration}ms)` : ''}`);
        });
        if (res.finalOutput) {
          logToWfConsole(ctx, `  └─ 最终输出: ${JSON.stringify(res.finalOutput.value ?? res.finalOutput)}`);
        }
      } else {
        logToWfConsole(ctx, `❌ 执行异常: ${res.error}`);
        (res.logs || []).filter(l => !l.ok).forEach(l => {
          logToWfConsole(ctx, `  ├─ ❌ 节点 [${l.title}]: ${l.error || ''}`);
        });
      }
    } catch (err) {
      if (els.wfSvgLayer) {
        els.wfSvgLayer.querySelectorAll('.wf-edge-group.active').forEach(g => g.classList.remove('active'));
      }
      logToWfConsole(ctx, `❌ 系统调用失败: ${err.message}`);
    }
  }

  window.OrbitWorkflows.logToWfConsole = logToWfConsole;
  window.OrbitWorkflows.scheduleWfAutosave = scheduleWfAutosave;
  window.OrbitWorkflows.renderWorkflowMeta = renderWorkflowMeta;
  window.OrbitWorkflows.renderWorkflowSelector = renderWorkflowSelector;
  window.OrbitWorkflows.loadCurrentWorkflow = loadCurrentWorkflow;
  window.OrbitWorkflows.initWorkflowsView = initWorkflowsView;
  window.OrbitWorkflows.selectWorkflow = selectWorkflow;
  window.OrbitWorkflows.runCurrentWorkflow = runCurrentWorkflow;
})();
