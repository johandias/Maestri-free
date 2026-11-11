/**
 * Infinite Canvas Engine for Maestri Desktop (v2.0)
 * Handles Pan (via middle mouse/scroll only or Space), Zoom, Node placement,
 * Node dragging, and SVG Edge Connections with Orchestrator highlights.
 */

class MaestriCanvas {
  constructor(containerId, worldId, svgLayerId) {
    this.container = document.getElementById(containerId);
    this.world = document.getElementById(worldId);
    this.svgLayer = document.getElementById(svgLayerId);

    this.panX = 200;
    this.panY = 100;
    this.zoom = 1.0;
    this.minZoom = 0.25;
    this.maxZoom = 2.5;

    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;

    this.activeDragNode = null;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;

    this.selectedNodeId = null;
    this.isConnecting = false;
    this.connectSourceId = null;

    this.activeTool = "select"; // 'select', 'hand', 'connect', 'terminal', 'diagram', 'note'
    this.pendingPlacement = null; // type of node to place on click

    this.nodes = [];
    this.edges = [];

    this._initEvents();
    this.updateTransform();
  }

  _initEvents() {
    // Requirement 3: Panning is ONLY enabled by middle click (scroll wheel) or Space+click or Hand tool
    this.container.addEventListener("mousedown", (e) => {
      const isMiddleClick = (e.button === 1);
      const isSpaceDrag = (e.spaceKey || this.isSpacePressed);
      const isHandTool = (this.activeTool === "hand");

      if (isMiddleClick || isSpaceDrag || isHandTool) {
        this.isPanning = true;
        this.panStartX = e.clientX - this.panX;
        this.panStartY = e.clientY - this.panY;
        this.container.classList.add("panning");
        e.preventDefault();
        return;
      }

      // If left click on background
      if (e.button === 0 && (e.target === this.container || e.target === this.world || e.target.tagName === "svg" || e.target.id === "canvas-world")) {
        // Delimit area for new terminal
        if (this.pendingPlacement === "terminal") {
          this.isDelimiting = true;
          this.delimitStartX = (e.clientX - this.panX) / this.zoom;
          this.delimitStartY = (e.clientY - this.panY) / this.zoom;
          this.delimitCurrentX = this.delimitStartX;
          this.delimitCurrentY = this.delimitStartY;
          this._ensureDelimitBox();
          this._updateDelimitBox();
          e.preventDefault();
          return;
        } else if (this.pendingPlacement) {
          const mouseX = (e.clientX - this.panX) / this.zoom;
          const mouseY = (e.clientY - this.panY) / this.zoom;
          this.handlePlacementAt(this.pendingPlacement, mouseX, mouseY);
          this.setPendingPlacement(null);
          return;
        }

        this.clearSelection();
      }
    });

    // Space key detection
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && !["input", "textarea"].includes(document.activeElement.tagName.toLowerCase())) {
        this.isSpacePressed = true;
        this.container.classList.add("panning");
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        this.isSpacePressed = false;
        if (!this.isPanning) {
          this.container.classList.remove("panning");
        }
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (this.isPanning) {
        this.panX = e.clientX - this.panStartX;
        this.panY = e.clientY - this.panStartY;
        this.updateTransform();
      } else if (this.isDelimiting) {
        this.delimitCurrentX = (e.clientX - this.panX) / this.zoom;
        this.delimitCurrentY = (e.clientY - this.panY) / this.zoom;
        this._updateDelimitBox();
      } else if (this.activeDragNode) {
        const mouseX = (e.clientX - this.panX) / this.zoom;
        const mouseY = (e.clientY - this.panY) / this.zoom;
        const newX = Math.round(mouseX - this.dragOffsetX);
        const newY = Math.round(mouseY - this.dragOffsetY);

        this.activeDragNode.style.left = `${newX}px`;
        this.activeDragNode.style.top = `${newY}px`;

        const nodeObj = this.nodes.find(n => n.id === this.activeDragNode.id);
        if (nodeObj) {
          nodeObj.x = newX;
          nodeObj.y = newY;
        }

        this.renderEdges();
      }
    });

    window.addEventListener("mouseup", () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.container.classList.remove("panning");
        if (window.MaestriApp) {
          window.MaestriApp.triggerAutoSave();
        }
      }

      if (this.isDelimiting) {
        this.isDelimiting = false;
        const x1 = Math.min(this.delimitStartX, this.delimitCurrentX);
        const y1 = Math.min(this.delimitStartY, this.delimitCurrentY);
        const rawW = Math.abs(this.delimitCurrentX - this.delimitStartX);
        const rawH = Math.abs(this.delimitCurrentY - this.delimitStartY);

        this._removeDelimitBox();
        this.setPendingPlacement(null);
        if (this.activeTool === "terminal") {
          this.activeTool = "select";
          if (window.MaestriApp) window.MaestriApp.setToolActive("select");
        }

        const width = rawW > 140 ? Math.round(rawW) : 520;
        const height = rawH > 100 ? Math.round(rawH) : 320;
        const x = Math.round(x1);
        const y = Math.round(y1);

        if (window.MaestriApp) {
          window.MaestriApp.openTerminalModalAt(x, y, width, height);
        }
        return;
      }

      if (this.activeDragNode) {
        this.activeDragNode = null;
        if (window.MaestriApp) {
          window.MaestriApp.triggerAutoSave();
        }
      }
    });

    // Zoom via wheel - strictly ignore when scrolling inside terminal or other scrollable components
    this.container.addEventListener("wheel", (e) => {
      if (
        e.target.closest(".term-body") ||
        e.target.closest(".xterm") ||
        e.target.closest(".floating-sidebar") ||
        e.target.closest(".modal-window") ||
        e.target.closest(".note-node") ||
        e.target.closest(".portal-frame") ||
        e.target.closest(".orch-target-list")
      ) {
        return; // Let the component handle its own internal scrolling!
      }

      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const newZoom = Math.min(Math.max(this.zoom * zoomFactor, this.minZoom), this.maxZoom);

      const mouseX = e.clientX;
      const mouseY = e.clientY;
      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;

      this.updateTransform();
      if (window.MaestriApp) {
        window.MaestriApp.triggerAutoSave();
      }
    }, { passive: false });

    // Context Menu for Infinite Canvas Background
    this.container.addEventListener("contextmenu", (e) => {
      if (this.isDelimiting || this.isConnecting) return;
      if (
        e.target.closest(".canvas-node") ||
        e.target.closest(".floating-sidebar") ||
        e.target.closest(".modal-overlay") ||
        e.target.closest(".top-toolbar") ||
        e.target.closest("#custom-context-menu")
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (window.MaestriApp?.contextMenu) {
        window.MaestriApp.contextMenu.showForCanvas(e);
      }
    });
  }

  _ensureDelimitBox() {
    let box = document.getElementById("canvas-delimit-box");
    if (!box) {
      box = document.createElement("div");
      box.id = "canvas-delimit-box";
      box.className = "canvas-delimit-box";
      box.innerHTML = `<span class="delimit-dimensions">0 × 0 px</span>`;
      this.world.appendChild(box);
    }
  }

  _updateDelimitBox() {
    const box = document.getElementById("canvas-delimit-box");
    if (!box) return;
    const x = Math.min(this.delimitStartX, this.delimitCurrentX);
    const y = Math.min(this.delimitStartY, this.delimitCurrentY);
    const w = Math.abs(this.delimitCurrentX - this.delimitStartX);
    const h = Math.abs(this.delimitCurrentY - this.delimitStartY);

    box.style.left = `${Math.round(x)}px`;
    box.style.top = `${Math.round(y)}px`;
    box.style.width = `${Math.round(w)}px`;
    box.style.height = `${Math.round(h)}px`;

    const dimLabel = box.querySelector(".delimit-dimensions");
    if (dimLabel) {
      dimLabel.textContent = `${Math.round(w)} × ${Math.round(h)} px`;
    }
  }

  _removeDelimitBox() {
    const box = document.getElementById("canvas-delimit-box");
    if (box) box.remove();
  }

  setPendingPlacement(type) {
    this.pendingPlacement = type;
    if (type) {
      this.container.classList.add("placing");
      if (window.MaestriApp) {
        window.MaestriApp.showToast(`Clique em qualquer lugar do canvas para posicionar ${type.toUpperCase()}`);
      }
    } else {
      this.container.classList.remove("placing");
    }
  }

  handlePlacementAt(type, x, y) {
    if (!window.MaestriApp) return;
    if (type === "terminal") {
      window.MaestriApp.openTerminalModalAt(x, y);
    } else if (type === "diagram") {
      window.MaestriApp.createDiagramNodeAt(x, y);
    } else if (type === "note") {
      window.MaestriApp.createNoteNodeAt(x, y);
    } else if (type === "portal") {
      window.MaestriApp.createPortalNodeAt(x, y);
    } else if (type === "text") {
      window.MaestriApp.createTextAnnotationAt(x, y);
    }
  }

  updateTransform() {
    this.world.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    const zoomText = document.getElementById("zoom-level-text");
    if (zoomText) {
      zoomText.textContent = `${Math.round(this.zoom * 100)}%`;
    }
  }

  setZoom(delta) {
    const newZoom = Math.min(Math.max(this.zoom + delta, this.minZoom), this.maxZoom);
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    this.panX = centerX - (centerX - this.panX) * (newZoom / this.zoom);
    this.panY = centerY - (centerY - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;
    this.updateTransform();
    if (window.MaestriApp) window.MaestriApp.triggerAutoSave();
  }

  resetZoom() {
    this.zoom = 1.0;
    this.updateTransform();
    if (window.MaestriApp) window.MaestriApp.triggerAutoSave();
  }

  fitView() {
    if (this.nodes.length === 0) {
      this.panX = 200;
      this.panY = 100;
      this.zoom = 1.0;
      this.updateTransform();
      if (window.MaestriApp) window.MaestriApp.triggerAutoSave();
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + (n.width || 200));
      maxY = Math.max(maxY, n.y + (n.height || 150));
    });

    const padding = 80;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;

    const scaleX = window.innerWidth / width;
    const scaleY = window.innerHeight / height;
    this.zoom = Math.min(Math.max(Math.min(scaleX, scaleY), this.minZoom), 1.2);

    this.panX = (window.innerWidth - width * this.zoom) / 2 - (minX - padding) * this.zoom;
    this.panY = (window.innerHeight - height * this.zoom) / 2 - (minY - padding) * this.zoom;
    this.updateTransform();
    if (window.MaestriApp) window.MaestriApp.triggerAutoSave();
  }

  registerNodeElement(el, nodeData) {
    el.addEventListener("mousedown", (e) => {
      // 1. If currently in connecting mode, clicking anywhere on this target node completes the connection!
      if (this.isConnecting) {
        e.stopPropagation();
        e.preventDefault();
        this.handleConnectClick(nodeData.id);
        return;
      }

      if (["input", "button", "textarea", "select"].includes(e.target.tagName.toLowerCase())) {
        return;
      }
      if (e.target.closest(".term-body") || e.target.closest(".portal-frame")) {
        this.selectNode(nodeData.id);
        return;
      }

      e.stopPropagation();
      this.selectNode(nodeData.id);

      this.activeDragNode = el;
      const mouseX = (e.clientX - this.panX) / this.zoom;
      const mouseY = (e.clientY - this.panY) / this.zoom;
      this.dragOffsetX = mouseX - el.offsetLeft;
      this.dragOffsetY = mouseY - el.offsetTop;
    });

    // Resize observer to update SVG lines and dimensions smoothly without flickering
    if (window.ResizeObserver) {
      let edgeRaf = null;
      let saveTimer = null;
      const ro = new ResizeObserver(() => {
        const nodeObj = this.nodes.find(n => n.id === nodeData.id);
        if (nodeObj && (el.offsetWidth !== nodeObj.width || el.offsetHeight !== nodeObj.height)) {
          nodeObj.width = el.offsetWidth;
          nodeObj.height = el.offsetHeight;

          // Butter-smooth SVG edge updates at 60fps
          if (!edgeRaf) {
            edgeRaf = requestAnimationFrame(() => {
              this.renderEdges();
              edgeRaf = null;
            });
          }

          if (window.MaestriApp) {
            if (nodeObj.type === "terminal") {
              // Smooth, instant local reflow without ConPTY clear screen flashing
              window.MaestriApp.termController.resizeTerminal(nodeData.id, true);
            }
            // Debounce auto-save during resize drag
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
              window.MaestriApp.triggerAutoSave();
            }, 800);
          }
        }
      });
      ro.observe(el);
    }
  }

  selectNode(nodeId) {
    this.clearSelection();
    this.selectedNodeId = nodeId;
    try {
      localStorage.setItem("maestri_last_active_node", nodeId);
    } catch (e) {}
    const el = document.getElementById(nodeId);
    if (el) {
      el.classList.add("selected");
      this.showContextBar(el, nodeId);
    }
  }

  clearSelection() {
    this.selectedNodeId = null;
    document.querySelectorAll(".canvas-node.selected").forEach(el => el.classList.remove("selected"));
    const bar = document.getElementById("node-context-bar");
    if (bar) bar.remove();
  }

  showContextBar(nodeEl, nodeId) {
    const existing = document.getElementById("node-context-bar");
    if (existing) existing.remove();

    const node = this.nodes.find(n => n.id === nodeId);
    const isOrch = node?.is_orchestrator;

    const bar = document.createElement("div");
    bar.id = "node-context-bar";
    bar.className = "node-context-bar";
    bar.innerHTML = `
      <button class="context-btn ${isOrch ? 'active-orch' : ''}" title="${isOrch ? 'Remover função de Chefe' : 'Tornar Chefe / Orquestrador'}" onclick="window.MaestriApp.toggleOrchestrator('${nodeId}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="${isOrch ? '#eab308' : 'none'}" stroke="${isOrch ? '#eab308' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"></path>
        </svg>
      </button>
      <button class="context-btn" title="Conectar a outro nó (Compartilhar dados)" onclick="window.MaestriApp.startConnect('${nodeId}')">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
      </button>
      <button class="context-btn" title="Enviar Saída para Nós Conectados" onclick="window.MaestriApp.broadcastFromNode('${nodeId}')">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>
      </button>
      <button class="context-btn" title="Desconectar todas as ligações deste nó" onclick="window.MaestriApp.disconnectNode('${nodeId}')">
        <svg width="15" height="15" fill="none" stroke="#ef4444" stroke-width="2" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
      </button>
      <button class="context-btn" title="Duplicar" onclick="window.MaestriApp.duplicateNode('${nodeId}')">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      </button>
      <button class="context-btn danger" title="Excluir" onclick="window.MaestriApp.deleteNode('${nodeId}')">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    `;
    nodeEl.appendChild(bar);
  }

  handleConnectClick(targetId) {
    if (this.connectSourceId && this.connectSourceId !== targetId) {
      // Prevent duplicate identical connections
      const alreadyConnected = this.edges.some(e => e.from === this.connectSourceId && e.to === targetId);
      if (!alreadyConnected) {
        const sourceNode = this.nodes.find(n => n.id === this.connectSourceId);
        const isOrch = sourceNode?.is_orchestrator;

        this.edges.push({
          id: `edge_${Date.now()}`,
          from: this.connectSourceId,
          to: targetId,
          style: isOrch ? "orchestrator" : "dashed",
          color: isOrch ? "#eab308" : "#38bdf8"
        });
        this.renderEdges();
        if (window.MaestriApp) {
          window.MaestriApp.showToast(`Nós conectados com sucesso!`);
          window.MaestriApp.updateAllConnectionStatus();
          window.MaestriApp.triggerAutoSave();
        }
      } else {
        if (window.MaestriApp) window.MaestriApp.showToast("Estes nós já estão conectados.");
      }
    }
    this.cancelConnect();
  }

  cancelConnect() {
    this.isConnecting = false;
    this.connectSourceId = null;
    this.container.classList.remove("connecting");
    document.querySelectorAll(".connecting-source").forEach(el => el.classList.remove("connecting-source"));
  }

  renderEdges() {
    const oldElements = this.svgLayer.querySelectorAll(".edge-group, .edge-path");
    oldElements.forEach(el => el.remove());

    this.edges.forEach(edge => {
      const fromEl = document.getElementById(edge.from);
      const toEl = document.getElementById(edge.to);
      if (!fromEl || !toEl) return;

      const fromRect = {
        x: fromEl.offsetLeft,
        y: fromEl.offsetTop,
        w: fromEl.offsetWidth,
        h: fromEl.offsetHeight
      };
      const toRect = {
        x: toEl.offsetLeft,
        y: toEl.offsetTop,
        w: toEl.offsetWidth,
        h: toEl.offsetHeight
      };

      const fromCenter = { x: fromRect.x + fromRect.w / 2, y: fromRect.y + fromRect.h / 2 };
      const toCenter = { x: toRect.x + toRect.w / 2, y: toRect.y + toRect.h / 2 };

      let startX, startY, endX, endY;
      let hx1, hy1, hx2, hy2;
      const dx = toCenter.x - fromCenter.x;
      const dy = toCenter.y - fromCenter.y;
      const curvature = 0.45;

      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal connection (left to right / right to left)
        startX = dx > 0 ? fromRect.x + fromRect.w : fromRect.x;
        startY = fromCenter.y;
        endX = dx > 0 ? toRect.x - 3 : toRect.x + toRect.w + 3;
        endY = toCenter.y;

        hx1 = startX + (endX - startX) * curvature;
        hy1 = startY;
        hx2 = endX - (endX - startX) * curvature;
        hy2 = endY;
      } else {
        // Vertical connection (top to bottom / bottom to top)
        startX = fromCenter.x;
        startY = dy > 0 ? fromRect.y + fromRect.h : fromRect.y;
        endX = toCenter.x;
        endY = dy > 0 ? toRect.y - 3 : toRect.y + toRect.h + 3;

        hx1 = startX;
        hy1 = startY + (endY - startY) * curvature;
        hx2 = endX;
        hy2 = endY - (endY - startY) * curvature;
      }

      // Midpoint on cubic bezier curve (t = 0.5)
      const midX = 0.125 * startX + 0.375 * hx1 + 0.375 * hx2 + 0.125 * endX;
      const midY = 0.125 * startY + 0.375 * hy1 + 0.375 * hy2 + 0.125 * endY;

      const d = `M ${startX} ${startY} C ${hx1} ${hy1}, ${hx2} ${hy2}, ${endX} ${endY}`;

      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "edge-group");
      g.setAttribute("data-edge-id", edge.id);

      // Invisible thick hit area for effortless hover & click
      const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hitArea.setAttribute("d", d);
      hitArea.setAttribute("class", "edge-hit-area");
      g.appendChild(hitArea);

      // Visible styled connection path with dynamic state colors and matching arrowheads
      const isTransmitting = (edge.visualState === "dispatching" || edge.isCommunicating);
      const isProcessing = (edge.visualState === "processing");
      const isOrch = (edge.style === "orchestrator" || edge.color === "#eab308");

      const fromNode = this.nodes.find(n => n.id === edge.from);
      const toNode = this.nodes.find(n => n.id === edge.to);
      const isObserverEdge = (fromNode && fromNode.is_controllable === false) || (toNode && toNode.is_controllable === false);

      let pathClass = `edge-path ${edge.style || "solid"}`;
      let strokeColor = edge.color || "#64748b";
      let markerId = "arrowhead";

      if (isTransmitting) {
        pathClass += " edge-order-transmitting";
        strokeColor = "#f59e0b";
        markerId = "arrowhead-transmitting";
      } else if (isProcessing) {
        pathClass += " edge-order-processing";
        strokeColor = "#10b981";
        markerId = "arrowhead-processing";
      } else if (isObserverEdge) {
        pathClass += " edge-observer-feed";
        strokeColor = "#06b6d4";
        markerId = "arrowhead-cyan";
      } else if (isOrch || strokeColor === "#eab308") {
        markerId = "arrowhead-orch";
        strokeColor = "#eab308";
      } else if (strokeColor === "#a855f7") {
        markerId = "arrowhead-purple";
      } else if (strokeColor === "#3b82f6") {
        markerId = "arrowhead-blue";
      } else {
        markerId = "arrowhead";
      }

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("class", pathClass);
      path.setAttribute("stroke", strokeColor);
      path.setAttribute("marker-end", `url(#${markerId})`);
      g.appendChild(path);

      // Interactive delete button at the midpoint
      const delBadge = document.createElementNS("http://www.w3.org/2000/svg", "g");
      delBadge.setAttribute("class", "edge-del-badge");
      delBadge.setAttribute("transform", `translate(${midX}, ${midY})`);
      delBadge.innerHTML = `
        <circle r="10" fill="#0f172a" stroke="#ef4444" stroke-width="1.6" />
        <text y="3.5" text-anchor="middle" fill="#f87171" font-size="12" font-weight="bold" pointer-events="none">✕</text>
        <title>Clique para excluir esta conexão</title>
      `;

      delBadge.addEventListener("click", (e) => {
        e.stopPropagation();
        if (window.MaestriApp) {
          window.MaestriApp.deleteEdge(edge.id);
        }
      });

      g.appendChild(delBadge);
      this.svgLayer.appendChild(g);
    });
  }
}

window.MaestriCanvas = MaestriCanvas;
