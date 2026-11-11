# Maestri Desktop - AI Orchestrator (Free / Python Edition)

## Visão Geral do Projeto
O **Maestri Desktop** é uma plataforma de orquestração visual de agentes de inteligência artificial construída em Python (FastAPI) e tecnologias web nativas. Ele oferece uma interface de *canvas infinito* para coordenar múltiplos agentes (Antigravity/Gemini, Claude Code, OpenAI Codex ou PowerShell nativo) com suporte a sessões reais de terminal via ConPTY (Windows), notas de contexto vivas e delegação de tarefas assistida por IA.

---

## 🏛️ Arquitetura do Sistema

- **Backend FastAPI (`server.py`)**:
  - Servidor HTTP e WebSocket para comunicação bidirecional em tempo real.
  - Endpoints REST para gerenciamento de projetos, nós, arestas, notas e métricas de tokens.
  - Endpoints WebSocket (`/ws/terminal/{session_id}`) para streaming de I/O de terminal interativo.

- **Gerenciador de Processos & PTY (`core/terminal_manager.py`)**:
  - Utiliza `pywinpty` (Windows ConPTY nativo) para emulação de terminal completa (VT/ANSI, redimensionamento dinâmico e suporte UTF-8).
  - Isolamento de processos entre terminais.

- **Motor de Orquestração (`core/orchestrator.py`)**:
  - Coordena a distribuição de diretrizes entre os agentes subordinados conectados.
  - Formata ordens e papéis para prevenir redundância de tarefas e otimizar o uso de tokens.

- **Gerenciador de Workspace & Projetos (`core/workspace_manager.py`)**:
  - Salva e restaura o estado do canvas, nós, grupos e conexões.
  - Sincroniza instruções de contexto vivas com os terminais ativos.

- **Frontend Web & Canvas (`frontend/`)**:
  - Canvas interativo com zoom, pan, arrasto de janelas e conexões visuais (`frontend/js/canvas.js`).
  - Emulador de terminal integrado com `xterm.js` e addon fit (`frontend/js/terminal.js`).
  - Interface rica com tema escuro moderno e responsivo (`frontend/css/theme.css`).

- **Launchers & CLI**:
  - `run_app.py`: Inicia o servidor uvicorn e abre a aplicação em modo janela dedicada (Microsoft Edge ou Google Chrome).
  - `start.bat`: Inicializador rápido para ambiente Windows.
  - `bin/maestri.cmd` / `bin/maestri.ps1`: Ferramenta de linha de comando para agentes interagirem com o orquestrador.

---

## 🔒 Diretrizes de Segurança e Privacidade
- **Execução 100% Local**: Nenhuma telemetria ou dado de usuário deve ser transmitido para servidores de terceiros.
- **Isolamento de Credenciais**: Nunca realize commit de chaves de API, tokens de acesso, credenciais ou caminhos absolutos do sistema do usuário.
- **Validação de Comandos**: Assegure tratamento de erros e timeouts adequados para processos no terminal.
