/**
 * Terminal Manager for Maestri Desktop (v2.2)
 * Integrates xterm.js inside Canvas cards matching native VS Code PowerShell terminal.
 * Powered by ConPTY backend with real cursor positioning, native prompt and UTF-8.
 */

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

class MaestriTerminalController {
  constructor() {
    this.terminals = {}; // sessionId -> { term, ws, container, fitAddon, themeKey }
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

    // 1. Cleanly tear down any pre-existing instance for this session to eliminate duplicate listeners & double keystrokes
    if (this.terminals[sessionData.id]) {
      this.destroy(sessionData.id);
    }
    container.innerHTML = "";

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

        term.open(container);

        // Click to focus unless user is currently connecting nodes
        container.addEventListener("click", () => {
          if (!window.MaestriApp?.canvas?.isConnecting) {
            term.focus();
          }
        });
        container.addEventListener("mousedown", () => {
          if (!window.MaestriApp?.canvas?.isConnecting) {
            term.focus();
          }
        });

        // Strictly isolate scroll events to terminal viewport (never zoom canvas)
        container.addEventListener("wheel", (e) => {
          e.stopPropagation();
        }, { passive: true });

        // Right-Click Context Menu (Paste, Copy, Clear, Crown, Rename, Broadcast, Restart, Close)
        container.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (window.MaestriApp?.canvas?.isConnecting) return;
          if (window.MaestriApp?.contextMenu) {
            window.MaestriApp.contextMenu.showForTerminal(e, sessionData.id);
          }
        });

        // Copy on select (ConEmu / Windows Terminal standard)
        term.onSelectionChange(() => {
          const sel = term.getSelection();
          if (sel && sel.trim().length > 0) {
            try {
              navigator.clipboard.writeText(sel);
            } catch (e) {}
          }
        });

        // Standard terminal shortcut handling (Ctrl+Shift+C / Ctrl+Shift+V / Shift+Insert)
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

        setTimeout(() => {
          this.fitTerminal(sessionData.id, false);
          term.focus();
        }, 30);
      } else {
        throw new Error("Terminal library not loaded");
      }
    } catch (err) {
      console.warn("xterm init fallback:", err);
      container.innerHTML = `<div class="term-fallback" style="padding: 10px; color: #10b981; font-family: monospace; font-size: 12px; height: 100%; overflow-y: auto;">
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
        const nodeEl = document.getElementById(sessionData.id);
        const indicator = nodeEl?.querySelector(".term-indicator");
        if (indicator) {
          indicator.classList.remove("stopped", "idle");
          indicator.title = "Terminal Ativo";
        }
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
          }
        }
      };

      ws.onclose = () => {
        term.writeln("\r\n\x1b[90m[Conexão com terminal encerrada. Use o botão 🔄 no cabeçalho para reiniciar.]\x1b[0m");
        const nodeEl = document.getElementById(sessionData.id);
        const indicator = nodeEl?.querySelector(".term-indicator");
        if (indicator) {
          indicator.classList.remove("running", "idle");
          indicator.classList.add("stopped");
          indicator.title = "Terminal Parado/Desconectado. Clique no botão 🔄 para reiniciar.";
        }
      };

      ws.onerror = (err) => {
        console.warn("Terminal WS error:", err);
      };

      term.onData((data) => {
        // Discard automated terminal report responses (e.g. Device Attributes \x1b[?1;2c)
        // that xterm emits in response to DA queries. If sent over WS, they pollute shell stdin as literal text!
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

    this.terminals[sessionData.id] = {
      term,
      ws,
      container,
      fitAddon,
      lastCols: 80,
      lastRows: 24,
      conptyTimer: null
    };
  }

  fitTerminal(sessionId, isDragging = false) {
    const item = this.terminals[sessionId];
    if (!item) return { cols: 80, rows: 24 };
    const { term, container, ws, fitAddon } = item;
    if (!container || !term) return { cols: 80, rows: 24 };

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) return { cols: 80, rows: 24 };

    let cols = 80;
    let rows = 24;

    // 1. Try official FitAddon first
    if (fitAddon) {
      try {
        const proposed = fitAddon.proposeDimensions();
        if (proposed && proposed.cols > 10 && proposed.rows > 2) {
          cols = proposed.cols;
          rows = proposed.rows;
        }
      } catch (err) {}
    }

    // 2. If FitAddon is not ready yet, calculate from character size
    if (cols === 80 && rows === 24) {
      const core = term._core;
      const charWidth = (core?._renderService?.dimensions?.css?.cell?.width && core._renderService.dimensions.css.cell.width > 0)
        ? core._renderService.dimensions.css.cell.width
        : 7.82;
      const charHeight = (core?._renderService?.dimensions?.css?.cell?.height && core._renderService.dimensions.css.cell.height > 0)
        ? core._renderService.dimensions.css.cell.height
        : 15.6;

      const availW = Math.max(0, width - 12);
      const availH = Math.max(0, height - 6);
      cols = Math.max(20, Math.floor(availW / charWidth));
      rows = Math.max(4, Math.floor(availH / charHeight));
    }

    // Reflow the buffer locally immediately
    if (term.cols !== cols || term.rows !== rows) {
      term.resize(cols, rows);
    }

    // Synchronize ConPTY backend
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
        item.conptyTimer = setTimeout(sendResize, 100);
      } else {
        // Instant sync when not dragging (mount, window resize, layout refresh)
        sendResize();
      }
    }

    return { cols, rows };
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
