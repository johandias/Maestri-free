/**
 * Terminal Manager for Maestri Desktop (v3.0 - Maestri Parity Edition)
 * Integrates xterm.js inside Canvas cards with Apple/Maestri-style window controls,
 * Agent Preset badges, Dynamic Status Indicators, Editable Titles, and Frosted Glass aesthetics.
 * Powered by ConPTY backend with real cursor positioning, native prompt and UTF-8.
 */

// Agent Preset Configuration with icons, colors, and display names
const AGENT_PRESETS = {
  antigravity: {
    name: "Antigravity",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
    color: "#02b5e2",
    bgColor: "rgba(2, 181, 226, 0.12)",
    borderColor: "rgba(2, 181, 226, 0.35)",
    description: "Gemini / Antigravity Agent"
  },
  claude: {
    name: "Claude Code",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>',
    color: "#c2ebfc",
    bgColor: "rgba(1, 80, 137, 0.28)",
    borderColor: "rgba(2, 181, 226, 0.40)",
    description: "Anthropic Claude Code Agent"
  },
  codex: {
    name: "Codex",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/></svg>',
    color: "#02b5e2",
    bgColor: "rgba(1, 80, 137, 0.18)",
    borderColor: "rgba(1, 80, 137, 0.40)",
    description: "OpenAI Codex Agent"
  },
  deepseek: {
    name: "DeepSeek",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="2.5"/><circle cx="5" cy="6" r="1.8"/><circle cx="19" cy="6" r="1.8"/><circle cx="5" cy="18" r="1.8"/><circle cx="19" cy="18" r="1.8"/><path d="M10 10.2L6.3 7.3M14 10.2l3.7-2.9M10 13.8l-3.7 2.9M14 13.8l3.7 2.9"/></svg>',
    color: "#c2ebfc",
    bgColor: "rgba(0, 38, 71, 0.40)",
    borderColor: "rgba(2, 181, 226, 0.30)",
    description: "DeepSeek AI Agent"
  },
  shell: {
    name: "Shell",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7l5 5-5 5M12 18h7"/></svg>',
    color: "#ffffff",
    bgColor: "rgba(0, 38, 71, 0.25)",
    borderColor: "rgba(194, 235, 252, 0.25)",
    description: "Native Shell / PowerShell"
  }
};

window.AGENT_PRESETS = AGENT_PRESETS;

