/**
 * Sidebar Controller for Maestri Desktop (v2.0)
 * Manages projects inside ./projects/, node inventory, filtering and quick actions.
 */

class MaestriSidebar {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.searchInput = document.getElementById("sidebar-search-input");
    this.treeContainer = document.getElementById("sidebar-tree-container");
    this.currentProjectName = "Meu Projeto";
    this.groups = [];
    this._initEvents();
  }

  _initEvents() {
    if (this.searchInput) {
      this.searchInput.addEventListener("input", (e) => {
        this.filterItems(e.target.value.toLowerCase().trim());
      });
    }

    // Project selector button
    const btnProject = document.getElementById("btn-current-project");
    if (btnProject) {
      btnProject.addEventListener("click", () => {
        this.openProjectPicker();
      });
    }

    // Quick creation buttons in sidebar footer
    const btnAddTerm = document.getElementById("btn-sidebar-add-term");
    if (btnAddTerm) {
      btnAddTerm.addEventListener("click", () => {
        if (window.MaestriApp) {
          window.MaestriApp.setToolActive("terminal");
          window.MaestriApp.canvas.setPendingPlacement("terminal");
          window.MaestriApp.showToast("Clique e arraste no canvas para delimitar a área do novo terminal.");
        }
      });
    }

    const btnAddDiag = document.getElementById("btn-sidebar-add-diag");
    if (btnAddDiag) {
      btnAddDiag.addEventListener("click", () => {
        if (window.MaestriApp) window.MaestriApp.canvas.setPendingPlacement("diagram");
      });
    }

    // Toggle sidebar collapse
    const btnCollapse = document.getElementById("btn-toggle-sidebar");
    if (btnCollapse) {
      btnCollapse.addEventListener("click", () => {
        this.container.classList.toggle("collapsed");
      });
    }
  }

  async openProjectPicker() {
    if (window.MaestriProjects) {
      window.MaestriProjects.openBrowser();
      return;
    }
  }

  setProjectName(name) {
    this.currentProjectName = name || "Meu Projeto";
    const label = document.getElementById("current-project-label");
    if (label) {
      label.textContent = this.currentProjectName;
    }
  }

  updateNodeList(nodes) {
    if (!this.treeContainer) return;
    this.treeContainer.innerHTML = "";

    const groupEl = document.createElement("div");
    groupEl.className = "tree-group";

    const header = document.createElement("div");
    header.className = "tree-group-header";
    header.innerHTML = `
      <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="transform: rotate(90deg)">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
      <span>Nós no Canvas (${nodes.length})</span>
    `;
    groupEl.appendChild(header);

    if (nodes.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.style.padding = "10px 12px";
      emptyMsg.style.fontSize = "12px";
      emptyMsg.style.color = "#64748b";
      emptyMsg.innerHTML = "Canvas limpo.<br>Clique em <b>Terminal</b> acima para adicionar.";
      groupEl.appendChild(emptyMsg);
    } else {
      nodes.forEach(node => {
        const itemEl = document.createElement("div");
        itemEl.className = "tree-item";
        itemEl.dataset.name = (node.title || node.id).toLowerCase();

        let iconSvg = node.icon 
          ? `<span style="font-size: 14px; margin-right: 2px;">${node.icon}</span>` 
          : `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`;
        if (node.type === "diagram") {
          iconSvg = node.icon 
            ? `<span style="font-size: 14px; margin-right: 2px;">${node.icon}</span>`
            : `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;
        } else if (node.type === "note") {
          iconSvg = node.icon 
            ? `<span style="font-size: 14px; margin-right: 2px;">${node.icon}</span>`
            : `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>`;
        } else if (node.type === "portal") {
          iconSvg = node.icon 
            ? `<span style="font-size: 14px; margin-right: 2px;">${node.icon}</span>`
            : `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line></svg>`;
        }

        let modeBadge = "";
        if (node.is_orchestrator) {
          modeBadge = `<span style="color: #eab308; font-size: 11px;">👑 Chefe</span>`;
        } else if (node.is_controllable === false) {
          modeBadge = `<span style="color: #22d3ee; font-size: 11px;" title="Apenas Observador / Sensor">👁️ Observador</span>`;
        } else if (node.type === "terminal") {
          modeBadge = `<span style="color: #38bdf8; font-size: 11px;" title="Controlado / Executor">⚡ Executor</span>`;
        }

        itemEl.innerHTML = `
          <div class="item-left">
            ${iconSvg}
            <span>${node.title || node.id}</span>
          </div>
          <div>${modeBadge}</div>
        `;

        itemEl.addEventListener("click", () => {
          document.querySelectorAll(".tree-item").forEach(i => i.classList.remove("active"));
          itemEl.classList.add("active");
          if (window.MaestriApp) {
            window.MaestriApp.focusNode(node.id);
          }
        });

        groupEl.appendChild(itemEl);
      });
    }

    this.treeContainer.appendChild(groupEl);
  }

  filterItems(term) {
    if (!term) {
      document.querySelectorAll(".tree-item").forEach(el => el.style.display = "flex");
      return;
    }
    document.querySelectorAll(".tree-item").forEach(el => {
      const match = el.dataset.name && el.dataset.name.includes(term);
      el.style.display = match ? "flex" : "none";
    });
  }
}

window.MaestriSidebar = MaestriSidebar;
