"""
Workspace and Project Manager for Maestri Desktop.
Handles projects inside './projects/', context persistence, and clean default state.
"""
import json
import os
import re
import time
from typing import Dict, Any, List, Optional

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(WORKSPACE_ROOT, "data")
PROJECTS_DIR = os.path.join(WORKSPACE_ROOT, "projects")
CURRENT_STATE_FILE = os.path.join(DATA_DIR, "current_workspace.json")
SESSION_STATE_FILE = os.path.join(DATA_DIR, "session_state.json")

def _atomic_write_json(file_path: str, data: Any):
    """Atomically writes JSON to disk via temporary file to prevent corruption on sudden exit."""
    tmp_path = f"{file_path}.tmp_{int(time.time() * 1000)}"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, file_path)
    except Exception as e:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass
        raise e

class WorkspaceManager:
    def __init__(self):
        os.makedirs(DATA_DIR, exist_ok=True)
        os.makedirs(PROJECTS_DIR, exist_ok=True)
        self.version = int(time.time() * 1000)
        self._ensure_clean_default()

    def get_workspace_version(self) -> int:
        return self.version

    def get_workspace_poll(self, client_version: int = 0) -> Dict[str, Any]:
        """High-performance differential polling: avoids re-serializing data if client already has latest version."""
        if client_version and client_version == self.version:
            return {"changed": False, "version": self.version}
        ws = self.get_workspace()
        return {"changed": True, "version": self.version, "workspace": ws}

    def _clean_canvas_state(self, project_name: str = "Meu Projeto") -> Dict[str, Any]:
        """Requirement 1: Start completely clean with NO pre-generated dummy nodes."""
        return {
            "meta": {
                "name": project_name,
                "version": "2.0.0",
                "theme": "dark",
                "orchestrator_node_id": None
            },
            "groups": [
                {
                    "id": "group_main",
                    "title": project_name,
                    "expanded": True,
                    "items": []
                }
            ],
            "canvas": {
                "viewport": {"x": 200, "y": 120, "zoom": 1.0},
                "nodes": [], # Clean slate!
                "edges": []  # Clean slate!
            },
            "shared_context": {}
        }

    def _ensure_clean_default(self):
        # Ensure default project folder exists
        default_proj_dir = os.path.join(PROJECTS_DIR, "meu_projeto")
        os.makedirs(default_proj_dir, exist_ok=True)
        proj_file = os.path.join(default_proj_dir, "project.json")

        if not os.path.exists(proj_file):
            data = self._clean_canvas_state("Meu Projeto")
            with open(proj_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

        # Ensure current_workspace.json exists and starts clean
        if not os.path.exists(CURRENT_STATE_FILE):
            data = self._clean_canvas_state("Meu Projeto")
            with open(CURRENT_STATE_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

    def list_projects(self) -> List[Dict[str, Any]]:
        """Lists all projects available in ./projects/ with enriched metadata."""
        projects = []
        if not os.path.exists(PROJECTS_DIR):
            return projects

        curr_ws = self.get_workspace()
        active_slug = curr_ws.get("meta", {}).get("slug", "")

        for entry in os.scandir(PROJECTS_DIR):
            if entry.is_dir():
                proj_json = os.path.join(entry.path, "project.json")
                name = entry.name
                meta = {}
                node_count = 0
                terminals_count = 0
                notes_count = 0
                edges_count = 0
                cwd = ""
                focus = ""
                template = "blank"

                if os.path.exists(proj_json):
                    try:
                        with open(proj_json, "r", encoding="utf-8") as f:
                            d = json.load(f)
                            meta = d.get("meta", {})
                            name = meta.get("name", entry.name)
                            cwd = meta.get("working_directory", "")
                            focus = meta.get("focus", "")
                            template = meta.get("template", "custom")
                            nodes = d.get("canvas", {}).get("nodes", [])
                            node_count = len(nodes)
                            terminals_count = sum(1 for n in nodes if n.get("type") == "terminal")
                            notes_count = sum(1 for n in nodes if n.get("type") == "note")
                            edges_count = len(d.get("canvas", {}).get("edges", []))
                    except Exception:
                        pass
                projects.append({
                    "slug": entry.name,
                    "name": name,
                    "path": entry.path,
                    "cwd": cwd,
                    "focus": focus,
                    "template": template,
                    "node_count": node_count,
                    "terminals_count": terminals_count,
                    "notes_count": notes_count,
                    "edges_count": edges_count,
                    "is_active": (entry.name == active_slug or (not active_slug and entry.name == "meu_projeto")),
                    "modified": os.path.getmtime(entry.path)
                })
        return sorted(projects, key=lambda x: x["modified"], reverse=True)

    def create_project(
        self,
        name: str,
        working_directory: Optional[str] = None,
        template: str = "blank",
        focus: str = "",
        custom_instances: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Creates a new project directory with AI squad templates and custom focus."""
        slug = re.sub(r'[^a-zA-Z0-9_\-]', '_', name.lower().strip()) or "novo_projeto"
        proj_dir = os.path.join(PROJECTS_DIR, slug)
        counter = 1
        base_slug = slug
        while os.path.exists(proj_dir):
            slug = f"{base_slug}_{counter}"
            proj_dir = os.path.join(PROJECTS_DIR, slug)
            counter += 1

        os.makedirs(proj_dir, exist_ok=True)

        target_cwd = working_directory
        if not target_cwd or not os.path.exists(target_cwd):
            curr = self.get_workspace()
            target_cwd = curr.get("meta", {}).get("working_directory", WORKSPACE_ROOT)

        data = self._generate_template_workspace(name, slug, target_cwd, template, focus, custom_instances)

        proj_file = os.path.join(proj_dir, "project.json")
        with open(proj_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        # Context documentation file
        ctx_file = os.path.join(proj_dir, "context.md")
        with open(ctx_file, "w", encoding="utf-8") as f:
            f.write(f"# Contexto do Projeto: {name}\n\nFoco do Projeto: {focus or 'Geral'}\nTemplate: {template}\nPasta de Trabalho: {target_cwd}\n")

        self.active_project_slug = slug
        self.last_project_switch_time = time.time()
        self.save_workspace(data, is_project_switch=True)
        self.sync_gemini_instructions(data)
        return {"slug": slug, "name": name, "path": proj_dir, "workspace": data}

    def _generate_template_workspace(
        self,
        name: str,
        slug: str,
        cwd: str,
        template: str = "blank",
        focus: str = "",
        custom_instances: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Builds a rich, harmonious initial canvas layout for AI squads."""
        ts = int(time.time() * 1000)
        data = self._clean_canvas_state(name)
        data["meta"]["slug"] = slug
        data["meta"]["working_directory"] = cwd
        data["meta"]["focus"] = focus or template
        data["meta"]["template"] = template

        nodes = []
        edges = []

        if custom_instances and len(custom_instances) > 0:
            # Custom instance builder with clean horizontal and vertical layout
            start_x = 400
            start_y = 200
            for idx, inst in enumerate(custom_instances):
                tid = f"term_{ts}_{idx}"
                is_orch = bool(inst.get("is_orchestrator", idx == 0))
                title = inst.get("title", f"Agente {idx + 1}")
                preset = inst.get("preset", "antigravity")
                resps = inst.get("responsibilities", ["Geral"])
                color = "#eab308" if is_orch else ("#a855f7" if preset == "antigravity" else "#3b82f6")

                nodes.append({
                    "id": tid,
                    "type": "terminal",
                    "x": start_x + (idx * 560),
                    "y": start_y,
                    "width": 520,
                    "height": 340,
                    "title": title,
                    "command": "powershell.exe",
                    "preset": preset,
                    "cwd": cwd,
                    "is_orchestrator": is_orch,
                    "responsibilities": resps,
                    "borderColor": color,
                    "status": "running"
                })
                # Add attached context note
                nid = f"note_ctx_{ts}_{idx}"
                nodes.append({
                    "id": nid,
                    "type": "note",
                    "x": start_x + (idx * 560),
                    "y": start_y + 360,
                    "width": 320,
                    "height": 180,
                    "boundNodeId": tid,
                    "text": f"🧠 [Contexto: {title}]\n• Papel: {', '.join(resps)}\n• Missão: Atuar no projeto {name}"
                })
                edges.append({"id": f"edge_ctx_{ts}_{idx}", "from": tid, "to": nid, "style": "orchestrator", "color": "#eab308"})
            data["canvas"]["nodes"] = nodes
            data["canvas"]["edges"] = edges
            return data

        if template == "fullstack":
            # 1. Orquestrador Chefe
            orch_id = f"term_{ts}_orch"
            nodes.append({
                "id": orch_id,
                "type": "terminal",
                "x": 600,
                "y": 140,
                "width": 800,
                "height": 480,
                "title": "Antigravity",
                "command": "powershell.exe",
                "preset": "antigravity",
                "cwd": cwd,
                "is_orchestrator": True,
                "borderColor": "#eab308",
                "status": "running"
            })
            note_orch = f"note_ctx_{ts}_orch"
            nodes.append({
                "id": note_orch,
                "type": "note",
                "x": 1450,
                "y": 140,
                "width": 340,
                "height": 280,
                "boundNodeId": orch_id,
                "text": f"🧠 [Contexto do Chefe: {name}]\n• Papel: Orquestrador Chefe (Formula & Delega)\n• Missão: Coordenar o desenvolvimento de {name}\n• Regras: O Chefe apenas pensa e delega para backend e frontend."
            })
            edges.append({"id": f"edge_{ts}_no", "from": orch_id, "to": note_orch, "style": "orchestrator", "color": "#eab308"})

            # 2. Backend
            back_id = f"term_{ts}_back"
            nodes.append({
                "id": back_id,
                "type": "terminal",
                "x": 200,
                "y": 680,
                "width": 720,
                "height": 420,
                "title": "backend",
                "command": "powershell.exe",
                "preset": "antigravity",
                "cwd": cwd,
                "is_orchestrator": False,
                "responsibilities": ["Backend", "APIs REST", "Banco de Dados"],
                "borderColor": "#a855f7",
                "status": "running"
            })
            note_back = f"note_ctx_{ts}_back"
            nodes.append({
                "id": note_back,
                "type": "note",
                "x": -160,
                "y": 680,
                "width": 320,
                "height": 220,
                "boundNodeId": back_id,
                "text": "🧠 [Contexto: backend]\n• Papel: Especialista Backend\n• Foco: Endpoints REST, banco de dados e lógica de negócio.\n• Regras: Validar contratos e seguir boas práticas de arquitetura."
            })
            edges.append({"id": f"edge_{ts}_ob", "from": orch_id, "to": back_id, "style": "orchestrator", "color": "#eab308"})
            edges.append({"id": f"edge_{ts}_nb", "from": back_id, "to": note_back, "style": "orchestrator", "color": "#eab308"})

            # 3. Frontend
            front_id = f"term_{ts}_front"
            nodes.append({
                "id": front_id,
                "type": "terminal",
                "x": 980,
                "y": 680,
                "width": 720,
                "height": 420,
                "title": "frontend",
                "command": "powershell.exe",
                "preset": "antigravity",
                "cwd": cwd,
                "is_orchestrator": False,
                "responsibilities": ["Frontend Web", "UI / UX", "Componentes"],
                "borderColor": "#3b82f6",
                "status": "running"
            })
            note_front = f"note_ctx_{ts}_front"
            nodes.append({
                "id": note_front,
                "type": "note",
                "x": 1740,
                "y": 680,
                "width": 320,
                "height": 220,
                "boundNodeId": front_id,
                "text": "🧠 [Contexto: frontend]\n• Papel: Especialista Frontend\n• Foco: Interfaces limpas, responsividade e componentes modernos.\n• Regras: Design pixel-perfect e prevenção de overflow."
            })
            edges.append({"id": f"edge_{ts}_of", "from": orch_id, "to": front_id, "style": "orchestrator", "color": "#eab308"})
            edges.append({"id": f"edge_{ts}_nf", "from": front_id, "to": note_front, "style": "orchestrator", "color": "#eab308"})

            # 4. Observador / Scripts
            obs_id = f"term_{ts}_obs"
            nodes.append({
                "id": obs_id,
                "type": "terminal",
                "x": 1820,
                "y": 140,
                "width": 620,
                "height": 340,
                "title": "PowerShell",
                "command": "powershell.exe",
                "preset": "shell",
                "cwd": cwd,
                "is_orchestrator": False,
                "is_controllable": False,
                "responsibilities": ["Telemetria", "Análise de Código", "Scripts Locais"],
                "borderColor": "#06b6d4",
                "status": "running"
            })
            edges.append({"id": f"edge_{ts}_oo", "from": orch_id, "to": obs_id, "style": "orchestrator", "color": "#eab308"})
            data["meta"]["orchestrator_node_id"] = orch_id

        elif template == "frontend_ui":
            orch_id = f"term_{ts}_orch"
            nodes.append({
                "id": orch_id,
                "type": "terminal",
                "x": 550,
                "y": 140,
                "width": 780,
                "height": 460,
                "title": "Antigravity",
                "command": "powershell.exe",
                "preset": "antigravity",
                "cwd": cwd,
                "is_orchestrator": True,
                "borderColor": "#eab308",
                "status": "running"
            })
            front_id = f"term_{ts}_front"
            nodes.append({
                "id": front_id,
                "type": "terminal",
                "x": 150,
                "y": 660,
                "width": 720,
                "height": 420,
                "title": "claude frontend",
                "command": "powershell.exe",
                "preset": "antigravity",
                "cwd": cwd,
                "is_orchestrator": False,
                "responsibilities": ["HTML, CSS & JS", "Layouts & Telas", "Design System"],
                "borderColor": "#3b82f6",
                "status": "running"
            })
            auditor_id = f"term_{ts}_auditor"
            nodes.append({
                "id": auditor_id,
                "type": "terminal",
                "x": 930,
                "y": 660,
                "width": 700,
                "height": 420,
                "title": "Auditor Visual",
                "command": "powershell.exe",
                "preset": "shell",
                "cwd": cwd,
                "is_orchestrator": False,
                "is_controllable": False,
                "responsibilities": ["Auditoria Visual", "Inspeção de Telas", "Validação"],
                "borderColor": "#06b6d4",
                "status": "running"
            })
            edges.append({"id": f"edge_{ts}_of", "from": orch_id, "to": front_id, "style": "orchestrator", "color": "#eab308"})
            edges.append({"id": f"edge_{ts}_oa", "from": orch_id, "to": auditor_id, "style": "orchestrator", "color": "#eab308"})
            data["meta"]["orchestrator_node_id"] = orch_id

        elif template == "backend_api":
            orch_id = f"term_{ts}_orch"
            nodes.append({
                "id": orch_id,
                "type": "terminal",
                "x": 550,
                "y": 140,
                "width": 780,
                "height": 460,
                "title": "Antigravity",
                "command": "powershell.exe",
                "preset": "antigravity",
                "cwd": cwd,
                "is_orchestrator": True,
                "borderColor": "#eab308",
                "status": "running"
            })
            api_id = f"term_{ts}_api"
            nodes.append({
                "id": api_id,
                "type": "terminal",
                "x": 100,
                "y": 660,
                "width": 660,
                "height": 420,
                "title": "api-designer",
                "command": "powershell.exe",
                "preset": "antigravity",
                "cwd": cwd,
                "responsibilities": ["Contratos REST", "Schemas Pydantic", "Documentação OpenAPI"],
                "borderColor": "#a855f7",
                "status": "running"
            })
            back_id = f"term_{ts}_back"
            nodes.append({
                "id": back_id,
                "type": "terminal",
                "x": 800,
                "y": 660,
                "width": 660,
                "height": 420,
                "title": "backend-dev",
                "command": "powershell.exe",
                "preset": "antigravity",
                "cwd": cwd,
                "responsibilities": ["Endpoints FastAPI", "Regras de Negócio", "Testes"],
                "borderColor": "#a855f7",
                "status": "running"
            })
            edges.append({"id": f"edge_{ts}_oapi", "from": orch_id, "to": api_id, "style": "orchestrator", "color": "#eab308"})
            edges.append({"id": f"edge_{ts}_oback", "from": orch_id, "to": back_id, "style": "orchestrator", "color": "#eab308"})
            data["meta"]["orchestrator_node_id"] = orch_id

        elif template == "single_agent":
            agent_id = f"term_{ts}_agent"
            nodes.append({
                "id": agent_id,
                "type": "terminal",
                "x": 450,
                "y": 200,
                "width": 800,
                "height": 480,
                "title": "Agente Especialista",
                "command": "powershell.exe",
                "preset": "antigravity",
                "cwd": cwd,
                "is_orchestrator": True,
                "responsibilities": ["Especialista Dedicado", "Automação", "Código"],
                "borderColor": "#a855f7",
                "status": "running"
            })
            note_id = f"note_ctx_{ts}_agent"
            nodes.append({
                "id": note_id,
                "type": "note",
                "x": 1300,
                "y": 200,
                "width": 340,
                "height": 260,
                "boundNodeId": agent_id,
                "text": f"🧠 [Contexto: Agente Especialista]\n• Projeto: {name}\n• Foco: {focus or 'Desenvolvimento dedicado'}\n• Regras: Atuar de forma rápida, cirúrgica e segura."
            })
            edges.append({"id": f"edge_{ts}_ag", "from": agent_id, "to": note_id, "style": "orchestrator", "color": "#eab308"})
            data["meta"]["orchestrator_node_id"] = agent_id

        data["canvas"]["nodes"] = nodes
        data["canvas"]["edges"] = edges
        return data

    def duplicate_project(self, slug: str, new_name: Optional[str] = None) -> Dict[str, Any]:
        """Duplicates an existing project with all its canvas nodes, edges and configurations."""
        proj_file = os.path.join(PROJECTS_DIR, slug, "project.json")
        if not os.path.exists(proj_file):
            raise FileNotFoundError(f"Projeto '{slug}' não encontrado.")

        with open(proj_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        orig_name = data.get("meta", {}).get("name", slug)
        target_name = new_name or f"{orig_name} (Cópia)"
        new_slug = re.sub(r'[^a-zA-Z0-9_\-]', '_', target_name.lower().strip()) or f"{slug}_copia"
        counter = 1
        base_slug = new_slug
        new_proj_dir = os.path.join(PROJECTS_DIR, new_slug)
        while os.path.exists(new_proj_dir):
            new_slug = f"{base_slug}_{counter}"
            new_proj_dir = os.path.join(PROJECTS_DIR, new_slug)
            counter += 1

        os.makedirs(new_proj_dir, exist_ok=True)
        data["meta"]["name"] = target_name
        data["meta"]["slug"] = new_slug

        # Rewrite IDs to prevent conflict with original project
        ts = int(time.time() * 1000)
        id_map = {}
        for idx, node in enumerate(data.get("canvas", {}).get("nodes", [])):
            old_id = node.get("id")
            new_id = f"{node.get('type', 'node')}_{ts}_{idx}"
            id_map[old_id] = new_id
            node["id"] = new_id

        # Update boundNodeId for notes
        for node in data.get("canvas", {}).get("nodes", []):
            if node.get("boundNodeId") and node["boundNodeId"] in id_map:
                node["boundNodeId"] = id_map[node["boundNodeId"]]

        # Update edges
        for idx, edge in enumerate(data.get("canvas", {}).get("edges", [])):
            edge["id"] = f"edge_{ts}_{idx}"
            if edge.get("from") in id_map:
                edge["from"] = id_map[edge["from"]]
            if edge.get("to") in id_map:
                edge["to"] = id_map[edge["to"]]

        if data.get("meta", {}).get("orchestrator_node_id") in id_map:
            data["meta"]["orchestrator_node_id"] = id_map[data["meta"]["orchestrator_node_id"]]

        new_proj_file = os.path.join(new_proj_dir, "project.json")
        with open(new_proj_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        return {"slug": new_slug, "name": target_name, "path": new_proj_dir, "workspace": data}

    def delete_project(self, slug: str) -> Dict[str, Any]:
        """Deletes a project folder safely."""
        proj_dir = os.path.join(PROJECTS_DIR, slug)
        if not os.path.exists(proj_dir):
            raise FileNotFoundError(f"Projeto '{slug}' não encontrado.")

        import shutil
        shutil.rmtree(proj_dir, ignore_errors=True)

        # If the deleted project was the active one, fallback to another or create default
        curr_ws = self.get_workspace()
        if curr_ws.get("meta", {}).get("slug") == slug:
            remaining = self.list_projects()
            if remaining:
                next_slug = remaining[0]["slug"]
                self.load_project(next_slug)
            else:
                self.create_project("Meu Projeto")

        return {"status": "ok", "deleted_slug": slug}

    def rename_project(self, slug: str, new_name: str) -> Dict[str, Any]:
        """Renames an existing project."""
        proj_file = os.path.join(PROJECTS_DIR, slug, "project.json")
        if not os.path.exists(proj_file):
            raise FileNotFoundError(f"Projeto '{slug}' não encontrado.")

        with open(proj_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        data.setdefault("meta", {})["name"] = new_name
        with open(proj_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        # If active, also update current_workspace.json
        curr_ws = self.get_workspace()
        if curr_ws.get("meta", {}).get("slug") == slug:
            curr_ws.setdefault("meta", {})["name"] = new_name
            self.save_workspace(curr_ws)

        return {"status": "ok", "slug": slug, "name": new_name}

    def load_project(self, slug: str) -> Optional[Dict[str, Any]]:
        proj_file = os.path.join(PROJECTS_DIR, slug, "project.json")
        if os.path.exists(proj_file):
            try:
                with open(proj_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                data.setdefault("meta", {})["slug"] = slug
                self.active_project_slug = slug
                self.last_project_switch_time = time.time()
                self.save_workspace(data, is_project_switch=True)
                return data
            except Exception as e:
                print(f"Error loading project {slug}: {e}")
        return None

    def get_workspace(self) -> Dict[str, Any]:
        if os.path.exists(CURRENT_STATE_FILE):
            try:
                with open(CURRENT_STATE_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return self._clean_canvas_state()

    def save_workspace(self, data: Dict[str, Any], is_project_switch: bool = False) -> bool:
        try:
            self.version = int(time.time() * 1000)
            data["_version"] = self.version
            meta = data.setdefault("meta", {})
            slug = meta.get("slug")

            # Ignore stale save from old project right after a project switch
            if not is_project_switch and hasattr(self, 'last_project_switch_time'):
                if (time.time() - self.last_project_switch_time < 3.5):
                    active_slug = getattr(self, 'active_project_slug', None)
                    if slug and active_slug and slug != active_slug:
                        print(f"[Maestri] Ignorando salvamento tardio do projeto antigo '{slug}' durante troca para '{active_slug}'")
                        return True

            if is_project_switch and slug:
                self.active_project_slug = slug

            # If slug is missing, infer it from meta.name or existing project directories
            if not slug and meta.get("name"):
                name_clean = re.sub(r'[^a-zA-Z0-9_\-]', '_', meta["name"].lower().strip())
                if os.path.isdir(os.path.join(PROJECTS_DIR, name_clean)):
                    slug = name_clean
                    meta["slug"] = slug
                else:
                    for entry in os.scandir(PROJECTS_DIR):
                        if entry.is_dir():
                            p_json = os.path.join(entry.path, "project.json")
                            if os.path.exists(p_json):
                                try:
                                    with open(p_json, "r", encoding="utf-8") as pf:
                                        p_data = json.load(pf)
                                        if p_data.get("meta", {}).get("name") == meta["name"]:
                                            slug = entry.name
                                            meta["slug"] = slug
                                            break
                                except Exception:
                                    pass

            # 1. Atomically save to current workspace
            _atomic_write_json(CURRENT_STATE_FILE, data)

            # 2. Persist active session pointer so rebooting app restores exact project and viewport
            session_state = {
                "active_project_slug": slug or "meu_projeto",
                "active_project_name": meta.get("name", "Meu Projeto"),
                "working_directory": meta.get("working_directory", WORKSPACE_ROOT),
                "orchestrator_node_id": meta.get("orchestrator_node_id"),
                "viewport": data.get("canvas", {}).get("viewport", {}),
                "node_count": len(data.get("canvas", {}).get("nodes", [])),
                "saved_at": time.time(),
                "version": self.version
            }
            _atomic_write_json(SESSION_STATE_FILE, session_state)

            # 3. If project has a slug, save project.json & state_snapshot.json in project folder
            if slug:
                proj_dir = os.path.join(PROJECTS_DIR, slug)
                os.makedirs(proj_dir, exist_ok=True)
                proj_file = os.path.join(proj_dir, "project.json")
                _atomic_write_json(proj_file, data)

                # Detailed snapshot for multi-agent auditing & rollback
                snapshot_file = os.path.join(proj_dir, "state_snapshot.json")
                _atomic_write_json(snapshot_file, {
                    "timestamp": time.time(),
                    "project": slug,
                    "workspace": data
                })

            # 4. Automatically sync GEMINI.md in the working directory
            self.sync_gemini_instructions(data)
            return True
        except Exception as e:
            print(f"Error saving workspace: {e}")
            return False

    # ─────────────────────────────────────────────────────────────
    # Intelligent Connector Nodes: Identity, Context Sync & Edge Transport
    # ─────────────────────────────────────────────────────────────

    def get_node_identity(self, node_id: str) -> Dict[str, Any]:
        """Returns a comprehensive identity profile for a node, including its
        connections, role in the workspace, connected context notes, and peers."""
        data = self.get_workspace()
        nodes = data.get("canvas", {}).get("nodes", [])
        edges = data.get("canvas", {}).get("edges", [])

        # Find the target node
        node = next((n for n in nodes if n.get("id") == node_id), None)
        if not node:
            return {"status": "error", "message": f"Node '{node_id}' not found"}

        # Build a quick lookup of all nodes by id
        nodes_by_id = {n["id"]: n for n in nodes}

        # Find all edges connected to this node (supports both from/to and source/target)
        connected_edges = []
        for e in edges:
            src = e.get("from") or e.get("source")
            tgt = e.get("to") or e.get("target")
            if src == node_id or tgt == node_id:
                connected_edges.append(e)

        # Classify connected nodes
        connected_note = None
        connected_peers = []
        commander = None
        subordinates = []

        # 1. Check if note is bound directly via boundNodeId
        for n in nodes:
            if n.get("type") == "note" and n.get("boundNodeId") == node_id:
                connected_note = {
                    "note_id": n["id"],
                    "title": n.get("title", "Anotação de Contexto"),
                    "text": n.get("text", ""),
                }
                break

        # 2. Iterate edges to find peers, commander, subordinates or connected note
        for edge in connected_edges:
            src = edge.get("from") or edge.get("source")
            tgt = edge.get("to") or edge.get("target")
            other_id = tgt if src == node_id else src
            other = nodes_by_id.get(other_id)
            if not other:
                continue

            other_type = other.get("type", "terminal")

            # Context note connection via edge (if not already found)
            if other_type == "note" and not connected_note:
                connected_note = {
                    "note_id": other["id"],
                    "title": other.get("title", "Anotação de Contexto"),
                    "text": other.get("text", ""),
                }
                continue

            # Terminal relationships
            if other_type == "terminal":
                other_summary = {
                    "id": other["id"],
                    "title": other.get("title", "Terminal"),
                    "preset": other.get("preset", "shell"),
                    "is_orchestrator": bool(other.get("is_orchestrator")),
                    "responsibilities": other.get("responsibilities", []),
                }

                if other.get("is_orchestrator"):
                    commander = other_summary
                elif node.get("is_orchestrator"):
                    subordinates.append(other_summary)
                else:
                    connected_peers.append(other_summary)

        # Derive position description
        if node.get("is_orchestrator"):
            position_role = "orchestrator"
            pos_desc = f"Orquestrador / Chefe — comanda: {', '.join(s['title'] for s in subordinates) if subordinates else '(nenhum subordinado conectado)'}"
        elif commander:
            position_role = "subordinate"
            pos_desc = f"Executor Subordinado — reporta a: {commander['title']}"
        else:
            position_role = "autonomous"
            peers_desc = ', '.join(p['title'] for p in connected_peers) if connected_peers else '(nenhum par)'
            pos_desc = f"Executor Autônomo — conectados: {peers_desc}"

        identity = {
            "status": "ok",
            "node_id": node_id,
            "title": node.get("title", "Terminal"),
            "preset": node.get("preset", "shell"),
            "is_orchestrator": bool(node.get("is_orchestrator")),
            "responsibilities": node.get("responsibilities", []),
            "connected_note": connected_note.get("text", "") if connected_note else "",
            "connected_note_id": connected_note.get("note_id") if connected_note else None,
            "position_in_workspace": pos_desc,
            "position_meta": {
                "role": position_role,
                "total_connections": len(connected_edges),
                "peer_count": len(connected_peers),
                "subordinate_count": len(subordinates),
            },
            "connected_peers": connected_peers,
            "commander": commander,
            "subordinates": subordinates,
            "working_directory": node.get("cwd") or data.get("meta", {}).get("working_directory", ""),
        }
        return identity

    def sync_node_context(
        self,
        node_id: str,
        rules: List[str] = None,
        obligations: str = None,
        position: str = None,
        learned: List[str] = None,
        identity_summary: str = None,
        what_it_does: str = None,
    ) -> Dict[str, Any]:
        """Finds or auto-creates a connected context note for a node and builds
        a structured context text with clearly delineated sections.
        Merges new rules/learned with existing ones instead of replacing."""
        data = self.get_workspace()
        nodes = data.get("canvas", {}).get("nodes", [])
        edges = data.get("canvas", {}).get("edges", [])
        nodes_by_id = {n["id"]: n for n in nodes}

        # Find the target node
        node = next((n for n in nodes if n.get("id") == node_id), None)
        if not node:
            return {"status": "error", "message": f"Node '{node_id}' not found"}

        # If what_it_does is provided, also update responsibilities on node
        if what_it_does:
            existing_resps = list(node.get("responsibilities", []))
            for item in [r.strip() for r in what_it_does.split(",") if r.strip()]:
                if item not in existing_resps:
                    existing_resps.append(item)
            node["responsibilities"] = existing_resps

        # Find connected context note via boundNodeId or edges
        note_node = next((n for n in nodes if n.get("type") == "note" and n.get("boundNodeId") == node_id), None)
        if not note_node:
            for edge in edges:
                src = edge.get("from") or edge.get("source")
                tgt = edge.get("to") or edge.get("target")
                other_id = tgt if src == node_id else (src if tgt == node_id else None)
                if other_id and other_id in nodes_by_id:
                    candidate = nodes_by_id[other_id]
                    if candidate.get("type") == "note":
                        note_node = candidate
                        break

        # Auto-create a note if none exists
        if not note_node:
            note_id = f"note_ctx_{int(time.time() * 1000)}"
            node_x = node.get("x", 200)
            node_y = node.get("y", 200)
            node_w = node.get("width", 500)
            note_node = {
                "id": note_id,
                "type": "note",
                "title": f"Contexto: {node.get('title', 'Terminal')}",
                "text": "",
                "boundNodeId": node_id,
                "x": node_x + node_w + 36,
                "y": node_y,
                "width": 320,
                "height": 240
            }
            nodes.append(note_node)
            nodes_by_id[note_id] = note_node

            # Create edge connecting note to the node
            edge_id = f"edge_ctx_{int(time.time() * 1000)}"
            edges.append({
                "id": edge_id,
                "from": node_id,
                "to": note_id,
                "style": "orchestrator",
                "color": "#eab308"
            })

        # ── Parse existing note text to merge rules & learned ──
        existing_rules = []
        existing_learned = []
        existing_text = note_node.get("text", "")

        if existing_text:
            in_section = None
            for line in existing_text.splitlines():
                line_str = line.strip()
                if "REGRAS" in line_str.upper() or "[REGRAS" in line_str.upper():
                    in_section = "rules"
                    continue
                elif "APRENDIZADOS" in line_str.upper() or "[APRENDIZADOS" in line_str.upper():
                    in_section = "learned"
                    continue
                elif any(h in line_str for h in ["IDENTIDADE", "POSIÇÃO", "POSICAO", "OBRIGAÇÕES", "OBRIGACOES", "Última"]):
                    in_section = None
                    continue

                if in_section == "rules" and line_str.startswith("•"):
                    r = line_str.lstrip("• ").strip()
                    if r and r not in existing_rules:
                        existing_rules.append(r)
                elif in_section == "learned" and line_str.startswith("•"):
                    l = line_str.lstrip("• ").strip()
                    if l and l not in existing_learned:
                        existing_learned.append(l)

        # Merge (deduplicate, preserving order)
        clean_new_rules = [r.strip().lstrip("• ") for r in (rules or []) if r.strip()]
        clean_new_learned = [l.strip().lstrip("• ") for l in (learned or []) if l.strip()]
        merged_rules = list(dict.fromkeys(existing_rules + clean_new_rules))
        merged_learned = list(dict.fromkeys(existing_learned + clean_new_learned))

        # ── Derive position info from connections if not explicitly given ──
        identity = self.get_node_identity(node_id)
        if not position:
            position = identity.get("position_in_workspace", "Nó do Workspace")

        # Derive obligations / what it does if not given
        if not obligations:
            # Check if there was an obligation in existing text
            ob_match = re.search(r"(?:📌 OBRIGAÇÕES|⚙️ \[Obrigações\]):\s*\n?([^\n\r]+)", existing_text)
            if ob_match:
                obligations = ob_match.group(1).lstrip("• ").strip()
            else:
                obligations = ", ".join(node.get("responsibilities", [])) or "Seguir diretrizes do projeto e evitar alucinações técnicas."

        resps_str = ", ".join(node.get("responsibilities", [])) or "Geral"
        title = node.get("title", "Terminal")
        preset = node.get("preset", "shell")
        role_label = "👑 Orquestrador Chefe" if node.get("is_orchestrator") else "⚙️ Executor Subordinado"
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

        rules_block = "\n".join(f"• {r}" for r in merged_rules) if merged_rules else "• Seguir premissas do GEMINI.md e validar antes de executar\n• Nunca alucinar dados fora do escopo do projeto"
        learned_block = "\n".join(f"• {l}" for l in merged_learned) if merged_learned else "• (nenhum aprendizado adicional registrado ainda)"

        structured_text = f"""🧠 [Contexto & Memória Viva: {title}]
══════════════════════════════════════════════════
📋 IDENTIDADE & ESCOPO:
• ID: {node_id} | Preset: {preset}
• Papel: {role_label}
• O que faz: {resps_str}

📍 POSIÇÃO NO WORKSPACE:
• {position}

📌 OBRIGAÇÕES:
• {obligations}

⚖️ REGRAS & RESTRIÇÕES (ANTI-ALUCINAÇÃO):
{rules_block}

💡 APRENDIZADOS & FATOS MEMORIZADOS:
{learned_block}

⏰ Sincronizado em: {timestamp}
"""
        note_node["text"] = structured_text
        self.save_workspace(data)

        return {
            "status": "ok",
            "note_id": note_node["id"],
            "boundNodeId": node_id,
            "text": structured_text,
            "note_text": structured_text
        }

    def get_edge_transport_info(self, edge_id: str) -> Dict[str, Any]:
        """Returns information about what flows through a specific edge,
        including source/target nodes, edge style, and note text if applicable."""
        data = self.get_workspace()
        edges = data.get("canvas", {}).get("edges", [])
        nodes_by_id = {n["id"]: n for n in data.get("canvas", {}).get("nodes", [])}

        edge = next((e for e in edges if e.get("id") == edge_id), None)
        if not edge:
            return {"status": "error", "message": f"Edge '{edge_id}' not found"}

        source_id = edge.get("from") or edge.get("source")
        target_id = edge.get("to") or edge.get("target")
        source_node = nodes_by_id.get(source_id, {})
        target_node = nodes_by_id.get(target_id, {})

        result = {
            "status": "ok",
            "edge_id": edge_id,
            "style": edge.get("style", "default"),
            "color": edge.get("color", "#38bdf8"),
            "source": {
                "id": source_id,
                "title": source_node.get("title", ""),
                "type": source_node.get("type", "terminal"),
                "preset": source_node.get("preset", ""),
            },
            "target": {
                "id": target_id,
                "title": target_node.get("title", ""),
                "type": target_node.get("type", "terminal"),
                "preset": target_node.get("preset", ""),
            },
        }

        # Include note text if either side is a note
        if source_node.get("type") == "note":
            result["note_text"] = source_node.get("text", "")
            result["note_side"] = "source"
            result["flow_type"] = "context_transport"
        elif target_node.get("type") == "note":
            result["note_text"] = target_node.get("text", "")
            result["note_side"] = "target"
            result["flow_type"] = "context_transport"
        else:
            result["flow_type"] = "inter_terminal_channel"

        return result

    def _build_connected_notes_section(self, nodes: List[Dict], edges: List[Dict]) -> str:
        """Builds the '🔗 Contexto Vivo dos Agentes' section for GEMINI.md
        by collecting note text from each terminal's connected context note."""
        nodes_by_id = {n["id"]: n for n in nodes}
        terminal_nodes = [n for n in nodes if n.get("type") == "terminal"]

        entries = []
        for terminal in terminal_nodes:
            tid = terminal["id"]
            # 1. Check boundNodeId
            bound_note = next((n for n in nodes if n.get("type") == "note" and n.get("boundNodeId") == tid), None)
            if bound_note and bound_note.get("text", "").strip():
                entries.append(
                    f"### 📝 {terminal.get('title', 'Terminal')} (`{tid}`)\n"
                    f"{bound_note['text'].strip()}\n"
                )
                continue

            # 2. Check edges
            for edge in edges:
                src = edge.get("from") or edge.get("source")
                tgt = edge.get("to") or edge.get("target")
                other_id = tgt if src == tid else (src if tgt == tid else None)
                if other_id and other_id in nodes_by_id:
                    candidate = nodes_by_id[other_id]
                    if candidate.get("type") == "note" and candidate.get("text", "").strip():
                        entries.append(
                            f"### 📝 {terminal.get('title', 'Terminal')} (`{tid}`)\n"
                            f"{candidate['text'].strip()}\n"
                        )
                        break

        if not entries:
            return ""

        header = "## 🔗 Contexto Vivo dos Agentes (Anotações Conectadas):\n"
        return header + "\n".join(entries)

    def sync_gemini_instructions(self, data: Dict[str, Any]):
        try:
            working_dir = data.get("meta", {}).get("working_directory") or WORKSPACE_ROOT
            if not os.path.exists(working_dir):
                working_dir = WORKSPACE_ROOT

            nodes = data.get("canvas", {}).get("nodes", [])
            subordinates = [n for n in nodes if not n.get("is_orchestrator") and n.get("type") == "terminal"]
            orch = next((n for n in nodes if n.get("is_orchestrator")), None)

            sub_lines = []
            for s in subordinates:
                resps = ", ".join(s.get("responsibilities", [])) or "Geral"
                sub_lines.append(f"- **{s.get('title', 'Terminal')}** (ID: `{s.get('id')}`, Preset: `{s.get('preset', 'shell')}`): {resps}")
            sub_block = "\n".join(sub_lines) if sub_lines else "- (Nenhum orquestrado conectado ainda)"

            dir_name = os.path.basename(working_dir.rstrip(r"\/")) or working_dir

            content = f"""# 📁 ESCOPO GLOBAL DO PROJETO: {dir_name}
> **DIRETÓRIO RAIZ ATIVO:** `{working_dir}`

Este workspace está operando com foco **100% EXCLUSIVO** no projeto desta pasta.

## 🚨 DIRETRIZES DE ESCOPO E NAVEGAÇÃO RESTRITA:
- **O PROJETO ESTÁ 100% CONTIDO NESTA PASTA (`{working_dir}`)**.
- **JAMAIS execute buscas recursivas amplas fora da pasta do projeto** (ex: `Get-ChildItem ~ -Recurse`, `dir /s C:\\`, etc.). Mantenha as buscas e comandos estritamente contidos nesta pasta de trabalho para preservar performance e tokens.
- Toda a leitura, criação e edição de arquivos deve ocorrer única e exclusivamente dentro dos limites deste projeto.

## 🎯 PREMISSA GLOBAL ABSOLUTA (Todas as IAs, Agentes e Terminais):
1. **ESCOPO EXCLUSIVO DE TODA EDIÇÃO E MELHORIA**:
   - O sistema, o Orquestrador e todos os agentes devem **pré-supor que toda solicitação, edição, código gerado, teste e melhoria é ESTRITAMENTE para esta pasta de trabalho (`{working_dir}`)**.
   - Qualquer arquivo criado, modificado ou inspecionado deve pertencer a este projeto.
2. **É TERMINANTEMENTE PROIBIDO ALTERAR AS DEPENDÊNCIAS DO MAESTRI**:
   - A IA NUNCA deve alterar pacotes, `pip`, `npm`, `requirements.txt` ou arquivos de infraestrutura da aplicação Maestri (`run_app.py`, `server.py`, `core/*`, etc.).
   - Dependências técnicas só podem ser instaladas ou alteradas se forem dependências locais declaradas deste projeto (`{dir_name}`).

## 👑 Arquitetura de Papéis Maestri:
- **Orquestrador Chefe ({orch.get('title', 'Antigravity') if orch else 'Antigravity'})**: SÓ PENSA, CONTEXTUALIZA E FORMULA ORDENS. NUNCA executa trabalho técnico localmente.
- **Nós Subordinados Executores**:
{sub_block}

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

{self._build_connected_notes_section(nodes, data.get("canvas", {}).get("edges", []))}
"""
            # Sync instructions across all popular AI Agent standard instruction files:
            # - GEMINI.md (Antigravity & Gemini CLI)
            # - CLAUDE.md (Claude Code)
            # - AGENTS.md (OpenAI Codex, Cursor, general agent ecosystem)
            doc_filenames = ["GEMINI.md", "CLAUDE.md", "AGENTS.md"]

            target_dirs = [working_dir]

            for tdir in target_dirs:
                if os.path.isdir(tdir):
                    for fname in doc_filenames:
                        try:
                            fpath = os.path.join(tdir, fname)
                            with open(fpath, "w", encoding="utf-8") as f:
                                f.write(content)
                        except Exception as write_err:
                            print(f"[WorkspaceManager] Error writing {fname} in {tdir}: {write_err}")
        except Exception as e:
            print(f"Error syncing agent instructions: {e}")

    def reset_workspace(self) -> Dict[str, Any]:
        data = self._clean_canvas_state("Meu Projeto")
        self.active_project_slug = "meu_projeto"
        self.last_project_switch_time = time.time()
        self.save_workspace(data, is_project_switch=True)
        return data

    def update_node_context(self, project_slug: str, node_id: str, context_data: Dict[str, Any]):
        """Requirement 4: Saves node outputs and documentation into the project context folder."""
        if not project_slug:
            project_slug = "meu_projeto"
        proj_dir = os.path.join(PROJECTS_DIR, project_slug)
        os.makedirs(proj_dir, exist_ok=True)

        node_ctx_file = os.path.join(proj_dir, f"context_{node_id}.json")
        with open(node_ctx_file, "w", encoding="utf-8") as f:
            json.dump(context_data, f, indent=2, ensure_ascii=False)
