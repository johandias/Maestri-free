# 🎼 Maestri Desktop (Free / Python Edition)

> **Orquestrador Visual de Agentes de Inteligência Artificial em Canvas Infinito**  
> Execute, conecte e conduza múltiplos agentes de IA locais (Antigravity, Claude Code, OpenAI Codex, PowerShell) em um ambiente espacial moderno, leve e 100% privado.

---

## 📖 Visão Geral

O **Maestri Desktop** é uma plataforma de orquestração multi-agente construída em Python (FastAPI) e tecnologias web nativas. Inspirada na filosofia de condução de uma orquestra, ela transforma o usuário em um verdadeiro maestro: em vez de alternar dezenas de abas de terminal desconectadas, você organiza seus agentes e fluxos de desenvolvimento em uma interface visual de **canvas infinito**.

---

## ✨ Principais Funcionalidades

- 🎨 **Canvas Infinito e Espacial**: Navegação fluida com pan, zoom, posicionamento livre de janelas, conexões visuais (arestas com fluxo animado) e agrupamentos.
- 💻 **Terminais Nativos ConPTY (Windows)**: Sessões reais do PowerShell via `pywinpty` com suporte total a sequências ANSI/VT, cores completas, UTF-8, histórico preservado e redimensionamento dinâmico.
- 🤖 **Multi-Agente Plug & Play**: Suporte integrado e presets pré-configurados para os principais ecossistemas de agentes de linha de comando:
  - **Antigravity / Gemini CLI** (`agy`)
  - **Claude Code** (`claude`)
  - **OpenAI Codex** (`codex`)
  - **Shell / PowerShell Nativo**
- 👑 **Motor de Orquestração com IA**: Formulação e distribuição inteligente de diretrizes para nós subordinados conectados, com divisão de tarefas por especialidade (Backend, Frontend, QA, etc.) e regras anti-alucinação.
- 🧠 **Notas de Contexto Vivas & Memória Compartilhada**: Vincule anotações em Markdown diretamente aos nós de terminal no canvas para servir como memória e diretriz viva dos agentes.
- ⚡ **CLI Interna (`maestri`)**: Comandos diretos disponíveis dentro dos próprios terminais para delegar tarefas (`maestri order`, `maestri delegate`), gerenciar notas (`maestri note`) e consultar competências (`maestri role`).
- 🚀 **Interface Desktop Standalone (Sem Electron)**: Inicia instantaneamente utilizando os motores nativos do Microsoft Edge ou Google Chrome no modo aplicação (`--app`), garantindo baixo consumo de memória RAM.
- 🔒 **100% Local & Focado em Privacidade**: Todo o processamento, estado e histórico ficam salvos estritamente na sua máquina. Sem telemetria, sem tracking e sem envio de dados para servidores externos.

---

## 📋 Pré-requisitos

Antes de iniciar, certifique-se de possuir em seu sistema:

