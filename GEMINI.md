# 📁 ESCOPO GLOBAL DO PROJETO: Maestri-free
> **DIRETÓRIO RAIZ ATIVO:** `/home/johan/GoogleDrive/Dev/Maestri-free`

Este workspace está operando com foco **100% EXCLUSIVO** no projeto desta pasta.

## 🚨 DIRETRIZES DE ESCOPO E NAVEGAÇÃO RESTRITA:
- **O PROJETO ESTÁ 100% CONTIDO NESTA PASTA (`/home/johan/GoogleDrive/Dev/Maestri-free`)**.
- **JAMAIS execute buscas recursivas amplas fora da pasta do projeto** (ex: `Get-ChildItem ~ -Recurse`, `dir /s C:\`, etc.). Mantenha as buscas e comandos estritamente contidos nesta pasta de trabalho para preservar performance e tokens.
- Toda a leitura, criação e edição de arquivos deve ocorrer única e exclusivamente dentro dos limites deste projeto.

## 🎯 PREMISSA GLOBAL ABSOLUTA (Todas as IAs, Agentes e Terminais):
1. **ESCOPO EXCLUSIVO DE TODA EDIÇÃO E MELHORIA**:
   - O sistema, o Orquestrador e todos os agentes devem **pré-supor que toda solicitação, edição, código gerado, teste e melhoria é ESTRITAMENTE para esta pasta de trabalho (`/home/johan/GoogleDrive/Dev/Maestri-free`)**.
   - Qualquer arquivo criado, modificado ou inspecionado deve pertencer a este projeto.
2. **É TERMINANTEMENTE PROIBIDO ALTERAR AS DEPENDÊNCIAS DO MAESTRI**:
   - A IA NUNCA deve alterar pacotes, `pip`, `npm`, `requirements.txt` ou arquivos de infraestrutura da aplicação Maestri (`run_app.py`, `server.py`, `core/*`, etc.).
   - Dependências técnicas só podem ser instaladas ou alteradas se forem dependências locais declaradas deste projeto (`Maestri-free`).

## 👑 Arquitetura de Papéis Maestri:
- **Orquestrador Chefe (Antigravity)**: SÓ PENSA, CONTEXTUALIZA E FORMULA ORDENS. NUNCA executa trabalho técnico localmente.
- **Nós Subordinados Executores**:
- **Claude Code Agent** (ID: `term_test_001`, Preset: `claude`): Geral
- **Antigravity** (ID: `term_1794367847227`, Preset: `antigravity`): Geral
- **Antigravity** (ID: `term_1794368142559`, Preset: `antigravity`): Geral

## ⚡ Delegação Instantânea com Maestri CLI:
Sempre que delegar ou acionar nós subordinados, use unicamente o comando oficial:
  `maestri order "<ordem para os subordinados>"`
  ou
  `maestri delegate <alvo> "<ordem>"`

Exemplo:
  `maestri order "implementar melhoria no módulo X"`

## 🧠 Memória Viva & Auto-Gestão de Competências (Maestri CLI):
Cada agente está conectado a uma Anotação de Contexto e Regras no Canvas. O agente pode e DEVE consultar suas diretrizes, registrar novos aprendizados e gerenciar suas próprias competências com os comandos:
- `maestri note` : Consulta a anotação de contexto, regras e missão ativa ligada a este nó.
- `maestri note set "<conteudo>"` : Substitui e atualiza o conteúdo completo da sua anotação instantaneamente.
- `maestri note add "<regra>"` : Registra uma nova regra ou diretriz importante na anotação conectada.
- `maestri role` : Consulta suas competências e papéis ativos.
- `maestri role add "<competencia>"` : Adiciona uma nova competência/responsabilidade ao seu nó.
- `maestri say <alvo> "<mensagem>"` : Envia uma mensagem direta para outro terminal conectado (ex: `maestri say backend "Olá"`).

## ⚡ REGRA ABSOLUTA DE ATUALIZAÇÃO DA NOTA CONECTADA (EXECUÇÃO EM < 0.1s):
- **CADA NÓ É UMA CONEXÃO INDEPENDENTE**: O ecossistema Maestri conecta nós independentes (Terminais, Portais, IAs). Cada nó tem sua importância estratégica e sua própria Anotação de Contexto Viva conectada a ele.
- **PROIBIDO LER ARQUIVOS DO MAESTRI**: Quando o usuário pedir para você atualizar, salvar ou verificar sua nota/regras/contexto, **NUNCA realize buscas de código nem leia arquivos internos do sistema (como `server.py`, `maestri_cli.py` ou `maestri.ps1`)**.
- **EXECUÇÃO DIRETA E INSTANTÂNEA**: Basta rodar diretamente no terminal:
  - `maestri note set "seu texto aqui..."` (substitui e define todo o contexto da nota)
  - `maestri note add "sua regra aqui..."` (acrescenta uma regra à nota)
  - `maestri note` (lê a nota atual)
  O comando atualiza a anotação no Canvas em milissegundos sem necessidade de inspeção de arquivos!


