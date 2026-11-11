/**
 * Maestri Projects Manager & Creation Wizard
 * Gerencia a navegação, templates de squads, instâncias e foco específico em ./projects/
 */

class MaestriProjectsManager {
  constructor() {
    this.projects = [];
    this.activeSlug = null;
    this.selectedTemplate = "fullstack";
    this.wizardInstances = [];

    // Predefined Squad Templates
    this.templates = {
      fullstack: {
        id: "fullstack",
        icon: "👑",
        title: "Squad Fullstack",
        badge: "Recomendado",
        desc: "Orquestrador Chefe + Backend API + Frontend Web + Observador PowerShell. Completo e coordenado.",
        defaultFocus: "Desenvolvimento Web Fullstack (Frontend, Backend & Banco de Dados)",
        instances: [
          { title: "Antigravity", preset: "antigravity", is_orchestrator: true, is_controllable: true, resps: "Orquestrador Chefe (Formula & Delega)" },
          { title: "backend", preset: "antigravity", is_orchestrator: false, is_controllable: true, resps: "Backend, APIs REST, Banco de Dados" },
          { title: "front", preset: "antigravity", is_orchestrator: false, is_controllable: true, resps: "HTML, CSS & JS, Layouts & Telas, UX" },
          { title: "PowerShell", preset: "shell", is_orchestrator: false, is_controllable: false, resps: "Análise de Código, Observador" }
        ]
      },
      frontend_ui: {
        id: "frontend_ui",
        icon: "🎨",
        title: "Squad Frontend & UI/UX",
        badge: "Design & Telas",
        desc: "Chefe Orquestrador + Claude Frontend + Auditor Visual / Responsividade.",
        defaultFocus: "Engenharia de Interface, Telas, Responsividade & Design System",
        instances: [
          { title: "Antigravity", preset: "antigravity", is_orchestrator: true, is_controllable: true, resps: "Orquestrador Chefe (Formula & Delega)" },
          { title: "claude frontend", preset: "antigravity", is_orchestrator: false, is_controllable: true, resps: "HTML, CSS & JS, Telas, Componentes" },
          { title: "Auditor Visual", preset: "shell", is_orchestrator: false, is_controllable: false, resps: "Auditoria Visual, Inspeção de Telas" }
        ]
      },
      backend_api: {
        id: "backend_api",
        icon: "⚙️",
        title: "Squad Backend & APIs",
        badge: "APIs & Dados",
        desc: "Chefe Orquestrador + API Designer + Backend Dev + Persistência de Dados.",
        defaultFocus: "Arquitetura de APIs, Schemas REST, Banco de Dados & Serviços",
        instances: [
          { title: "Antigravity", preset: "antigravity", is_orchestrator: true, is_controllable: true, resps: "Orquestrador Chefe (Formula & Delega)" },
          { title: "api-designer", preset: "antigravity", is_orchestrator: false, is_controllable: true, resps: "Contratos REST, Schemas Pydantic" },
          { title: "backend-dev", preset: "antigravity", is_orchestrator: false, is_controllable: true, resps: "Endpoints FastAPI, Regras de Negócio" }
        ]
      },
      single_agent: {
        id: "single_agent",
        icon: "🚀",
        title: "Agente Especialista Único",
        badge: "Focado & Rápido",
        desc: "1 Terminal Focado de Alta Precisão conectado à sua Nota de Contexto Viva.",
        defaultFocus: "Automação e Tarefas Focadas de Alta Precisão",
        instances: [
          { title: "Agente Especialista", preset: "antigravity", is_orchestrator: true, is_controllable: true, resps: "Especialista Dedicado, Código, Automação" }
        ]
      },
      blank: {
        id: "blank",
        icon: "🛠️",
        title: "Workspace em Branco",
        badge: "Customizado",
        desc: "Tela limpa para montar instâncias, nós e blocos personalizados livremente.",
        defaultFocus: "Construção Livre do Canvas",
        instances: []
      }
    };

    this.init();
  }

