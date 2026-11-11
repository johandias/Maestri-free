"""
Orchestrator Core for Maestri Desktop.
Implements the multi-agent orchestration principles described in 'Orquestrador IA em Python.json':
- Role management (Supervisor/Maestro, Programmer, QA Reviewer, Git Manager)
- Task delegation & state management (similar to LangGraph Supervisor / CrewAI)
- Audit trail logging (immutable, structured audit records)
- Human-in-the-loop (HITL) pause and resume mechanics
"""
import os
import json
import time
import uuid
import urllib.request
import asyncio
import subprocess
from typing import Dict, Any, List, Optional

class AuditLogger:
    def __init__(self):
        self.logs: List[Dict[str, Any]] = []

    def record_event(self, caller: str, event_type: str, details: Dict[str, Any]):
        entry = {
            "id": str(uuid.uuid4()),
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "caller": caller,
            "event_type": event_type,
            "details": details
        }
        self.logs.append(entry)
        return entry

class AgentDefinition:
    def __init__(self, id: str, name: str, role: str, goal: str, tools: List[str]):
        self.id = id
        self.name = name
        self.role = role
        self.goal = goal
        self.tools = tools

class MaestriOrchestrator:
    def __init__(self):
        self.audit_logger = AuditLogger()
        self.agents: Dict[str, AgentDefinition] = {}
        self.execution_state: Dict[str, Any] = {
            "status": "idle",
            "active_task": None,
            "current_step": 0,
            "ask_human": False,
            "paused_thread_id": None
        }
        self._initialize_default_agents()

    def _initialize_default_agents(self):
        self.register_agent(AgentDefinition(
            id="agent_supervisor",
            name="Maestro",
            role="Supervisor & Roteador Central",
            goal="Decompor objetivos complexos e delegar tarefas aos especialistas",
            tools=["router", "delegate_task", "request_human_approval"]
        ))
        self.register_agent(AgentDefinition(
            id="agent_programmer",
            name="Programador (Codex / Claude)",
            role="Desenvolvedor Fullstack",
            goal="Implementar código, scripts e funcionalidades com qualidade",
            tools=["file_editor", "code_generator", "run_terminal"]
        ))
        self.register_agent(AgentDefinition(
            id="agent_qa",
            name="Revisor & QA",
            role="Auditor e Validador de Qualidade",
            goal="Testar endpoints, revisar lógica e garantir ausência de bugs",
            tools=["portal_browser", "test_runner", "syntax_checker"]
        ))
        self.register_agent(AgentDefinition(
            id="agent_git",
            name="Git Manager",
            role="Gerenciador de Versionamento",
            goal="Criar branches, validar diffs e realizar commits",
            tools=["git_cli", "changelog_generator"]
        ))

    def register_agent(self, agent: AgentDefinition):
        self.agents[agent.id] = agent
        self.audit_logger.record_event("system", "agent_registered", {
            "agent_id": agent.id,
            "name": agent.name,
            "role": agent.role
        })

    def route_task(self, prompt: str) -> Dict[str, Any]:
        """Simulates the Supervisor router logic from LangGraph as discussed in the JSON."""
        prompt_lower = prompt.lower()
        if any(w in prompt_lower for w in ["test", "testar", "portal", "qa", "revisar"]):
            selected_agent = "agent_qa"
        elif any(w in prompt_lower for w in ["git", "commit", "branch", "push"]):
            selected_agent = "agent_git"
        elif any(w in prompt_lower for w in ["código", "criar", "codex", "app", "tela", "programar"]):
            selected_agent = "agent_programmer"
        else:
            selected_agent = "agent_supervisor"

        agent = self.agents.get(selected_agent)
        event = self.audit_logger.record_event("Maestro", "task_routed", {
            "input_prompt": prompt,
            "target_agent": agent.name if agent else selected_agent,
            "reasoning": "Roteamento baseado na análise semântica do prompt."
        })
        return {
            "selected_agent": agent.name if agent else selected_agent,
            "agent_id": selected_agent,
            "audit_id": event["id"]
        }

    def get_audit_trail(self) -> List[Dict[str, Any]]:
        return self.audit_logger.logs

    def _clean_prompt(self, prompt: str) -> str:
        """Sanitizes prompt by stripping surrounding quotes, agy wrappers, and repetitive directive prefixes."""
        clean = (prompt or "").strip()
        if (clean.startswith('"') and clean.endswith('"')) or (clean.startswith("'") and clean.endswith("'")):
            clean = clean[1:-1].strip()
        if clean.startswith("agy "):
            clean = clean[4:].strip().strip('"').strip("'").strip()

        prefixes = [
            "Implementar a interface, componentes visuais e integração de usuário para:",
            "Construir e validar a lógica de backend, rotas e regras de negócio para:",
            "Executar testes, verificar erros, integridade do código e sintaxe para:",
            "Verificar status do repositório, branches e preparar versionamento para:",
            "Executar diretiva técnica conforme solicitado pelo Chefe:"
        ]
        changed = True
        while changed:
            changed = False
            for pfx in prefixes:
                if clean.lower().startswith(pfx.lower()):
                    clean = clean[len(pfx):].strip()
                    changed = True
                    break
        return clean or prompt

    async def formulate_and_delegate_orders(
        self,
        prompt: str,
        working_dir: str,
        target_nodes: List[Dict[str, Any]],
        orchestrator_node: Optional[Dict[str, Any]] = None,
        context_note: str = "",
        observer_nodes: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        prompt = self._clean_prompt(prompt)
        """
        Fundamental Principle of Maestri Architecture:
        - The Orchestrator (Chefe) ONLY THINKS, CONTEXTUALIZES AND FORMULATES ORDERS.
        - The Orchestrator NEVER executes technical tasks directly.
        - Subordinate nodes KNOW they are subordinates and follow the Chef's orders.
        - Active Connected Context Note serves as persistent memory for the Chefe and agents.
        - Observer nodes provide vision and telemetry only; they NEVER receive execution directives.
        """
        orch_title = orchestrator_node.get("title", "Orquestrador Chefe") if orchestrator_node else "Orquestrador Chefe"
        dir_basename = os.path.basename(working_dir.rstrip(r"\/")) if working_dir else "Projeto"

        # 1. Contextualize project directory
        files_preview = []
        if working_dir and os.path.exists(working_dir):
            try:
                files_preview = [f for f in os.listdir(working_dir) if not f.startswith(".")][:12]
            except Exception:
                pass

        # 2. Inspect target subordinates with their assigned responsibilities and connected context notes
        # Exclude any observer node from receiving execution directives
        subordinates_info = []
        for n in target_nodes:
            if n.get("is_controllable") is not False:
                subordinates_info.append({
                    "id": n.get("id"),
                    "title": n.get("title", "Terminal"),
                    "preset": n.get("preset", "shell"),
                    "command": n.get("command", ""),
                    "responsibilities": n.get("responsibilities", []),
                    "connected_note": n.get("connected_note_text", "")
                })

        # 3. Formulate orders via Connected IA (Gemini or Antigravity CLI or Fast Heuristic Fallback)
        ia_result = await self._query_ia_for_delegation(
            prompt=prompt,
            working_dir=working_dir,
            files_preview=files_preview,
            subordinates=subordinates_info,
            orch_title=orch_title,
            context_note=context_note,
            observer_nodes=observer_nodes
        )

        thought_process = ia_result.get("thought_process")
        raw_delegations = ia_result.get("delegations", [])

        # Anti-Duplication Filter:
        # 1. Guarantee strictly ONE delegation per node_id (no double-delegating to same terminal)
        # 2. Guarantee that each agent receives a unique, non-overlapping directive
        delegations = []
        seen_nodes = set()
        seen_directives = set()

        for d in raw_delegations:
            nid = d.get("node_id")
            if not nid or nid in seen_nodes:
                continue
            seen_nodes.add(nid)

            target_name = d.get("target_title", "Agente")
            d_text = (d.get("order_directive") or prompt).strip()

            if d_text in seen_directives:
                # Differentiate identical directives so agents do not perform the exact same task
                d["order_directive"] = f"[{target_name}]: {d_text} (foco na sua especialidade de {d.get('role', 'apoio')})"
                if d.get("command_to_run") and not d["command_to_run"].startswith("agy"):
                    d["command_to_run"] = d["order_directive"]

            seen_directives.add(d["order_directive"].strip())
            delegations.append(d)

        # Build updated on-screen context note summary
        del_lines = [f"  - [{d.get('target_title', 'Agente')}]: {d.get('order_directive')}" for d in delegations]
        del_text = "\n".join(del_lines) if del_lines else "  - (Nenhuma diretiva delegada)"

        updated_context_note = (
            f"🧠 [Contexto & Memória do Chefe: {orch_title}]\n"
            f"• Missão Ativa: {prompt}\n"
            f"• Pensamento Estratégico: {thought_process}\n"
            f"• Diretivas em Execução:\n{del_text}\n"
            f"• Pasta de Trabalho: {working_dir or os.getcwd()}"
        )

        # Audit Event
        audit_event = self.audit_logger.record_event(orch_title, "orchestrator_delegated_orders", {
            "objective": prompt,
            "working_dir": working_dir,
            "target_count": len(delegations),
            "thought_process": thought_process,
            "delegations": delegations,
            "context_note": context_note
        })

        return {
            "status": "ok",
            "thought_process": thought_process,
            "delegations": delegations,
            "updated_context_note": updated_context_note,
            "audit_id": audit_event["id"]
        }

    async def _query_ia_for_delegation(
        self,
        prompt: str,
        working_dir: str,
        files_preview: List[str],
        subordinates: List[Dict[str, Any]],
        orch_title: str,
        context_note: str = "",
        observer_nodes: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Attempts Connected Gemini API first, then agy CLI, and falls back to structured heuristic planner."""
        api_key = os.environ.get("GEMINI_API_KEY")
        files_str = ", ".join(files_preview) if files_preview else "diretório raiz"
        
        sub_items = []
        for s in subordinates:
            note_txt = (s.get("connected_note") or "").strip()
            note_display = f"\n    • Anotação de Contexto & Regras deste Nó:\n    \"\"\"{note_txt}\"\"\"" if note_txt else "\n    • (Sem anotação vinculada)"
            sub_items.append(
                f"• Nó: [{s.get('title')}] (ID: `{s.get('id')}`, Preset: `{s.get('preset')}`)\n"
                f"  - Competências Declaradas: {', '.join(s.get('responsibilities', [])) or 'Geral'}"
                f"{note_display}"
            )
        sub_str = "\n\n".join(sub_items) if sub_items else "(Nenhum subordinado)"

        obs_lines = []
        if observer_nodes:
            for obs in observer_nodes:
                obs_lines.append(f"• [{obs.get('title', 'Observador')} - Tipo: {obs.get('type', 'sensor')}]:\n  Situação Atual: {obs.get('status_overview', '(sem saída recente)')}")
        obs_str = "\n".join(obs_lines) if obs_lines else ""

        system_instruction = (
            "Você é o ORQUESTRADOR CENTRAL (CHEFE/MAESTRO) no ecossistema multiagentes Maestri Desktop.\n"
            "PREMISSA GLOBAL ABSOLUTA: Toda e qualquer solicitação, edição, código gerado e melhoria é ESTRITAMENTE para o projeto contido no diretório de trabalho fornecido. É terminantemente proibido tocar na infraestrutura ou dependências do software Maestri.\n"
            "Princípio Fundamental: O Orquestrador SÓ PENSA, SE CONTEXTUALIZA E FORMULA ORDENS. ELE NUNCA EXECUTA O TRABALHO TÉCNICO DIRETAMENTE. "
            "Ele delega tudo para os nós subordinados conectados. Os agentes subordinados sabem que são subordinados e seguem rigorosamente as ordens do Chefe.\n"
            "CONSCIÊNCIA DOS NÓS INDEPENDENTES & SUAS NOTAS DE CONTEXTO:\n"
            "- Cada nó conectado ao Chefe é uma conexão totalmente independente com seu próprio papel e importância estratégica.\n"
            "- Cada nó possui sua própria Anotação de Contexto Viva conectada (sua memória própria com regras e obrigações).\n"
            "- Você DEVE analisar minuciosamente o conteúdo da anotação de CADA nó e formular diretivas que respeitem exatamente suas regras e competências declaradas.\n"
            "NÓS EM MODO APENAS OBSERVADOR / SENSOR:\n"
            "Se houver nós observadores informados, eles NÃO DEVEM receber ordens e NUNCA devem estar no array 'delegations'. Suas saídas servem unicamente para ajudar você a enxergar a situação e contextualizar o projeto.\n"
            "REGRA ABSOLUTA DE DEDICAÇÃO ÚNICA & NÃO-REPETIÇÃO:\n"
            "- Cada agente subordinado possui uma especialidade DISTINTA. É TERMINANTEMENTE PROIBIDO pedir a mesma coisa para mais de um agente.\n"
            "- NUNCA envie a mesma ordem para dois terminais diferentes, e NUNCA repita a mesma diretiva para o mesmo agente.\n"
            "- O array 'delegations' NÃO PODE conter mais de uma entrada para o mesmo 'node_id', e NUNCA deve ter duas ordens idênticas.\n"
            "- Se houver mais de um agente com competências similares (ex: dois agentes de frontend), divida estritamente o trabalho (ex: um cuida de layout/CSS e o outro de scripts/lógica), ou delegue apenas ao principal.\n"
            "- PREVENÇÃO DE BUSCAS RECURSIVAS EXTERNAS: Indique sempre os caminhos e subpastas dos arquivos da pasta de trabalho e ordene aos agentes que NUNCA busquem fora da pasta de trabalho.\n"
            "Seu papel:\n"
            "1. Analisar o objetivo do usuário e o diretório de trabalho.\n"
            "2. Pensar estrategicamente na divisão das tarefas voltadas 100% para os arquivos desse projeto, levando em consideração o estado visual/situação dos nós observadores.\n"
            "3. Formular uma ORDEM CLARA, IMPERATIVA E ESPECÍFICA para CADA um dos nós subordinados executores listados, de acordo com o título/papel de cada um.\n"
            "Retorne APENAS um JSON válido com a estrutura:\n"
            "{\n"
            '  "thought_process": "resumo do pensamento estratégico e contextualização...",\n'
            '  "delegations": [\n'
            '    {\n'
            '      "node_id": "<id correspondente>",\n'
            '      "target_title": "<título>",\n'
            '      "role": "<papel atribuído>",\n'
            '      "order_directive": "<diretiva direta para o subordinado>",\n'
            '      "command_to_run": "<comando ou texto para execução no nó>"\n'
            '    }\n'
            '  ]\n'
            "}"
        )

        note_snippet = f"\nMemória de Contexto Viva Conectada:\n'''\n{context_note}\n'''\n" if context_note else ""
        obs_snippet = f"\nSistemas Sensores/Observadores Conectados (Apenas Visão Situacional - NÃO DELEGAR ORDENS A ELES):\n'''\n{obs_str}\n'''\n" if obs_str else ""
        user_content = (
            f"Objetivo do Usuário: '{prompt}'\n"
            f"Diretório de Trabalho: {working_dir} (Arquivos: {files_str})\n"
            f"{note_snippet}"
            f"{obs_snippet}"
            f"Subordinados Executores Conectados e suas Responsabilidades:\n{sub_str}\n"
        )

        # 1. Fast Direct Gemini REST API (Low latency ~0.8s)
        if api_key:
            try:
                result = await asyncio.to_thread(self._sync_call_gemini_api, api_key, system_instruction, user_content)
                if result and "delegations" in result and result["delegations"]:
                    return result
            except Exception as e:
                print(f"[Orchestrator IA Gemini API Fallback]: {e}")

        # 2. Instant Heuristic & Semantic Planner (< 0.005s, zero delay)
        # Guarantees immediate real-time dispatch to subordinates without waiting for slow CLI boots
        return self._heuristic_formulation(prompt, working_dir, files_preview, subordinates, orch_title, context_note, observer_nodes)

    def _sync_call_gemini_api(self, api_key: str, system_instruction: str, user_content: str) -> Optional[Dict[str, Any]]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": f"INSTRUÇÃO DO SISTEMA:\n{system_instruction}\n\nSOLICITAÇÃO:\n{user_content}"}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json"
            }
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            raw_text = body["candidates"][0]["content"]["parts"][0]["text"].strip()
            return json.loads(raw_text)

    def _heuristic_formulation(
        self,
        prompt: str,
        working_dir: str,
        files_preview: List[str],
        subordinates: List[Dict[str, Any]],
        orch_title: str,
        context_note: str = "",
        observer_nodes: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Deterministic, highly-specialized planner that categorizes tasks per agent role and responsibilities."""
        clean_prompt = self._clean_prompt(prompt)

        dir_name = os.path.basename(working_dir.rstrip(r"\/")) if working_dir else "Projeto"
        p_lower = clean_prompt.lower()
        context_preview = f" (Contexto ativo: {context_note[:60]}...)" if context_note else ""
        obs_mention = ""
        if observer_nodes:
            obs_names = ", ".join([o.get("title", "Sensor") for o in observer_nodes])
            obs_mention = f" Contexto situacional capturado dos nós observadores: [{obs_names}]."

        # Provide unambiguous path guidance to all agents
        front_loc = f"na pasta raiz ou subpastas de '{dir_name}'"
        back_loc = f"na pasta raiz ou subpastas de '{dir_name}'"

        thought = (
            f"Contextualização Global: Todas as tarefas e edições destinam-se exclusivamente ao projeto '{dir_name}' ({working_dir}). "
            f"O Chefe formulou e distribuiu a missão '{clean_prompt}' entre os {len(subordinates)} executores conectados.{obs_mention}"
        )

        delegations = []
        assigned_directives = set()
        matched_roles_count = {}

        for sub in subordinates:
            sub_id = sub["id"]
            title = sub["title"]
            preset = sub["preset"].lower()
            resps = sub.get("responsibilities", [])
            resp_desc = ", ".join(resps) if resps else ""
            t_lower = title.lower() + " " + resp_desc.lower()

            if any(k in t_lower for k in ["back", "api", "server", "banco", "db"]):
                count = matched_roles_count.get("backend", 0) + 1
                matched_roles_count["backend"] = count
                if count == 1:
                    role = "Desenvolvedor Backend (APIs & Rotas)"
                    directive = f"[Projeto {dir_name}] Desenvolver e validar endpoints e regras de negócio {back_loc} para: {clean_prompt}. (Atenção: todo o código está nesta pasta; nunca realize buscas fora de '{dir_name}')"
                else:
                    role = "Desenvolvedor Backend (Banco de Dados & Persistência)"
                    directive = f"[Projeto {dir_name}] Configurar persistência, schemas e integridade dos dados {back_loc} para: {clean_prompt}. (Atenção: todo o código está nesta pasta; nunca realize buscas fora de '{dir_name}')"
                cmd = f"agy \"{directive}\"" if preset == "antigravity" else directive

            elif any(k in t_lower for k in ["front", "ui", "tela", "view", "component", "css"]):
                count = matched_roles_count.get("frontend", 0) + 1
                matched_roles_count["frontend"] = count
                if count == 1:
                    role = "Desenvolvedor Frontend (Interface & Layout)"
                    directive = f"[Projeto {dir_name}] Implementar a interface visual, HTML e layout {front_loc} para: {clean_prompt}. (Atenção: todo o código está nesta pasta; nunca realize buscas fora de '{dir_name}')"
                else:
                    role = "Desenvolvedor Frontend (Lógica & Integração Client)"
                    directive = f"[Projeto {dir_name}] Integrar scripts, interações e validações de tela {front_loc} para: {clean_prompt}. (Atenção: todo o código está nesta pasta; nunca realize buscas fora de '{dir_name}')"
                cmd = f"agy \"{directive}\"" if preset == "antigravity" else directive

            elif any(k in t_lower for k in ["qa", "test", "revis", "audit", "valida"]):
                count = matched_roles_count.get("qa", 0) + 1
                matched_roles_count["qa"] = count
                role = "Auditor de Qualidade & QA (Subordinado)"
                directive = f"[Projeto {dir_name}] Executar testes, verificar erros e sintaxe {front_loc if 'front' in t_lower else back_loc} para: {clean_prompt}. (Atenção: nunca busque fora de '{dir_name}')"
                cmd = f"pytest || python -m unittest" if preset == "shell" else f"agy \"{directive}\""

            elif any(k in t_lower for k in ["git", "version", "deploy", "ci", "ops"]):
                count = matched_roles_count.get("devops", 0) + 1
                matched_roles_count["devops"] = count
                role = "Gerenciador Git & DevOps (Subordinado)"
                directive = f"[Projeto {dir_name}] Verificar status do repositório, branches e preparar versionamento para: {clean_prompt}. (Atenção: nunca busque fora de '{dir_name}')"
                cmd = "git status"

            else:
                count = matched_roles_count.get("general", 0) + 1
                matched_roles_count["general"] = count
                role = f"Especialista {title} ({resp_desc})" if resp_desc else f"Especialista Técnico {title}"
                directive = f"[Projeto {dir_name}] Atuar no escopo especializado de {resp_desc or title} para apoiar: {clean_prompt}. (Atenção: nunca busque fora de '{dir_name}')"
                cmd = f"agy \"{directive}\"" if preset == "antigravity" else directive

            # Absolute guarantee: no two agents get identical directives
            if directive in assigned_directives:
                directive = f"[{title}]: {directive} (especialidade focada)"
                if cmd and not cmd.startswith("agy"):
                    cmd = directive
            assigned_directives.add(directive)

            delegations.append({
                "node_id": sub_id,
                "target_title": title,
                "role": role,
                "order_directive": directive,
                "command_to_run": cmd
            })

        return {
            "thought_process": thought,
            "delegations": delegations
        }
