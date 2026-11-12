/**
 * Modal Manager for Maestri Desktop (v3.0)
 * Handles "New Terminal" and "Edit Existing Terminal" modals with 3 tabs:
 * [Detalhes][Aparência][Agente] matching official Maestri screenshots.
 * - 5 Agent Presets: Antigravity, Claude Code, Codex, DeepSeek, Shell
 * - Customizable Window Icons
 * - Multiple Terminal Themes with Interactive Live Preview
 * - Native Folder Picker integration
 * - Granular Responsibility Management
 * - Agent Configuration Tab (NEW): Model, Temperature, System Prompt, Max Tokens
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
    this.selectedIcon = "laptop";
    this.selectedAppearanceIcon = "prompt";
    this.selectedTheme = "vscode";
    this._initModal();
    this._initAppearance32Grid();
    this._initAppleColors();
  }

  _initAppearance32Grid() {
    const grid = document.getElementById("appearance-32-icon-grid");
    if (!grid) return;
    const list = window.MAESTRI_APPEARANCE_LIST || [];
    grid.innerHTML = "";
    list.forEach((item, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "appearance-icon-btn";
      btn.dataset.iconId = item.id;
      btn.title = item.label;
      btn.innerHTML = item.svg;
      if (this.selectedAppearanceIcon === item.id || (!this.selectedAppearanceIcon && idx === 1)) {
        btn.classList.add("active");
      }
      btn.addEventListener("click", () => {
        grid.querySelectorAll(".appearance-icon-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.selectedAppearanceIcon = item.id;
        this.selectedIcon = item.id;
        const iconInput = document.getElementById("input-term-icon");
        if (iconInput) iconInput.value = item.id;
      });
      grid.appendChild(btn);
    });
  }

  _initAppleColors() {
    const palette = document.getElementById("apple-color-palette") || document.getElementById("apple-color-swatches");
    const colorSelect = document.getElementById("select-term-color");
    if (palette) {
      const circles = palette.querySelectorAll(".color-circle");
      circles.forEach(circle => {
        circle.addEventListener("click", () => {
          circles.forEach(c => c.classList.remove("active"));
          circle.classList.add("active");
          const col = circle.dataset.color || circle.style.backgroundColor;
          this.selectedBorderColor = col;
          if (colorSelect) colorSelect.value = col;
        });
      });
    }

    // Segmented control: Terminal | Chat (Print 6)
    document.querySelectorAll(".segmented-control .segmented-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".segmented-control .segmented-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.selectedFace = btn.dataset.face || "terminal";
      });
    });

    // Theme preview cards: Sistema | Escuro | Claro | + Personalizado (Print 6)
    document.querySelectorAll(".theme-cards-grid .theme-preview-card").forEach(card => {
      card.addEventListener("click", () => {
        document.querySelectorAll(".theme-cards-grid .theme-preview-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        this.selectedTheme = card.dataset.theme || "system";
        const themeSelect = document.getElementById("select-term-theme");
        if (themeSelect) themeSelect.value = this.selectedTheme;
      });
    });
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

    // Tab buttons (Details / Appearance / Agent) - 3 tabs as per requirement
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
        this.selectedIcon = btn.dataset.icon || "laptop";
        const iconInput = document.getElementById("input-term-icon");
        if (iconInput) iconInput.value = this.selectedIcon;
      });
    });

    const iconInput = document.getElementById("input-term-icon");
    iconInput?.addEventListener("input", () => {
      const val = iconInput.value.trim() || "laptop";
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
          btnBrowseCwd.innerHTML = `${window.MAESTRI_ICONS?.get?.('topbar', 'folder') || ''} Procurar...`;
        }
      });
    }

    // Agent tab: Model selector change
    const modelSelect = document.getElementById("select-agent-model");
    if (modelSelect) {
      modelSelect.addEventListener("change", () => {
        const model = modelSelect.value;
        const tempInput = document.getElementById("input-agent-temperature");
        const tokensInput = document.getElementById("input-agent-max-tokens");
        // Adjust defaults based on model
        if (model.includes("opus") || model.includes("sonnet")) {
          if (tempInput && !tempInput.dataset.userSet) tempInput.value = "0.7";
          if (tokensInput && !tokensInput.dataset.userSet) tokensInput.value = "8192";
        } else if (model.includes("gpt-4")) {
          if (tempInput && !tempInput.dataset.userSet) tempInput.value = "0.7";
          if (tokensInput && !tokensInput.dataset.userSet) tokensInput.value = "4096";
        } else if (model.includes("deepseek")) {
          if (tempInput && !tempInput.dataset.userSet) tempInput.value = "0.3";
          if (tokensInput && !tokensInput.dataset.userSet) tokensInput.value = "8192";
        } else {
          if (tempInput && !tempInput.dataset.userSet) tempInput.value = "0.7";
          if (tokensInput && !tokensInput.dataset.userSet) tokensInput.value = "4096";
        }
      });
    }

    // Track user-set values
    ["input-agent-temperature", "input-agent-max-tokens"].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", () => {
          el.dataset.userSet = "true";
        });
      }
    });

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

    // Escape key to close
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.overlay?.classList.contains("active")) {
        this.close();
      }
    });
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
        <button type="button" class="resp-del-btn" data-index="${idx}" title="Remover responsabilidade">${window.MAESTRI_ICONS?.get?.('actionbar', 'delete') || ''}</button>
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
    this.selectedIcon = "laptop";
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

      // Agent tab defaults
      this._resetAgentTab();

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
        this.responsibilities = ["IA Assistente", "Análise de Código", "Orquestração"];
      } else if (savedPreset === "codex") {
        this.responsibilities = ["Implementação de Código", "Automação", "Refatoração"];
      } else if (savedPreset === "claude") {
        this.responsibilities = ["Desenvolvedor Fullstack", "Refatoração", "Code Review"];
      } else if (savedPreset === "deepseek") {
        this.responsibilities = ["Raciocínio Complexo", "Otimização", "Arquitetura"];
      } else {
        this.responsibilities = ["Terminal Local", "Scripts", "Admin"];
      }
      this._renderResponsibilities();
    }
  }

  _resetAgentTab() {
    const modelSelect = document.getElementById("select-agent-model");
    const tempInput = document.getElementById("input-agent-temperature");
    const tokensInput = document.getElementById("input-agent-max-tokens");
    const sysPrompt = document.getElementById("input-agent-system-prompt");
    const presetPrompt = document.getElementById("select-agent-preset-prompt");

    if (modelSelect) modelSelect.value = "claude-sonnet-5-5";
    if (tempInput) { tempInput.value = "0.7"; delete tempInput.dataset.userSet; }
    if (tokensInput) { tokensInput.value = "8192"; delete tokensInput.dataset.userSet; }
    if (sysPrompt) sysPrompt.value = "";
    if (presetPrompt) presetPrompt.value = "";
  }

  // Open in "Edit Existing Terminal Configuration" mode
  openEdit(node) {
    if (!node) return;
    this.isEditMode = true;
    this.editingNodeId = node.id;
    this.selectedPreset = node.preset || "shell";
    this.selectedIcon = node.icon || "laptop";
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

      this._initAppearance32Grid();
      this._initAppleColors();

      if (node.borderColor) {
        const swatchesContainer = document.getElementById("apple-color-swatches");
        const nameDisplay = document.getElementById("apple-color-name-display");
        if (swatchesContainer) {
          swatchesContainer.querySelectorAll(".apple-color-swatch").forEach(s => {
            const isMatch = s.dataset.hex.toLowerCase() === node.borderColor.toLowerCase();
            s.classList.toggle("active", isMatch);
            if (isMatch && nameDisplay) nameDisplay.textContent = s.dataset.name;
          });
        }
      }

      const themeSelect = document.getElementById("select-term-theme");
      if (themeSelect) themeSelect.value = this.selectedTheme;
      this._updateThemePreview(this.selectedTheme);

      // Agent tab - populate from node
      const modelSelect = document.getElementById("select-agent-model");
      if (modelSelect && node.aiModel) modelSelect.value = node.aiModel;

      const tempInput = document.getElementById("input-agent-temperature");
      if (tempInput && node.aiTemperature !== undefined) tempInput.value = node.aiTemperature;

      const tokensInput = document.getElementById("input-agent-max-tokens");
      if (tokensInput && node.aiMaxTokens) tokensInput.value = node.aiMaxTokens;

      const sysPrompt = document.getElementById("input-agent-system-prompt");
      if (sysPrompt && node.aiSystemPrompt) sysPrompt.value = node.aiSystemPrompt;

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

    // Agent tab specific defaults
    const modelSelect = document.getElementById("select-agent-model");
    const tempInput = document.getElementById("input-agent-temperature");
    const tokensInput = document.getElementById("input-agent-max-tokens");
    const sysPrompt = document.getElementById("input-agent-system-prompt");

    if (preset === "antigravity") {
      if (nameInput) nameInput.value = "Antigravity";
      if (cmdInput) cmdInput.value = "agy";
      if (iconInput) iconInput.value = "sparkle";
      this.selectedIcon = "sparkle";
      if (modelSelect) modelSelect.value = "claude-opus-5-5";
      if (tempInput) { tempInput.value = "0.5"; delete tempInput.dataset.userSet; }
      if (tokensInput) { tokensInput.value = "8192"; delete tokensInput.dataset.userSet; }
      if (sysPrompt) sysPrompt.value = "Você é o Orquestrador Chefe (Antigravity). Sua função é PENSAR, CONTEXTUALIZAR e FORMULAR ORDENS estratégicas. Você NÃO executa trabalho técnico diretamente — delega tudo aos nós subordinados. Use a ferramenta de orquestração para despachar missões claras, com objetivos mensuráveis e critérios de aceite.";
    } else if (preset === "claude") {
      if (nameInput) nameInput.value = "Claude Code";
      if (cmdInput) cmdInput.value = "claude";
      if (iconInput) iconInput.value = "brain";
      this.selectedIcon = "brain";
      if (modelSelect) modelSelect.value = "claude-sonnet-5-5";
      if (tempInput) { tempInput.value = "0.7"; delete tempInput.dataset.userSet; }
      if (tokensInput) { tokensInput.value = "8192"; delete tokensInput.dataset.userSet; }
      if (sysPrompt) sysPrompt.value = "Você é um engenheiro de software sênior (Claude Code). Escreva código limpo, testável e bem documentado. Siga as convenções do projeto. Prefira composição sobre herança. Use TypeScript estrito. Escreva testes para lógica crítica.";
    } else if (preset === "codex") {
      if (nameInput) nameInput.value = "Codex";
      if (cmdInput) cmdInput.value = "codex";
      if (iconInput) iconInput.value = "chip";
      this.selectedIcon = "chip";
      if (modelSelect) modelSelect.value = "gpt-4o";
      if (tempInput) { tempInput.value = "0.3"; delete tempInput.dataset.userSet; }
      if (tokensInput) { tokensInput.value = "4096"; delete tokensInput.dataset.userSet; }
      if (sysPrompt) sysPrompt.value = "Você é o Codex, agente de implementação autônoma. Foque em: implementar features completas, escrever testes, corrigir bugs, refatorar código legado. Entregue diffs prontos para merge. Não peça confirmação para passos óbvios.";
    } else if (preset === "deepseek") {
      if (nameInput) nameInput.value = "DeepSeek";
      if (cmdInput) cmdInput.value = "deepseek";
      if (iconInput) iconInput.value = "cpu";
      this.selectedIcon = "cpu";
      if (modelSelect) modelSelect.value = "deepseek-coder";
      if (tempInput) { tempInput.value = "0.2"; delete tempInput.dataset.userSet; }
      if (tokensInput) { tokensInput.value = "8192"; delete tokensInput.dataset.userSet; }
      if (sysPrompt) sysPrompt.value = "Você é o DeepSeek, especialista em raciocínio complexo, otimização de algoritmos e arquitetura de sistemas. Resolva problemas difíceis passo a passo. Otimize para performance e correção. Explique seu raciocínio antes de codificar.";
    } else if (preset === "shell") {
      if (nameInput) nameInput.value = "PowerShell";
      if (cmdInput) cmdInput.value = "powershell.exe";
      if (iconInput) iconInput.value = "laptop";
      this.selectedIcon = "laptop";
      if (modelSelect) modelSelect.value = "local-shell";
      if (tempInput) { tempInput.value = "0"; delete tempInput.dataset.userSet; }
      if (tokensInput) { tokensInput.value = "0"; delete tokensInput.dataset.userSet; }
      if (sysPrompt) sysPrompt.value = "";
    }

    document.querySelectorAll(".quick-icon-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.icon === this.selectedIcon);
    });
  }

  _switchTab(tab) {
    const detailsView = document.getElementById("tab-view-details");
    const appearanceView = document.getElementById("tab-view-appearance");
    const agentView = document.getElementById("tab-view-agent");

    // Hide all
    [detailsView, appearanceView, agentView].forEach(v => {
      if (v) v.style.display = "none";
    });

    // Show selected
    if (tab === "details" && detailsView) detailsView.style.display = "block";
    else if (tab === "appearance" && appearanceView) appearanceView.style.display = "block";
    else if (tab === "agent" && agentView) agentView.style.display = "block";
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
    const icon = document.getElementById("input-term-icon")?.value || this.selectedIcon || "laptop";

    // Agent tab data
    const aiModel = document.getElementById("select-agent-model")?.value || "claude-sonnet-5-5";
    const aiTemperature = parseFloat(document.getElementById("input-agent-temperature")?.value) || 0.7;
    const aiMaxTokens = parseInt(document.getElementById("input-agent-max-tokens")?.value) || 8192;
    const aiSystemPrompt = document.getElementById("input-agent-system-prompt")?.value || "";

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
          icon: icon,
          aiModel: aiModel,
          aiTemperature: aiTemperature,
          aiMaxTokens: aiMaxTokens,
          aiSystemPrompt: aiSystemPrompt
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
          aiModel: aiModel,
          aiTemperature: aiTemperature,
          aiMaxTokens: aiMaxTokens,
          aiSystemPrompt: aiSystemPrompt,
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