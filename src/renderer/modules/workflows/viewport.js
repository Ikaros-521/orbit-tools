/* Workflows Visual Canvas - Viewport & Coordinate Transformer
   Handles pan, zoom, screen-to-canvas coordinate mapping, and panel resizers. */
(() => {
  window.OrbitWorkflows = window.OrbitWorkflows || {};

  const wfCanvas = {
    panX: 0,
    panY: 0,
    scale: 1,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    selectedEdgeId: null,
    selectedNodeId: null,
    connecting: null, // { active, fromNodeId, fromType: 'out'|'in', fromPortEl, startX, startY, dragDistance }
    inspectorNodeId: null,
  };

  function applyCanvasTransform(ctx) {
    const { els } = ctx;
    if (els.wfCanvasViewport) {
      els.wfCanvasViewport.style.transform = `translate(${wfCanvas.panX}px, ${wfCanvas.panY}px) scale(${wfCanvas.scale})`;
    }
    if (els.wfCanvasArea) {
      els.wfCanvasArea.style.backgroundPosition = `${wfCanvas.panX}px ${wfCanvas.panY}px`;
      els.wfCanvasArea.style.backgroundSize = `${20 * wfCanvas.scale}px ${20 * wfCanvas.scale}px`;
    }
    if (els.wfZoomScale) {
      els.wfZoomScale.textContent = `${Math.round(wfCanvas.scale * 100)}%`;
    }
  }

  function screenToCanvas(ctx, clientX, clientY) {
    const { els } = ctx;
    if (!els.wfCanvasArea) return { x: clientX, y: clientY };
    const rect = els.wfCanvasArea.getBoundingClientRect();
    return {
      x: (clientX - rect.left - wfCanvas.panX) / wfCanvas.scale,
      y: (clientY - rect.top - wfCanvas.panY) / wfCanvas.scale,
    };
  }

  function fitWorkflowCanvas(ctx) {
    const { els, getCurrentWorkflow } = ctx;
    const currentWorkflow = getCurrentWorkflow();
    if (!currentWorkflow || !currentWorkflow.nodes || !currentWorkflow.nodes.length || !els.wfCanvasArea) return;
    const nodes = currentWorkflow.nodes;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      const x = n.x || 0, y = n.y || 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 220);
      maxY = Math.max(maxY, y + 90);
    });
    const rect = els.wfCanvasArea.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const pad = 50;
    const contentW = Math.max(160, maxX - minX + pad * 2);
    const contentH = Math.max(160, maxY - minY + pad * 2);
    const sX = rect.width / contentW;
    const sY = rect.height / contentH;
    const targetScale = Math.min(1.2, Math.max(0.45, Math.min(sX, sY)));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    wfCanvas.scale = targetScale;
    wfCanvas.panX = (rect.width / 2) - centerX * targetScale;
    wfCanvas.panY = (rect.height / 2) - centerY * targetScale;
    applyCanvasTransform(ctx);
  }

  function setupViewportListeners(ctx) {
    const { els } = ctx;

    if (els.wfCanvasArea) {
      els.wfCanvasArea.addEventListener('mousedown', (e) => {
        const isBlankTarget = (e.target === els.wfCanvasArea || e.target === els.wfSvgLayer || e.target === els.wfCanvasViewport || e.target === els.wfNodesContainer);
        if (isBlankTarget || e.button === 1) {
          ctx.cancelDraftConnection();
          if (wfCanvas.selectedNodeId) {
            wfCanvas.selectedNodeId = null;
            document.querySelectorAll('.wf-node.selected').forEach(n => n.classList.remove('selected'));
            ctx.syncWfInspector();
          }
          if (wfCanvas.selectedEdgeId) {
            wfCanvas.selectedEdgeId = null;
            ctx.renderWorkflowCanvas();
          }
          wfCanvas.isPanning = true;
          els.wfCanvasArea.classList.add('panning');
          wfCanvas.panStartX = e.clientX - wfCanvas.panX;
          wfCanvas.panStartY = e.clientY - wfCanvas.panY;

          const onPanMove = (ev) => {
            if (!wfCanvas.isPanning) return;
            wfCanvas.panX = ev.clientX - wfCanvas.panStartX;
            wfCanvas.panY = ev.clientY - wfCanvas.panStartY;
            applyCanvasTransform(ctx);
          };
          const onPanUp = () => {
            wfCanvas.isPanning = false;
            els.wfCanvasArea.classList.remove('panning');
            window.removeEventListener('mousemove', onPanMove);
            window.removeEventListener('mouseup', onPanUp);
          };
          window.addEventListener('mousemove', onPanMove);
          window.addEventListener('mouseup', onPanUp);
        }
      });

      els.wfCanvasArea.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = els.wfCanvasArea.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
        const newScale = Math.min(1.8, Math.max(0.4, wfCanvas.scale * zoomFactor));
        if (newScale !== wfCanvas.scale) {
          wfCanvas.panX = mouseX - (mouseX - wfCanvas.panX) * (newScale / wfCanvas.scale);
          wfCanvas.panY = mouseY - (mouseY - wfCanvas.panY) * (newScale / wfCanvas.scale);
          wfCanvas.scale = newScale;
          applyCanvasTransform(ctx);
        }
      }, { passive: false });

      els.wfCanvasArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });

      els.wfCanvasArea.addEventListener('drop', (e) => {
        e.preventDefault();
        const raw = e.dataTransfer.getData('text/plain');
        if (!raw) return;
        try {
          const data = JSON.parse(raw);
          const pos = screenToCanvas(ctx, e.clientX, e.clientY);
          ctx.addNodeToCanvas(data.type, data.title, {
            x: Math.round(pos.x - 110),
            y: Math.round(pos.y - 30),
            ...(data.extra || {}),
            config: data.config || undefined,
          });
        } catch {}
      });
    }

    if (els.btnWfZoomIn) {
      els.btnWfZoomIn.addEventListener('click', () => {
        wfCanvas.scale = Math.min(1.8, wfCanvas.scale * 1.15);
        applyCanvasTransform(ctx);
      });
    }
    if (els.btnWfZoomOut) {
      els.btnWfZoomOut.addEventListener('click', () => {
        wfCanvas.scale = Math.max(0.4, wfCanvas.scale * 0.85);
        applyCanvasTransform(ctx);
      });
    }
    if (els.btnWfResetView) {
      els.btnWfResetView.addEventListener('click', () => {
        wfCanvas.scale = 1;
        wfCanvas.panX = 0;
        wfCanvas.panY = 0;
        applyCanvasTransform(ctx);
      });
    }
    if (els.btnWfFitView) {
      els.btnWfFitView.addEventListener('click', () => {
        fitWorkflowCanvas(ctx);
      });
    }

    // Sidebar width resizer
    if (els.wfSidebarResizer && els.wfSidebar) {
      try {
        const savedW = localStorage.getItem('orbit.wfSidebarWidth');
        if (savedW) document.documentElement.style.setProperty('--wf-sidebar-w', `${savedW}px`);
      } catch {}

      els.wfSidebarResizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        els.wfSidebarResizer.classList.add('resizing');
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        const startX = e.clientX;
        const origW = els.wfSidebar.getBoundingClientRect().width;

        const onMove = (ev) => {
          const newW = Math.min(480, Math.max(170, Math.round(origW + (ev.clientX - startX))));
          document.documentElement.style.setProperty('--wf-sidebar-w', `${newW}px`);
        };
        const onUp = (ev) => {
          els.wfSidebarResizer.classList.remove('resizing');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          const finalW = Math.min(480, Math.max(170, Math.round(origW + (ev.clientX - startX))));
          try { localStorage.setItem('orbit.wfSidebarWidth', String(finalW)); } catch {}
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    }

    // Console height resizer
    if (els.wfConsoleResizer && els.wfConsole) {
      try {
        const savedH = localStorage.getItem('orbit.wfConsoleHeight');
        if (savedH) document.documentElement.style.setProperty('--wf-console-h', `${savedH}px`);
      } catch {}

      els.wfConsoleResizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        els.wfConsoleResizer.classList.add('resizing');
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        const startY = e.clientY;
        const origH = els.wfConsole.getBoundingClientRect().height;

        let currentH = origH;
        const onMove = (ev) => {
          currentH = Math.min(520, Math.max(65, Math.round(origH + (startY - ev.clientY))));
          document.documentElement.style.setProperty('--wf-console-h', `${currentH}px`);
        };
        const onUp = (ev) => {
          els.wfConsoleResizer.classList.remove('resizing');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          if (ev && typeof ev.clientY === 'number') {
            currentH = Math.min(520, Math.max(65, Math.round(origH + (startY - ev.clientY))));
          }
          try { localStorage.setItem('orbit.wfConsoleHeight', String(currentH)); } catch {}
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    }
  }

  window.OrbitWorkflows.wfCanvas = wfCanvas;
  window.OrbitWorkflows.applyCanvasTransform = applyCanvasTransform;
  window.OrbitWorkflows.screenToCanvas = screenToCanvas;
  window.OrbitWorkflows.fitWorkflowCanvas = fitWorkflowCanvas;
  window.OrbitWorkflows.setupViewportListeners = setupViewportListeners;
})();