const TERMINAL_THEMES = {
  "vscode": {
    name: "VS Code Dark+",
    background: "#181818",
    foreground: "#cccccc",
    cursor: "#ffffff",
    cursorAccent: "#181818",
    selectionBackground: "rgba(255, 255, 255, 0.25)",
    black: "#000000", red: "#cd3131", green: "#0dbc79", yellow: "#e5e510",
    blue: "#2472c8", magenta: "#bc3fbc", cyan: "#11a8cd", white: "#e5e5e5",
    brightBlack: "#666666", brightRed: "#f14c4c", brightGreen: "#23d18b", brightYellow: "#f5f543",
    brightBlue: "#3b8eea", brightMagenta: "#d670d6", brightCyan: "#29b8db", brightWhite: "#ffffff"
  },
  "tokyo-night": {
    name: "Tokyo Night",
    background: "#1a1b26",
    foreground: "#a9b1d6",
    cursor: "#c0caf5",
    cursorAccent: "#1a1b26",
    selectionBackground: "rgba(122, 162, 247, 0.3)",
    black: "#32344a", red: "#f7768e", green: "#9ece6a", yellow: "#e0af68",
    blue: "#7aa2f7", magenta: "#bb9af7", cyan: "#7dcfff", white: "#a9b1d6",
    brightBlack: "#444b6a", brightRed: "#ff7a93", brightGreen: "#b9f27c", brightYellow: "#ff9e64",
    brightBlue: "#7da6ff", brightMagenta: "#c0caf5", brightCyan: "#0db9d7", brightWhite: "#acb0d0"
  },
  "dracula": {
    name: "Dracula",
    background: "#282a36",
    foreground: "#f8f8f2",
    cursor: "#f8f8f2",
    cursorAccent: "#282a36",
    selectionBackground: "rgba(68, 71, 90, 0.7)",
    black: "#21222c", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c",
    blue: "#bd93f9", magenta: "#ff79c6", cyan: "#8be9fd", white: "#f8f8f2",
    brightBlack: "#6272a4", brightRed: "#ff6e6e", brightGreen: "#69ff94", brightYellow: "#ffffa5",
    brightBlue: "#d6acff", brightMagenta: "#ff92df", brightCyan: "#a4ffff", brightWhite: "#ffffff"
  },
  "cyberpunk": {
    name: "Cyberpunk 2077",
    background: "#0b0e14",
    foreground: "#00ff9f",
    cursor: "#ffe600",
    cursorAccent: "#0b0e14",
    selectionBackground: "rgba(255, 0, 85, 0.35)",
    black: "#121820", red: "#ff0055", green: "#00ff9f", yellow: "#ffe600",
    blue: "#00b8ff", magenta: "#d600ff", cyan: "#00f0ff", white: "#fcee0a",
    brightBlack: "#384b60", brightRed: "#ff3377", brightGreen: "#33ffb2", brightYellow: "#ffea33",
    brightBlue: "#33c6ff", brightMagenta: "#de33ff", brightCyan: "#33f3ff", brightWhite: "#ffffff"
  },
  "solarized": {
    name: "Solarized Dark",
    background: "#002b36",
    foreground: "#839496",
    cursor: "#93a1a1",
    cursorAccent: "#002b36",
    selectionBackground: "rgba(7, 54, 66, 0.8)",
    black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900",
    blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5",
    brightBlack: "#586e75", brightRed: "#cb4b16", brightGreen: "#586e75", brightYellow: "#657b83",
    brightBlue: "#839496", brightMagenta: "#6c71c4", brightCyan: "#93a1a1", brightWhite: "#fdf6e3"
  },
  "monokai": {
    name: "Monokai Pro",
    background: "#221f22",
    foreground: "#fcfcfa",
    cursor: "#ffd866",
    cursorAccent: "#221f22",
    selectionBackground: "rgba(255, 216, 102, 0.25)",
    black: "#403e41", red: "#ff6188", green: "#a9dc76", yellow: "#ffd866",
    blue: "#fc9867", magenta: "#ab9df2", cyan: "#78dce8", white: "#fcfcfa",
    brightBlack: "#727072", brightRed: "#ff6188", brightGreen: "#a9dc76", brightYellow: "#ffd866",
    brightBlue: "#fc9867", brightMagenta: "#ab9df2", brightCyan: "#78dce8", brightWhite: "#ffffff"
  },
  "nord": {
    name: "Nord",
    background: "#2e3440",
    foreground: "#d8dee9",
    cursor: "#eceff4",
    cursorAccent: "#2e3440",
    selectionBackground: "rgba(67, 76, 94, 0.8)",
    black: "#3b4252", red: "#bf616a", green: "#a3be8c", yellow: "#ebcb8b",
    blue: "#81a1c1", magenta: "#b48ead", cyan: "#88c0d0", white: "#e5e9f0",
    brightBlack: "#4c566a", brightRed: "#bf616a", brightGreen: "#a3be8c", brightYellow: "#ebcb8b",
    brightBlue: "#81a1c1", brightMagenta: "#b48ead", brightCyan: "#8fbcbb", brightWhite: "#eceff4"
  }
};

window.TERMINAL_THEMES = TERMINAL_THEMES;

