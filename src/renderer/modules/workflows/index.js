/* Workflows Visual Canvas - Subsystem Facade & Entry Point
   Coordinates viewport, graph, library, inspector, and execution runner.
   Exposes window.__wfTestApi and OrbitWorkflows controller. */
(() => {
  window.OrbitWorkflows = window.OrbitWorkflows || {};
  const OW = window.OrbitWorkflows;

  let ctx = null;
  let currentWorkflow = null;

  function init(hostCtx) {
    ctx = {
      ...hostCtx,
      wfCanvas: OW.wfCanvas,
      getCurrentWorkflow: () => currentWorkflow,
      setCurrentWorkflow: (wf) => { currentWorkflow = wf; },
      // Viewport methods
      applyCanvasTransform: () => OW.applyCanvasTransform(ctx),
      screenToCanvas: (c, x, y) => OW.screenToCanvas(c, x, y),
      fitWorkflowCanvas: () => OW.fitWorkflowCanvas(ctx),
      // Graph methods
      pushWfHistory: () => OW.pushWfHistory(ctx),
      applyWfSnapshot: (snap) => OW.applyWfSnapshot(ctx, snap),
      undoWf: () => OW.undoWf(ctx),
      redoWf: () => OW.redoWf(ctx),
      updateWfUndoButtons: () => OW.updateWfUndoButtons(ctx),
      beginWfFieldEdit: (el) => OW.beginWfFieldEdit(ctx, el),
      duplicateSelectedNode: () => OW.duplicateSelectedNode(ctx),
      cancelDraftConnection: () => OW.cancelDraftConnection(ctx),
      completeConnection: (fromId, fromT, toId, toT) => OW.completeConnection(ctx, fromId, fromT, toId, toT),
      startDraftConnection: (node, port, type) => OW.startDraftConnection(ctx, node, port, type),
      renderWorkflowCanvas: () => OW.renderWorkflowCanvas(ctx),
      updateSvgEdgesOnly: () => OW.updateSvgEdgesOnly(ctx),
      // Library methods
      renderWorkflowLib: () => OW.renderWorkflowLib(ctx),
      addNodeToCanvas: (type, title, extra) => OW.addNodeToCanvas(ctx, type, title, extra),
      // Inspector methods
      wfNodeConfigSummary: (node) => OW.wfNodeConfigSummary(ctx, node),
      syncWfInspector: () => OW.syncWfInspector(ctx),
      // Runner methods
      logToWfConsole: (msg) => OW.logToWfConsole(ctx, msg),
      scheduleWfAutosave: () => OW.scheduleWfAutosave(ctx),
      renderWorkflowMeta: () => OW.renderWorkflowMeta(ctx),
      renderWorkflowSelector: () => OW.renderWorkflowSelector(ctx),
      loadCurrentWorkflow: () => OW.loadCurrentWorkflow(ctx),
      initWorkflowsView: () => OW.initWorkflowsView(ctx),
      selectWorkflow: (id) => OW.selectWorkflow(ctx, id),
      runCurrentWorkflow: () => OW.runCurrentWorkflow(ctx),
    };

    OW.setupViewportListeners(ctx);
    setupToolbarAndEventBindings(ctx);

    // 供 UI 自动化测试驱动工作流视图 (保持 100% 契约兼容)
    window.__wfTestApi = {
      selectWorkflow: (id) => OW.selectWorkflow(ctx, id),
      runCurrentWorkflow: () => OW.runCurrentWorkflow(ctx),
      addNodeToCanvas: (type, title, extra) => OW.addNodeToCanvas(ctx, type, title, extra),
      getCurrentWorkflow: () => currentWorkflow,
      getCanvasState: () => ({ ...OW.wfCanvas }),
    };

    return ctx;
  }

  function setupToolbarAndEventBindings(c) {
    const { els, state } = c;

    // Global keyboard events for workflow
    window.addEventListener('keydown', (e) => {
      if (state.view !== 'workflows') return;
      if (e.key === 'Escape') {
        c.cancelDraftConnection();
        if (OW.wfCanvas.selectedEdgeId) {
          OW.wfCanvas.selectedEdgeId = null;
          c.renderWorkflowCanvas();
        }
        return;
      }
      const ae = document.activeElement;
      const aeTag = ae && ae.tagName;
      const typing = aeTag === 'INPUT' || aeTag === 'TEXTAREA' || aeTag === 'SELECT' || (ae && ae.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !typing && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) c.redoWf(); else c.undoWf();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !typing && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        c.redoWf();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !typing && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        c.duplicateSelectedNode();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && currentWorkflow) {
        if (typing) return;
        if (OW.wfCanvas.selectedNodeId) {
          const targetNode = currentWorkflow.nodes.find(n => n.id === OW.wfCanvas.selectedNodeId);
          if (targetNode) {
            c.pushWfHistory();
            currentWorkflow.nodes = currentWorkflow.nodes.filter(n => n.id !== targetNode.id);
            currentWorkflow.edges = currentWorkflow.edges.filter(ed => ed.from !== targetNode.id && ed.to !== targetNode.id);
            OW.wfCanvas.selectedNodeId = null;
            c.scheduleWfAutosave();
            c.renderWorkflowCanvas();
            c.logToWfConsole(`✓ 已删除选中的节点 [${targetNode.title}]`);
            return;
          }
        }
        if (OW.wfCanvas.selectedEdgeId) {
          const removedEdge = currentWorkflow.edges.find(ed => (ed.id || `edge-${ed.from}-${ed.to}`) === OW.wfCanvas.selectedEdgeId);
          if (removedEdge) {
            c.pushWfHistory();
            currentWorkflow.edges = currentWorkflow.edges.filter(ed => ed !== removedEdge);
            OW.wfCanvas.selectedEdgeId = null;
            c.scheduleWfAutosave();
            c.renderWorkflowCanvas();
            c.logToWfConsole(`✓ 已删除选中的连线`);
          }
        }
      }
    });

    if (els.wfSelect) {
      els.wfSelect.addEventListener('change', () => {
        state.currentWorkflowId = els.wfSelect.value;
        c.loadCurrentWorkflow();
      });
    }

    if (els.btnWfNew) {
      els.btnWfNew.addEventListener('click', async () => {
        const id = `wf-${Date.now()}`;
        const newWf = {
          id,
          name: `新建工作流 ${state.workflows.length + 1}`,
          desc: '',
          enabled: true,
          nodes: [
            { id: 'node-1', type: 'trigger/manual', title: '手动触发', x: 80, y: 120 }
          ],
          edges: []
        };
        state.workflows.push(newWf);
        state.currentWorkflowId = id;
        c.renderWorkflowSelector();
        c.loadCurrentWorkflow();
        await window.host.saveWorkflow(newWf).catch(() => {});
        state.workflows = await window.host.listWorkflows().catch(() => state.workflows);
        c.renderWorkflowSelector();
        c.logToWfConsole(`✓ 已创建新工作流，直接在上方输入名称与描述即可 (自动保存)`);
        if (els.wfNameInput) {
          els.wfNameInput.focus();
          els.wfNameInput.select();
        }
      });
    }

    if (els.wfNameInput) {
      els.wfNameInput.addEventListener('input', () => {
        if (!currentWorkflow) return;
        currentWorkflow.name = els.wfNameInput.value;
        c.renderWorkflowSelector();
        c.scheduleWfAutosave();
      });
    }

    if (els.wfDescInput) {
      els.wfDescInput.addEventListener('input', () => {
        if (!currentWorkflow) return;
        currentWorkflow.desc = els.wfDescInput.value;
        c.scheduleWfAutosave();
      });
    }

    if (els.wfEnabledToggle) {
      els.wfEnabledToggle.addEventListener('change', () => {
        if (!currentWorkflow) return;
        currentWorkflow.enabled = els.wfEnabledToggle.checked;
        c.scheduleWfAutosave();
        c.logToWfConsole(currentWorkflow.enabled
          ? '⚡ 已启用自动触发：匹配的剪贴板内容变化将自动运行此工作流'
          : '🛑 已禁用自动触发：仅可手动运行测试');
      });
    }

    if (els.wfLibSearch) {
      els.wfLibSearch.addEventListener('input', () => {
        state.wfLibQuery = els.wfLibSearch.value;
        c.renderWorkflowLib();
      });
    }

    if (els.wfInspClose) {
      els.wfInspClose.addEventListener('click', () => {
        OW.wfCanvas.selectedNodeId = null;
        document.querySelectorAll('.wf-node.selected').forEach(n => n.classList.remove('selected'));
        c.syncWfInspector();
      });
    }

    if (els.btnWfSave) {
      els.btnWfSave.addEventListener('click', async () => {
        if (!currentWorkflow) return;
        state.workflows = await window.host.saveWorkflow(currentWorkflow);
        c.renderWorkflowSelector();
        const orig = els.btnWfSave.textContent;
        els.btnWfSave.textContent = '✓ 已保存';
        setTimeout(() => { if (els.btnWfSave) els.btnWfSave.textContent = orig; }, 1000);
        c.logToWfConsole(`✓ 工作流 [${currentWorkflow.name}] 已保存`);
      });
    }

    if (els.btnWfUndo) {
      els.btnWfUndo.addEventListener('click', () => c.undoWf());
    }

    if (els.btnWfRedo) {
      els.btnWfRedo.addEventListener('click', () => c.redoWf());
    }

    if (els.btnWfDelete) {
      els.btnWfDelete.addEventListener('click', async () => {
        if (!currentWorkflow) return;
        if (confirm(`确定删除工作流 "${currentWorkflow.name}" 吗？`)) {
          state.workflows = await window.host.deleteWorkflow(currentWorkflow.id);
          state.currentWorkflowId = state.workflows.length > 0 ? state.workflows[0].id : null;
          c.renderWorkflowSelector();
          c.loadCurrentWorkflow();
          c.logToWfConsole(`已删除工作流`);
        }
      });
    }

    if (els.btnWfRun) {
      els.btnWfRun.addEventListener('click', () => c.runCurrentWorkflow());
    }

    if (els.btnWfClearConsole) {
      els.btnWfClearConsole.addEventListener('click', () => {
        if (els.wfConsoleBody) els.wfConsoleBody.textContent = '日志已清空';
      });
    }

    if (els.btnWfCopyConsole) {
      els.btnWfCopyConsole.addEventListener('click', async () => {
        if (!els.wfConsoleBody) return;
        const text = els.wfConsoleBody.textContent || '';
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch {
          try {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            ok = document.execCommand('copy');
            ta.remove();
          } catch {}
        }
        const btn = els.btnWfCopyConsole;
        btn.textContent = ok ? '已复制 ✓' : '复制失败';
        setTimeout(() => { btn.textContent = '复制'; }, 1200);
      });
    }

    // 自动触发 (剪贴板监听等) 的执行结果实时镜像到工作流控制台
    if (window.host.onWorkflowEvent) {
      window.host.onWorkflowEvent(p => {
        if (!p) return;
        if (p.event === 'auto-skip') {
          c.logToWfConsole(`⏭ 类型不匹配已跳过 [${p.name}] (需 ${p.need} · 实际 ${p.detectedType})`);
          return;
        }
        if (p.event !== 'auto-run') return;
        if (p.ok) {
          const totalMs = (p.logs || []).reduce((acc, l) => acc + (l.duration || 0), 0);
          c.logToWfConsole(`⚡ 自动触发 [${p.name}] (剪贴板 · ${p.detectedType}) ✓ 成功 · ${totalMs}ms`);
        } else {
          c.logToWfConsole(`⚡ 自动触发 [${p.name}] (剪贴板 · ${p.detectedType}) ❌ 失败: ${p.error || '未知错误'}`);
        }
      });
    }
  }

  OW.init = init;
})();
