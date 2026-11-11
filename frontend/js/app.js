/**
 * Main Application Orchestrator for Maestri Desktop (v2.0)
 * Handles full canvas lifecycle, real machine terminal nodes,
 * inter-node communication, orchestrator delegation, and project context.
 */

class MaestriApplication {
  constructor() {
    this.canvas = null;
    this.termController = null;
    this.sidebar = null;
    this.modal = null;
    this.contextMenu = null;
    this.autoSaveTimer = null;
    this.currentData = null;
    this.currentVersion = 0;
  }

  async init() {
    this.canvas = new MaestriCanvas("canvas-container", "canvas-world", "svg-layer");
    this.termController = new MaestriTerminalController();
    this.sidebar = new MaestriSidebar("floating-sidebar");
    this.modal = new MaestriModalManager();
    this.contextMenu = new MaestriContextMenu();

    this._bindToolbar();
    this._bindOrchestratorModal();
    this.initTokenMonitor();
    this.initPersistenceIndicator();
    this.initEventsWebSocket();
    await this.loadWorkspace();

    window.addEventListener("resize", () => {
      this.termController.resizeAll();
    });

    // Automatic persistent state save on exit / close / hide
    const handleExitSave = () => {
      if (window.__isSwitchingProject || this.isSwitchingProject) {
        console.log("[Maestri] Ignorando salvamento de saída durante troca de projeto...");
        return;
      }
      const data = this.serializeState();
      try {
        const payload = JSON.stringify(data);
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon("/api/workspace/save", blob);
          navigator.sendBeacon("/api/workspace/flush");
        } else {
          fetch("/api/workspace/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true
          });
          fetch("/api/workspace/flush", {
            method: "POST",
            keepalive: true
          });
        }
      } catch (e) {
        console.warn("Exit save failed:", e);
      }
    };

    window.addEventListener("beforeunload", handleExitSave);
    window.addEventListener("pagehide", handleExitSave);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        handleExitSave();
      }
    });

    // Periodic safety auto-save every 15s to keep state synchronized
    setInterval(() => {
      this.triggerAutoSave();
    }, 15000);

    console.log("Maestri Desktop App v2.0 Online (Zero Context Loss Mode).");
  }

  initPersistenceIndicator() {
    const pill = document.getElementById("persistence-status-pill");
    if (pill) {
      pill.addEventListener("click", () => {
        this.saveStateImmediately();
      });
    }
  }

  initTokenMonitor() {
    const capsule = document.getElementById("ai-tokens-capsule");
    const popover = document.getElementById("ai-tokens-popover");
    const btnClose = document.getElementById("btn-close-tokens-popover");

    if (capsule && popover) {
      capsule.addEventListener("click", (e) => {
        e.stopPropagation();
        const isHidden = popover.classList.contains("hidden");
        if (isHidden) {
          popover.classList.remove("hidden");
          this.refreshTokenMetrics(true);
        } else {
          popover.classList.add("hidden");
        }
      });

      btnClose?.addEventListener("click", (e) => {
        e.stopPropagation();
        popover.classList.add("hidden");
      });

      document.addEventListener("click", (e) => {
        if (!popover.contains(e.target) && !capsule.contains(e.target)) {
          popover.classList.add("hidden");
        }
      });
    }

    // Refresh every 5 seconds and immediately
    this.refreshTokenMetrics();
    setInterval(() => this.refreshTokenMetrics(), 5000);

    // Live sync for Agent Notes & Competencies modified via CLI or API
    setInterval(() => this.syncExternalChanges(), 3000);
  }

  async syncExternalChanges() {
    try {
      // High-performance differential polling: only receive data when version actually changes
      const res = await fetch(`/api/workspace/poll?v=${this.currentVersion || 0}`);
      if (!res.ok) return;
      const pollData = await res.json();
      if (!pollData || !pollData.changed) {
        return; // Zero changes on server, zero DOM work!
      }

      this.currentVersion = pollData.version || this.currentVersion;
      const data = pollData.workspace;
      if (!data) return;
      const nodes = data.canvas?.nodes || [];

      nodes.forEach(remoteNode => {
        if (remoteNode.type === "note") {
          const localNode = this.canvas.nodes.find(n => n.id === remoteNode.id);
          if (localNode && localNode.text !== remoteNode.text) {
            localNode.text = remoteNode.text;
            const contentEl = document.getElementById(`note_content_${remoteNode.id}`);
            if (contentEl && document.activeElement !== contentEl) {
              contentEl.innerText = remoteNode.text;
              const noteBox = document.getElementById(remoteNode.id);
              if (noteBox) {
                noteBox.classList.add("note-pulsing-update");
                setTimeout(() => noteBox.classList.remove("note-pulsing-update"), 1800);
              }
            }
          }
        } else if (remoteNode.type === "terminal") {
          const localNode = this.canvas.nodes.find(n => n.id === remoteNode.id);
          if (localNode) {
            const oldResps = JSON.stringify(localNode.responsibilities || []);
            const newResps = JSON.stringify(remoteNode.responsibilities || []);
            if (oldResps !== newResps) {
              localNode.responsibilities = remoteNode.responsibilities || [];
              const barEl = document.getElementById(`term_resp_bar_${remoteNode.id}`);
              if (barEl) {
                const respPills = (localNode.responsibilities || []).map(r => `<span class="term-resp-pill" title="Responsabilidade / Papel do Agente">⚡ ${r}</span>`).join('');
                barEl.innerHTML = respPills;
              }
            }
          }
        }
      });
    } catch (e) {
      // Quiet background polling
    }
  }

  async refreshTokenMetrics(renderPopoverDetails = false) {
    try {
      const res = await fetch("/api/tokens/usage");
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.active_ais) return;

      const pillsContainer = document.getElementById("ai-tokens-pills");
      if (pillsContainer) {
        pillsContainer.innerHTML = data.active_ais.map(ai => {
          let statusClass = "healthy";
          if (ai.percent_available < 20) statusClass = "low";
          else if (ai.percent_available < 50) statusClass = "moderate";

          return `
            <div class="ai-token-chip ${statusClass}" title="${ai.name} (${ai.model}): ${ai.available.toLocaleString()} de ${ai.limit.toLocaleString()} tokens restantes (${ai.percent_available}%)">
              <span>${ai.icon}</span>
              <span>${ai.formatted_available}</span>
            </div>
          `;
        }).join("");
      }

      const popoverList = document.getElementById("tokens-popover-list");
      if (popoverList && (!popoverList.innerHTML || renderPopoverDetails)) {
        popoverList.innerHTML = data.active_ais.map(ai => {
          let statusClass = "healthy";
          let fillColor = "#10b981";
          if (ai.percent_available < 20) { statusClass = "low"; fillColor = "#ef4444"; }
          else if (ai.percent_available < 50) { statusClass = "moderate"; fillColor = "#f59e0b"; }

          const nodesCountText = ai.nodes_count > 0 ? `${ai.nodes_count} nó(s) ativo(s)` : "Disponível";

          return `
            <div class="ai-token-card">
              <div class="ai-card-header">
                <div class="ai-card-name">
                  <span style="font-size: 14px;">${ai.icon}</span>
                  <div>
                    <div style="font-weight: 600; color: #f8fafc;">${ai.name}</div>
                    <div style="font-size: 10px; color: #64748b;">${ai.model} • ${nodesCountText}</div>
                  </div>
                </div>
                <span class="ai-card-pct ${statusClass}">${ai.percent_available}% disp.</span>
              </div>
              <div class="ai-card-progress">
                <div class="ai-progress-fill" style="width: ${ai.percent_available}%; background: ${fillColor};"></div>
              </div>
              <div class="ai-card-stats">
                <span>Disponíveis: <strong style="color: #e2e8f0;">${ai.available.toLocaleString()}</strong></span>
                <span>Limite: ${ai.limit.toLocaleString()}</span>
              </div>
            </div>
          `;
        }).join("");
      }
    } catch (e) {
      console.warn("Failed to fetch token usage:", e);
    }
  }

  _bindToolbar() {
    // Requirement 8: All toolbar tools fully functional

    // 1. Select Tool
    document.getElementById("btn-tool-select")?.addEventListener("click", () => {
      this.setToolActive("select");
      this.canvas.activeTool = "select";
      this.canvas.setPendingPlacement(null);
      this.showToast("Ferramenta Seleção ativa.");
    });

    // 2. Hand / Pan Tool
    document.getElementById("btn-tool-hand")?.addEventListener("click", () => {
      this.setToolActive("hand");
      this.canvas.activeTool = "hand";
      this.canvas.setPendingPlacement(null);
      this.showToast("Mão de arrasto ativa (ou use o botão de rolagem do mouse).");
    });

    // 3. Terminal Tool (Delimit area by click and drag)
    document.getElementById("btn-tool-terminal")?.addEventListener("click", () => {
      this.setToolActive("terminal");
      this.canvas.setPendingPlacement("terminal");
      this.showToast("Clique e arraste no canvas para delimitar a área do novo terminal.");
    });

    document.getElementById("btn-sidebar-add")?.addEventListener("click", () => {
      this.setToolActive("terminal");
      this.canvas.setPendingPlacement("terminal");
      this.showToast("Clique e arraste no canvas para delimitar a área do novo terminal.");
    });

    // 4. Diagram Block Tool
    document.getElementById("btn-tool-diagram")?.addEventListener("click", () => {
      this.setToolActive("diagram");
      this.canvas.setPendingPlacement("diagram");
    });

    // 5. Note Tool
    document.getElementById("btn-tool-note")?.addEventListener("click", () => {
      this.setToolActive("note");
      this.canvas.setPendingPlacement("note");
    });

    // 6. Text Annotation Tool
    document.getElementById("btn-tool-text")?.addEventListener("click", () => {
      this.setToolActive("text");
      this.canvas.setPendingPlacement("text");
    });

    // 7. Portal (Web Preview) Tool
    document.getElementById("btn-tool-portal")?.addEventListener("click", () => {
      this.setToolActive("portal");
      this.canvas.setPendingPlacement("portal");
    });

    // 8. Connect Nodes Tool
    document.getElementById("btn-tool-connect")?.addEventListener("click", () => {
      if (this.canvas.selectedNodeId) {
        this.startConnect(this.canvas.selectedNodeId);
      } else {
        this.showToast("Selecione um nó primeiro para conectar.");
      }
    });

    // 9. Run Orchestration (Requirement 5)
    document.getElementById("btn-tool-run")?.addEventListener("click", () => {
      this.triggerOrchestrationLoop();
    });

    // 10. Save Workspace
    document.getElementById("btn-tool-save")?.addEventListener("click", () => {
      this.saveStateImmediately();
    });

    // 11. Projects Dialog
    document.getElementById("btn-tool-projects")?.addEventListener("click", () => {
      this.sidebar.openProjectPicker();
    });

    // 12. Export JSON
    document.getElementById("btn-view-json")?.addEventListener("click", () => {
      this.exportJson();
    });

    // 13. Flexible Tools Menu Dropdown (Vidro Fosco)
    const moreToolsBtn = document.getElementById("btn-more-tools");
    const moreToolsDropdown = document.getElementById("more-tools-dropdown");
    if (moreToolsBtn && moreToolsDropdown) {
      moreToolsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isHidden = moreToolsDropdown.style.display === "none";
        moreToolsDropdown.style.display = isHidden ? "flex" : "none";
      });

      document.addEventListener("click", (e) => {
        if (!moreToolsDropdown.contains(e.target) && e.target !== moreToolsBtn) {
          moreToolsDropdown.style.display = "none";
        }
      });

      moreToolsDropdown.querySelectorAll(".dropdown-item").forEach(item => {
        item.addEventListener("click", () => {
          moreToolsDropdown.style.display = "none";
        });
      });
    }

    document.getElementById("btn-reset-workspace-top")?.addEventListener("click", () => {
      document.getElementById("btn-reset-workspace")?.click();
    });

    // 14. Workspace Directory Selector
    document.getElementById("btn-select-workspace-dir")?.addEventListener("click", async () => {
      try {
        const currentDir = this.currentWorkingDirectory || "";
        const res = await fetch(`/api/browse-directory?initial=${encodeURIComponent(currentDir)}`);
        const data = await res.json();
        if (data && data.path) {
          await this.setWorkspaceDirectory(data.path);
        }
      } catch (e) {
        console.warn("Folder picker error:", e);
      }
    });

    document.getElementById("btn-open-dir-explorer")?.addEventListener("click", async () => {
      try {
        await fetch("/api/workspace/open-directory", { method: "POST" });
        this.showToast("Pasta aberta no Windows Explorer.");
      } catch (e) {
        this.showToast("Erro ao abrir pasta.");
      }
    });

    // Reset Clean
    document.getElementById("btn-reset-workspace")?.addEventListener("click", async () => {
      if (confirm("Deseja limpar todos os nós do canvas atual e iniciar limpo?")) {
        await fetch("/api/workspace/reset", { method: "POST" });
        window.location.reload();
      }
    });

    // Zoom and View Controls
    document.getElementById("btn-zoom-in")?.addEventListener("click", () => this.canvas.setZoom(0.15));
    document.getElementById("btn-zoom-out")?.addEventListener("click", () => this.canvas.setZoom(-0.15));
    document.getElementById("zoom-level-text")?.addEventListener("click", () => this.canvas.resetZoom());
    document.getElementById("btn-fit-view")?.addEventListener("click", () => this.canvas.fitView());

    // Keyboard shortcuts
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.altKey) && e.key.toLowerCase() === "t") {
        e.preventDefault();
        this.modal.open();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        this.saveStateImmediately();
      }
    });
  }

  setToolActive(toolName) {
    document.querySelectorAll(".toolbar-btn").forEach(b => b.classList.remove("active"));
    const activeBtn = document.getElementById(`btn-tool-${toolName}`);
    if (activeBtn) activeBtn.classList.add("active");
  }

  initEventsWebSocket() {
    try {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${proto}//${location.host}/ws/events`;
      this.eventsWs = new WebSocket(url);

      this.eventsWs.onopen = () => {
        if (this._eventsPingInterval) clearInterval(this._eventsPingInterval);
        this._eventsPingInterval = setInterval(() => {
          if (this.eventsWs && this.eventsWs.readyState === WebSocket.OPEN) {
            this.eventsWs.send("ping");
          }
        }, 15000);
      };

      this.eventsWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "note_updated") {
            this.handleLiveNoteUpdate(data.note_id, data.text, data.boundNodeId);
          }
        } catch (err) {}
      };

      this.eventsWs.onclose = () => {
        if (this._eventsPingInterval) clearInterval(this._eventsPingInterval);
        setTimeout(() => this.initEventsWebSocket(), 3000);
      };
    } catch (e) {
      console.warn("[Maestri Events WS Error]:", e);
    }
  }

  handleLiveNoteUpdate(noteId, text, boundNodeId) {
    if (!noteId) return;
    const noteNode = this.canvas.nodes.find(n => n.id === noteId || (boundNodeId && n.boundNodeId === boundNodeId));
    if (noteNode) {
      noteNode.text = text;
      const targetId = noteNode.id;
      const noteEl = document.getElementById(`note_content_${targetId}`);
      if (noteEl) {
        noteEl.innerText = text;
      }
      const card = document.getElementById(targetId);
      if (card) {
        card.classList.remove("note-updated-flash");
        void card.offsetWidth; // Force reflow
        card.classList.add("note-updated-flash");
        setTimeout(() => card.classList.remove("note-updated-flash"), 1500);
      }
    }
  }

  async loadWorkspace() {
    try {
      const res = await fetch(`/api/workspace?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });
      const data = await res.json();
      this.currentData = data;
      this.currentVersion = data._version || Date.now();

      const projName = data.meta?.name || "Meu Projeto";
      this.currentProjectSlug = data.meta?.slug || null;
      this.sidebar.setProjectName(projName);

      const hasSavedViewport = data.canvas && data.canvas.viewport && typeof data.canvas.viewport.x === "number";
      if (hasSavedViewport) {
        this.canvas.panX = data.canvas.viewport.x;
        this.canvas.panY = data.canvas.viewport.y;
        this.canvas.zoom = data.canvas.viewport.zoom ?? 1.0;
        this.canvas.updateTransform();
      }

      this.canvas.nodes = data.canvas?.nodes || [];
      this.canvas.edges = data.canvas?.edges || [];

      // Update workspace working directory
      this.currentWorkingDirectory = data.meta?.working_directory || "";
      this.updateWorkspaceDirectoryUI(this.currentWorkingDirectory);

      // Render nodes on canvas (clean if empty)
      this.canvas.nodes.forEach(node => this.renderNode(node));
      setTimeout(() => {
        this.canvas.renderEdges();
        this.updateAllConnectionStatus();
      }, 150);

      this.sidebar.updateNodeList(this.canvas.nodes);

      // Restore active selected node visual focus without moving camera if viewport exists
      const lastActiveNodeId = localStorage.getItem("maestri_last_active_node");
      const defaultActiveId = (lastActiveNodeId && this.canvas.nodes.some(n => n.id === lastActiveNodeId))
        ? lastActiveNodeId
        : (this.canvas.nodes.find(n => n.is_orchestrator)?.id || this.canvas.nodes[0]?.id);

      if (defaultActiveId) {
        this.canvas.selectNode(defaultActiveId);
      }

      // ONLY if there is NO saved viewport at all, focus the default node as an initial onboarding step
      if (!hasSavedViewport && defaultActiveId) {
        setTimeout(() => {
          this.focusNode(defaultActiveId);
        }, 280);
      }

    } catch (e) {
      console.error("Failed to load workspace:", e);
      this.showToast("Erro ao carregar dados do workspace.");
    }
  }

  renderNode(node) {
    const world = document.getElementById("canvas-world");
    const el = document.createElement("div");
    el.id = node.id;
    el.className = `canvas-node ${node.is_orchestrator ? 'is-orchestrator' : ''}`;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;

    // Right-click contextual options for nodes
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.contextMenu) {
        this.contextMenu.showForNode(e, node.id);
      }
    });

    if (node.type === "text") {
      el.className += " text-node";
      el.innerHTML = `
        <span>${node.title || 'Texto'}</span>
        <div class="hand-underline"></div>
      `;
    } else if (node.type === "diagram") {
      el.className += ` diagram-node ${node.bgStyle === 'hatched' ? 'hatched' : ''}`;
      el.style.borderColor = node.borderColor || "#3b82f6";
      if (node.width) el.style.width = `${node.width}px`;
      if (node.height) el.style.height = `${node.height}px`;

      el.innerHTML = `
        <div class="node-title">${node.title}</div>
        ${node.subtitle ? `<div class="node-subtitle">${node.subtitle}</div>` : ''}
      `;
    } else if (node.type === "terminal") {
      const isObserver = node.is_controllable === false;
      el.className += ` terminal-node ${isObserver ? 'is-observer-node' : ''}`;
      el.style.width = `${node.width || 520}px`;
      el.style.height = `${node.height || 320}px`;
      if (node.borderColor) el.style.borderColor = node.borderColor;

      const termBodyId = `term_body_${node.id}`;
      const orchCrownSvg = `<svg width="11" height="11" viewBox="0 0 24 24" fill="#000" stroke="#000" stroke-width="2" style="margin-right: 3px;"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"></path></svg>`;
      const orchBadge = node.is_orchestrator ? `<span class="orchestrator-badge">${orchCrownSvg}CHEFE</span>` : '';
      const modeBadge = isObserver
        ? `<span id="term_mode_badge_${node.id}" class="mode-badge observer-badge" title="Nó em Modo Observador: Apenas visão e telemetria para a IA. Não recebe ordens nem comandos. Clique para alternar para Controlado." onclick="window.MaestriApp.toggleControllable('${node.id}', event)">👁️ OBSERVAÇÃO</span>`
        : (node.is_orchestrator ? '' : `<span id="term_mode_badge_${node.id}" class="mode-badge controlled-badge" title="Nó Controlado: Executa ordens do Chefe. Clique para alternar para Apenas Observador." onclick="window.MaestriApp.toggleControllable('${node.id}', event)">⚡ CONTROLADO</span>`);
      const folderIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 3px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
      const rawCwd = node.cwd ? (node.cwd.split(/[\\/]/).filter(Boolean).pop() || node.cwd) : '';
      const cleanCwd = rawCwd.replace(/^[📁📂\s]+/, '').trim();
      const cwdDisplay = node.cwd ? `<span class="term-cwd-pill" title="${node.cwd}">${folderIcon}${cleanCwd}</span>` : '';

      // Requirement: Render Responsibilities / Papéis
      const respPills = (node.responsibilities || []).map(r => `<span class="term-resp-pill" title="Responsabilidade / Papel do Agente">⚡ ${r}</span>`).join('');
      const respBar = `<div id="term_resp_bar_${node.id}" class="term-resp-bar">${respPills}</div>`;

      el.innerHTML = `
        <div class="terminal-header">
          <div class="term-title-box">
            <span class="term-indicator ${node.status === 'running' ? '' : 'idle'}"></span>
            <span id="term_icon_${node.id}" class="term-custom-icon" title="Ícone do terminal">${node.icon || '💻'}</span>
            <span id="term_title_text_${node.id}" class="term-title" title="Clique duas vezes para renomear">${node.title}</span>
            <button class="icon-btn edit-title-btn" title="Renomear terminal" onclick="window.MaestriApp.startRenameNode('${node.id}', event)">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg>
            </button>
            ${orchBadge}
            ${modeBadge}
            ${cwdDisplay}
          </div>
          <div class="term-actions">
            <button class="icon-btn mode-toggle-btn ${isObserver ? 'is-observer' : 'is-controlled'}" id="term_mode_btn_${node.id}" title="${isObserver ? 'Modo Observador Ativo (Ajuda a IA a enxergar a situação, mas NÃO recebe ordens). Clique para Tornar Controlado' : 'Modo Controlado Ativo (Recebe ordens do Chefe e executa). Clique para Tornar Apenas Observador'}" onclick="window.MaestriApp.toggleControllable('${node.id}', event)">
              ${isObserver ? '👁️' : '🎮'}
            </button>
            <button class="icon-btn" title="Configurações do Terminal (Ícone, Tema, Papel...)" onclick="window.MaestriApp.openEditTerminalModal('${node.id}', event)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            </button>
            <button class="icon-btn ${node.is_orchestrator ? 'active' : ''}" title="${node.is_orchestrator ? 'Remover função de Chefe' : 'Tornar Chefe / Orquestrador'}" onclick="window.MaestriApp.toggleOrchestrator('${node.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="${node.is_orchestrator ? '#eab308' : 'none'}" stroke="${node.is_orchestrator ? '#eab308' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"></path></svg>
            </button>
            <button class="icon-btn" title="Compartilhar Saída com Nós Conectados" onclick="window.MaestriApp.broadcastFromNode('${node.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>
            </button>
            <button class="icon-btn" title="Reiniciar" onclick="window.MaestriApp.restartTerminal('${node.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><polyline points="21 3 21 8 16 8"></polyline></svg>
            </button>
            <button class="icon-btn danger-hover" title="Fechar" onclick="window.MaestriApp.deleteNode('${node.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
        ${respBar}
        <div id="${termBodyId}" class="term-body"></div>
        <div class="term-context-bar">
          <span id="term_conn_status_${node.id}" class="conn-status-text">● Desconectado</span>
          <div class="conn-actions">
            <button class="context-pill-btn" onclick="window.MaestriApp.createConnectedContextNote('${node.id}')" title="Criar ou focar anotação de contexto vivo vinculada a este nó">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
              <span>🧠 Contexto</span>
            </button>
            <button class="context-pill-btn orch-dispatch-btn ${node.is_orchestrator ? '' : 'hidden'}" onclick="window.MaestriApp.dispatchFromOrchestrator('${node.id}')" title="Formular e despachar ordens com IA para os nós subordinados">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#eab308" stroke="#eab308" stroke-width="2"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"></path></svg>
              <span>👑 Despachar Ordens</span>
            </button>
            <button class="context-pill-btn" onclick="window.MaestriApp.broadcastFromNode('${node.id}')" title="Compartilhar histórico deste nó com os conectados">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line><path d="M20 21H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3"></path></svg>
              <span>Enviar Dados</span>
            </button>
          </div>
        </div>
      `;
      world.appendChild(el);
      this.canvas.registerNodeElement(el, node);

      const titleSpan = el.querySelector(`#term_title_text_${node.id}`);
      titleSpan?.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        this.startRenameNode(node.id, e);
      });

      setTimeout(() => {
        this.termController.mountTerminal(termBodyId, node);
      }, 50);
      return;
    } else if (node.type === "note") {
      // Requirement: Connected Active Context Note
      const connectedEdge = this.canvas.edges.find(e => e.from === node.id || e.to === node.id);
      const boundTargetId = node.boundNodeId || (connectedEdge ? (connectedEdge.from === node.id ? connectedEdge.to : connectedEdge.from) : null);
      const boundTarget = boundTargetId ? this.canvas.nodes.find(n => n.id === boundTargetId) : null;
      const isBoundToOrch = boundTarget?.is_orchestrator;

      el.className += ` note-node ${boundTarget ? 'connected-context' : ''} ${isBoundToOrch ? 'orchestrator-context' : ''}`;
      el.style.width = `${node.width || 320}px`;
      el.innerHTML = `
        <div class="note-header">
          <div class="note-title-box">
            <span class="note-icon">🧠</span>
            <span class="note-title">${boundTarget ? `Contexto Vivo: ${boundTarget.title}` : 'Memória de Contexto'}</span>
            ${boundTarget ? `<span class="note-bound-tag" title="Vinculado a ${boundTarget.title}">@${boundTarget.title}</span>` : ''}
          </div>
          <div class="note-actions">
            ${boundTarget ? `<button class="icon-btn note-sync-btn" onclick="window.MaestriApp.syncNoteWithAgent('${node.id}')" title="Sincronizar e Injetar Contexto no Agente">⚡</button>` : ''}
            <button class="icon-btn" onclick="window.MaestriApp.deleteNode('${node.id}')" style="width: 18px; height: 18px;">✕</button>
          </div>
        </div>
        <div id="note_content_${node.id}" class="note-body" contenteditable="true" onblur="window.MaestriApp.updateNoteText('${node.id}', this.innerText)">${node.text || "Memória de contexto ativa: objetivos, regras e diretrizes..."}</div>
      `;
    } else if (node.type === "portal") {
      const isObserver = node.is_controllable === false;
      el.className += ` portal-node ${isObserver ? 'is-observer-node' : ''}`;
      el.style.width = `${node.width || 480}px`;
      el.style.height = `${node.height || 340}px`;
      const portalModeBadge = `<span id="portal_mode_badge_${node.id}" class="mode-badge ${isObserver ? 'observer-badge' : 'controlled-badge'}" title="${isObserver ? 'Apenas Observador / Sensor Web (Clique para tornar Controlado)' : 'Navegador Controlado (Clique para tornar Apenas Observador)'}" onclick="window.MaestriApp.toggleControllable('${node.id}', event)">${isObserver ? '👁️ OBSERVAÇÃO' : '⚡ CONTROLADO'}</span>`;
      el.innerHTML = `
        <div class="portal-bar">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 11px; color: #38bdf8; font-weight: 600;">🌐 Navegador</span>
            ${portalModeBadge}
          </div>
          <input type="text" class="portal-url" value="${node.url || 'https://google.com'}" onchange="window.MaestriApp.updatePortalUrl('${node.id}', this.value)">
          <div style="display: flex; align-items: center; gap: 4px;">
            <button class="icon-btn mode-toggle-btn ${isObserver ? 'is-observer' : 'is-controlled'}" id="portal_mode_btn_${node.id}" title="${isObserver ? 'Modo Observador Ativo (Ajuda a IA a enxergar a situação). Clique para Ativar Modo Controlado' : 'Modo Controlado Ativo. Clique para Tornar Apenas Observador'}" onclick="window.MaestriApp.toggleControllable('${node.id}', event)">
              ${isObserver ? '👁️' : '🎮'}
            </button>
            <button class="icon-btn" onclick="window.MaestriApp.deleteNode('${node.id}')">✕</button>
          </div>
        </div>
        <iframe class="portal-frame" src="${node.url}"></iframe>
      `;
    }

    world.appendChild(el);
    this.canvas.registerNodeElement(el, node);
  }

  // Requirement 3: Open modal at target coordinates with optional delimited dimensions
  openTerminalModalAt(x, y, width = null, height = null) {
    this.modal.open(Math.round(x), Math.round(y), width ? Math.round(width) : null, height ? Math.round(height) : null);
  }

  createTerminalNode(params) {
    const id = `term_${Date.now()}`;
    const width = params.width || 520;
    const height = params.height || 320;
    const x = params.x ?? Math.round((-this.canvas.panX + window.innerWidth / 2 - width / 2) / this.canvas.zoom);
    const y = params.y ?? Math.round((-this.canvas.panY + window.innerHeight / 2 - height / 2) / this.canvas.zoom);

    const node = {
      id: id,
      type: "terminal",
      x: x,
      y: y,
      width: width,
      height: height,
      title: params.title || "Terminal",
      icon: params.icon || "💻",
      command: params.command || "powershell.exe",
      preset: params.preset || "shell",
      cwd: params.cwd || this.currentWorkingDirectory || "",
      is_orchestrator: params.isOrchestrator || false,
      is_controllable: params.isControllable !== undefined ? params.isControllable : true,
      responsibilities: params.responsibilities || [],
      borderColor: params.color || "#3b82f6",
      terminalTheme: params.terminalTheme || "vscode",
      status: "running"
    };

    this.canvas.nodes.push(node);
    this.renderNode(node);
    this.canvas.selectNode(node.id);
    this.sidebar.updateNodeList(this.canvas.nodes);
    this.showToast(`Terminal "${node.title}" criado.`);
    this.triggerAutoSave();
  }

  openEditTerminalModal(nodeId, event) {
    if (event) event.stopPropagation();
    const node = this.canvas.nodes.find(n => n.id === nodeId);
    if (node) {
      this.modal.openEdit(node);
    }
  }

  async updateTerminalNode(nodeId, params) {
    const node = this.canvas.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const oldPreset = node.preset;
    const oldCommand = node.command;

    node.title = params.title || node.title;
    node.icon = params.icon || node.icon || "💻";
    node.command = params.command || node.command;
    node.preset = params.preset || node.preset;
    node.ai = node.preset !== "shell" ? node.preset : null;
    node.cwd = params.cwd || node.cwd;
    node.borderColor = params.color || node.borderColor;
    node.responsibilities = params.responsibilities || [];
    node.terminalTheme = params.terminalTheme || "vscode";

    // Update controllable state if specified
    if (params.isControllable !== undefined) {
      node.is_controllable = Boolean(params.isControllable);
      this.updateNodeControlModeUI(nodeId);
    }

    // Toggle orchestrator if changed
    if (params.isOrchestrator !== undefined && params.isOrchestrator !== node.is_orchestrator) {
      this.toggleOrchestrator(nodeId);
    }

    // Update visual element on canvas
    const el = document.getElementById(nodeId);
    if (el) {
      if (node.borderColor) el.style.borderColor = node.borderColor;

      const titleSpan = document.getElementById(`term_title_text_${nodeId}`);
      if (titleSpan) titleSpan.textContent = node.title;

      const iconSpan = document.getElementById(`term_icon_${nodeId}`);
      if (iconSpan) iconSpan.textContent = node.icon;

      // Update responsibilities bar
      let respBar = el.querySelector(".term-resp-bar");
      const respPills = (node.responsibilities || []).map(r => `<span class="term-resp-pill" title="Responsabilidade / Papel do Agente">⚡ ${r}</span>`).join('');
      if (respBar) {
        respBar.innerHTML = respPills;
        respBar.style.display = respPills ? "flex" : "none";
      } else if (respPills) {
        const newRespBar = document.createElement("div");
        newRespBar.className = "term-resp-bar";
        newRespBar.innerHTML = respPills;
        const header = el.querySelector(".terminal-header");
        if (header) header.after(newRespBar);
      }
    }

    // Live update xterm theme
    if (this.termController) {
      this.termController.setTerminalTheme(nodeId, node.terminalTheme);
    }

    this.sidebar.updateNodeList(this.canvas.nodes);
    this.triggerAutoSave();

    // If preset / AI or command changed, automatically reboot the terminal with the new AI
    const aiChanged = (oldPreset !== node.preset) || (oldCommand !== node.command);
    if (aiChanged) {
      await fetch(`/api/terminal/restart/${nodeId}`, { method: "POST" }).catch(() => {});
      this.restartTerminal(nodeId);
      this.showToast(`🤖 Terminal configurado para rodar ${node.preset.toUpperCase()} automaticamente!`);
    } else {
      this.showToast(`Configurações de "${node.title}" atualizadas com sucesso!`);
    }
  }

  // Toggle node between Orchestrated/Controllable Worker (⚡) and Observer/Sensor Only (👁️)
  toggleControllable(nodeId, event) {
    if (event) event.stopPropagation();
    const node = this.canvas.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Toggle controllable boolean
    node.is_controllable = (node.is_controllable === false ? true : false);
    this.updateNodeControlModeUI(nodeId);
    this.triggerAutoSave();

    if (node.is_controllable === false) {
      this.showToast(`👁️ "${node.title || 'Nó'}" agora é Apenas Observador (ajuda a IA a enxergar a situação; não recebe ordens).`);
    } else {
      this.showToast(`⚡ "${node.title || 'Nó'}" ativado como Sistema Controlado (pronto para receber ordens e executar tarefas).`);
    }
  }

  // Seamless live UI refresh for a node's control/observer mode without flickering or session drops
  updateNodeControlModeUI(nodeId) {
    const node = this.canvas.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const isObserver = node.is_controllable === false;
    const el = document.getElementById(nodeId);
    if (!el) return;

    el.classList.toggle("is-observer-node", isObserver);

    if (node.type === "terminal") {
      const badge = el.querySelector(`#term_mode_badge_${nodeId}`);
      if (badge) {
        if (isObserver) {
          badge.className = "mode-badge observer-badge";
          badge.innerHTML = "👁️ OBSERVAÇÃO";
          badge.title = "Nó em Modo Observador: Apenas visão e telemetria para a IA. Não recebe ordens nem comandos. Clique para alternar para Controlado.";
          badge.style.display = "inline-flex";
        } else if (node.is_orchestrator) {
          badge.style.display = "none";
        } else {
          badge.className = "mode-badge controlled-badge";
          badge.innerHTML = "⚡ CONTROLADO";
          badge.title = "Nó Controlado: Executa ordens do Chefe. Clique para alternar para Apenas Observador.";
          badge.style.display = "inline-flex";
        }
      }

      const btn = el.querySelector(`#term_mode_btn_${nodeId}`);
      if (btn) {
        btn.className = `icon-btn mode-toggle-btn ${isObserver ? 'is-observer' : 'is-controlled'}`;
        btn.innerHTML = isObserver ? "👁️" : "🎮";
        btn.title = isObserver
          ? "Modo Observador Ativo (Ajuda a IA a enxergar, mas NÃO recebe ordens). Clique para Tornar Controlado"
          : "Modo Controlado Ativo (Recebe ordens do Chefe e executa). Clique para Tornar Apenas Observador";
      }
    } else if (node.type === "portal") {
      const badge = el.querySelector(`#portal_mode_badge_${nodeId}`);
      if (badge) {
        badge.className = `mode-badge ${isObserver ? 'observer-badge' : 'controlled-badge'}`;
        badge.innerHTML = isObserver ? "👁️ OBSERVAÇÃO" : "⚡ CONTROLADO";
        badge.title = isObserver ? "Apenas Observador / Sensor Web" : "Navegador Controlado";
      }
      const btn = el.querySelector(`#portal_mode_btn_${nodeId}`);
      if (btn) {
        btn.className = `icon-btn mode-toggle-btn ${isObserver ? 'is-observer' : 'is-controlled'}`;
        btn.innerHTML = isObserver ? "👁️" : "🎮";
        btn.title = isObserver
          ? "Modo Observador Ativo. Clique para Ativar Modo Controlado"
          : "Modo Controlado Ativo. Clique para Tornar Apenas Observador";
      }
    }

    if (this.sidebar) this.sidebar.updateNodeList(this.canvas.nodes);
    if (this.canvas) this.canvas.renderEdges();
  }

  // Requirement: Active Connected Context Note for Terminals / Orchestrator
  createConnectedContextNote(termId) {
    const termNode = this.canvas.nodes.find(n => n.id === termId);
    if (!termNode) return;

    // Check if an existing note is already connected to this terminal
    const existingEdge = this.canvas.edges.find(e => 
      (e.from === termId || e.to === termId) &&
      this.canvas.nodes.some(n => n.id === (e.from === termId ? e.to : e.from) && n.type === "note")
    );
    if (existingEdge) {
      const existingNoteId = existingEdge.from === termId ? existingEdge.to : existingEdge.from;
      this.focusNode(existingNoteId);
      this.showToast(`Anotação de contexto já vinculada a "${termNode.title}".`);
      return;
    }

    const noteId = `note_ctx_${Date.now()}`;
    const noteX = Math.round(termNode.x + (termNode.width || 520) + 36);
    const noteY = Math.round(termNode.y);

    const respText = (termNode.responsibilities && termNode.responsibilities.length > 0)
      ? termNode.responsibilities.join(", ")
      : (termNode.is_orchestrator ? "Orquestrador Chefe (Formula & Delega)" : "Executor Técnico");

    const initialText = `🧠 [Contexto & Memória: ${termNode.title}]\n` +
      `• Papel Atribuído: ${respText}\n` +
      `• Missão Ativa: [Defina a meta deste agente]\n` +
      `• Regras & Restrições: [Padrões de projeto, diretrizes]\n` +
      `• Estado / Decisões: [Contexto persistente sempre ativo]`;

    const noteNode = {
      id: noteId,
      type: "note",
      x: noteX,
      y: noteY,
      width: 320,
      text: initialText,
      boundNodeId: termId
    };

    this.canvas.nodes.push(noteNode);
    this.renderNode(noteNode);

    // Create edge connecting terminal and context note
    const edgeId = `edge_ctx_${Date.now()}`;
    this.canvas.edges.push({
      id: edgeId,
      from: termId,
      to: noteId,
      style: "orchestrator",
      color: "#eab308"
    });

    this.canvas.renderEdges();
    this.canvas.selectNode(noteId);
    this.sidebar.updateNodeList(this.canvas.nodes);
    this.updateAllConnectionStatus();
    this.showToast(`🧠 Anotação de contexto criada e vinculada a "${termNode.title}"!`);
    this.triggerAutoSave();
  }

  syncNoteWithAgent(noteId) {
    const note = this.canvas.nodes.find(n => n.id === noteId);
    if (!note) return;

    // Find connected terminal
    const edge = this.canvas.edges.find(e => e.from === noteId || e.to === noteId);
    if (!edge) {
      this.showToast("Esta anotação não está conectada a nenhum terminal.");
      return;
    }

    const termId = edge.from === noteId ? edge.to : edge.from;
    const termNode = this.canvas.nodes.find(n => n.id === termId);
    const termSession = this.termController.terminals[termId];

    if (termSession && termSession.ws && termSession.ws.readyState === WebSocket.OPEN) {
      const banner = `\r\n\x1b[38;2;245;158;11m╔═══════════════════════════════════════════════════════════════════════════════════════╗\x1b[0m\r\n` +
        `\x1b[38;2;245;158;11m║ 🧠 MEMÓRIA DE CONTEXTO VIVO SINCRONIZADA                                              ║\x1b[0m\r\n` +
        `\x1b[38;2;245;158;11m╚═══════════════════════════════════════════════════════════════════════════════════════╝\x1b[0m\r\n` +
        `\x1b[33m${note.text}\x1b[0m\r\n` +
        `\x1b[38;2;16;185;129m[OK] Contexto gravado e ativo na memória do agente.\x1b[0m\r\n\r\n`;
      termSession.term?.write(banner);
      this.triggerCommunicationVisual(noteId, [termId], 2500);
      this.showToast(`🧠 Contexto sincronizado com "${termNode?.title || 'Terminal'}"!`);
    } else {
      this.showToast(`Terminal "${termNode?.title || 'Terminal'}" não está conectado ao WebSocket.`);
    }
  }

  createDiagramNodeAt(x, y) {
    const title = prompt("Título do bloco de arquitetura:", "Novo Serviço");
    if (!title) return;

    const id = `diag_${Date.now()}`;
    const node = {
      id: id,
      type: "diagram",
      x: Math.round(x),
      y: Math.round(y),
      width: 150,
      height: 90,
      title: title,
      subtitle: "Componente",
      borderColor: "#3b82f6",
      bgStyle: "solid"
    };

    this.canvas.nodes.push(node);
    this.renderNode(node);
    this.canvas.selectNode(id);
    this.sidebar.updateNodeList(this.canvas.nodes);
    this.showToast("Bloco de diagrama criado.");
    this.triggerAutoSave();
  }

  createNoteNodeAt(x, y) {
    const text = prompt("Conteúdo da nota ou documentação:", "Instruções do projeto...");
    if (!text) return;

    const id = `note_${Date.now()}`;
    const node = {
      id: id,
      type: "note",
      x: Math.round(x),
      y: Math.round(y),
      width: 260,
      text: text
    };

    this.canvas.nodes.push(node);
    this.renderNode(node);
    this.canvas.selectNode(id);
    this.sidebar.updateNodeList(this.canvas.nodes);
    this.showToast("Nota criada.");
    this.triggerAutoSave();
  }

  createTextAnnotationAt(x, y) {
    const title = prompt("Texto do título no canvas:", "Novo Módulo");
    if (!title) return;

    const id = `text_${Date.now()}`;
    const node = {
      id: id,
      type: "text",
      x: Math.round(x),
      y: Math.round(y),
      title: title
    };

    this.canvas.nodes.push(node);
    this.renderNode(node);
    this.sidebar.updateNodeList(this.canvas.nodes);
    this.showToast("Texto anotado.");
    this.triggerAutoSave();
  }

  createPortalNodeAt(x, y) {
    const url = prompt("URL do Portal Web:", "https://news.ycombinator.com");
    if (!url) return;

    const id = `portal_${Date.now()}`;
    const node = {
      id: id,
      type: "portal",
      x: Math.round(x),
      y: Math.round(y),
      width: 480,
      height: 340,
      url: url
    };

    this.canvas.nodes.push(node);
    this.renderNode(node);
    this.sidebar.updateNodeList(this.canvas.nodes);
    this.showToast("Portal criado.");
    this.triggerAutoSave();
  }

  // Requirement 5: Designate window as Orchestrator / Chefe
  async toggleOrchestrator(nodeId) {
    const node = this.canvas.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Toggle
    const newState = !node.is_orchestrator;
    
    // Clear other orchestrators if activating this one
    if (newState) {
      this.canvas.nodes.forEach(n => {
        if (n.id !== nodeId && n.is_orchestrator) {
          n.is_orchestrator = false;
          const el = document.getElementById(n.id);
          if (el) el.classList.remove("is-orchestrator");
        }
      });
    }

    node.is_orchestrator = newState;
    const nodeEl = document.getElementById(nodeId);
    if (nodeEl) {
      nodeEl.classList.toggle("is-orchestrator", newState);
    }

    // Update server state
    await fetch("/api/terminal/orchestrator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ node_id: nodeId, is_orchestrator: newState })
    });

    // Re-render edges to highlight connections from orchestrator
    this.canvas.edges.forEach(e => {
      if (e.from === nodeId) {
        e.style = newState ? "orchestrator" : "dashed";
        e.color = newState ? "#eab308" : "#38bdf8";
      }
    });
    this.canvas.renderEdges();
    this.sidebar.updateNodeList(this.canvas.nodes);
    this.updateAllConnectionStatus();
    this.showToast(newState ? `👑 "${node.title}" definido como CHEFE / Orquestrador.` : `Função de Chefe removida de "${node.title}".`);

    this.showToast(newState ? `👑 "${node.title}" agora é o CHEFE / ORQUESTRADOR!` : `Função de orquestrador removida.`);
    this.triggerAutoSave();
  }

  // Requirement 4: Broadcast output to connected target nodes
  async broadcastFromNode(sourceId) {
    const connectedEdges = this.canvas.edges.filter(e => e.from === sourceId);
    if (connectedEdges.length === 0) {
      this.showToast("Este nó não possui conexões de saída. Use a ferramenta Conectar primeiro.");
      return;
    }

    const targetIds = connectedEdges.map(e => e.to);
    this.triggerCommunicationVisual(sourceId, targetIds, 3500);
    try {
      const res = await fetch("/api/context/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: sourceId, target_ids: targetIds })
      });
      const data = await res.json();
      this.showToast(`Contexto e saída transmitidos para ${targetIds.length} nós conectados!`);
    } catch (e) {
      this.showToast("Erro ao transmitir contexto.");
    }
  }

  _bindOrchestratorModal() {
    const overlay = document.getElementById("orchestrator-modal-overlay");
    const btnCancel = document.getElementById("btn-orch-cancel");
    const btnSend = document.getElementById("btn-orch-send");
    const selectAll = document.getElementById("orch-select-all");
    const selectNone = document.getElementById("orch-select-none");
    const promptInput = document.getElementById("orch-modal-prompt");

    overlay?.addEventListener("click", (e) => {
      if (e.target === overlay) this.closeOrchestratorModal();
    });

    btnCancel?.addEventListener("click", () => this.closeOrchestratorModal());
    btnSend?.addEventListener("click", () => this.submitOrchestratorDispatch());

    selectAll?.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll("#orch-target-list input[type='checkbox']:not([disabled])").forEach(cb => cb.checked = true);
    });

    selectNone?.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll("#orch-target-list input[type='checkbox']:not([disabled])").forEach(cb => cb.checked = false);
    });

    promptInput?.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        this.submitOrchestratorDispatch();
      } else if (e.key === "Escape") {
        this.closeOrchestratorModal();
      }
    });
  }

  // Requirement 5: Orchestration Loop across connected nodes
  async triggerOrchestrationLoop() {
    const orchestratorNode = this.canvas.nodes.find(n => n.is_orchestrator);
    if (!orchestratorNode) {
      this.showToast("Nenhum nó definido como CHEFE. Clique no ícone 👑 de um terminal para defini-lo.");
      return;
    }
    this.openOrchestratorModal(orchestratorNode.id);
  }

  openOrchestratorModal(nodeId) {
    const node = this.canvas.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Support bidirectional connections to Chefe, excluding the Chefe itself and note nodes
    const connectedIds = this.canvas.edges
      .filter(e => e.from === nodeId || e.to === nodeId)
      .map(e => (e.from === nodeId ? e.to : e.from))
      .filter(id => id !== nodeId);

    const uniqueTargetIds = [...new Set(connectedIds)];
    const validTargetNodes = uniqueTargetIds
      .map(id => this.canvas.nodes.find(n => n.id === id))
      .filter(n => n && n.type !== "note");

    if (validTargetNodes.length === 0) {
      this.showToast("Este nó não possui outros nós subordinados ou observadores conectados.");
      return;
    }

    this.activeOrchestratorNodeId = nodeId;
    const overlay = document.getElementById("orchestrator-modal-overlay");
    const titleEl = document.getElementById("orch-modal-title");
    const listEl = document.getElementById("orch-target-list");
    const promptInput = document.getElementById("orch-modal-prompt");

    if (titleEl) {
      titleEl.textContent = `Instrução do Chefe: ${node.title}`;
    }

    if (listEl) {
      listEl.innerHTML = "";
      validTargetNodes.forEach(targetNode => {
        const targetId = targetNode.id;
        const isObserver = targetNode.is_controllable === false;
        const item = document.createElement("div");
        item.className = `orch-target-item ${isObserver ? 'is-observer-item' : ''}`;
        item.innerHTML = `
          <input type="checkbox" id="orch_target_${targetId}" value="${targetId}" ${isObserver ? 'disabled' : 'checked'}>
          <label for="orch_target_${targetId}" class="orch-target-label">
            <span style="font-weight: 500;">${targetNode.title || (targetNode.type === 'portal' ? 'Navegador Web' : 'Terminal')}</span>
            ${isObserver 
              ? `<span class="orch-target-role observer-tag" title="Este nó atua como sensor/olhos. A IA usará seu status para entender a situação, sem enviar comandos para ele.">👁️ Observador (Somente Leitura)</span>`
              : `<span class="orch-target-role controllable-tag">⚡ ${targetNode.preset || 'Executor'}</span>`
            }
          </label>
        `;
        listEl.appendChild(item);
      });
    }

    if (promptInput) {
      promptInput.value = "";
    }

    if (overlay) {
      overlay.classList.add("active");
      setTimeout(() => promptInput?.focus(), 80);
    }
  }

  closeOrchestratorModal() {
    const overlay = document.getElementById("orchestrator-modal-overlay");
    if (overlay) overlay.classList.remove("active");
  }

  async submitOrchestratorDispatch() {
    if (this._isDispatchingOrchestrator) {
      console.warn("[Maestri] Disparo de orquestração já em andamento, ignorando clique duplicado.");
      return;
    }

    const promptInput = document.getElementById("orch-modal-prompt");
    const promptText = promptInput?.value?.trim() || "";
    if (!promptText) {
      this.showToast("Digite o objetivo ou missão antes de formular as ordens.");
      promptInput?.focus();
      return;
    }

    const selectedCheckboxes = document.querySelectorAll("#orch-target-list input[type='checkbox']:checked");
    const selectedTargets = Array.from(selectedCheckboxes)
      .map(cb => cb.value)
      .filter(id => {
        const n = this.canvas.nodes.find(node => node.id === id);
        return n && n.is_controllable !== false;
      });

    if (selectedTargets.length === 0) {
      this.showToast("Selecione pelo menos um agente subordinado.");
      return;
    }

    // Set concurrency lock and disable submit button to prevent double execution
    this._isDispatchingOrchestrator = true;
    const btnSend = document.getElementById("btn-orch-send");
    if (btnSend) {
      btnSend.disabled = true;
      btnSend.textContent = "⏳ Despachando ordens...";
    }

    const orchId = this.activeOrchestratorNodeId;
    this.closeOrchestratorModal();
    this.showToast(`👑 Chefe pensando com a IA e formulando ordens...`);
    
    // 1. Immediately activate vibrant Dispatching state (Chefe glow amber + edge flow)
    this.setOrchestrationVisualState(orchId, selectedTargets, "dispatching");

    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          orchestrator_node_id: orchId,
          target_node_ids: selectedTargets
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === "ok") {
        const count = data.delivered_to || selectedTargets.length;
        this.showToast(`👑 Ordens despachadas para ${count} agente(s)! Subordinados em processamento ativo.`);

        // 2. Transition immediately into active Processing state (Subordinates glow green + green edge flow)
        this.setOrchestrationVisualState(orchId, selectedTargets, "processing");

        // Automatically update the connected context note on screen with the latest strategic plan!
        if (data.updated_context_note) {
          const connectedNoteEdge = this.canvas.edges.find(e => 
            (e.from === orchId || e.to === orchId) &&
            this.canvas.nodes.some(n => n.id === (e.from === orchId ? e.to : e.from) && n.type === "note")
          );
          if (connectedNoteEdge) {
            const noteId = connectedNoteEdge.from === orchId ? connectedNoteEdge.to : connectedNoteEdge.from;
            const noteObj = this.canvas.nodes.find(n => n.id === noteId);
            if (noteObj) {
              noteObj.text = data.updated_context_note;
              const noteEl = document.getElementById(`note_content_${noteId}`);
              if (noteEl) noteEl.innerText = data.updated_context_note;
              this.triggerAutoSave();
            }
          }
        }

        // Return to normal running state after processing finishes
        setTimeout(() => {
          this.setOrchestrationVisualState(orchId, selectedTargets, "idle");
        }, 5500);
      } else {
        const errMsg = data.message || "Orquestrador inativo ou indisponível";
        this.showToast(`⚠️ Orquestração Bloqueada: ${errMsg}`);
        this.setOrchestrationVisualState(orchId, selectedTargets, "idle");
      }
    } catch (e) {
      console.error("Erro na orquestração:", e);
      this.showToast("Erro ao acionar formulação do orquestrador.");
      this.setOrchestrationVisualState(orchId, selectedTargets, "idle");
    } finally {
      // Cooldown timer to prevent accidental double-submits
      setTimeout(() => {
        this._isDispatchingOrchestrator = false;
        if (btnSend) {
          btnSend.disabled = false;
          btnSend.textContent = "⚡ Formular e Despachar Ordens com IA";
        }
      }, 1500);
    }
  }

  dispatchFromOrchestrator(nodeId) {
    this.openOrchestratorModal(nodeId);
  }

  deleteEdge(edgeId) {
    this.canvas.edges = this.canvas.edges.filter(e => e.id !== edgeId);
    this.canvas.renderEdges();
    this.updateAllConnectionStatus();
    this.showToast("Conexão removida.");
    this.triggerAutoSave();
  }

  disconnectNode(nodeId) {
    const beforeCount = this.canvas.edges.length;
    this.canvas.edges = this.canvas.edges.filter(e => e.from !== nodeId && e.to !== nodeId);
    const removed = beforeCount - this.canvas.edges.length;
    this.canvas.renderEdges();
    this.canvas.clearSelection();
    this.updateAllConnectionStatus();
    this.showToast(removed > 0 ? `${removed} conexão(ões) removida(s).` : "Nenhuma conexão ativa neste nó.");
    this.triggerAutoSave();
  }

  startRenameNode(nodeId, event) {
    if (event) event.stopPropagation();
    const node = this.canvas.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const titleSpan = document.getElementById(`term_title_text_${nodeId}`);
    if (!titleSpan || titleSpan.querySelector("input")) return;

    const currentTitle = node.title || "Terminal";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "term-title-inline-input";
    input.value = currentTitle;

    titleSpan.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;
    const commitChange = () => {
      if (committed) return;
      committed = true;
      const newTitle = input.value.trim() || currentTitle;
      node.title = newTitle;

      const newSpan = document.createElement("span");
      newSpan.id = `term_title_text_${nodeId}`;
      newSpan.className = "term-title";
      newSpan.title = "Clique duas vezes para renomear";
      newSpan.textContent = newTitle;
      newSpan.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        this.startRenameNode(nodeId, e);
      });

      if (input.parentNode) {
        input.replaceWith(newSpan);
      }

      this.sidebar.updateNodeList(this.canvas.nodes);
      this.triggerAutoSave();
      this.showToast(`Nome alterado para "${newTitle}".`);
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitChange();
      } else if (e.key === "Escape") {
        input.value = currentTitle;
        commitChange();
      }
      e.stopPropagation();
    });

    input.addEventListener("blur", () => {
      commitChange();
    });

    input.addEventListener("mousedown", (e) => e.stopPropagation());
    input.addEventListener("click", (e) => e.stopPropagation());
  }

  // Dynamic Real-Time Orchestration States: 'dispatching' -> 'processing' -> 'idle'
  setOrchestrationVisualState(sourceId, targetIds, state = "idle") {
    const targets = Array.isArray(targetIds) ? targetIds : (targetIds ? [targetIds] : []);

    if (state === "dispatching") {
      // 1. Chefe Node: Glowing pulsating amber (Enviando ordem)
      if (sourceId) {
        const sourceEl = document.getElementById(sourceId);
        if (sourceEl) {
          sourceEl.classList.remove("node-processing-task");
          sourceEl.classList.add("node-dispatching-order");
        }
      }

      // 2. Subordinate Nodes: Receiving state
      targets.forEach(tid => {
        const el = document.getElementById(tid);
        if (el) {
          el.classList.remove("node-dispatching-order");
          el.classList.add("node-receiving");
        }
      });

      // 3. Edges: Flowing amber energy pulse
      this.canvas.edges.forEach(e => {
        if ((sourceId && e.from === sourceId && targets.includes(e.to)) || (!sourceId && targets.includes(e.to))) {
          e.visualState = "dispatching";
        }
      });
      this.canvas.renderEdges();

    } else if (state === "processing") {
      // 1. Chefe Node: Settles to normal orchestrator status
      if (sourceId) {
        const sourceEl = document.getElementById(sourceId);
        if (sourceEl) sourceEl.classList.remove("node-dispatching-order");
      }

      // 2. Subordinate Nodes: Vibrant pulsating emerald green (Executando ordem)
      targets.forEach(tid => {
        const el = document.getElementById(tid);
        if (el) {
          el.classList.remove("node-receiving", "node-dispatching-order");
          el.classList.add("node-processing-task");
        }
      });

      // 3. Edges: Flowing green data link
      this.canvas.edges.forEach(e => {
        if ((sourceId && e.from === sourceId && targets.includes(e.to)) || (!sourceId && targets.includes(e.to))) {
          e.visualState = "processing";
        }
      });
      this.canvas.renderEdges();

    } else {
      // Idle state: Clean all animations
      if (sourceId) {
        const sourceEl = document.getElementById(sourceId);
        if (sourceEl) sourceEl.classList.remove("node-dispatching-order", "node-transmitting");
      }
      targets.forEach(tid => {
        const el = document.getElementById(tid);
        if (el) el.classList.remove("node-receiving", "node-processing-task");
      });
      document.querySelectorAll(".node-dispatching-order, .node-processing-task, .node-transmitting, .node-receiving").forEach(el => {
        el.classList.remove("node-dispatching-order", "node-processing-task", "node-transmitting", "node-receiving");
      });

      this.canvas.edges.forEach(e => {
        delete e.visualState;
        delete e.isCommunicating;
      });
      this.canvas.renderEdges();
    }
  }

  handleTerminalDispatchEvent(orchId) {
    const targets = this.canvas.edges
      .filter(e => e.from === orchId || e.to === orchId)
      .map(e => (e.from === orchId ? e.to : e.from));
    this.setOrchestrationVisualState(orchId, targets, "dispatching");
    setTimeout(() => {
      this.setOrchestrationVisualState(orchId, targets, "processing");
      setTimeout(() => this.setOrchestrationVisualState(orchId, targets, "idle"), 4500);
    }, 1200);
  }

  handleTerminalProcessingEvent(nodeId) {
    const nodeEl = document.getElementById(nodeId);
    if (nodeEl) {
      nodeEl.classList.add("node-processing-task");
      // Find connecting edge to orchestrator
      const orchEdge = this.canvas.edges.find(e => e.from === nodeId || e.to === nodeId);
      if (orchEdge) {
        orchEdge.visualState = "processing";
        this.canvas.renderEdges();
      }

      if (this._procTimeoutMap?.[nodeId]) clearTimeout(this._procTimeoutMap[nodeId]);
      this._procTimeoutMap = this._procTimeoutMap || {};
      this._procTimeoutMap[nodeId] = setTimeout(() => {
        nodeEl?.classList.remove("node-processing-task");
        if (orchEdge) {
          delete orchEdge.visualState;
          this.canvas.renderEdges();
        }
      }, 3500);
    }
  }

  triggerCommunicationVisual(sourceId, targetIds, durationMs = 3500) {
    this.setOrchestrationVisualState(sourceId, targetIds, "dispatching");
    setTimeout(() => {
      this.setOrchestrationVisualState(sourceId, targetIds, "processing");
      setTimeout(() => {
        this.setOrchestrationVisualState(sourceId, targetIds, "idle");
      }, Math.max(1200, durationMs - 1200));
    }, 1200);
  }

  updateAllConnectionStatus() {
    if (!this.canvas || !this.canvas.nodes) return;
    this.canvas.nodes.forEach(node => {
      const outgoing = this.canvas.edges.filter(e => e.from === node.id).length;
      const incoming = this.canvas.edges.filter(e => e.to === node.id).length;
      const total = outgoing + incoming;
      const el = document.getElementById(`term_conn_status_${node.id}`);
      if (el) {
        if (total === 0) {
          el.innerHTML = `<span style="color: #64748b;">● Desconectado</span>`;
        } else {
          el.innerHTML = `<span style="color: #10b981;">● ${total} conexão(ões) (${outgoing} saída, ${incoming} entrada)</span>`;
        }
      }
      const dispatchBtn = document.querySelector(`#${node.id} .orch-dispatch-btn`);
      if (dispatchBtn) {
        dispatchBtn.classList.toggle("hidden", !node.is_orchestrator);
      }
    });
  }

  startConnect(sourceId) {
    this.canvas.isConnecting = true;
    this.canvas.connectSourceId = sourceId;
    this.canvas.container.classList.add("connecting");
    document.querySelectorAll(".connecting-source").forEach(el => el.classList.remove("connecting-source"));
    const sourceEl = document.getElementById(sourceId);
    if (sourceEl) sourceEl.classList.add("connecting-source");
    this.showToast("Clique em qualquer parte do nó de destino para conectar.");
  }

  restartTerminal(nodeId) {
    const node = this.canvas.nodes.find(n => n.id === nodeId);
    if (!node) return;
    this.termController.destroy(nodeId);
    const termBody = document.getElementById(`term_body_${nodeId}`);
    if (termBody) {
      termBody.innerHTML = "";
      this.termController.mountTerminal(`term_body_${nodeId}`, node);
      this.showToast(`Terminal "${node.title}" reiniciado.`);
      setTimeout(() => this.updateAllConnectionStatus(), 100);
    }
  }

  duplicateNode(nodeId) {
    const original = this.canvas.nodes.find(n => n.id === nodeId);
    if (!original) return;

    const copy = JSON.parse(JSON.stringify(original));
    copy.id = `${original.type}_${Date.now()}`;
    copy.x += 40;
    copy.y += 40;
    copy.is_orchestrator = false;

    this.canvas.nodes.push(copy);
    this.renderNode(copy);
    this.sidebar.updateNodeList(this.canvas.nodes);
    this.showToast("Nó duplicado.");
    this.triggerAutoSave();
  }

  deleteNode(nodeId) {
    const el = document.getElementById(nodeId);
    if (el) el.remove();

    this.termController.destroy(nodeId);
    this.canvas.nodes = this.canvas.nodes.filter(n => n.id !== nodeId);
    this.canvas.edges = this.canvas.edges.filter(e => e.from !== nodeId && e.to !== nodeId);
    this.canvas.renderEdges();
    this.canvas.clearSelection();
    this.sidebar.updateNodeList(this.canvas.nodes);
    this.updateAllConnectionStatus();

    this.showToast("Nó excluído.");
    this.triggerAutoSave();
  }

  focusNode(nodeId) {
    const target = this.canvas.nodes.find(n => n.id === nodeId);
    if (target) {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      this.canvas.panX = centerX - (target.x + 100) * this.canvas.zoom;
      this.canvas.panY = centerY - (target.y + 80) * this.canvas.zoom;
      this.canvas.updateTransform();
      this.canvas.selectNode(target.id);
    }
  }

  updateNoteText(nodeId, text) {
    const node = this.canvas.nodes.find(n => n.id === nodeId);
    if (node) {
      node.text = text;
      this.triggerAutoSave();
    }
  }

  updatePortalUrl(nodeId, url) {
    const node = this.canvas.nodes.find(n => n.id === nodeId);
    if (node) {
      node.url = url;
      const frame = document.querySelector(`#${nodeId} .portal-frame`);
      if (frame) frame.src = url;
      this.triggerAutoSave();
    }
  }

  exportJson() {
    const data = this.serializeState();
    const str = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const dlAnchor = document.createElement("a");
    dlAnchor.setAttribute("href", str);
    dlAnchor.setAttribute("download", `${data.meta?.name || "maestri"}_workspace.json`);
    dlAnchor.click();
    this.showToast("Arquivo JSON exportado!");
  }

  serializeState() {
    return {
      meta: {
        name: this.sidebar?.currentProjectName || "Meu Projeto",
        slug: this.currentProjectSlug || this.currentData?.meta?.slug || null,
        version: "2.0.0",
        theme: "dark",
        orchestrator_node_id: this.canvas.nodes.find(n => n.is_orchestrator)?.id || null,
        working_directory: this.currentWorkingDirectory || null
      },
      groups: this.sidebar?.groups || [],
      canvas: {
        viewport: {
          x: this.canvas.panX,
          y: this.canvas.panY,
          zoom: this.canvas.zoom
        },
        nodes: this.canvas.nodes,
        edges: this.canvas.edges
      }
    };
  }

  updateWorkspaceDirectoryUI(dirPath) {
    const labelEl = document.getElementById("workspace-dir-label");
    const boxEl = document.getElementById("workspace-dir-box");
    if (!labelEl) return;
    if (!dirPath) {
      labelEl.textContent = "Selecionar Pasta";
      if (boxEl) boxEl.title = "Clique para selecionar a pasta de trabalho acessível pelas IAs e terminais";
    } else {
      const rawName = dirPath.split(/[\\/]/).filter(Boolean).pop() || dirPath;
      // Strip any emojis or leading folder icons so only the crisp SVG folder shows
      const cleanName = rawName.replace(/^[\s\p{Emoji}\p{Extended_Pictographic}📁📂]+/u, '').trim();
      labelEl.textContent = cleanName;
      if (boxEl) boxEl.title = `Pasta de trabalho ativa: ${dirPath}\nAs IAs e terminais editam e consultam arquivos nesta pasta.`;
    }
  }

  async setWorkspaceDirectory(dirPath) {
    try {
      const res = await fetch("/api/workspace/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: dirPath })
      });
      const data = await res.json();
      if (data.status === "ok") {
        this.currentWorkingDirectory = data.path;
        this.updateWorkspaceDirectoryUI(data.path);
        const cleanName = (data.folder_name || "").replace(/^[📁📂\s]+/, '').trim();
        this.showToast(`📁 Pasta de trabalho: "${cleanName}". IAs e terminais agora têm acesso direto!`);

        // Update prefill in modal
        const cwdInput = document.getElementById("input-term-cwd");
        if (cwdInput) cwdInput.value = data.path;

        // Update cwd pill for all terminals
        this.canvas.nodes.forEach(node => {
          if (node.type === "terminal") {
            node.cwd = data.path;
            const cwdPill = document.querySelector(`#${node.id} .term-cwd-pill`);
            if (cwdPill) {
              const folderIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 3px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
              cwdPill.innerHTML = `${folderIcon}${cleanName}`;
              cwdPill.title = data.path;
            }
          }
        });
        this.triggerAutoSave();
      }
    } catch (e) {
      this.showToast("Erro ao definir pasta de trabalho.");
    }
  }

  async saveStateImmediately() {
    const data = this.serializeState();
    try {
      await fetch("/api/workspace/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      this.showToast("Projeto e nós salvos com sucesso!");
    } catch (e) {
      this.showToast("Erro ao salvar projeto.");
    }
  }

  triggerAutoSave() {
    if (window.__isSwitchingProject || this.isSwitchingProject) return;
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(async () => {
      if (window.__isSwitchingProject || this.isSwitchingProject) return;
      const data = this.serializeState();
      try {
        await fetch("/api/workspace/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
      } catch (e) {
        console.warn("Auto-save failed:", e);
      }
    }, 600);
  }

  showToast(message) {
    let toast = document.getElementById("toast-notification");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast-notification";
      toast.className = "toast-msg";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2800);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.MaestriApp = new MaestriApplication();
  window.MaestriApp.init();
});
