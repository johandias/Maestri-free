/**
 * Modal Manager for Maestri Desktop (v2.3)
 * Handles "New Terminal" and "Edit Existing Terminal" modals:
 * - Presets: Antigravity, Claude Code, Codex, Shell
 * - Customizable Window Icons (👑, ⚡, 🤖, 🧠, 💻, 🎨, 📦, 🧪, 🛡️, 🚀, etc.)
 * - Multiple Terminal Themes with Interactive Live Preview
 * - Native Folder Picker integration
 * - Granular Responsibility Management
 */

class MaestriModalManager {
  constructor() {
    this.overlay = document.getElementById("terminal-modal-overlay");
    this.selectedPreset = localStorage.getItem("maestri_last_preset") || "antigravity";
    this.activeTab = localStorage.getItem("maestri_last_modal_tab") || "details";
    this.targetX = null;
    this.targetY = null;
    this.targetWidth = null;
    this.targetHeight = null;
    this.responsibilities = [];
    this.isEditMode = false;
    this.editingNodeId = null;
    this.selectedIcon = "💻";
    this.selectedTheme = "vscode";
    this._initModal();
  }

  _initModal() {
    // Quick Start Preset cards click handler
    document.querySelectorAll(".quick-card").forEach(card => {
      card.addEventListener("click", () => {
        document.querySelectorAll(".quick-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        this.selectedPreset = card.dataset.preset;
        localStorage.setItem("maestri_last_preset", this.selectedPreset);
        if (!this.isEditMode) {
          this._updateFormForPreset(this.selectedPreset);
        }
      });
    });

    // Tab buttons (Details vs Appearance)
    document.querySelectorAll(".modal-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".modal-tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.activeTab = btn.dataset.tab;
        localStorage.setItem("maestri_last_modal_tab", this.activeTab);
        this._switchTab(this.activeTab);
        if (this.activeTab === "appearance") {
          this._updateThemePreview(this.selectedTheme);
        }
      });
    });

    // Quick Icon Picker
    document.querySelectorAll(".quick-icon-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".quick-icon-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.selectedIcon = btn.dataset.icon || "💻";
        const iconInput = document.getElementById("input-term-icon");
        if (iconInput) iconInput.value = this.selectedIcon;
      });
    });

    const iconInput = document.getElementById("input-term-icon");
    iconInput?.addEventListener("input", () => {
      const val = iconInput.value.trim() || "💻";
      this.selectedIcon = val;
      document.querySelectorAll(".quick-icon-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.icon === val);
      });
    });

    // Theme selector change with instant Live Preview
    const themeSelect = document.getElementById("select-term-theme");
    themeSelect?.addEventListener("change", () => {
      this.selectedTheme = themeSelect.value;
      this._updateThemePreview(this.selectedTheme);
    });

    // Responsibilities Tag Manager
    const respInput = document.getElementById("input-resp-tag");
    const btnAddResp = document.getElementById("btn-add-resp-tag");

    const addTag = () => {
      const val = respInput?.value?.trim();
      if (val && !this.responsibilities.includes(val)) {
        this.responsibilities.push(val);
        if (respInput) respInput.value = "";
        this._renderResponsibilities();
      }
    };

    btnAddResp?.addEventListener("click", addTag);
    respInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addTag();
      }
    });

    // Quick suggestion pills
    document.querySelectorAll(".quick-resp-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        const resp = pill.dataset.resp;
        if (resp && !this.responsibilities.includes(resp)) {
          this.responsibilities.push(resp);
          this._renderResponsibilities();
        }
      });
    });

    // Native folder picker button
    const btnBrowseCwd = document.getElementById("btn-browse-cwd");
    if (btnBrowseCwd) {
      btnBrowseCwd.addEventListener("click", async () => {
        try {
          const cwdInput = document.getElementById("input-term-cwd");
          const currentVal = cwdInput?.value || "";
          btnBrowseCwd.textContent = "Abrindo...";
          const res = await fetch(`/api/browse-directory?initial=${encodeURIComponent(currentVal)}`);
          const data = await res.json();
          if (data && data.path && cwdInput) {
            cwdInput.value = data.path;
          }
        } catch (e) {
          console.warn("Folder picker error:", e);
        } finally {
          btnBrowseCwd.textContent = "📂 Procurar...";
        }
      });
    }

    // Action buttons
    const btnCancel = document.getElementById("btn-modal-cancel");
    if (btnCancel) {
      btnCancel.addEventListener("click", () => this.close());
    }

    const btnCreate = document.getElementById("btn-modal-create");
    if (btnCreate) {
      btnCreate.addEventListener("click", () => this.saveOrSubmitModal());
    }

    // Close on overlay background click
    if (this.overlay) {
      this.overlay.addEventListener("click", (e) => {
        if (e.target === this.overlay) this.close();
      });
    }
  }

  _updateThemePreview(themeKey) {
    const themes = window.TERMINAL_THEMES || {};
    const theme = themes[themeKey] || themes["vscode"] || {};
    const previewBox = document.getElementById("theme-preview-box");
    const previewTerm = document.getElementById("theme-preview-terminal");
    const previewTitle = document.getElementById("preview-theme-title");

    if (previewTitle) previewTitle.textContent = theme.name || themeKey;
    if (previewTerm) {
      previewTerm.style.backgroundColor = theme.background || "#181818";
      previewTerm.style.color = theme.foreground || "#cccccc";
    }
    if (previewBox) {
      previewBox.style.borderColor = theme.blue || "rgba(255, 255, 255, 0.18)";
    }
  }

  _renderResponsibilities() {
    const listEl = document.getElementById("modal-resp-tags-list");
    if (!listEl) return;
    listEl.innerHTML = "";
    this.responsibilities.forEach((resp, idx) => {
      const tag = document.createElement("span");
      tag.className = "resp-badge-item";
      tag.innerHTML = `
        <span>${resp}</span>
        <button type="button" class="resp-del-btn" data-index="${idx}" title="Remover responsabilidade">✕</button>
      `;
      tag.querySelector(".resp-del-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        this.responsibilities.splice(idx, 1);
        this._renderResponsibilities();
      });
      listEl.appendChild(tag);
    });
  }

  // Open in "Create New Terminal" mode
  open(targetX = null, targetY = null, targetWidth = null, targetHeight = null) {
    this.isEditMode = false;
    this.editingNodeId = null;
    this.targetX = targetX;
    this.targetY = targetY;
    this.targetWidth = targetWidth;
    this.targetHeight = targetHeight;
    this.selectedIcon = "💻";
    this.selectedTheme = "vscode";
    this.responsibilities = [];

    if (this.overlay) {
      this.overlay.classList.add("active");

      const titleEl = document.querySelector("#terminal-modal-overlay .modal-title");
      if (titleEl) titleEl.textContent = "New Terminal";

      const btnAction = document.getElementById("btn-modal-create");
      if (btnAction) btnAction.textContent = "Criar Instância";

      // Restore previously chosen preset
      const savedPreset = localStorage.getItem("maestri_last_preset") || this.selectedPreset || "antigravity";
      this.selectedPreset = savedPreset;
      document.querySelectorAll(".quick-card").forEach(c => {
        c.classList.toggle("active", c.dataset.preset === savedPreset);
      });
      this._updateFormForPreset(savedPreset);

      const iconInput = document.getElementById("input-term-icon");
      if (iconInput) iconInput.value = this.selectedIcon;
      document.querySelectorAll(".quick-icon-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.icon === this.selectedIcon);
      });

      const cwdInput = document.getElementById("input-term-cwd");
      if (cwdInput && window.MaestriApp?.currentWorkingDirectory) {
        cwdInput.value = window.MaestriApp.currentWorkingDirectory;
      }

      const orchCheckbox = document.getElementById("checkbox-is-orchestrator");
      if (orchCheckbox) orchCheckbox.checked = false;

      const ctrlCheckbox = document.getElementById("checkbox-is-controllable");
      if (ctrlCheckbox) ctrlCheckbox.checked = true;

      const themeSelect = document.getElementById("select-term-theme");
      if (themeSelect) themeSelect.value = "vscode";
      this._updateThemePreview("vscode");

      // Restore previously chosen tab
      const savedTab = localStorage.getItem("maestri_last_modal_tab") || this.activeTab || "details";
      this.activeTab = savedTab;
      document.querySelectorAll(".modal-tab-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.tab === savedTab);
      });
      this._switchTab(savedTab);

      const nameInput = document.getElementById("input-term-name");
      if (nameInput) setTimeout(() => nameInput.focus(), 60);

      // Default responsibilities per preset
      if (savedPreset === "antigravity") {
        this.responsibilities = ["IA Assistente", "Análise de Código"];
      } else if (savedPreset === "codex") {
        this.responsibilities = ["Implementação de Código", "Automação"];
      } else if (savedPreset === "claude") {
        this.responsibilities = ["Desenvolvedor Fullstack", "Refatoração"];
      } else {
        this.responsibilities = ["Terminal Local", "Scripts"];
      }
      this._renderResponsibilities();
    }
  }

  // Open in "Edit Existing Terminal Configuration" mode
  openEdit(node) {
    if (!node) return;
    this.isEditMode = true;
    this.editingNodeId = node.id;
    this.selectedPreset = node.preset || "shell";
    this.selectedIcon = node.icon || "💻";
    this.selectedTheme = node.terminalTheme || "vscode";
    this.responsibilities = [...(node.responsibilities || [])];

    if (this.overlay) {
      this.overlay.classList.add("active");

      const titleEl = document.querySelector("#terminal-modal-overlay .modal-title");
      if (titleEl) titleEl.innerHTML = `⚙️ Configurações: ${node.title || 'Terminal'}`;

      const btnAction = document.getElementById("btn-modal-create");
      if (btnAction) btnAction.textContent = "Salvar Alterações";

      const nameInput = document.getElementById("input-term-name");
      if (nameInput) nameInput.value = node.title || "Terminal";

      const iconInput = document.getElementById("input-term-icon");
      if (iconInput) iconInput.value = this.selectedIcon;
      document.querySelectorAll(".quick-icon-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.icon === this.selectedIcon);
      });

      const cmdInput = document.getElementById("input-term-cmd");
      if (cmdInput) cmdInput.value = node.command || "powershell.exe";

      const cwdInput = document.getElementById("input-term-cwd");
      if (cwdInput) cwdInput.value = node.cwd || "";

      const orchCheckbox = document.getElementById("checkbox-is-orchestrator");
      if (orchCheckbox) orchCheckbox.checked = Boolean(node.is_orchestrator);

      const ctrlCheckbox = document.getElementById("checkbox-is-controllable");
      if (ctrlCheckbox) ctrlCheckbox.checked = (node.is_controllable !== false);

      const colorSelect = document.getElementById("select-term-color");
      if (colorSelect && node.borderColor) colorSelect.value = node.borderColor;

      const themeSelect = document.getElementById("select-term-theme");
      if (themeSelect) themeSelect.value = this.selectedTheme;
      this._updateThemePreview(this.selectedTheme);

      document.querySelectorAll(".quick-card").forEach(c => {
        c.classList.toggle("active", c.dataset.preset === this.selectedPreset);
      });

      this._switchTab(this.activeTab || "details");
      this._renderResponsibilities();
    }
  }

  close() {
    if (this.overlay) {
      this.overlay.classList.remove("active");
    }
    this.targetX = null;
    this.targetY = null;
    this.targetWidth = null;
    this.targetHeight = null;
    this.responsibilities = [];
    this.isEditMode = false;
    this.editingNodeId = null;
  }

  _updateFormForPreset(preset) {
    const nameInput = document.getElementById("input-term-name");
    const cmdInput = document.getElementById("input-term-cmd");
    const iconInput = document.getElementById("input-term-icon");

    if (preset === "antigravity") {
      if (nameInput) nameInput.value = "Antigravity";
      if (cmdInput) cmdInput.value = "agy";
      if (iconInput) iconInput.value = "✨";
      this.selectedIcon = "✨";
    } else if (preset === "claude") {
      if (nameInput) nameInput.value = "Claude Code";
      if (cmdInput) cmdInput.value = "claude";
      if (iconInput) iconInput.value = "🟣";
      this.selectedIcon = "🟣";
    } else if (preset === "codex") {
      if (nameInput) nameInput.value = "Codex";
      if (cmdInput) cmdInput.value = "codex";
      if (iconInput) iconInput.value = "🟢";
      this.selectedIcon = "🟢";
    } else if (preset === "shell") {
      if (nameInput) nameInput.value = "PowerShell";
      if (cmdInput) cmdInput.value = "powershell.exe";
      if (iconInput) iconInput.value = "💻";
      this.selectedIcon = "💻";
    }

    document.querySelectorAll(".quick-icon-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.icon === this.selectedIcon);
    });
  }

  _switchTab(tab) {
    const detailsView = document.getElementById("tab-view-details");
    const appearanceView = document.getElementById("tab-view-appearance");
    if (tab === "details") {
      if (detailsView) detailsView.style.display = "block";
      if (appearanceView) appearanceView.style.display = "none";
    } else {
      if (detailsView) detailsView.style.display = "none";
      if (appearanceView) appearanceView.style.display = "block";
    }
  }

  saveOrSubmitModal() {
    const name = document.getElementById("input-term-name")?.value || "Terminal";
    const command = document.getElementById("input-term-cmd")?.value || "powershell.exe";
    const cwd = document.getElementById("input-term-cwd")?.value || "";
    const monitorActivity = document.getElementById("input-term-monitor")?.checked ?? true;
    const isOrchestrator = document.getElementById("checkbox-is-orchestrator")?.checked ?? false;
    const isControllable = document.getElementById("checkbox-is-controllable")?.checked ?? true;
    const color = document.getElementById("select-term-color")?.value || "#3b82f6";
    const size = document.getElementById("select-term-size")?.value || "standard";
    const theme = document.getElementById("select-term-theme")?.value || this.selectedTheme || "vscode";
    const icon = document.getElementById("input-term-icon")?.value || this.selectedIcon || "💻";

    if (this.isEditMode && this.editingNodeId) {
      // Edit existing terminal node
      if (window.MaestriApp) {
        window.MaestriApp.updateTerminalNode(this.editingNodeId, {
          title: name,
          command: command,
          preset: this.selectedPreset,
          cwd: cwd,
          monitorActivity: monitorActivity,
          isOrchestrator: isOrchestrator,
          isControllable: isControllable,
          responsibilities: [...this.responsibilities],
          color: color,
          terminalTheme: theme,
          icon: icon
        });
      }
    } else {
      // Create new terminal node
      let width = this.targetWidth || 520;
      let height = this.targetHeight || 320;
      if (!this.targetWidth) {
        if (size === "compact") {
          width = 420;
          height = 260;
        } else if (size === "large") {
          width = 680;
          height = 440;
        }
      }

      if (window.MaestriApp) {
        window.MaestriApp.createTerminalNode({
          title: name,
          command: command,
          preset: this.selectedPreset,
          cwd: cwd,
          monitorActivity: monitorActivity,
          isOrchestrator: isOrchestrator,
          isControllable: isControllable,
          responsibilities: [...this.responsibilities],
          color: color,
          terminalTheme: theme,
          icon: icon,
          width: width,
          height: height,
          x: this.targetX,
          y: this.targetY
        });
      }
    }

    this.close();
  }
}

window.MaestriModalManager = MaestriModalManager;
