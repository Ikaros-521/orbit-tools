/* Workflows Visual Canvas - Graph & Node/Edge Renderer
   Handles DAG node/edge DOM & SVG rendering, Bézier connections, port snapping, and undo/redo history. */
(() => {
  window.OrbitWorkflows = window.OrbitWorkflows || {};

  const wfHistory = { undo: [], redo: [], wfId: null };

  function wfSnapshot(ctx) {
    const currentWorkflow = ctx.getCurrentWorkflow();
    if (!currentWorkflow) return null;
    return { nodes: structuredClone(currentWorkflow.nodes), edges: structuredClone(currentWorkflow.edges) };
  }

  function pushWfHistory(ctx) {
    const currentWorkflow = ctx.getCurrentWorkflow();
    if (!currentWorkflow) return;
    if (wfHistory.wfId !== currentWorkflow.id) {
      wfHistory.undo = [];
      wfHistory.redo = [];
      wfHistory.wfId = currentWorkflow.id;
    }
    const snap = wfSnapshot(ctx);
    if (!snap) return;
    wfHistory.undo.push(snap);
    if (wfHistory.undo.length > 60) wfHistory.undo.shift();
    wfHistory.redo.length = 0;
    updateWfUndoButtons(ctx);
  }

  function applyWfSnapshot(ctx, snap) {
    const currentWorkflow = ctx.getCurrentWorkflow();
    if (!currentWorkflow) return;
    currentWorkflow.nodes = snap.nodes;
    currentWorkflow.edges = snap.edges;
    ctx.wfCanvas.selectedNodeId = null;
    ctx.wfCanvas.selectedEdgeId = null;
    cancelDraftConnection(ctx);
    renderWorkflowCanvas(ctx);
    ctx.scheduleWfAutosave();
    updateWfUndoButtons(ctx);
  }

  function undoWf(ctx) {
    const currentWorkflow = ctx.getCurrentWorkflow();
    if (!currentWorkflow || wfHistory.undo.length === 0) return;
    wfHistory.redo.push(wfSnapshot(ctx));
    applyWfSnapshot(ctx, wfHistory.undo.pop());
    ctx.logToWfConsole('↶ 已撤销');
  }

  function redoWf(ctx) {
    const currentWorkflow = ctx.getCurrentWorkflow();
    if (!currentWorkflow || wfHistory.redo.length === 0) return;
    wfHistory.undo.push(wfSnapshot(ctx));
    applyWfSnapshot(ctx, wfHistory.redo.pop());
    ctx.logToWfConsole('↷ 已重做');
  }

  function updateWfUndoButtons(ctx) {
    const { els } = ctx;
    if (els.btnWfUndo) els.btnWfUndo.disabled = wfHistory.undo.length === 0;
    if (els.btnWfRedo) els.btnWfRedo.disabled = wfHistory.redo.length === 0;
  }

  function beginWfFieldEdit(ctx, inputEl) {
    if (!inputEl || inputEl.dataset.wfHist) return;
    inputEl.dataset.wfHist = '1';
    inputEl.addEventListener('blur', () => { delete inputEl.dataset.wfHist; }, { once: true });
    pushWfHistory(ctx);
  }

  function duplicateSelectedNode(ctx) {
    const currentWorkflow = ctx.getCurrentWorkflow();
    const wfCanvas = ctx.wfCanvas;
    if (!currentWorkflow || !wfCanvas.selectedNodeId) return;
    const src = currentWorkflow.nodes.find(n => n.id === wfCanvas.selectedNodeId);
    if (!src) return;
    pushWfHistory(ctx);
    const copy = structuredClone(src);
    copy.id = `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    copy.x = (src.x || 0) + 32;
    copy.y = (src.y || 0) + 32;
    currentWorkflow.nodes.push(copy);
    wfCanvas.selectedNodeId = copy.id;
    renderWorkflowCanvas(ctx);
    ctx.scheduleWfAutosave();
    ctx.logToWfConsole(`⧉ 已复制节点 [${copy.title}] (Ctrl+D)`);
  }

  function cancelDraftConnection(ctx) {
    const wfCanvas = ctx.wfCanvas;
    if (!wfCanvas.connecting) return;
    if (wfCanvas.connecting.fromPortEl) {
      wfCanvas.connecting.fromPortEl.classList.remove('connecting-source');
    }
    const draft = ctx.els.wfSvgLayer ? ctx.els.wfSvgLayer.querySelector('#wfDraftPath') : null;
    if (draft) draft.remove();
    document.querySelectorAll('.wf-port.snap-target').forEach(p => p.classList.remove('snap-target'));
    wfCanvas.connecting = null;
  }

  function findPortUnderCursor(clientX, clientY) {
    const elements = document.elementsFromPoint(clientX, clientY) || [];
    return elements.find(el => el.classList.contains('wf-port')) || null;
  }

  function isPortCompatible(portEl, connecting) {
    if (!portEl || !connecting) return false;
    const targetNodeEl = portEl.closest('.wf-node');
    if (!targetNodeEl) return false;
    const targetNodeId = targetNodeEl.dataset.id;
    if (targetNodeId === connecting.fromNodeId) return false; // 禁止节点自身自环
    const isTargetIn = portEl.classList.contains('in');
    return connecting.fromType === 'out' ? isTargetIn : !isTargetIn;
  }

  function completeConnection(ctx, fromNodeId, fromType, targetNodeId, targetType) {
    const currentWorkflow = ctx.getCurrentWorkflow();
    if (!currentWorkflow) return;
    const src = fromType === 'out' ? fromNodeId : targetNodeId;
    const dst = fromType === 'out' ? targetNodeId : fromNodeId;
    if (!currentWorkflow.edges.some(ed => ed.from === src && ed.to === dst)) {
      const fromNode = currentWorkflow.nodes.find(n => n.id === src);
      const toNode = currentWorkflow.nodes.find(n => n.id === dst);
      pushWfHistory(ctx);
      currentWorkflow.edges.push({ id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, from: src, to: dst });
      ctx.scheduleWfAutosave();
      renderWorkflowCanvas(ctx);
      ctx.logToWfConsole(`✓ 连线建立成功: [${fromNode?.title || src}] ➔ [${toNode?.title || dst}]`);
    } else {
      ctx.logToWfConsole(`⚠️ 节点间已有连线，无需重复连接`);
    }
  }

  function startDraftConnection(ctx, node, portEl, fromType) {
    cancelDraftConnection(ctx);
    const wfCanvas = ctx.wfCanvas;
    const startX = fromType === 'out' ? ((node.x || 0) + 220) : (node.x || 0);
    const startY = (node.y || 0) + 38;

    wfCanvas.connecting = {
      active: true,
      fromNodeId: node.id,
      fromType,
      fromPortEl: portEl,
      startX,
      startY,
      dragDistance: 0,
    };
    portEl.classList.add('connecting-source');

    let draft = ctx.els.wfSvgLayer.querySelector('#wfDraftPath');
    if (!draft) {
      draft = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      draft.setAttribute('id', 'wfDraftPath');
      draft.setAttribute('class', 'wf-draft-path');
      ctx.els.wfSvgLayer.appendChild(draft);
    }

    const onMouseMove = (ev) => {
      if (!wfCanvas.connecting || !wfCanvas.connecting.active) return;
      wfCanvas.connecting.dragDistance += Math.hypot(ev.movementX || 0, ev.movementY || 0);
      const canvasPos = ctx.screenToCanvas(ctx, ev.clientX, ev.clientY);

      let x1, y1, x2, y2;
      if (fromType === 'out') {
        x1 = startX; y1 = startY;
        x2 = canvasPos.x; y2 = canvasPos.y;
      } else {
        x1 = canvasPos.x; y1 = canvasPos.y;
        x2 = startX; y2 = startY;
      }
      const dx = Math.max(30, Math.abs(x2 - x1) * 0.5);
      draft.setAttribute('d', `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);

      const hoveredPort = findPortUnderCursor(ev.clientX, ev.clientY);
      document.querySelectorAll('.wf-port.snap-target').forEach(p => {
        if (p !== hoveredPort) p.classList.remove('snap-target');
      });
      if (hoveredPort && isPortCompatible(hoveredPort, wfCanvas.connecting)) {
        hoveredPort.classList.add('snap-target');
      }
    };

    const onMouseUp = (ev) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      const hoveredPort = findPortUnderCursor(ev.clientX, ev.clientY);
      if (hoveredPort && isPortCompatible(hoveredPort, wfCanvas.connecting)) {
        const targetNodeEl = hoveredPort.closest('.wf-node');
        const targetNodeId = targetNodeEl ? targetNodeEl.dataset.id : null;
        const targetType = hoveredPort.classList.contains('in') ? 'in' : 'out';
        if (targetNodeId) {
          completeConnection(ctx, wfCanvas.connecting.fromNodeId, wfCanvas.connecting.fromType, targetNodeId, targetType);
        }
        cancelDraftConnection(ctx);
      } else {
        if (wfCanvas.connecting && wfCanvas.connecting.dragDistance < 6) {
          ctx.logToWfConsole(`🔗 已激活端口连接引导，请拖动或点击目标端口成线 (Esc 取消)`);
        } else {
          cancelDraftConnection(ctx);
        }
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function renderWorkflowCanvas(ctx) {
    const { els, escapeHtml, state } = ctx;
    const currentWorkflow = ctx.getCurrentWorkflow();
    const wfCanvas = ctx.wfCanvas;
    if (!els.wfNodesContainer || !els.wfSvgLayer) return;
    els.wfNodesContainer.innerHTML = '';
    els.wfSvgLayer.innerHTML = '';
    if (!currentWorkflow) return;

    // 1. 渲染 Nodes 元素进 DOM
    currentWorkflow.nodes.forEach(node => {
      const el = document.createElement('div');
      el.className = 'wf-node' + (wfCanvas.selectedNodeId === node.id ? ' selected' : '');
      el.style.left = `${node.x || 0}px`;
      el.style.top = `${node.y || 0}px`;
      el.dataset.id = node.id;

      let isPluginDisabled = false;
      if (node.type === 'action/plugin' && node.pluginId) {
        const p = state.plugins.find(x => x.id === node.pluginId);
        if (!p || !p.enabled) isPluginDisabled = true;
      }

      const headClass = isPluginDisabled
        ? 'warn'
        : (node.type.startsWith('trigger')
          ? 'trigger'
          : node.type.startsWith('output')
            ? 'output'
            : node.type.startsWith('util/')
              ? 'util'
              : node.type.startsWith('source/')
                ? 'source'
                : 'action');

      const cfgSummary = ctx.wfNodeConfigSummary(node);
      el.innerHTML = `
        <div class="wf-node-head ${headClass}">
          <span>${escapeHtml(node.title)}</span>
          <button type="button" class="wf-node-del" title="删除节点">×</button>
        </div>
        <div class="wf-node-body">
          <span class="mono">${escapeHtml(node.type)}</span>
          ${cfgSummary ? `<span class="wf-node-cfg">${escapeHtml(cfgSummary)}</span>` : ''}
          ${isPluginDisabled ? '<span class="wf-node-warn">⚠️ 所属插件已禁用 (熔断保护)</span>' : ''}
        </div>
        ${!node.type.startsWith('trigger') ? '<div class="wf-port in" title="连线入口 (拖拽或点击成线)"></div>' : ''}
        ${!node.type.startsWith('output') ? '<div class="wf-port out" title="连线出口 (按住拖出连线)"></div>' : ''}
      `;

      const delBtn = el.querySelector('.wf-node-del');
      if (delBtn) {
        delBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          pushWfHistory(ctx);
          currentWorkflow.nodes = currentWorkflow.nodes.filter(n => n.id !== node.id);
          currentWorkflow.edges = currentWorkflow.edges.filter(ed => ed.from !== node.id && ed.to !== node.id);
          if (wfCanvas.selectedNodeId === node.id) wfCanvas.selectedNodeId = null;
          ctx.scheduleWfAutosave();
          renderWorkflowCanvas(ctx);
          ctx.logToWfConsole(`已删除节点 [${node.title}]`);
        });
      }

      // 卡片右键快捷删除节点
      el.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.wf-port') || e.target.closest('.wf-node-del')) return;
        e.preventDefault();
        e.stopPropagation();
        pushWfHistory(ctx);
        currentWorkflow.nodes = currentWorkflow.nodes.filter(n => n.id !== node.id);
        currentWorkflow.edges = currentWorkflow.edges.filter(ed => ed.from !== node.id && ed.to !== node.id);
        if (wfCanvas.selectedNodeId === node.id) wfCanvas.selectedNodeId = null;
        ctx.scheduleWfAutosave();
        renderWorkflowCanvas(ctx);
        ctx.logToWfConsole(`✂️ 右键已删除节点 [${node.title}]`);
      });

      el.addEventListener('mousedown', (e) => {
        if (e.target.closest('.wf-port') || e.target.closest('.wf-node-del')) return;
        e.stopPropagation();
        wfCanvas.selectedNodeId = node.id;
        wfCanvas.selectedEdgeId = null;
        document.querySelectorAll('.wf-node.selected').forEach(n => { if (n !== el) n.classList.remove('selected'); });
        el.classList.add('selected');
        el.style.zIndex = 30;
        ctx.syncWfInspector();

        let startX = e.clientX, startY = e.clientY;
        let origX = node.x || 0, origY = node.y || 0;
        let dragHistPushed = false;

        const onMouseMove = (ev) => {
          if (!dragHistPushed) { pushWfHistory(ctx); dragHistPushed = true; }
          node.x = Math.max(10, origX + (ev.clientX - startX) / wfCanvas.scale);
          node.y = Math.max(10, origY + (ev.clientY - startY) / wfCanvas.scale);
          el.style.left = `${node.x}px`;
          el.style.top = `${node.y}px`;
          updateSvgEdgesOnly(ctx);
        };
        const onMouseUp = () => {
          el.style.zIndex = '';
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          if (dragHistPushed) ctx.scheduleWfAutosave(); // 坐标变化也是编辑
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });

      const outPort = el.querySelector('.wf-port.out');
      if (outPort) {
        outPort.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const conn = wfCanvas.connecting;
          if (conn && conn.fromType === 'in' && conn.fromNodeId !== node.id) {
            completeConnection(ctx, node.id, 'out', conn.fromNodeId, 'in');
            cancelDraftConnection(ctx);
            return;
          }
          startDraftConnection(ctx, node, outPort, 'out');
        });
        outPort.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const beforeLen = currentWorkflow.edges.length;
          pushWfHistory(ctx);
          currentWorkflow.edges = currentWorkflow.edges.filter(ed => ed.from !== node.id);
          if (currentWorkflow.edges.length !== beforeLen) {
            renderWorkflowCanvas(ctx);
            ctx.logToWfConsole(`✂️ 已断开节点 [${node.title}] 的所有输出连线`);
          }
        });
        outPort.addEventListener('click', (e) => {
          e.stopPropagation();
          if (wfCanvas.connecting && wfCanvas.connecting.fromType === 'in' && wfCanvas.connecting.fromNodeId !== node.id) {
            completeConnection(ctx, wfCanvas.connecting.fromNodeId, 'in', node.id, 'out');
            cancelDraftConnection(ctx);
          }
        });
      }

      const inPort = el.querySelector('.wf-port.in');
      if (inPort) {
        inPort.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const conn = wfCanvas.connecting;
          if (conn && conn.fromType === 'out' && conn.fromNodeId !== node.id) {
            completeConnection(ctx, conn.fromNodeId, 'out', node.id, 'in');
            cancelDraftConnection(ctx);
            return;
          }
          const existingInEdge = currentWorkflow.edges.find(ed => ed.to === node.id);
          if (existingInEdge) {
            const upstreamNode = currentWorkflow.nodes.find(n => n.id === existingInEdge.from);
            pushWfHistory(ctx);
            currentWorkflow.edges = currentWorkflow.edges.filter(ed => ed !== existingInEdge);
            renderWorkflowCanvas(ctx);
            if (upstreamNode) {
              const upstreamEl = els.wfNodesContainer.querySelector(`.wf-node[data-id="${upstreamNode.id}"]`);
              const upstreamOutPort = upstreamEl ? upstreamEl.querySelector('.wf-port.out') : inPort;
              startDraftConnection(ctx, upstreamNode, upstreamOutPort, 'out');
              ctx.logToWfConsole(`✂️ 已拔出连线 [${upstreamNode.title} ➔ ${node.title}]：甩至空白处松手即断开，或拖至新端口重连`);
              return;
            }
          }
          startDraftConnection(ctx, node, inPort, 'in');
        });
        inPort.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const beforeLen = currentWorkflow.edges.length;
          pushWfHistory(ctx);
          currentWorkflow.edges = currentWorkflow.edges.filter(ed => ed.to !== node.id);
          if (currentWorkflow.edges.length !== beforeLen) {
            renderWorkflowCanvas(ctx);
            ctx.logToWfConsole(`✂️ 已断开节点 [${node.title}] 的所有输入连线`);
          }
        });
        inPort.addEventListener('click', (e) => {
          e.stopPropagation();
          if (wfCanvas.connecting && wfCanvas.connecting.fromType === 'out' && wfCanvas.connecting.fromNodeId !== node.id) {
            completeConnection(ctx, wfCanvas.connecting.fromNodeId, 'out', node.id, 'in');
            cancelDraftConnection(ctx);
          }
        });
      }

      els.wfNodesContainer.appendChild(el);
    });

    // 2. 渲染 SVG Edges (Cubic Bézier)
    (currentWorkflow.edges || []).forEach(edge => {
      const fromNode = currentWorkflow.nodes.find(n => n.id === edge.from);
      const toNode = currentWorkflow.nodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) return;

      const fromEl = els.wfNodesContainer.querySelector(`.wf-node[data-id="${edge.from}"]`);
      const toEl = els.wfNodesContainer.querySelector(`.wf-node[data-id="${edge.to}"]`);

      const x1 = (fromNode.x || 0) + 220;
      const y1 = (fromNode.y || 0) + (fromEl ? (fromEl.offsetHeight / 2) : 36);
      const x2 = (toNode.x || 0);
      const y2 = (toNode.y || 0) + (toEl ? (toEl.offsetHeight / 2) : 36);

      const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
      const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;

      const edgeKey = edge.id || `edge-${edge.from}-${edge.to}`;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'wf-edge-group' + (wfCanvas.selectedEdgeId === edgeKey ? ' selected' : ''));
      g.setAttribute('id', `edge-group-${edge.from}-${edge.to}`);
      g.setAttribute('data-id', edgeKey);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('id', `edge-${edge.from}-${edge.to}`);
      path.setAttribute('class', 'wf-edge-line');
      path.setAttribute('data-id', edgeKey);
      path.style.cursor = 'pointer';

      const removeThisEdge = (actionDesc = '断开') => {
        pushWfHistory(ctx);
        currentWorkflow.edges = currentWorkflow.edges.filter(x => x !== edge);
        if (wfCanvas.selectedEdgeId === edgeKey) wfCanvas.selectedEdgeId = null;
        renderWorkflowCanvas(ctx);
        ctx.logToWfConsole(`✂️ ${actionDesc}连线: [${fromNode.title}] ➔ [${toNode.title}]`);
      };

      path.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeThisEdge('右键已断开');
      });

      path.addEventListener('click', (e) => {
        e.stopPropagation();
        if (wfCanvas.selectedEdgeId === edgeKey) {
          removeThisEdge('再次点击已断开');
        } else {
          wfCanvas.selectedEdgeId = edgeKey;
          renderWorkflowCanvas(ctx);
          ctx.logToWfConsole(`已选中连线 [${fromNode.title} ➔ ${toNode.title}]，按 Delete 键或右键/点击 × 即可断开`);
        }
      });

      g.appendChild(path);

      // 悬停中点微型删除徽标
      const badge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      badge.setAttribute('class', 'wf-edge-badge');
      badge.setAttribute('id', `edge-badge-${edge.from}-${edge.to}`);
      badge.setAttribute('transform', `translate(${midX}, ${midY})`);
      badge.setAttribute('title', '点击断开此连线');
      badge.innerHTML = `
        <circle cx="0" cy="0" r="8.5"></circle>
        <text x="0" y="0.5">✕</text>
      `;
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        removeThisEdge('点击徽标已断开');
      });
      badge.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeThisEdge('右键已断开');
      });

      g.appendChild(badge);
      els.wfSvgLayer.appendChild(g);
    });

    ctx.syncWfInspector();
  }

  function updateSvgEdgesOnly(ctx) {
    const { els } = ctx;
    const currentWorkflow = ctx.getCurrentWorkflow();
    if (!currentWorkflow || !els.wfSvgLayer) return;
    (currentWorkflow.edges || []).forEach(edge => {
      const fromNode = currentWorkflow.nodes.find(n => n.id === edge.from);
      const toNode = currentWorkflow.nodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) return;
      const path = els.wfSvgLayer.querySelector(`#edge-${edge.from}-${edge.to}`);
      const badge = els.wfSvgLayer.querySelector(`#edge-badge-${edge.from}-${edge.to}`);
      if (path) {
        const fromEl = els.wfNodesContainer.querySelector(`.wf-node[data-id="${edge.from}"]`);
        const toEl = els.wfNodesContainer.querySelector(`.wf-node[data-id="${edge.to}"]`);
        const x1 = (fromNode.x || 0) + 220;
        const y1 = (fromNode.y || 0) + (fromEl ? (fromEl.offsetHeight / 2) : 36);
        const x2 = (toNode.x || 0);
        const y2 = (toNode.y || 0) + (toEl ? (toEl.offsetHeight / 2) : 36);
        const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
        path.setAttribute('d', `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
        if (badge) {
          badge.setAttribute('transform', `translate(${(x1 + x2) / 2}, ${(y1 + y2) / 2})`);
        }
      }
    });
  }

  window.OrbitWorkflows.wfHistory = wfHistory;
  window.OrbitWorkflows.pushWfHistory = pushWfHistory;
  window.OrbitWorkflows.applyWfSnapshot = applyWfSnapshot;
  window.OrbitWorkflows.undoWf = undoWf;
  window.OrbitWorkflows.redoWf = redoWf;
  window.OrbitWorkflows.updateWfUndoButtons = updateWfUndoButtons;
  window.OrbitWorkflows.beginWfFieldEdit = beginWfFieldEdit;
  window.OrbitWorkflows.duplicateSelectedNode = duplicateSelectedNode;
  window.OrbitWorkflows.cancelDraftConnection = cancelDraftConnection;
  window.OrbitWorkflows.completeConnection = completeConnection;
  window.OrbitWorkflows.startDraftConnection = startDraftConnection;
  window.OrbitWorkflows.renderWorkflowCanvas = renderWorkflowCanvas;
  window.OrbitWorkflows.updateSvgEdgesOnly = updateSvgEdgesOnly;
})();
