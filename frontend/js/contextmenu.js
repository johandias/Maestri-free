/**
 * Context Menu Controller for Maestri Desktop (v2.0)
 * Handles right-click contextual menus for:
 * 1. Terminal / Agent sessions (Paste, Copy, Clear, Restart, Rename, Orchestrator, Connect, Delete)
 * 2. Canvas Nodes (Rename, Orchestrator, Connect, Broadcast, Duplicate, Delete)
 * 3. Infinite Canvas Background (New Terminal here, New Antigravity here, Delimit area, New Block, New Note, Set Folder, Fit View)
 */

class MaestriContextMenu {
  constructor() {
    this.menuEl = null;
    this.activeTarget = null;
    this._init();
  }

  _init() {
    this.menuEl = document.createElement("div");
    this.menuEl.id = "custom-context-menu";
    this.menuEl.className = "custom-context-menu";
    this.menuEl.style.display = "none";
    document.body.appendChild(this.menuEl);

    // Close menu on click anywhere outside, escape key, or window resize
    window.addEventListener("click", () => this.hide());
    window.addEventListener("resize", () => this.hide());
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.hide();
    });
    document.addEventListener("mousedown", (e) => {
      if (this.menuEl && this.menuEl.style.display !== "none" && !this.menuEl.contains(e.target)) {
        this.hide();
      }
    });

    // Requirement: Native Desktop App feel - intercept right click everywhere and show custom frosted menu
    window.addEventListener("contextmenu", (e) => {
      if (!e.defaultPrevented) {
        e.preventDefault();
        this.showForCanvas(e);
      }
    }, false);
  }

  show(e, items) {
    e.preventDefault();
    this.menuEl.innerHTML = "";

    items.forEach(item => {
      if (item.type === "divider") {
        const div = document.createElement("div");
        div.className = "context-menu-divider";
        this.menuEl.appendChild(div);
        return;
      }

      const itemEl = document.createElement("div");
      itemEl.className = `context-menu-item ${item.danger ? 'danger' : ''}`;
      itemEl.innerHTML = `
        <span class="menu-icon">${item.icon || ''}</span>
        <span class="menu-label">${item.label}</span>
        ${item.shortcut ? `<span class="menu-shortcut">${item.shortcut}</span>` : ''}
      `;

      itemEl.addEventListener("click", (evt) => {
        evt.stopPropagation();
        this.hide();
        if (typeof item.action === "function") {
          item.action();
        }
      });

      this.menuEl.appendChild(itemEl);
    });

    this.menuEl.style.display = "flex";

    // Smart position clamping to stay within viewport
    const menuWidth = 230;
    const menuHeight = this.menuEl.offsetHeight || 260;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) x = Math.max(10, window.innerWidth - menuWidth - 12);
    if (y + menuHeight > window.innerHeight) y = Math.max(10, window.innerHeight - menuHeight - 12);

    this.menuEl.style.left = `${x}px`;
    this.menuEl.style.top = `${y}px`;
  }

  hide() {
    if (this.menuEl) {
      this.menuEl.style.display = "none";
    }
  }

  showForTerminal(e, nodeId) {
    const app = window.MaestriApp;
    if (!app) return;
    const node = app.canvas.nodes.find(n => n.id === nodeId);
    if (!node) return;

    app.canvas.selectNode(nodeId);
    const termSession = app.termController.terminals[nodeId];
    const term = termSession?.term;
    if (term) {
      try { term.focus(); } catch (fErr) {}
    }
    const ws = termSession?.ws;
    const sel = term ? term.getSelection() : "";
    const isOrch = node.is_orchestrator;
    const isObserver = node.is_controllable === false;

    const items = [
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`,
        label: "🧠 Criar Anotação de Contexto Vinculada",
        action: () => app.createConnectedContextNote(nodeId)
      },
      { type: "divider" },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path></svg>`,
        label: "Colar Texto",
        shortcut: "Ctrl+V",
        action: async () => {
          try {
            const clipText = await navigator.clipboard.readText();
            if (clipText && ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "input", data: clipText }));
            }
          } catch (err) {
            app.showToast("Permissão de colar negada.");
          }
        }
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>`,
        label: sel ? `Copiar Seleção ("${sel.slice(0, 15)}...")` : "Copiar Seleção",
        shortcut: "Ctrl+C",
        action: async () => {
          if (sel) {
            try {
              await navigator.clipboard.writeText(sel);
              app.showToast("Texto copiado!");
            } catch (err) {}
          } else {
            app.showToast("Nenhum texto selecionado para copiar.");
          }
        }
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`,
        label: "Limpar Tela",
        action: () => {
          if (term) term.clear();
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "input", data: "cls\r" }));
          }
        }
      },
      { type: "divider" },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="${isOrch ? '#eab308' : 'none'}" stroke="${isOrch ? '#eab308' : 'currentColor'}" stroke-width="2"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"></path></svg>`,
        label: isOrch ? "Remover Função de Chefe" : "👑 Definir como Chefe / Orquestrador",
        action: () => app.toggleOrchestrator(nodeId)
      },
      {
        icon: isObserver
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
        label: isObserver ? "⚡ Ativar Modo Controlado (Executa Ordens)" : "👁️ Alternar para Apenas Observador (Somente Leitura)",
        action: () => app.toggleControllable(nodeId)
      },
      ...(isOrch ? [{
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
        label: "⚡ Formular e Despachar Ordens com IA",
        action: () => app.openOrchestratorModal(nodeId)
      }] : []),
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
        label: "⚙️ Configurações do Terminal...",
        action: () => app.openEditTerminalModal(nodeId)
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg>`,
        label: "Renomear Terminal",
        action: () => app.startRenameNode(nodeId)
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
        label: "Conectar a Outro Nó",
        action: () => app.startConnect(nodeId)
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>`,
        label: "Compartilhar Saída com Conectados",
        action: () => app.broadcastFromNode(nodeId)
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><polyline points="21 3 21 8 16 8"></polyline></svg>`,
        label: "Reiniciar Terminal",
        action: () => app.restartTerminal(nodeId)
      },
      { type: "divider" },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
        label: "Fechar / Excluir Terminal",
        danger: true,
        action: () => app.deleteNode(nodeId)
      }
    ];

    this.show(e, items);
  }

  showForNode(e, nodeId) {
    const app = window.MaestriApp;
    if (!app) return;
    const node = app.canvas.nodes.find(n => n.id === nodeId);
    if (!node) return;

    app.canvas.selectNode(nodeId);

    if (node.type === "terminal") {
      this.showForTerminal(e, nodeId);
      return;
    }

    if (node.type === "note") {
      const items = [
        {
          icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
          label: "⚡ Sincronizar Contexto com Agente",
          action: () => app.syncNoteWithAgent(nodeId)
        },
        {
          icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
          label: "Conectar a Terminal / Agente",
          action: () => app.startConnect(nodeId)
        },
        {
          icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="2" x2="12" y2="12"></line><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path></svg>`,
          label: "Desconectar Ligações",
          action: () => app.disconnectNode(nodeId)
        },
        { type: "divider" },
        {
          icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
          label: "Excluir Anotação",
          danger: true,
          action: () => app.deleteNode(nodeId)
        }
      ];
      this.show(e, items);
      return;
    }

    const items = [
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
        label: "Conectar a Outro Nó",
        action: () => app.startConnect(nodeId)
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="2" x2="12" y2="12"></line><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path></svg>`,
        label: "Desconectar Ligações",
        action: () => app.disconnectNode(nodeId)
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
        label: "Duplicar Bloco",
        action: () => app.duplicateNode(nodeId)
      },
      { type: "divider" },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
        label: "Excluir",
        danger: true,
        action: () => app.deleteNode(nodeId)
      }
    ];

    this.show(e, items);
  }

  showForCanvas(e) {
    const app = window.MaestriApp;
    if (!app) return;

    // Canvas world coordinates
    const canvasX = Math.round((e.clientX - app.canvas.panX) / app.canvas.zoom);
    const canvasY = Math.round((e.clientY - app.canvas.panY) / app.canvas.zoom);

    const items = [
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`,
        label: "Novo Terminal Aqui",
        shortcut: "Ctrl+T",
        action: () => app.openTerminalModalAt(canvasX, canvasY)
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>`,
        label: "Novo Agente Antigravity Aqui",
        action: () => {
          app.createTerminalNode({
            title: "Antigravity",
            command: "powershell.exe",
            preset: "antigravity",
            x: canvasX,
            y: canvasY,
            width: 540,
            height: 340,
            color: "#a855f7"
          });
        }
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"></rect></svg>`,
        label: "Delimitar Área de Terminal",
        action: () => {
          app.setToolActive("terminal");
          app.canvas.setPendingPlacement("terminal");
          app.showToast("Clique e arraste para desenhar o terminal.");
        }
      },
      { type: "divider" },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect></svg>`,
        label: "Novo Bloco de Diagrama",
        action: () => app.createDiagramNodeAt(canvasX, canvasY)
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M14 2H6a2 2 0 0 1-2 2v16a2 2 0 0 1 2 2h12a2 2 0 0 1 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`,
        label: "Nova Nota / Documentação",
        action: () => app.createNoteNodeAt(canvasX, canvasY)
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
        label: "Selecionar Pasta de Trabalho",
        action: () => document.getElementById("btn-select-workspace-dir")?.click()
      },
      { type: "divider" },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`,
        label: "Enquadrar Tela (Fit View)",
        action: () => app.canvas.fitView()
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>`,
        label: "Limpar Nós do Canvas",
        danger: true,
        action: () => document.getElementById("btn-reset-workspace")?.click()
      }
    ];

    this.show(e, items);
  }
}

window.MaestriContextMenu = MaestriContextMenu;
