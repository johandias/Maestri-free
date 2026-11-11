/**
 * Sidebar Controller for Maestri Desktop (v3.0)
 * Manages hamburger toggle, workspace list with search, project selection,
 * dynamic counters, and node inventory with filtering.
 */

class MaestriSidebar {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.searchInput = document.getElementById("sidebar-filter-input") || document.getElementById("sidebar-search-input");
    this.treeContainer = document.getElementById("sidebar-tree-container");
    this.workspacesListEl = document.getElementById("sidebar-workspaces-list");
    this.currentProjectName = "maestri-free";
    this.currentProjectSlug = "maestri-free";
    this.workspaces = [
      { name: "Campanhas Sistema", slug: "campanhas-sistema", icon: "📊", badge: "2", badgeType: "badge-red" },
      { name: "maestri-free", slug: "maestri-free", icon: "⚡", badge: "4", badgeType: "badge-orange", active: true },
      { name: "criador-slides-ppt", slug: "criador-slides-ppt", icon: "📑", badge: "1", badgeType: "badge-orange" }
    ];
    this.groups = [];
    this.isCollapsed = true; // drawer retrátil fechado por padrão
    this._initEvents();
    this._loadWorkspaces();
  }

  _initEvents() {
    // Official Maestri Hamburger Button (top-left nav)
    const btnHamburger = document.getElementById("btn-sidebar-hamburger");
    if (btnHamburger) {
      btnHamburger.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleCollapse();
      });
    }

    // Close button inside sidebar drawer
    const btnClose = document.getElementById("btn-close-sidebar");
    if (btnClose) {
      btnClose.addEventListener("click", (e) => {
        e.stopPropagation();
        this.collapse();
      });
    }

    // Toggle button legacy support
    const btnToggle = document.getElementById("btn-toggle-sidebar");
    if (btnToggle) {
      btnToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleCollapse();
      });
    }

    // Translucent Top-Left Workspace Pill
    const pill = document.getElementById("current-workspace-pill");
    if (pill) {
      pill.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleCollapse();
      });
    }

    // Close on Escape key
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.isCollapsed) {
        this.collapse();
      }
    });

    // Close drawer when clicking outside on canvas
    document.addEventListener("click", (e) => {
      if (!this.isCollapsed && this.container && !this.container.contains(e.target) && !e.target.closest("#top-left-nav")) {
        this.collapse();
      }
    });

    // Search / Filter input with debounce
    if (this.searchInput) {
      let debounceTimer = null;
      this.searchInput.addEventListener("input", (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.filterItems(e.target.value.toLowerCase().trim());
        }, 100);
      });
    }

    // New workspace button (+)
    const btnNewWs = document.getElementById("btn-new-workspace-plus") || document.getElementById("btn-sidebar-new-project");
    if (btnNewWs) {
      btnNewWs.addEventListener("click", (e) => {
        e.stopPropagation();
        if (window.MaestriProjects) {
          window.MaestriProjects.openWizard();
        }
      });
    }

    // Wire initial workspace items in sidebar
    this._bindWorkspaceItems();

    // Quick creation buttons in sidebar footer
    const btnAddTerm = document.getElementById("btn-sidebar-add-term");
    if (btnAddTerm) {
      btnAddTerm.addEventListener("click", () => {
        if (window.MaestriApp) {
          window.MaestriApp.setToolActive("terminal");
          window.MaestriApp.canvas.setPendingPlacement("terminal");
          window.MaestriApp.showToast("Clique e arraste no canvas para delimitar a área do novo terminal.");
          this.collapse();
        }
      });
    }

    const btnAddDiag = document.getElementById("btn-sidebar-add-diag");
    if (btnAddDiag) {
      btnAddDiag.addEventListener("click", () => {
        if (window.MaestriApp) {
          window.MaestriApp.canvas.setPendingPlacement("diagram");
          this.collapse();
        }
      });
    }

    // Listen for workspace changes from other components
    window.addEventListener("maestri:workspace-changed", (e) => {
      if (e.detail && e.detail.workspace) {
        this.setProjectName(e.detail.workspace.name, e.detail.workspace.slug);
        this._updateCounters(e.detail.workspace);
      }
    });
  }

  _bindWorkspaceItems() {
    if (!this.workspacesListEl) return;
    this.workspacesListEl.querySelectorAll(".workspace-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const slug = item.dataset.slug;
        const name = item.dataset.name;
        this.selectWorkspace(slug, name);
      });
    });
  }

  selectWorkspace(slug, name) {
    this.currentProjectSlug = slug;
    this.currentProjectName = name;
    
    // Highlight in list
    if (this.workspacesListEl) {
      this.workspacesListEl.querySelectorAll(".workspace-item").forEach(el => {
        el.classList.toggle("active", el.dataset.slug === slug);
      });
    }

    // Update pill
    const label = document.getElementById("current-project-label");
    if (label) label.textContent = name;

    // Switch project
    if (window.MaestriProjects) {
      window.MaestriProjects.switchProject(slug);
    }
  }

  async _loadWorkspaces() {
    try {
      const res = await fetch("/api/workspaces/list").catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (data.workspaces && data.workspaces.length > 0) {
          this.workspaces = data.workspaces;
          this._renderWorkspacesList();
        }
      }
    } catch (e) {
      console.warn("Failed to load workspaces list:", e);
    }
    this._renderWorkspacePill();
  }

  _renderWorkspacesList() {
    if (!this.workspacesListEl || !this.workspaces.length) return;
    this.workspacesListEl.innerHTML = "";
    this.workspaces.forEach(ws => {
      const item = document.createElement("div");
      const isActive = ws.slug === this.currentProjectSlug || ws.active;
      item.className = `workspace-item ${isActive ? 'active' : ''}`;
      item.dataset.slug = ws.slug;
      item.dataset.name = ws.name;
      item.innerHTML = `
        <div class="ws-item-left">
          <span class="ws-item-icon">${ws.icon || "📁"}</span>
          <span class="ws-item-name">${ws.name}</span>
        </div>
        <span class="workspace-item-badge ${ws.badgeType || (isActive ? 'badge-orange' : 'badge-red')}">${ws.badge || ws.node_count || 1}</span>
      `;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectWorkspace(ws.slug, ws.name);
      });
      this.workspacesListEl.appendChild(item);
    });
  }

  _renderWorkspacePill() {
    const pill = document.getElementById("current-workspace-pill");
    if (!pill) return;

    const activeWs = this.workspaces.find(w => w.slug === this.currentProjectSlug) || this.workspaces[1] || this.workspaces[0];
    if (activeWs) {
      pill.innerHTML = `
        <span class="ws-pill-icon">${activeWs.icon || "📁"}</span>
        <span class="ws-pill-name" id="current-project-label">${activeWs.name}</span>
        <span class="ws-pill-badge">${activeWs.badge || activeWs.node_count || 4}</span>
      `;
      pill.title = `${activeWs.name} • Espaço de Trabalho Ativo`;
    }
  }

  _updateCounters(workspace) {
    const pill = document.getElementById("current-workspace-pill");
    if (pill && workspace) {
      const badgeEl = pill.querySelector(".ws-pill-badge");
      if (badgeEl) {
        badgeEl.textContent = workspace.node_count || 4;
      }
      pill.title = `${workspace.name} • Espaço de Trabalho Ativo`;
    }
  }

  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
    if (this.container) {
      this.container.classList.toggle("collapsed", this.isCollapsed);
    }

    const btnHamburger = document.getElementById("btn-sidebar-hamburger");
    if (btnHamburger) {
      btnHamburger.classList.toggle("open", !this.isCollapsed);
    }

    localStorage.setItem("maestri_sidebar_collapsed", this.isCollapsed.toString());
  }

  collapse() {
    this.isCollapsed = true;
    if (this.container) {
      this.container.classList.add("collapsed");
    }
    const btnHamburger = document.getElementById("btn-sidebar-hamburger");
    if (btnHamburger) {
      btnHamburger.classList.remove("open");
    }
    localStorage.setItem("maestri_sidebar_collapsed", "true");
  }

  expand() {
    this.isCollapsed = false;
    if (this.container) {
      this.container.classList.remove("collapsed");
    }
    const btnHamburger = document.getElementById("btn-sidebar-hamburger");
    if (btnHamburger) {
      btnHamburger.classList.add("open");
    }
    localStorage.setItem("maestri_sidebar_collapsed", "false");
  }

  openProjectPicker() {
    if (window.MaestriProjects) {
      window.MaestriProjects.openBrowser();
    }
  }

  setProjectName(name, slug = null) {
    this.currentProjectName = name || "Meu Projeto";
    this.currentProjectSlug = slug;
    const label = document.getElementById("current-project-label");
    if (label) {
      label.textContent = this.currentProjectName;
    }
    this._renderWorkspacePill();
  }

  updateNodeList(nodes) {
    if (!this.treeContainer) return;
    this.treeContainer.innerHTML = "";

    // Group nodes by type
    const terminals = nodes.filter(n => n.type === "terminal");
    const diagrams = nodes.filter(n => n.type === "diagram");
    const notes = nodes.filter(n => n.type === "note");
    const portals = nodes.filter(n => n.type === "portal");
    const texts = nodes.filter(n => n.type === "text");

    const groups = [
      { key: "terminals", label: "Terminais & Agentes", nodes: terminals, icon: "terminal" },
      { key: "diagrams", label: "Blocos de Diagrama", nodes: diagrams, icon: "diagram" },
      { key: "notes", label: "Anotações de Contexto", nodes: notes, icon: "note" },
      { key: "portals", label: "Portais Web", nodes: portals, icon: "portal" },
      { key: "texts", label: "Textos & Rótulos", nodes: texts, icon: "text" }
    ];

    groups.forEach(group => {
      if (group.nodes.length === 0) return;

      const groupEl = document.createElement("div");
      groupEl.className = "tree-group";
      groupEl.dataset.group = group.key;

      const header = document.createElement("div");
      header.className = "tree-group-header";
      header.innerHTML = `
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="transform: rotate(90deg); transition: transform 0.2s;">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
        <span>${group.label} (${group.nodes.length})</span>
      `;

      // Collapsible group header
      header.addEventListener("click", () => {
        groupEl.classList.toggle("collapsed");
        const svg = header.querySelector("svg");
        if (svg) {
          svg.style.transform = groupEl.classList.contains("collapsed") ? "rotate(0deg)" : "rotate(90deg)";
        }
      });
      groupEl.appendChild(header);

      const itemsContainer = document.createElement("div");
      itemsContainer.className = "tree-group-items";

      group.nodes.forEach(node => {
        const itemEl = document.createElement("div");
        itemEl.className = "tree-item";
        itemEl.dataset.name = (node.title || node.id).toLowerCase();
        itemEl.dataset.nodeId = node.id;
        itemEl.dataset.type = node.type;

        let iconHtml = this._getNodeIcon(node);

        let modeBadge = "";
        if (node.is_orchestrator) {
          modeBadge = `<span class="mode-badge orch-badge" title="Chefe / Orquestrador">👑</span>`;
        } else if (node.is_controllable === false) {
          modeBadge = `<span class="mode-badge observer-badge" title="Apenas Observador / Sensor">👁️</span>`;
        } else if (node.type === "terminal") {
          modeBadge = `<span class="mode-badge controlled-badge" title="Controlado / Executor">⚡</span>`;
        }

        // Responsibility pills preview (max 2)
        const respPreview = (node.responsibilities && node.responsibilities.length > 0)
          ? `<div class="resp-preview">${node.responsibilities.slice(0, 2).map(r => `<span class="mini-pill">${r}</span>`).join('')}${node.responsibilities.length > 2 ? `<span class="mini-pill more">+${node.responsibilities.length - 2}</span>` : ''}</div>`
          : '';

        itemEl.innerHTML = `
          <div class="item-left">
            ${iconHtml}
            <span class="item-title">${node.title || node.id}</span>
          </div>
          <div class="item-right">
            ${modeBadge}
            ${respPreview}
          </div>
        `;

        // Click to focus node
        itemEl.addEventListener("click", (e) => {
          e.stopPropagation();
          document.querySelectorAll(".tree-item").forEach(i => i.classList.remove("active"));
          itemEl.classList.add("active");
          if (window.MaestriApp) {
            window.MaestriApp.focusNode(node.id);
          }
        });

        // Double-click to rename
        itemEl.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          if (window.MaestriApp) {
            window.MaestriApp.startRenameNode(node.id, e);
          }
        });

        // Context menu on right-click
        itemEl.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          document.querySelectorAll(".tree-item").forEach(i => i.classList.remove("active"));
          itemEl.classList.add("active");
          if (window.MaestriApp && window.MaestriApp.contextMenu) {
            window.MaestriApp.contextMenu.showForNode(e, node.id);
          }
        });

        itemsContainer.appendChild(itemEl);
      });

      groupEl.appendChild(itemsContainer);
      this.treeContainer.appendChild(groupEl);
    });

    // If no nodes at all
    if (nodes.length === 0) {
      const emptyGroup = document.createElement("div");
      emptyGroup.className = "tree-group";
      emptyGroup.innerHTML = `
        <div class="tree-group-header" style="pointer-events: none; opacity: 0.5;">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
          <span>Nós no Canvas (0)</span>
        </div>
        <div class="tree-group-items">
          <div style="padding: 16px 12px; text-align: center; color: #64748b; font-size: 12px; line-height: 1.5;">
            Canvas vazio.<br>
            Use a toolbar ou clique com botão direito no canvas<br>
            para adicionar terminais, blocos, notas ou portais.
          </div>
        </div>
      `;
      this.treeContainer.appendChild(emptyGroup);
    }

    // Restore collapsed groups from localStorage
    const collapsedGroups = JSON.parse(localStorage.getItem("maestri_collapsed_sidebar_groups") || "[]");
    collapsedGroups.forEach(key => {
      const groupEl = this.treeContainer.querySelector(`[data-group="${key}"]`);
      if (groupEl) {
        groupEl.classList.add("collapsed");
        const svg = groupEl.querySelector(".tree-group-header svg");
        if (svg) svg.style.transform = "rotate(0deg)";
      }
    });
  }

  _getNodeIcon(node) {
    if (node.icon) {
      return `<span class="node-icon-emoji">${node.icon}</span>`;
    }

    switch (node.type) {
      case "diagram":
        return `<svg class="node-icon-svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;
      case "note":
        return `<svg class="node-icon-svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
      case "portal":
        return `<svg class="node-icon-svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line></svg>`;
      case "text":
        return `<svg class="node-icon-svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>`;
      default: // terminal
        return `<svg class="node-icon-svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`;
    }
  }

  filterItems(term) {
    // Filter workspaces list
    if (this.workspacesListEl) {
      this.workspacesListEl.querySelectorAll(".workspace-item").forEach(item => {
        if (!term) {
          item.style.display = "flex";
        } else {
          const name = (item.dataset.name || "").toLowerCase();
          const slug = (item.dataset.slug || "").toLowerCase();
          item.style.display = (name.includes(term) || slug.includes(term)) ? "flex" : "none";
        }
      });
    }

    if (!term) {
      document.querySelectorAll(".tree-item").forEach(el => el.style.display = "flex");
      document.querySelectorAll(".tree-group").forEach(el => el.style.display = "");
      return;
    }

    let anyVisible = false;
    document.querySelectorAll(".tree-item").forEach(el => {
      const name = el.dataset.name || "";
      const type = el.dataset.type || "";
      const match = name.includes(term) || type.includes(term);
      el.style.display = match ? "flex" : "none";
      if (match) anyVisible = true;
    });

    // Show/hide groups based on visible items
    document.querySelectorAll(".tree-group").forEach(group => {
      const visibleItems = group.querySelectorAll(".tree-item[style*='flex'], .tree-item:not([style*='none'])");
      const hasVisible = group.querySelector(".tree-item[style*='flex']") ||
        Array.from(group.querySelectorAll(".tree-item")).some(el => el.style.display !== "none");
      group.style.display = hasVisible ? "" : "none";
    });
  }

  // Called when a node is added/removed/updated
  refreshNodeList() {
    if (window.MaestriApp) {
      this.updateNodeList(window.MaestriApp.canvas.nodes);
    }
  }

  // Highlight a specific node in the sidebar
  highlightNode(nodeId) {
    document.querySelectorAll(".tree-item").forEach(el => el.classList.remove("active"));
    const target = this.treeContainer.querySelector(`[data-node-id="${nodeId}"]`);
    if (target) {
      target.classList.add("active");
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });

      // Expand parent group if collapsed
      const group = target.closest(".tree-group");
      if (group && group.classList.contains("collapsed")) {
        group.classList.remove("collapsed");
        const svg = group.querySelector(".tree-group-header svg");
        if (svg) svg.style.transform = "rotate(90deg)";
      }
    }
  }
}

window.MaestriSidebar = MaestriSidebar;