  init() {
    this._bindTriggers();
    this._bindBrowserEvents();
    this._bindWizardEvents();
  }

  _bindTriggers() {
    // Sidebar project dropdown button
    const btnSidebarProj = document.getElementById("btn-current-project");
    if (btnSidebarProj) {
      btnSidebarProj.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openBrowser();
      });
    }

    // Sidebar quick create button
    const btnSidebarNew = document.getElementById("btn-sidebar-new-project");
    if (btnSidebarNew) {
      btnSidebarNew.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openWizard();
      });
    }

    // Topbar Projects button
    const btnTopProj = document.getElementById("btn-top-projects");
    if (btnTopProj) {
      btnTopProj.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openBrowser();
      });
    }

    // Global keyboard shortcuts (Esc closes modals)
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeBrowser();
        this.closeWizard();
      }
    });
  }

  /* =========================================================================
     PROJECT BROWSER (NAVEGADOR DE PROJETOS)
     ========================================================================= */

  async openBrowser() {
    const overlay = document.getElementById("projects-browser-modal-overlay");
    if (!overlay) return;

    overlay.classList.add("active");
    await this.fetchAndRenderProjects();

    const searchInput = document.getElementById("projects-search-input");
    if (searchInput) {
      searchInput.value = "";
      setTimeout(() => searchInput.focus(), 100);
    }
  }

  closeBrowser() {
    const overlay = document.getElementById("projects-browser-modal-overlay");
    if (overlay) overlay.classList.remove("active");
  }

  async fetchAndRenderProjects() {
    const grid = document.getElementById("projects-cards-grid");
    if (!grid) return;

    grid.innerHTML = `<div class="projects-loading-spinner"><div class="spinner-ring"></div><span>Carregando projetos de ./projects/...</span></div>`;

    try {
      const res = await fetch("/api/projects");
      const list = await res.json();
      this.projects = Array.isArray(list) ? list : [];

      const activeProj = this.projects.find(p => p.is_active);
      this.activeSlug = activeProj ? activeProj.slug : null;

      this.renderProjectCards(this.projects);
    } catch (e) {
      grid.innerHTML = `<div class="projects-empty-state"><span style="color: #ef4444;">Erro ao carregar projetos: ${e.message}</span></div>`;
    }
  }

  renderProjectCards(list) {
    const grid = document.getElementById("projects-cards-grid");
    if (!grid) return;

    if (!list || list.length === 0) {
      grid.innerHTML = `
        <div class="projects-empty-state">
          <div style="font-size: 32px; margin-bottom: 8px;">📂</div>
          <div style="font-size: 15px; font-weight: 600; color: #cbd5e1;">Nenhum projeto encontrado</div>
          <p style="font-size: 12px; color: #94a3b8; max-width: 320px; margin: 6px auto 14px;">Crie um novo projeto com instâncias de IA coordenadas e foco específico.</p>
          <button class="btn-primary" onclick="window.MaestriProjects.openWizard()">+ Criar Primeiro Projeto</button>
        </div>`;
      return;
    }

    grid.innerHTML = "";

    list.forEach(p => {
      const card = document.createElement("div");
      card.className = `project-card ${p.is_active ? "is-active" : ""}`;

      const templateInfo = this.templates[p.template] || { icon: "📁", title: p.template || "Projeto" };
      const modifiedDate = p.modified ? new Date(p.modified * 1000).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";

      const shortCwd = p.cwd ? (p.cwd.length > 45 ? "..." + p.cwd.slice(-42) : p.cwd) : "Pasta padrão do sistema";

      card.innerHTML = `
        <div class="project-card-header">
          <div class="project-card-title-group">
            <span class="project-card-icon">${templateInfo.icon}</span>
            <div>
              <div class="project-card-name" title="${this.escapeHtml(p.name)}">${this.escapeHtml(p.name)}</div>
              <div class="project-card-slug">${p.slug}</div>
            </div>
          </div>
          <div class="project-card-badges">
            ${p.is_active ? `<span class="badge-status-active">🟢 Ativo</span>` : `<span class="badge-status-idle">📁 Inativo</span>`}
          </div>
        </div>

        <div class="project-card-body">
          <div class="project-card-meta-row" title="${this.escapeHtml(p.cwd || '')}">
            <svg width="13" height="13" fill="none" stroke="#38bdf8" stroke-width="2" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            <span class="project-cwd-text">${this.escapeHtml(shortCwd)}</span>
          </div>

          ${p.focus ? `
            <div class="project-card-focus-tag" title="Foco da IA: ${this.escapeHtml(p.focus)}">
              🎯 <span>${this.escapeHtml(p.focus)}</span>
            </div>
          ` : `
            <div class="project-card-focus-tag" style="opacity: 0.6;">
              🎯 <span>${templateInfo.title}</span>
            </div>
          `}

          <div class="project-card-stats-row">
            <span class="stat-item" title="Terminais Conectados">💻 <strong>${p.terminals_count ?? 0}</strong> term</span>
            <span class="stat-item" title="Notas de Contexto Vivas">🧠 <strong>${p.notes_count ?? 0}</strong> notas</span>
            <span class="stat-item" title="Conexões Direcionadas">⚡ <strong>${p.edges_count ?? 0}</strong> conexões</span>
            ${modifiedDate ? `<span class="stat-date" title="Última modificação">🕒 ${modifiedDate}</span>` : ""}
          </div>
        </div>

        <div class="project-card-actions">
          ${p.is_active ? `
            <button class="btn-card-action btn-card-current" disabled>
              <span>Workspace Ativo</span>
            </button>
          ` : `
            <button class="btn-card-action btn-card-open" data-slug="${p.slug}" title="Abrir este workspace">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M15 3h6v6"></path><path d="M10 14L21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>
              <span>Abrir Projeto</span>
            </button>
          `}

          <div class="project-card-subactions">
            <button class="btn-subaction btn-duplicate" data-slug="${p.slug}" data-name="${this.escapeHtml(p.name)}" title="Duplicar / Clonar Projeto">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button class="btn-subaction btn-rename" data-slug="${p.slug}" data-name="${this.escapeHtml(p.name)}" title="Renomear Projeto">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            ${!p.is_active && list.length > 1 ? `
              <button class="btn-subaction btn-delete" data-slug="${p.slug}" data-name="${this.escapeHtml(p.name)}" title="Excluir Projeto">
                <svg width="13" height="13" fill="none" stroke="#ef4444" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            ` : ""}
          </div>
        </div>
      `;

      // Make entire card clickable to switch project if not active
      if (!p.is_active) {
        card.style.cursor = "pointer";
        card.addEventListener("click", (e) => {
          if (e.target.closest(".project-card-subactions") || e.target.closest(".btn-subaction")) {
            return;
          }
          this.switchProject(p.slug);
        });
      }

      grid.appendChild(card);
    });

    // Wire up card action buttons
    grid.querySelectorAll(".btn-card-open").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.switchProject(btn.dataset.slug);
      });
    });

    grid.querySelectorAll(".btn-duplicate").forEach(btn => {
      btn.addEventListener("click", () => this.duplicateProject(btn.dataset.slug, btn.dataset.name));
    });

    grid.querySelectorAll(".btn-rename").forEach(btn => {
      btn.addEventListener("click", () => this.renameProject(btn.dataset.slug, btn.dataset.name));
    });

    grid.querySelectorAll(".btn-delete").forEach(btn => {
      btn.addEventListener("click", () => this.deleteProject(btn.dataset.slug, btn.dataset.name));
    });
  }

  _bindBrowserEvents() {
    const btnClose = document.getElementById("btn-close-projects-browser");
    if (btnClose) btnClose.addEventListener("click", () => this.closeBrowser());

    const overlay = document.getElementById("projects-browser-modal-overlay");
    if (overlay) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.closeBrowser();
      });
    }

    const btnNew = document.getElementById("btn-browser-create-new");
    if (btnNew) {
      btnNew.addEventListener("click", () => {
        this.closeBrowser();
        this.openWizard();
      });
    }

    const searchInput = document.getElementById("projects-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        const q = e.target.value.toLowerCase().trim();
        if (!q) {
          this.renderProjectCards(this.projects);
          return;
        }
        const filtered = this.projects.filter(p =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.slug && p.slug.toLowerCase().includes(q)) ||
          (p.cwd && p.cwd.toLowerCase().includes(q)) ||
          (p.focus && p.focus.toLowerCase().includes(q))
        );
        this.renderProjectCards(filtered);
      });
    }
  }

  async switchProject(slug) {
    if (!slug) return;
    if (slug === this.activeSlug) {
      this.closeBrowser();
      return;
    }

    try {
      this.closeBrowser();
      if (window.MaestriApp && window.MaestriApp.showToast) {
        window.MaestriApp.showToast(`Alternando para o projeto '${slug}'...`);
      }

      // CRITICAL: Block exit-save beacon from sending old canvas state and overwriting the new project
      window.__isSwitchingProject = true;
      if (window.MaestriApp) {
        window.MaestriApp.isSwitchingProject = true;
      }

      // Switch project on backend via POST switch endpoint
      let success = false;
      try {
        const postRes = await fetch(`/api/projects/${slug}/switch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        const postData = await postRes.json();
        if (postData && postData.status === "ok") {
          success = true;
        }
      } catch (err) {
        console.warn("POST switch fallback to GET:", err);
      }

      if (!success) {
        const getRes = await fetch(`/api/projects/${slug}?_t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" }
        });
        const getData = await getRes.json();
        if (getData && getData.status === "ok") {
          success = true;
        }
      }

      if (success) {
        setTimeout(() => {
          window.location.reload();
        }, 120);
      } else {
        window.__isSwitchingProject = false;
        if (window.MaestriApp) window.MaestriApp.isSwitchingProject = false;
        alert("Erro ao alternar para o projeto.");
      }
    } catch (e) {
      window.__isSwitchingProject = false;
      if (window.MaestriApp) window.MaestriApp.isSwitchingProject = false;
      alert(`Erro ao abrir projeto: ${e.message}`);
    }
  }

  async duplicateProject(slug, currentName) {
    const newName = prompt(`Nome para a cópia do projeto '${currentName}':`, `${currentName} (Cópia)`);
    if (!newName || !newName.trim()) return;

    try {
      const res = await fetch(`/api/projects/${slug}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() })
      });
      const data = await res.json();
      if (data && data.status === "ok") {
        if (window.MaestriApp && window.MaestriApp.showToast) {
          window.MaestriApp.showToast(`Projeto duplicado com sucesso!`);
        }
        await this.fetchAndRenderProjects();
      } else {
        alert(data.message || "Erro ao duplicar projeto");
      }
    } catch (e) {
      alert(`Erro: ${e.message}`);
    }
  }

  async renameProject(slug, currentName) {
    const newName = prompt(`Novo nome para '${currentName}':`, currentName);
    if (!newName || !newName.trim() || newName.trim() === currentName) return;

    try {
      const res = await fetch(`/api/projects/${slug}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() })
      });
      const data = await res.json();
      if (data && data.status === "ok") {
        if (window.MaestriApp && window.MaestriApp.showToast) {
          window.MaestriApp.showToast(`Projeto renomeado com sucesso!`);
        }
        await this.fetchAndRenderProjects();
        if (window.MaestriApp && window.MaestriApp.sidebar) {
          window.MaestriApp.sidebar.setProjectName(newName.trim());
        }
      } else {
        alert(data.message || "Erro ao renomear projeto");
      }
    } catch (e) {
      alert(`Erro: ${e.message}`);
    }
  }

  async deleteProject(slug, currentName) {
    const ok = confirm(`Tem certeza que deseja excluir o projeto '${currentName}' (${slug})?\n\nEsta ação apagará a pasta em ./projects/${slug} e não pode ser desfeita.`);
    if (!ok) return;

    try {
      const res = await fetch(`/api/projects/${slug}/delete`, {
        method: "POST"
      });
      const data = await res.json();
      if (data && data.status === "ok") {
        if (window.MaestriApp && window.MaestriApp.showToast) {
          window.MaestriApp.showToast(`Projeto excluído com sucesso.`);
        }
        await this.fetchAndRenderProjects();
      } else {
        alert(data.message || "Erro ao excluir projeto");
      }
    } catch (e) {
      alert(`Erro: ${e.message}`);
    }
  }

  /* =========================================================================
     PROJECT CREATION WIZARD (CRIADOR COM FOCO & INSTÂNCIAS)
     ========================================================================= */

  openWizard() {
    const overlay = document.getElementById("project-wizard-modal-overlay");
    if (!overlay) return;

    overlay.classList.add("active");

    // Pre-populate CWD from current project directory
    const cwdInput = document.getElementById("wizard-proj-cwd");
    if (cwdInput && !cwdInput.value) {
      const currentDir = window.MaestriApp?.currentData?.meta?.working_directory || "";
      cwdInput.value = currentDir;
    }

    const nameInput = document.getElementById("wizard-proj-name");
    if (nameInput) {
      nameInput.value = "";
      setTimeout(() => nameInput.focus(), 120);
    }

    this.selectTemplate("fullstack");
  }

  closeWizard() {
    const overlay = document.getElementById("project-wizard-modal-overlay");
    if (overlay) overlay.classList.remove("active");
  }

  _bindWizardEvents() {
    const btnClose = document.getElementById("btn-close-project-wizard");
    if (btnClose) btnClose.addEventListener("click", () => this.closeWizard());

    const btnCancel = document.getElementById("btn-wizard-cancel");
    if (btnCancel) btnCancel.addEventListener("click", () => this.closeWizard());

    const overlay = document.getElementById("project-wizard-modal-overlay");
    if (overlay) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.closeWizard();
      });
    }

    // Folder picker button
    const btnBrowseCwd = document.getElementById("btn-wizard-browse-cwd");
    if (btnBrowseCwd) {
      btnBrowseCwd.addEventListener("click", async () => {
        const cwdInput = document.getElementById("wizard-proj-cwd");
        const initial = cwdInput ? cwdInput.value.trim() : "";
        try {
          btnBrowseCwd.disabled = true;
          btnBrowseCwd.innerHTML = `<span>Procurando...</span>`;
          const res = await fetch(`/api/browse-directory?initial=${encodeURIComponent(initial)}`);
          const data = await res.json();
          if (data && data.path && cwdInput) {
            cwdInput.value = data.path;
          }
        } catch (e) {
          console.warn("Folder picker error:", e);
        } finally {
          btnBrowseCwd.disabled = false;
          btnBrowseCwd.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg><span>📁 Procurar...</span>`;
        }
      });
    }

    // Render Template Cards
    this._renderTemplateCards();

    // Add instance button
    const btnAddInst = document.getElementById("btn-wizard-add-instance");
    if (btnAddInst) {
      btnAddInst.addEventListener("click", () => {
        this.wizardInstances.push({
          title: `Agente ${this.wizardInstances.length + 1}`,
          preset: "antigravity",
          is_orchestrator: false,
          is_controllable: true,
          resps: "Tarefas específicas",
          enabled: true
        });
        this.renderWizardInstancesList();
      });
    }

    // Submit Creation
    const btnSubmit = document.getElementById("btn-wizard-submit");
    if (btnSubmit) {
      btnSubmit.addEventListener("click", () => this.submitProjectCreation());
    }
  }

  _renderTemplateCards() {
    const container = document.getElementById("squad-templates-grid");
    if (!container) return;

    container.innerHTML = "";
    Object.values(this.templates).forEach(tmpl => {
      const card = document.createElement("div");
      card.className = `squad-template-card ${tmpl.id === this.selectedTemplate ? "selected" : ""}`;
      card.dataset.id = tmpl.id;

      card.innerHTML = `
        <div class="squad-tmpl-header">
          <span class="squad-tmpl-icon">${tmpl.icon}</span>
          <span class="squad-tmpl-badge">${tmpl.badge}</span>
        </div>
        <div class="squad-tmpl-title">${tmpl.title}</div>
        <div class="squad-tmpl-desc">${tmpl.desc}</div>
      `;

      card.addEventListener("click", () => {
        this.selectTemplate(tmpl.id);
      });

      container.appendChild(card);
    });
  }

  selectTemplate(templateId) {
    this.selectedTemplate = templateId;
    const tmpl = this.templates[templateId] || this.templates.fullstack;

    // Highlight card
    document.querySelectorAll(".squad-template-card").forEach(c => {
      c.classList.toggle("selected", c.dataset.id === templateId);
    });

    // Auto-fill focus input if empty or was previous default
    const focusInput = document.getElementById("wizard-proj-focus");
    if (focusInput && (!focusInput.value || Object.values(this.templates).some(t => t.defaultFocus === focusInput.value))) {
      focusInput.value = tmpl.defaultFocus;
    }

    // Clone instances for interactive editing
    this.wizardInstances = (tmpl.instances || []).map(inst => ({
      ...inst,
      enabled: true
    }));

    this.renderWizardInstancesList();
  }

  renderWizardInstancesList() {
    const container = document.getElementById("wizard-instances-list");
    if (!container) return;

    if (this.wizardInstances.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 18px; color: #94a3b8; font-size: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;">
          Nenhuma instância pré-definida para este template. Clique em <strong>+ Adicionar Instância</strong> para incluir nós antes de criar, ou comece com o canvas limpo.
        </div>`;
      return;
    }

    container.innerHTML = "";

    this.wizardInstances.forEach((inst, idx) => {
      const row = document.createElement("div");
      row.className = `wizard-instance-row ${inst.enabled ? "" : "disabled"}`;

      row.innerHTML = `
        <div class="inst-row-left">
          <input type="checkbox" class="inst-checkbox" ${inst.enabled ? "checked" : ""} data-idx="${idx}" title="Incluir no projeto">
          <span class="inst-role-badge ${inst.is_orchestrator ? "badge-orch" : (inst.preset === "antigravity" ? "badge-gemini" : "badge-shell")}">
            ${inst.is_orchestrator ? "👑 Chefe" : (inst.is_controllable ? "⚡ Executor" : "👁️ Observador")}
          </span>
        </div>

        <div class="inst-row-inputs">
          <input type="text" class="inst-input-title" value="${this.escapeHtml(inst.title)}" data-idx="${idx}" placeholder="Nome do Agente">
          <input type="text" class="inst-input-resps" value="${this.escapeHtml(inst.resps)}" data-idx="${idx}" placeholder="Papel / Responsabilidades">
        </div>

        <div class="inst-row-actions">
          <select class="inst-select-preset" data-idx="${idx}">
            <option value="antigravity" ${inst.preset === "antigravity" ? "selected" : ""}>Antigravity CLI</option>
            <option value="claude" ${inst.preset === "claude" ? "selected" : ""}>Claude CLI</option>
            <option value="shell" ${inst.preset === "shell" ? "selected" : ""}>PowerShell / Shell</option>
          </select>
          <button type="button" class="btn-remove-inst" data-idx="${idx}" title="Remover instância">&times;</button>
        </div>
      `;

      container.appendChild(row);
    });

    // Wire up row events
    container.querySelectorAll(".inst-checkbox").forEach(chk => {
      chk.addEventListener("change", (e) => {
        const i = parseInt(e.target.dataset.idx);
        if (this.wizardInstances[i]) {
          this.wizardInstances[i].enabled = e.target.checked;
          this.renderWizardInstancesList();
        }
      });
    });

    container.querySelectorAll(".inst-input-title").forEach(inp => {
      inp.addEventListener("input", (e) => {
        const i = parseInt(e.target.dataset.idx);
        if (this.wizardInstances[i]) this.wizardInstances[i].title = e.target.value;
      });
    });

    container.querySelectorAll(".inst-input-resps").forEach(inp => {
      inp.addEventListener("input", (e) => {
        const i = parseInt(e.target.dataset.idx);
        if (this.wizardInstances[i]) this.wizardInstances[i].resps = e.target.value;
      });
    });

    container.querySelectorAll(".inst-select-preset").forEach(sel => {
      sel.addEventListener("change", (e) => {
        const i = parseInt(e.target.dataset.idx);
        if (this.wizardInstances[i]) this.wizardInstances[i].preset = e.target.value;
      });
    });

    container.querySelectorAll(".btn-remove-inst").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.idx);
        this.wizardInstances.splice(i, 1);
        this.renderWizardInstancesList();
      });
    });
  }

  async submitProjectCreation() {
    const nameInput = document.getElementById("wizard-proj-name");
    const cwdInput = document.getElementById("wizard-proj-cwd");
    const focusInput = document.getElementById("wizard-proj-focus");

    const name = nameInput ? nameInput.value.trim() : "";
    const cwd = cwdInput ? cwdInput.value.trim() : "";
    const focus = focusInput ? focusInput.value.trim() : "";

    if (!name) {
      alert("Por favor, digite o nome do projeto.");
      if (nameInput) nameInput.focus();
      return;
    }

    if (!cwd) {
      alert("Por favor, selecione ou digite a pasta raiz de trabalho do projeto.");
      if (cwdInput) cwdInput.focus();
      return;
    }

    // Filter enabled instances
    const activeInstances = this.wizardInstances
      .filter(inst => inst.enabled)
      .map(inst => ({
        title: inst.title.trim() || "Agente",
        preset: inst.preset || "antigravity",
        is_orchestrator: Boolean(inst.is_orchestrator),
        is_controllable: Boolean(inst.is_controllable),
        responsibilities: inst.resps ? inst.resps.split(",").map(r => r.trim()).filter(Boolean) : ["Geral"]
      }));

    const btnSubmit = document.getElementById("btn-wizard-submit");
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = `<span>Criando projeto e estruturando squad...</span>`;
    }

    try {
      const payload = {
        name: name,
        cwd: cwd,
        template: this.selectedTemplate,
        focus: focus,
        instances: activeInstances.length > 0 ? activeInstances : null
      };

      const res = await fetch("/api/projects/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (result && result.slug) {
        this.closeWizard();
        if (window.MaestriApp && window.MaestriApp.showToast) {
          window.MaestriApp.showToast(`Projeto '${name}' criado com sucesso! Abrindo workspace...`);
        }
        window.__isSwitchingProject = true;
        if (window.MaestriApp) window.MaestriApp.isSwitchingProject = true;
        setTimeout(() => {
          window.location.reload();
        }, 150);
      } else {
        alert("Erro ao criar projeto: resposta inesperada do servidor.");
      }
    } catch (e) {
      alert(`Falha ao criar projeto: ${e.message}`);
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<span>🚀 Criar e Abrir Workspace</span>`;
      }
    }
  }

  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

// Global initialization
window.addEventListener("DOMContentLoaded", () => {
  window.MaestriProjects = new MaestriProjectsManager();
});