1. **Sistema Operacional**: Windows 10 ou Windows 11 (64-bit).
2. **Python**: Versão **3.10** ou superior instalada ([python.org](https://www.python.org/downloads/)).
   > *Dica*: Certifique-se de marcar a opção **"Add Python to PATH"** durante a instalação.
3. **Navegador**: Microsoft Edge ou Google Chrome (instalados por padrão no Windows).
4. **Git**: Para clonar o repositório ([git-scm.com](https://git-scm.com/)).
5. *(Opcional)* As ferramentas de CLI dos agentes de IA de sua preferência configuradas no sistema (`agy`, `claude`, `codex`, etc.).

---

## 🚀 Como Baixar e Instalar

Siga os passos abaixo para configurar e executar o Maestri em sua máquina:

### 1. Clonar o Repositório

Abra o terminal (PowerShell ou Prompt de Comando) e clone o projeto:

```powershell
git clone https://github.com/johandias/Maestri-free.git
cd Maestri-free
```

### 2. Criar e Ativar um Ambiente Virtual (Recomendado)

Criar um ambiente virtual isola as dependências do projeto e evita conflitos:

```powershell
# Criação do ambiente virtual
python -m venv venv

# Ativação no PowerShell
.\venv\Scripts\Activate.ps1
```

> *Observação*: Se o PowerShell bloquear a execução de scripts, execute previamente:
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned`

### 3. Instalar as Dependências

Com o ambiente virtual ativo, instale os pacotes necessários:

```powershell
pip install -r requirements.txt
```

---

## 🖥️ Como Executar

Você pode iniciar o Maestri de duas formas simples:

### Opção A: Pelo Atalho Executável (Mais Prático)

Basta dar um duplo clique no arquivo **`start.bat`** na pasta raiz do projeto, ou executá-lo pelo terminal:

```powershell
.\start.bat
```

### Opção B: Pelo Terminal Python

Com o ambiente virtual ativado, execute o inicializador:

```powershell
python run_app.py
```

O inicializador irá:
1. Iniciar o servidor FastAPI na porta local `8000`.
2. Abrir automaticamente a janela dedicada do aplicativo no desktop via Microsoft Edge ou Chrome.
3. Se preferir abrir no navegador tradicional, acesse diretamente: **[http://127.0.0.1:8000](http://127.0.0.1:8000)**.

---

## 🎮 Como Usar o Sistema

### 1. Navegação no Canvas
- **Panorâmica (Pan)**: Clique e arraste com o botão do meio do mouse (ou segure a tecla `Espaço` e arraste com o botão esquerdo).
- **Zoom**: Utilize a roda do mouse (scroll) para aproximar ou afastar o zoom do canvas.
- **Mover Nós**: Clique e arraste o cabeçalho de qualquer janela de terminal ou nota para reposicioná-la.

### 2. Adicionando Agentes e Terminais
- Clique com o botão direito em uma área vazia do canvas (ou utilize o menu lateral) para abrir o menu de criação.
- Escolha o tipo de nó desejado:
  - **Terminal / Agente**: Escolha o preset (Antigravity, Claude Code, OpenAI Codex ou Shell).
  - **Nota de Contexto**: Cria uma anotação adesiva para servir de memória viva.
  - **Diagrama / Bloco**: Adicione blocos conceituais de arquitetura (API, Banco de Dados, Auth, etc.).

### 3. Conectando Nós e Memórias
- Arraste uma linha a partir do ponto de conexão de um nó até o nó de destino para estabelecer uma conexão lógica.
- Conecte uma **Nota de Contexto** a um nó de terminal para vinculá-la como memória viva do agente.
- Conecte o nó **Orquestrador Chefe** aos nós **Subordinados Executores** para habilitar o fluxo automático de ordens.

### 4. Usando a CLI `maestri` dentro dos Terminais
Os terminais ConPTY possuem comandos exclusivos integrados:

- `maestri order "<sua ordem>"`: Utilizado pelo nó orquestrador para formular e despachar ordens para todos os subordinados conectados.
- `maestri delegate <alvo> "<sua ordem>"`: Envia uma diretiva direta para um agente específico (ex: `maestri delegate backend "Criar endpoint de login"`).
- `maestri note`: Exibe a nota de contexto e regras ativas vinculadas ao terminal.
- `maestri note set "<conteúdo>"`: Atualiza o conteúdo completo da nota conectada em tempo real.
- `maestri note add "<regra>"`: Acrescenta uma nova regra anti-alucinação ou aprendizado à nota.
- `maestri role`: Consulta as competências e papéis atribuídos ao nó.
- `maestri say <alvo> "<mensagem>"`: Envia uma mensagem direta entre terminais conectados.

### 5. Gerenciamento de Projetos
- Clique no menu de projetos no canto superior para alternar entre workspaces, salvar snapshots de estado ou iniciar um novo projeto limpo.

---

## 📁 Estrutura de Diretórios

```
Maestri-free/
├── bin/                 # Wrappers e scripts de linha de comando (maestri, agy, claude, codex)
├── core/                # Módulos centrais em Python
│   ├── agent_cli.py        # Integração e despacho com CLIs de agentes
│   ├── maestri_cli.py      # Implementação dos comandos da CLI maestri
│   ├── orchestrator.py     # Motor de orquestração e delegação estratégica
│   ├── terminal_manager.py # Gerenciador de processos ConPTY via pywinpty
│   └── workspace_manager.py# Gerenciador de estado, canvas e sincronização de notas
├── data/                # Modelos e configurações de workspace padrão
├── frontend/            # Interface gráfica web (HTML5, CSS3, ES6 Modular, xterm.js)
├── projects/            # Diretório de projetos dos usuários
│   └── meu_projeto/        # Template inicial de projeto limpo
├── requirements.txt     # Dependências Python do backend
├── run_app.py           # Launcher desktop standalone (Edge / Chrome app mode)
├── server.py            # Servidor FastAPI com WebSockets
├── start.bat            # Inicializador rápido para Windows
├── .gitignore           # Regras de exclusão de arquivos e proteção de privacidade
└── README.md            # Documentação do projeto
```

---

## 🛠️ Tecnologias Utilizadas

- **Backend**: Python 3.10+, FastAPI, Starlette, Uvicorn, WebSockets, PyWinPTY.
- **Frontend**: Vanilla JavaScript (ES6+), xterm.js (terminal VT100/ANSI com Fit Addon), HTML5 Canvas / SVG, CSS Grid & Flexbox Moderno.
- **Plataforma**: Windows ConPTY (Console Pseudo-Terminal API).

---

## 📄 Licença

Este projeto é disponibilizado sob a licença [MIT](LICENSE). Sinta-se livre para usar, estudar, modificar e distribuir.