// ============================================================================
// Terminal Header Factory - Creates Apple/Maestri-style window header with:
// - Window dots (Red: close, Yellow: minimize, Green: maximize/fit)
// - Agent Preset Badge with icon & color
// - Dynamic Status Indicator (pulsing dot with states)
// - Editable Title (double-click to edit)
// - Action Buttons (Clear, Restart, Connect)
// ============================================================================
function createTerminalHeader(sessionData, onClose, onMinimize, onMaximize, onClear, onRestart, onConnect) {
  const presetKey = (sessionData.preset || "shell").toLowerCase();
  const preset = AGENT_PRESETS[presetKey] || AGENT_PRESETS.shell;
  const isOrchestrator = sessionData.is_orchestrator === true;
  const customIcon = sessionData.icon || preset.icon;

  const header = document.createElement("div");
  header.className = "terminal-header-modern";
  header.dataset.sessionId = sessionData.id;

  // Window Dots (Apple-style traffic lights)
  const windowDots = document.createElement("div");
  windowDots.className = "window-dots-modern";

  const dotClose = document.createElement("span");
  dotClose.className = "window-dot dot-close";
  dotClose.title = "Fechar Terminal";
  dotClose.innerHTML = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M3 3L9 9M9 3L3 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  dotClose.addEventListener("click", (e) => {
    e.stopPropagation();
    if (confirm(`Fechar o terminal "${sessionData.title || preset.name}"?`)) {
      onClose(sessionData.id);
    }
  });

  const dotMinimize = document.createElement("span");
  dotMinimize.className = "window-dot dot-minimize";
  dotMinimize.title = "Minimizar/Recolher (Apenas Cabeçalho)";
  dotMinimize.innerHTML = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M3 6L9 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  let isMinimized = false;
  dotMinimize.addEventListener("click", (e) => {
    e.stopPropagation();
    isMinimized = !isMinimized;
    onMinimize(sessionData.id, isMinimized);
    dotMinimize.innerHTML = isMinimized
      ? `<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M3 6L9 6M6 3L6 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`
      : `<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M3 6L9 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    dotMinimize.title = isMinimized ? "Expandir Terminal" : "Minimizar/Recolher (Apenas Cabeçalho)";
  });

  const dotMaximize = document.createElement("span");
  dotMaximize.className = "window-dot dot-maximize";
  dotMaximize.title = "Ajustar à Tela / Focar (Fit to View)";
  dotMaximize.innerHTML = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>`;
  dotMaximize.addEventListener("click", (e) => {
    e.stopPropagation();
    onMaximize(sessionData.id);
  });

  windowDots.append(dotClose, dotMinimize, dotMaximize);

  // Preset Badge
  const presetBadge = document.createElement("div");
  presetBadge.className = "preset-badge";
  presetBadge.style.setProperty("--preset-color", preset.color);
  presetBadge.style.setProperty("--preset-bg", preset.bgColor);
  presetBadge.style.setProperty("--preset-border", preset.borderColor);
  presetBadge.innerHTML = `
    <span class="preset-icon" aria-hidden="true">${customIcon}</span>
    <span class="preset-name">${preset.name}</span>
    ${isOrchestrator ? '<span class="orchestrator-crown" title="Orquestrador Chefe"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg></span>' : ''}
  `;

  // Status Indicator (Pulsing Dot)
  const statusIndicator = document.createElement("div");
  statusIndicator.className = "status-indicator";
  statusIndicator.innerHTML = `
    <span class="status-dot" data-state="connecting"></span>
    <span class="status-tooltip">Conectando...</span>
  `;

  // Editable Title
  const titleWrapper = document.createElement("div");
  titleWrapper.className = "terminal-title-wrapper";
  titleWrapper.innerHTML = `
    <span class="terminal-title-display" data-original="${sessionData.title || preset.name}">${sessionData.title || preset.name}</span>
    <input type="text" class="terminal-title-input" value="${sessionData.title || preset.name}" style="display:none;">
    <button class="edit-title-btn" title="Editar título (duplo clique também funciona)" aria-label="Editar título">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
    </button>
  `;

  const titleDisplay = titleWrapper.querySelector(".terminal-title-display");
  const titleInput = titleWrapper.querySelector(".terminal-title-input");
  const editBtn = titleWrapper.querySelector(".edit-title-btn");

  const saveTitle = () => {
    const newTitle = titleInput.value.trim() || preset.name;
    if (newTitle !== titleDisplay.dataset.original) {
      titleDisplay.textContent = newTitle;
      titleDisplay.dataset.original = newTitle;
      // Save to workspace via API
      fetch(`/api/nodes/${sessionData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle })
      }).catch(console.warn);
    }
    titleInput.style.display = "none";
    titleDisplay.style.display = "";
    editBtn.style.display = "";
  };

  const startEdit = () => {
    titleDisplay.style.display = "none";
    editBtn.style.display = "none";
    titleInput.style.display = "inline-block";
    titleInput.focus();
    titleInput.select();
  };

  titleDisplay.addEventListener("dblclick", startEdit);
  editBtn.addEventListener("click", (e) => { e.stopPropagation(); startEdit(); });
  titleInput.addEventListener("blur", saveTitle);
  titleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveTitle();
    if (e.key === "Escape") {
      titleInput.value = titleDisplay.dataset.original;
      saveTitle();
    }
  });

  // Action Buttons Bar
  const actionBar = document.createElement("div");
  actionBar.className = "terminal-action-bar";

  const btnClear = document.createElement("button");
  btnClear.className = "action-btn action-clear";
  btnClear.title = "Limpar Buffer (Ctrl+L)";
  btnClear.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
  btnClear.addEventListener("click", (e) => { e.stopPropagation(); onClear(sessionData.id); });

  const btnRestart = document.createElement("button");
  btnRestart.className = "action-btn action-restart";
  btnRestart.title = "Reiniciar Sessão";
  btnRestart.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`;
  btnRestart.addEventListener("click", (e) => { e.stopPropagation(); onRestart(sessionData.id); });

  const btnConnect = document.createElement("button");
  btnConnect.className = "action-btn action-connect";
  btnConnect.title = "Conectar / Reconectar";
  btnConnect.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
  btnConnect.addEventListener("click", (e) => { e.stopPropagation(); onConnect(sessionData.id); });

  actionBar.append(btnClear, btnRestart, btnConnect);

  // Assemble header
  header.append(windowDots, presetBadge, statusIndicator, titleWrapper, actionBar);

  return header;
}

// Expose for global use
window.createTerminalHeader = createTerminalHeader;
window.AGENT_PRESETS = AGENT_PRESETS;

class MaestriTerminalController {
  constructor() {
    this.terminals = {}; // sessionId -> { term, ws, container, fitAddon, themeKey }
    this._statusResetTimer = null;
    this._resizeFrameId = null;
    this._lastResizeTime = 0;
  }

  setTerminalTheme(sessionId, themeKey) {
    const session = this.terminals[sessionId];
    if (session && session.term) {
      const themeObj = TERMINAL_THEMES[themeKey] || TERMINAL_THEMES["vscode"];
      session.term.options.theme = themeObj;
      session.themeKey = themeKey;
      if (session.container) {
        session.container.style.backgroundColor = themeObj.background;
      }
    }
  }

  mountTerminal(elementId, sessionData) {
    const container = document.getElementById(elementId);
    if (!container) return;

    // 1. Cleanly tear down any pre-existing instance for this session
    if (this.terminals[sessionData.id]) {
      this.destroy(sessionData.id);
    }
    container.innerHTML = "";

    // 2. Create modern header and body structure FIRST
    const structure = this.createModernTerminalStructure(sessionData.id, sessionData);
    if (!structure) return;

    // 3. Get the new body container
    const newContainer = structure.bodyEl;
    if (!newContainer) return;

    let term = null;
    let fitAddon = null;
    const themeKey = sessionData.terminalTheme || "vscode";
    const chosenTheme = TERMINAL_THEMES[themeKey] || TERMINAL_THEMES["vscode"];

    try {
      const TerminalClass = window.Terminal || (typeof Terminal !== "undefined" ? Terminal : null);
      if (TerminalClass) {
        term = new TerminalClass({
          cursorBlink: true,
          cursorStyle: "block",
          cursorInactiveStyle: "outline",
          cursorWidth: 2,
          fontSize: 13,
          fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace",
          letterSpacing: 0,
          lineHeight: 1.2,
          convertEol: false,
          windowsMode: false,
          scrollback: 10000,
          theme: chosenTheme
        });

        const FitAddonClass = window.FitAddon?.FitAddon || (typeof FitAddon !== "undefined" ? FitAddon.FitAddon : null);
        if (FitAddonClass) {
          fitAddon = new FitAddonClass();
          term.loadAddon(fitAddon);
        }

        // Open terminal into the NEW body container
        term.open(newContainer);

        // Click to focus unless user is currently connecting nodes
        newContainer.addEventListener("click", () => {
          if (!window.MaestriApp?.canvas?.isConnecting) {
            term.focus();
          }
        });
        newContainer.addEventListener("mousedown", () => {
          if (!window.MaestriApp?.canvas?.isConnecting) {
            term.focus();
          }
        });

        // Strictly isolate scroll events to terminal viewport (never zoom canvas)
        newContainer.addEventListener("wheel", (e) => {
          e.stopPropagation();
        }, { passive: true });

        // Right-Click Context Menu
        newContainer.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (window.MaestriApp?.canvas?.isConnecting) return;
          if (window.MaestriApp?.contextMenu) {
            window.MaestriApp.contextMenu.showForTerminal(e, sessionData.id);
          }
        });

        // Copy on select
        term.onSelectionChange(() => {
          const sel = term.getSelection();
          if (sel && sel.trim().length > 0) {
            try {
              navigator.clipboard.writeText(sel);
            } catch (e) {}
          }
        });

        // Standard terminal shortcut handling
        term.attachCustomKeyEventHandler((e) => {
          if (e.type === "keydown") {
            if (e.ctrlKey && e.shiftKey && e.code === "KeyC") {
              const sel = term.getSelection();
              if (sel) navigator.clipboard.writeText(sel);
              return false;
            }
            if ((e.ctrlKey && e.shiftKey && e.code === "KeyV") || (e.shiftKey && e.code === "Insert")) {
              navigator.clipboard.readText().then(text => {
                if (text && ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "input", data: text }));
                }
              }).catch(() => {});
              return false;
            }
          }
          return true;
        });
      } else {
        throw new Error("Terminal library not loaded");
      }
    } catch (err) {
      console.warn("xterm init fallback:", err);
      newContainer.innerHTML = `<div class="term-fallback" style="padding: 10px; color: #10b981; font-family: monospace; font-size: 12px; height: 100%; overflow-y: auto;">
        <div>Maestri Terminal Session [${sessionData.preset || 'Shell'}]</div>
        <div style="color: #94a3b8; margin: 6px 0;">> ${sessionData.command || 'powershell'}</div>
        <div style="color: #64748b;">Ready.</div>
      </div>`;
      return;
    }

    // Connect WebSocket
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host || "localhost:8000";
    const preset = sessionData.preset || "shell";
    const command = encodeURIComponent(sessionData.command || "powershell.exe");
    const isOrch = sessionData.is_orchestrator ? "true" : "false";
    const title = encodeURIComponent(sessionData.title || "");
    const cwd = encodeURIComponent(sessionData.cwd || "");
    const wsUrl = `${proto}//${host}/ws/terminal/${sessionData.id}?preset=${preset}&command=${command}&is_orchestrator=${isOrch}&title=${title}&cwd=${cwd}`;

    let ws = null;
    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        this.setTerminalConnected(sessionData.id);
        const dims = this.fitTerminal(sessionData.id, false);
        ws.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
        term.focus();
      };

      ws.onmessage = (event) => {
        term.write(event.data);
        if (typeof event.data === "string" && window.MaestriApp) {
          const msg = event.data;
          // 1. Detect Orchestrator formulating or dispatching orders (Turn node amber/gold)
          if (
            msg.includes("👑 ORQUESTRADOR CENTRAL (CHEFE)") ||
            msg.includes("👑 [Maestri Chefe]") ||
            msg.includes("Despachando ordem")
          ) {
            window.MaestriApp.handleTerminalDispatchEvent(sessionData.id);
            this.setTerminalTransmitting(sessionData.id);
          }
          // 2. Detect Subordinate receiving directive or running tasks/AI (Turn node emerald green)
          else if (
            msg.includes("👑 DIRETIVA SUPERIOR RECEBIDA") ||
            msg.includes("Executando ordem") ||
            msg.includes("Thought for") ||
            msg.includes("Running (") ||
            msg.includes("Running command") ||
            msg.includes("maestri order") ||
            msg.includes("[Contexto Recebido") ||
            msg.includes("[Solicitação do Chefe")
          ) {
            window.MaestriApp.handleTerminalProcessingEvent(sessionData.id);
            this.setTerminalProcessing(sessionData.id);
          }
          // 3. Return to connected state after a brief delay for other messages
          else if (msg.trim().length > 0) {
            // Debounce back to connected
            if (this._statusResetTimer) clearTimeout(this._statusResetTimer);
            this._statusResetTimer = setTimeout(() => {
              this.setTerminalConnected(sessionData.id);
            }, 2000);
          }
        }
      };

      ws.onclose = () => {
        term.writeln("\r\n\x1b[90m[Conexão com terminal encerrada. Use o botão 🔄 no cabeçalho para reiniciar.]\x1b[0m");
        this.setTerminalDisconnected(sessionData.id);
      };

      ws.onerror = (err) => {
        console.warn("Terminal WS error:", err);
        this.setTerminalError(sessionData.id);
      };

      term.onData((data) => {
        // Discard automated terminal report responses
        if (/^\x1b\[(\?|>)[0-9;]*c/.test(data)) {
          return;
        }
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data: data }));
        }
      });
    } catch (e) {
      console.error("Failed to connect WS:", e);
      term.writeln("\x1b[31mErro ao conectar WebSocket do terminal.\x1b[0m");
    }

    // Store terminal instance with new container reference
    this.terminals[sessionData.id] = {
      term,
      ws,
      container: newContainer,
      fitAddon,
      lastCols: 80,
      lastRows: 24,
      conptyTimer: null,
      sessionData,
      isMinimized: false,
      headerEl: structure.headerEl,
      bodyEl: structure.bodyEl,
      statusEl: structure.statusEl
    };

    // Initial fit and focus
    setTimeout(() => {
      this.fitTerminal(sessionData.id, false);
      term.focus();
    }, 30);
  }

  createModernTerminalStructure(sessionId, sessionData) {
    const nodeEl = document.getElementById(sessionId);
    if (!nodeEl) return null;

    // Clear existing content
    nodeEl.innerHTML = "";

    // Create header using factory
    const header = createTerminalHeader(
      sessionData,
      (id) => this.closeTerminal(id),
      (id, minimized) => this.minimizeTerminal(id, minimized),
      (id) => this.maximizeTerminal(id),
      (id) => this.clearTerminal(id),
      (id) => this.restartTerminal(id),
      (id) => this.connectTerminal(id)
    );

    // Create terminal body container
    const body = document.createElement("div");
    body.className = "terminal-body-modern";
    body.id = `${sessionId}-body`;

    // Assemble node
    nodeEl.appendChild(header);
    nodeEl.appendChild(body);

    // Return references for storage
    return {
      headerEl: header,
      bodyEl: body,
      statusEl: header.querySelector(".status-indicator .status-dot")
    };
  }

  closeTerminal(sessionId) {
    const item = this.terminals[sessionId];
    if (item) {
      if (item.ws) item.ws.close();
      if (item.term) item.term.dispose();
      const nodeEl = document.getElementById(sessionId);
      if (nodeEl) nodeEl.remove();
      delete this.terminals[sessionId];
      // Also notify backend
      fetch(`/api/nodes/${sessionId}`, { method: "DELETE" }).catch(console.warn);
    }
  }

  minimizeTerminal(sessionId, minimized) {
    const item = this.terminals[sessionId];
    if (!item || !item.bodyEl) return;

    item.isMinimized = minimized;
    const nodeEl = document.getElementById(sessionId);
    if (nodeEl) {
      nodeEl.classList.toggle("terminal-minimized", minimized);
    }
    // Refit when expanding
    if (!minimized) {
      setTimeout(() => this.fitTerminal(sessionId, false), 50);
    }
  }

  maximizeTerminal(sessionId) {
    const nodeEl = document.getElementById(sessionId);
    if (!nodeEl) return;

    // Trigger canvas fit view for this node
    if (window.MaestriApp?.canvas) {
      window.MaestriApp.canvas.fitView(nodeEl);
    }
  }

  clearTerminal(sessionId) {
    const item = this.terminals[sessionId];
    if (item?.term) {
      item.term.clear();
      item.term.reset();
    }
  }

  restartTerminal(sessionId) {
    const item = this.terminals[sessionId];
    if (!item) return;

    const sessionData = item.sessionData;
    // Close existing connection and dispose old terminal
    if (item.ws) item.ws.close();
    if (item.term) item.term.dispose();

    // Update status
    this.updateTerminalStatus(sessionId, "connecting");

    // Re-mount terminal (will create new WebSocket connection)
    this.mountTerminal(sessionId, sessionData);
  }

  connectTerminal(sessionId) {
    const item = this.terminals[sessionId];
    if (!item) return;

    const sessionData = item.sessionData;
    if (item.ws && item.ws.readyState === WebSocket.OPEN) {
      // Already connected
      this.updateTerminalStatus(sessionId, "connected");
      return;
    }

    // Clean up old terminal if exists
    if (item.ws) item.ws.close();
    if (item.term) item.term.dispose();

    // Re-mount to reconnect
    this.mountTerminal(sessionId, sessionData);
  }

  updateTerminalStatus(sessionId, state) {
    const item = this.terminals[sessionId];
    if (!item || !item.statusEl) return;

    const dot = item.statusEl;
    const tooltip = item.statusEl.parentElement?.querySelector(".status-tooltip");

    // Remove all state classes
    dot.classList.remove("state-connecting", "state-connected", "state-transmitting", "state-processing", "state-disconnected", "state-error");

    // Add new state class
    dot.classList.add(`state-${state}`);

    // Update tooltip text
    const stateLabels = {
      connecting: "Conectando...",
      connected: "Conectado • Ativo",
      transmitting: "Transmitindo • Enviando ordem",
      processing: "Processando • Executando tarefa",
      disconnected: "Desconectado",
      error: "Erro de conexão"
    };

    if (tooltip) {
      tooltip.textContent = stateLabels[state] || state;
    }

    // Also update legacy indicator for backward compatibility
    const legacyIndicator = item.headerEl?.querySelector(".term-indicator");
    if (legacyIndicator) {
      legacyIndicator.classList.remove("idle", "running", "stopped", "crashed");
      if (state === "connected" || state === "processing") {
        legacyIndicator.classList.add("running");
      } else if (state === "transmitting") {
        legacyIndicator.classList.add("running");
      } else if (state === "disconnected" || state === "error") {
        legacyIndicator.classList.add("stopped");
      } else {
        legacyIndicator.classList.add("idle");
      }
    }
  }

  // Enhanced status update methods for orchestration events
  setTerminalTransmitting(sessionId) {
    this.updateTerminalStatus(sessionId, "transmitting");
  }

  setTerminalProcessing(sessionId) {
    this.updateTerminalStatus(sessionId, "processing");
  }

  setTerminalConnected(sessionId) {
    this.updateTerminalStatus(sessionId, "connected");
  }

  setTerminalDisconnected(sessionId) {
    this.updateTerminalStatus(sessionId, "disconnected");
  }

  setTerminalError(sessionId) {
    this.updateTerminalStatus(sessionId, "error");
  }

  fitTerminal(sessionId, isDragging = false) {
    const item = this.terminals[sessionId];
    if (!item) return { cols: 80, rows: 24 };
    const { term, container, ws, fitAddon, bodyEl } = item;
    if (!container || !term) return { cols: 80, rows: 24 };

    // Get dimensions from the terminal body (not the whole node when minimized)
    const measureEl = bodyEl || container;
    const width = measureEl.clientWidth;
    const height = measureEl.clientHeight;
    if (width <= 0 || height <= 0) return { cols: 80, rows: 24 };

    let cols = 80;
    let rows = 24;

    // 1. Try official FitAddon first (most accurate)
    if (fitAddon) {
      try {
        const proposed = fitAddon.proposeDimensions();
        if (proposed && proposed.cols > 10 && proposed.rows > 2) {
          cols = proposed.cols;
          rows = proposed.rows;
        }
      } catch (err) {}
    }

    // 2. Fallback: calculate from character metrics
    if (cols === 80 && rows === 24) {
      const core = term._core;
      const charWidth = (core?._renderService?.dimensions?.css?.cell?.width && core._renderService.dimensions.css.cell.width > 0)
        ? core._renderService.dimensions.css.cell.width
        : 7.82;
      const charHeight = (core?._renderService?.dimensions?.css?.cell?.height && core._renderService.dimensions.css.cell.height > 0)
        ? core._renderService.dimensions.css.cell.height
        : 15.6;

      // Account for padding in terminal-body-modern
      const availW = Math.max(0, width - 16);
      const availH = Math.max(0, height - 8);
      cols = Math.max(20, Math.floor(availW / charWidth));
      rows = Math.max(4, Math.floor(availH / charHeight));
    }

    // Elastic resize: smooth transition to new dimensions
    // Prevent jarring recalculations by debouncing rapid resize events during drag
    const now = performance.now();
    const timeSinceLastResize = now - this._lastResizeTime;

    const applyResize = () => {
      // Reflow the buffer locally immediately
      if (term.cols !== cols || term.rows !== rows) {
        term.resize(cols, rows);
      }

      // Synchronize ConPTY backend with debouncing during drag
      if (cols !== item.lastCols || rows !== item.lastRows) {
        item.lastCols = cols;
        item.lastRows = rows;
        if (item.conptyTimer) {
          clearTimeout(item.conptyTimer);
          item.conptyTimer = null;
        }
        const sendResize = () => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "resize", cols: cols, rows: rows }));
          }
        };
        if (isDragging) {
          // Longer debounce during drag for elastic feel (150ms)
          item.conptyTimer = setTimeout(sendResize, 150);
        } else {
          // Instant sync when not dragging (mount, window resize, layout refresh)
          sendResize();
        }
      }
    };

    if (isDragging && timeSinceLastResize < 16) {
      // Throttle to ~60fps during drag for smooth elastic feel
      if (this._resizeFrameId) cancelAnimationFrame(this._resizeFrameId);
      this._resizeFrameId = requestAnimationFrame(() => {
        this._lastResizeTime = performance.now();
        applyResize();
      });
    } else {
      this._lastResizeTime = now;
      applyResize();
    }

    return { cols, rows };
  }

  // Force immediate resize (bypass throttling) - for mount, maximize, etc.
  forceResize(sessionId) {
    return this.fitTerminal(sessionId, false);
  }

  resizeTerminal(sessionId, isDragging = false) {
    this.fitTerminal(sessionId, isDragging);
  }

  resizeAll() {
    Object.keys(this.terminals).forEach(id => {
      this.resizeTerminal(id, false);
    });
  }

  destroy(sessionId) {
    if (this.terminals[sessionId]) {
      const { term, ws } = this.terminals[sessionId];
      if (ws) ws.close();
      if (term) term.dispose();
      delete this.terminals[sessionId];
    }
  }
}

window.MaestriTerminalController = MaestriTerminalController;
