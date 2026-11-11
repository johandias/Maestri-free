"""
FastAPI Server for Maestri Desktop.
Serves static frontend, handles REST endpoints for workspace persistence,
projects in ./projects/, native Windows folder picker, inter-node context sharing,
and WebSocket streams for real machine terminals.
"""
import sys
import os
import time
import json
import asyncio
import re
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List, Optional

from core.workspace_manager import WorkspaceManager
from core.terminal_manager import TerminalManager
from core.orchestrator import MaestriOrchestrator

workspace_mgr = WorkspaceManager()
terminal_mgr = TerminalManager()
orchestrator = MaestriOrchestrator()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure clean state and session directories
    print("[Maestri Backend] Motor de persistência durável ativo.")
    yield
    # Shutdown: flush all terminal session buffers and save workspace snapshot (Context7 best practice)
    print("[Maestri Backend] Encerrando com persistência de contexto: salvando logs e estados...")
    try:
        terminal_mgr.flush_all_logs()
        current_data = workspace_mgr.get_workspace()
        workspace_mgr.save_workspace(current_data)
        for session in list(terminal_mgr.sessions.values()):
            if session.is_running:
                await session.close()
    except Exception as e:
        print(f"[Maestri Backend] Erro ao persistir contexto no encerramento: {e}")

app = FastAPI(title="Maestri Desktop Backend", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend")

class CreateProjectRequest(BaseModel):
    name: str
    cwd: Optional[str] = None
    template: Optional[str] = "blank"
    focus: Optional[str] = ""
    instances: Optional[List[Dict[str, Any]]] = None

class RenameProjectRequest(BaseModel):
    name: str

class DuplicateProjectRequest(BaseModel):
    name: Optional[str] = None

class BroadcastContextRequest(BaseModel):
    source_id: str
    target_ids: List[str]

class RouteTaskRequest(BaseModel):
    prompt: str
    orchestrator_node_id: Optional[str] = None
    target_node_ids: Optional[List[str]] = []

class SetOrchestratorRequest(BaseModel):
    node_id: str
    is_orchestrator: bool

class SetDirectoryRequest(BaseModel):
    path: str

class UpdateNoteRequest(BaseModel):
    text: str
    mode: Optional[str] = "append"  # "append" | "rule" | "set"

class UpdateCompetenciesRequest(BaseModel):
    action: Optional[str] = "add"  # "add" | "remove" | "set"
    competency: Optional[str] = None
    responsibilities: Optional[List[str]] = None

class SyncContextRequest(BaseModel):
    rules: Optional[List[str]] = None
    obligations: Optional[str] = None
    position: Optional[str] = None
    learned: Optional[List[str]] = None
    identity_summary: Optional[str] = None
    what_it_does: Optional[str] = None

class SendTextRequest(BaseModel):
    text: str
    target_id: Optional[str] = None
    target_name: Optional[str] = None

@app.get("/api/workspace")
async def get_workspace():
    return JSONResponse(
        content=workspace_mgr.get_workspace(),
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"}
    )

@app.get("/api/workspace/poll")
async def poll_workspace(v: Optional[int] = 0):
    """High-performance differential polling: avoids re-serializing data if client already has latest version."""
    return workspace_mgr.get_workspace_poll(v or 0)

@app.post("/api/workspace/flush")
async def flush_workspace():
    """Flushes all terminal session logs and saves active project state snapshot."""
    terminal_mgr.flush_all_logs()
    ws = workspace_mgr.get_workspace()
    success = workspace_mgr.save_workspace(ws)
    return {"status": "ok" if success else "error", "message": "Contexto e logs sincronizados com sucesso."}

@app.get("/api/terminal/history/{session_id}")
async def get_terminal_history(session_id: str):
    """Returns persistent terminal history for a specific session."""
    history = terminal_mgr.get_session_history(session_id)
    return {"status": "ok", "session_id": session_id, "history": history}

@app.post("/api/workspace/save")
async def save_workspace(data: Dict[str, Any]):
    success = workspace_mgr.save_workspace(data)
    return {"status": "ok" if success else "error"}

@app.post("/api/workspace/reset")
async def reset_workspace():
    data = workspace_mgr.reset_workspace()
    return {"status": "ok", "workspace": data}

# Requirement 2: Projects inside ./projects/
@app.get("/api/projects")
async def list_projects():
    return JSONResponse(
        content=workspace_mgr.list_projects(),
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"}
    )

@app.post("/api/projects/create")
async def create_project(req: CreateProjectRequest):
    result = workspace_mgr.create_project(
        name=req.name,
        working_directory=req.cwd,
        template=req.template or "blank",
        focus=req.focus or "",
        custom_instances=req.instances
    )
    return JSONResponse(
        content=result,
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"}
    )

@app.post("/api/projects/{slug}/duplicate")
async def duplicate_project(slug: str, req: Optional[DuplicateProjectRequest] = None):
    new_name = req.name if req else None
    try:
        result = workspace_mgr.duplicate_project(slug, new_name)
        return {"status": "ok", "project": result}
    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/api/projects/{slug}/delete")
async def delete_project(slug: str):
    try:
        result = workspace_mgr.delete_project(slug)
        return result
    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/api/projects/{slug}/rename")
async def rename_project(slug: str, req: RenameProjectRequest):
    try:
        result = workspace_mgr.rename_project(slug, req.name)
        return result
    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.get("/api/projects/{slug}")
async def load_project(slug: str):
    data = workspace_mgr.load_project(slug)
    if data:
        return JSONResponse(
            content={"status": "ok", "workspace": data},
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"}
        )
    return JSONResponse(status_code=404, content={"status": "error", "message": "Project not found"})

@app.post("/api/projects/{slug}/switch")
async def switch_project_post(slug: str):
    _seed_workspace_if_needed(slug)
    data = workspace_mgr.load_project(slug)
    if data:
        cwd = data.get("meta", {}).get("working_directory")
        if cwd and os.path.exists(cwd):
            await terminal_mgr.update_all_sessions_cwd(cwd)
        return JSONResponse(
            content={"status": "ok", "workspace": data},
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"}
        )
    return JSONResponse(status_code=404, content={"status": "error", "message": "Project not found"})

# Canonical workspaces matching the official Maestri prints
CANONICAL_DEFAULT_WORKSPACES = [
    {
        "name": "Campanhas Sistema",
        "slug": "campanhas-sistema",
        "path": os.path.join(os.path.dirname(os.path.abspath(__file__)), "projects", "campanhas-sistema"),
        "icon": "📁",
        "node_count": 5,
        "agent_count": 3,
        "nodes": [
            {
                "id": "term_cs_orch",
                "type": "terminal",
                "title": "Orquestrador de Campanhas",
                "preset": "antigravity",
                "command": "powershell.exe" if sys.platform.startswith("win") else os.environ.get("SHELL", "/bin/bash"),
                "is_orchestrator": True,
                "maestro": True,
                "role": "Orquestrador",
                "appearance_icon": "👑",
                "appearance_color": "#facc15",
                "theme": "dark",
                "monitor_activity": True,
                "x": 200,
                "y": 150,
                "width": 540,
                "height": 340
            },
            {
                "id": "term_cs_claude",
                "type": "terminal",
                "title": "Claude Copywriter",
                "preset": "claude",
                "command": "claude",
                "is_orchestrator": False,
                "maestro": False,
                "role": "Copywriting & Conteúdo",
                "appearance_icon": "🟣",
                "appearance_color": "#c084fc",
                "theme": "dark",
                "monitor_activity": False,
                "x": 800,
                "y": 150,
                "width": 540,
                "height": 340
            },
            {
                "id": "term_cs_codex",
                "type": "terminal",
                "title": "Codex Automação",
                "preset": "codex",
                "command": "codex",
                "is_orchestrator": False,
                "maestro": False,
                "role": "Integração & Tráfego",
                "appearance_icon": "🟢",
                "appearance_color": "#34d399",
                "theme": "dark",
                "monitor_activity": False,
                "x": 800,
                "y": 540,
                "width": 540,
                "height": 340
            },
            {
                "id": "note_cs_guidelines",
                "type": "note",
                "title": "Diretrizes de Campanhas",
                "content": "# Campanhas Sistema\nPlanejamento estratégico de tráfego, copywriting e testes A/B com agentes autônomos.",
                "x": 200,
                "y": 540,
                "width": 420,
                "height": 280
            },
            {
                "id": "portal_cs_dashboard",
                "type": "portal",
                "title": "Dashboard de Métricas",
                "url": "https://analytics.google.com",
                "x": 1400,
                "y": 150,
                "width": 600,
                "height": 480
            }
        ]
    },
    {
        "name": "maestri-free",
        "slug": "maestri-free",
        "path": os.path.dirname(os.path.abspath(__file__)),
        "icon": "📁",
        "node_count": 6,
        "agent_count": 4,
        "nodes": [
            {
                "id": "term_mf_orch",
                "type": "terminal",
                "title": "Orquestrador Chefe",
                "preset": "antigravity",
                "command": "powershell.exe" if sys.platform.startswith("win") else os.environ.get("SHELL", "/bin/bash"),
                "is_orchestrator": True,
                "maestro": True,
                "role": "Orquestrador",
                "appearance_icon": "👑",
                "appearance_color": "#facc15",
                "theme": "dark",
                "monitor_activity": True,
                "x": 200,
                "y": 150,
                "width": 540,
                "height": 340
            },
            {
                "id": "term_mf_backend",
                "type": "terminal",
                "title": "Backend Python (FastAPI)",
                "preset": "antigravity",
                "command": "agy",
                "is_orchestrator": False,
                "maestro": False,
                "role": "Backend & Core",
                "appearance_icon": "✨",
                "appearance_color": "#38bdf8",
                "theme": "dark",
                "monitor_activity": False,
                "x": 800,
                "y": 150,
                "width": 540,
                "height": 340
            },
            {
                "id": "term_mf_claude",
                "type": "terminal",
                "title": "Claude Code Agent",
                "preset": "claude",
                "command": "claude",
                "is_orchestrator": False,
                "maestro": False,
                "role": "Generalista",
                "appearance_icon": "🟣",
                "appearance_color": "#c084fc",
                "theme": "dark",
                "monitor_activity": False,
                "x": 800,
                "y": 540,
                "width": 540,
                "height": 340
            },
            {
                "id": "term_mf_frontend",
                "type": "terminal",
                "title": "Frontend UI/UX",
                "preset": "deepseek",
                "command": "agy",
                "is_orchestrator": False,
                "maestro": False,
                "role": "Frontend & Design",
                "appearance_icon": "🎨",
                "appearance_color": "#f43f5e",
                "theme": "dark",
                "monitor_activity": False,
                "x": 200,
                "y": 540,
                "width": 540,
                "height": 340
            },
            {
                "id": "note_mf_scope",
                "type": "note",
                "title": "Escopo Global Maestri-free",
                "content": "# Escopo Maestri-free\nWorkspace autônomo com suporte ConPTY/POSIX PTY nativo e barramento de contexto em tempo real.",
                "x": 1400,
                "y": 150,
                "width": 420,
                "height": 280
            },
            {
                "id": "note_mf_tasks",
                "type": "note",
                "title": "Plano de Paridade",
                "content": "# Paridade Oficial\n- Frente 1: PTY Multiplataforma\n- Frente 2: Física Verlet de Cordas\n- Frente 3: Window Controls\n- Frente 4: Ícones Vetoriais",
                "x": 1400,
                "y": 480,
                "width": 420,
                "height": 300
            }
        ]
    },
    {
        "name": "criador-slides-ppt",
        "slug": "criador-slides-ppt",
        "path": os.path.join(os.path.dirname(os.path.abspath(__file__)), "projects", "criador-slides-ppt"),
        "icon": "📁",
        "node_count": 4,
        "agent_count": 2,
        "nodes": [
            {
                "id": "term_ppt_orch",
                "type": "terminal",
                "title": "Orquestrador de Apresentações",
                "preset": "antigravity",
                "command": "powershell.exe" if sys.platform.startswith("win") else os.environ.get("SHELL", "/bin/bash"),
                "is_orchestrator": True,
                "maestro": True,
                "role": "Orquestrador",
                "appearance_icon": "👑",
                "appearance_color": "#facc15",
                "theme": "dark",
                "monitor_activity": True,
                "x": 200,
                "y": 150,
                "width": 540,
                "height": 340
            },
            {
                "id": "term_ppt_claude",
                "type": "terminal",
                "title": "Claude Slide Designer",
                "preset": "claude",
                "command": "claude",
                "is_orchestrator": False,
                "maestro": False,
                "role": "Designer de Slides",
                "appearance_icon": "🟣",
                "appearance_color": "#c084fc",
                "theme": "dark",
                "monitor_activity": False,
                "x": 800,
                "y": 150,
                "width": 540,
                "height": 340
            },
            {
                "id": "term_ppt_codex",
                "type": "terminal",
                "title": "Codex PPTX Engine",
                "preset": "codex",
                "command": "codex",
                "is_orchestrator": False,
                "maestro": False,
                "role": "Gerador python-pptx",
                "appearance_icon": "🟢",
                "appearance_color": "#34d399",
                "theme": "dark",
                "monitor_activity": False,
                "x": 800,
                "y": 540,
                "width": 540,
                "height": 340
            },
            {
                "id": "note_ppt_briefing",
                "type": "note",
                "title": "Briefing da Apresentação",
                "content": "# Apresentação Executiva\nDiretrizes de layout, fontes, cores e estrutura de tópicos para geração automatizada de decks.",
                "x": 200,
                "y": 540,
                "width": 420,
                "height": 280
            }
        ]
    }
]

def _seed_workspace_if_needed(slug: str) -> bool:
    """Ensures a canonical workspace project directory and project.json exist before loading."""
    projects_dir = os.path.join(os.path.dirname(__file__), "projects")
    proj_dir = os.path.join(projects_dir, slug)
    proj_json = os.path.join(proj_dir, "project.json")
    if os.path.exists(proj_json):
        return True

    seed = next((s for s in CANONICAL_DEFAULT_WORKSPACES if s["slug"] == slug or s["name"].lower().strip() == slug.lower().strip()), None)
    if seed:
        try:
            os.makedirs(proj_dir, exist_ok=True)
            template_data = {
                "meta": {
                    "name": seed["name"],
                    "slug": seed["slug"],
                    "version": "2.0.0",
                    "working_directory": seed["path"],
                    "orchestrator_node_id": seed["nodes"][0]["id"] if seed.get("nodes") else None,
                    "theme": "dark"
                },
                "canvas": {
                    "viewport": {"x": 0, "y": 0, "zoom": 1.0},
                    "nodes": seed["nodes"],
                    "edges": []
                }
            }
            with open(proj_json, "w", encoding="utf-8") as f:
                json.dump(template_data, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            print(f"[WorkspaceSwitch] Erro ao criar projeto seed '{slug}': {e}")
    return False

# Requirement 1: Enriched workspaces list alias
@app.get("/api/workspaces/list")
async def list_workspaces():
    projects_dir = os.path.join(os.path.dirname(__file__), "projects")
    curr_ws = workspace_mgr.get_workspace()
    active_slug = curr_ws.get("meta", {}).get("slug", "")

    workspaces = []
    seen_slugs = set()

    if os.path.exists(projects_dir):
        for entry in os.scandir(projects_dir):
            if entry.is_dir():
                slug = entry.name
                proj_json = os.path.join(entry.path, "project.json")
                name = entry.name
                working_dir = ""
                nodes = []
                icon = "📁"
                if os.path.exists(proj_json):
                    try:
                        with open(proj_json, "r", encoding="utf-8") as f:
                            d = json.load(f)
                            meta = d.get("meta", {})
                            name = meta.get("name", entry.name)
                            working_dir = meta.get("working_directory", "")
                            icon = meta.get("icon", "📁")
                            nodes = d.get("canvas", {}).get("nodes", [])
                    except Exception:
                        pass
                agent_count = sum(1 for n in nodes if n.get("preset") in ['antigravity', 'claude', 'codex', 'deepseek'])
                workspaces.append({
                    "name": name,
                    "slug": slug,
                    "path": working_dir or entry.path,
                    "node_count": len(nodes),
                    "agent_count": agent_count,
                    "icon": icon,
                    "is_active": (slug == active_slug or (not active_slug and slug == "meu_projeto"))
                })
                seen_slugs.add(slug)
                seen_slugs.add(name.lower().strip())

    # Add canonical defaults if not already present or if only 1 project exists
    for default_ws in CANONICAL_DEFAULT_WORKSPACES:
        slug = default_ws["slug"]
        norm_name = default_ws["name"].lower().strip()
        if slug not in seen_slugs and norm_name not in seen_slugs:
            workspaces.append({
                "name": default_ws["name"],
                "slug": slug,
                "path": default_ws["path"],
                "node_count": default_ws["node_count"],
                "agent_count": default_ws["agent_count"],
                "icon": default_ws.get("icon", "📁"),
                "is_active": (slug == active_slug)
            })
            seen_slugs.add(slug)

    return JSONResponse(
        content={"status": "ok", "workspaces": workspaces},
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"}
    )

# Requirement 2: Switch workspace endpoint
@app.post("/api/workspaces/{slug}/switch")
async def switch_workspace(slug: str):
    _seed_workspace_if_needed(slug)
    data = workspace_mgr.load_project(slug)
    if data:
        cwd = data.get("meta", {}).get("working_directory")
        if cwd and os.path.exists(cwd):
            await terminal_mgr.update_all_sessions_cwd(cwd)
        return JSONResponse(
            content={"status": "ok", "workspace": data},
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"}
        )
    return JSONResponse(status_code=404, content={"status": "error", "message": f"Workspace '{slug}' não encontrado."})

# Requirement 6: Native folder picker dialog
@app.get("/api/browse-directory")
async def browse_directory(initial: str = ""):
    selected_path = ""
    def _pick():
        nonlocal selected_path
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            selected_path = filedialog.askdirectory(
                initialdir=initial if initial and os.path.exists(initial) else os.getcwd(),
                title="Selecione a Pasta de Trabalho para o Terminal"
            )
            root.destroy()
        except Exception as e:
            print(f"Error opening folder dialog: {e}")

    await asyncio.to_thread(_pick)
    return {"path": selected_path or (initial or os.getcwd())}

@app.post("/api/workspace/directory")
async def set_workspace_directory(req: SetDirectoryRequest):
    folder = os.path.abspath(req.path)
    if not os.path.exists(folder):
        return JSONResponse(status_code=400, content={"status": "error", "message": "Diretório não existe"})
    
    ws = workspace_mgr.get_workspace()
    ws.setdefault("meta", {})["working_directory"] = folder

    # Propagate active working directory to all terminal nodes
    for node in ws.get("canvas", {}).get("nodes", []):
        if node.get("type") == "terminal":
            node["cwd"] = folder

    workspace_mgr.save_workspace(ws)
    workspace_mgr.sync_gemini_instructions(ws)

    # Propagate active working directory directly to running terminals
    await terminal_mgr.update_all_sessions_cwd(folder)

    clean_folder_name = os.path.basename(folder) or folder
    return {
        "status": "ok", 
        "path": folder, 
        "folder_name": clean_folder_name
    }

@app.post("/api/workspace/open-directory")
async def open_workspace_directory():
    ws = workspace_mgr.get_workspace()
    folder = ws.get("meta", {}).get("working_directory", os.getcwd())
    if os.path.exists(folder):
        try:
            import subprocess
            subprocess.Popen(f'explorer "{folder}"')
            return {"status": "ok", "path": folder}
        except Exception as e:
            return {"status": "error", "message": str(e)}
    return JSONResponse(status_code=404, content={"status": "error", "message": "Diretório não encontrado"})


# =========================================================================
# FILE TREE & FILE SYSTEM ENDPOINTS (MAESTRI & OPEN-MAESTRI PARITY)
# =========================================================================

def _build_directory_tree(dir_path: str, max_depth: int = 3, current_depth: int = 0) -> List[Dict[str, Any]]:
    if current_depth > max_depth or not os.path.exists(dir_path) or not os.path.isdir(dir_path):
        return []

    entries = []
    ignored_names = {".git", "node_modules", "__pycache__", ".venv", "venv", ".idea", ".DS_Store"}

    try:
        items = sorted(os.listdir(dir_path), key=lambda x: (not os.path.isdir(os.path.join(dir_path, x)), x.lower()))
    except Exception:
        return []

    for name in items:
        if name in ignored_names:
            continue
        full_path = os.path.join(dir_path, name)
        is_dir = os.path.isdir(full_path)
        ext = os.path.splitext(name)[1].lstrip(".").lower() if not is_dir else ""

        entry: Dict[str, Any] = {
            "name": name,
            "path": full_path,
            "type": "directory" if is_dir else "file",
            "extension": ext
        }

        if is_dir:
            if current_depth < max_depth:
                entry["children"] = _build_directory_tree(full_path, max_depth, current_depth + 1)
            else:
                entry["children"] = []
        else:
            try:
                entry["size"] = os.path.getsize(full_path)
            except Exception:
                entry["size"] = 0

        entries.append(entry)

    return entries


@app.get("/api/fs/tree")
async def get_fs_tree(path: Optional[str] = None, max_depth: int = 3):
    ws = workspace_mgr.get_workspace()
    default_root = ws.get("meta", {}).get("working_directory") or os.getcwd()
    target_path = os.path.abspath(path) if path else os.path.abspath(default_root)

    if not os.path.exists(target_path) or not os.path.isdir(target_path):
        return JSONResponse(status_code=400, content={"status": "error", "message": f"Diretório não encontrado: {target_path}"})

    entries = _build_directory_tree(target_path, max_depth=max_depth)
    return {
        "status": "ok",
        "root": target_path,
        "name": os.path.basename(target_path) or target_path,
        "entries": entries
    }


@app.get("/api/fs/content")
async def get_fs_content(path: str):
    if not os.path.exists(path) or not os.path.isfile(path):
        return JSONResponse(status_code=404, content={"status": "error", "message": "Arquivo não encontrado."})

    try:
        # Limit to 500KB for preview safety
        size = os.path.getsize(path)
        if size > 500_000:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read(500_000) + "\n\n... [Truncado para pré-visualização rápida] ..."
        else:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()

        ext = os.path.splitext(path)[1].lstrip(".").lower()
        return {
            "status": "ok",
            "path": path,
            "name": os.path.basename(path),
            "extension": ext,
            "size": size,
            "content": content
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})


class FSCreateRequest(BaseModel):
    path: str
    type: str = "file"  # "file" or "directory"

@app.post("/api/fs/create")
async def create_fs_item(req: FSCreateRequest):
    try:
        if req.type == "directory":
            os.makedirs(req.path, exist_ok=True)
        else:
            parent = os.path.dirname(req.path)
            if parent and not os.path.exists(parent):
                os.makedirs(parent, exist_ok=True)
            if not os.path.exists(req.path):
                with open(req.path, "w", encoding="utf-8") as f:
                    f.write("")
        return {"status": "ok", "path": req.path}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})


class FSDeleteRequest(BaseModel):
    path: str

@app.post("/api/fs/delete")
async def delete_fs_item(req: FSDeleteRequest):
    if not os.path.exists(req.path):
        return JSONResponse(status_code=404, content={"status": "error", "message": "Item não encontrado."})
    try:
        import shutil
        if os.path.isdir(req.path):
            shutil.rmtree(req.path)
        else:
            os.remove(req.path)
        return {"status": "ok", "deleted": req.path}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})


class FSRenameRequest(BaseModel):
    old_path: str
    new_name: str

@app.post("/api/fs/rename")
async def rename_fs_item(req: FSRenameRequest):
    if not os.path.exists(req.old_path):
        return JSONResponse(status_code=404, content={"status": "error", "message": "Item original não encontrado."})
    try:
        parent = os.path.dirname(req.old_path)
        new_path = os.path.join(parent, req.new_name)
        os.rename(req.old_path, new_path)
        return {"status": "ok", "old_path": req.old_path, "new_path": new_path}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

# Requirement 4: Inter-node communication (piping output to connected nodes)
@app.post("/api/context/broadcast")
async def broadcast_context(req: BroadcastContextRequest):
    result = await terminal_mgr.broadcast_context(req.source_id, req.target_ids)
    return result

# Requirement 5: Designate any window as Orchestrator
@app.post("/api/terminal/orchestrator")
async def set_orchestrator(req: SetOrchestratorRequest):
    terminal_mgr.set_orchestrator(req.node_id, req.is_orchestrator)
    # Also update workspace state
    ws = workspace_mgr.get_workspace()
    ws.setdefault("meta", {})["orchestrator_node_id"] = req.node_id if req.is_orchestrator else None
    workspace_mgr.save_workspace(ws)
    return {"status": "ok", "orchestrator_node_id": ws["meta"]["orchestrator_node_id"]}

@app.get("/api/agents")
async def list_agents():
    return [
        {
            "id": a.id,
            "name": a.name,
            "role": a.role,
            "goal": a.goal,
            "tools": a.tools
        }
        for a in orchestrator.agents.values()
    ]

_recent_dispatches: Dict[str, Dict[str, Any]] = {}
_events_websockets: set = set()

async def broadcast_event(event_data: Dict[str, Any]):
    """Broadcasts real-time events to all connected canvas frontend WebSockets (< 5ms)."""
    if not _events_websockets:
        return
    dead = set()
    msg = json.dumps(event_data, ensure_ascii=False)
    for ws in list(_events_websockets):
        try:
            await ws.send_text(msg)
        except Exception:
            dead.add(ws)
    for d in dead:
        _events_websockets.discard(d)

@app.websocket("/ws/events")
async def websocket_events(websocket: WebSocket):
    await websocket.accept()
    _events_websockets.add(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        _events_websockets.discard(websocket)
    except Exception:
        _events_websockets.discard(websocket)

@app.post("/api/orchestrate")
async def orchestrate_prompt(req: RouteTaskRequest):
    import time
    dispatch_key = f"{req.orchestrator_node_id}:{req.prompt.strip()}"
    now = time.time()

    # Anti-repetition gatekeeper: prevent duplicate executions triggered in rapid succession
    if dispatch_key in _recent_dispatches:
        cached = _recent_dispatches[dispatch_key]
        if (now - cached.get("timestamp", 0)) < 4.0:
            print(f"[Orchestrate API] Ignorado disparo idêntico duplicado para {dispatch_key} (cooldown ativo)")
            return cached.get("result", {"status": "ok", "delivered_to": 0})

    # 1. Retrieve current workspace state to know node metadata & working directory
    ws = workspace_mgr.get_workspace()
    working_dir = ws.get("meta", {}).get("working_directory", os.getcwd())
    all_nodes = ws.get("canvas", {}).get("nodes", [])
    all_edges = ws.get("canvas", {}).get("edges", [])

    # Health & Readiness Check: Validate Orchestrator node and its active terminal session
    orch_node = next((n for n in all_nodes if n.get("id") == req.orchestrator_node_id), None)
    if not orch_node:
        return JSONResponse(status_code=400, content={"status": "error", "message": "Nenhum nó Chefe/Orquestrador selecionado."})

    orch_sess = terminal_mgr.sessions.get(req.orchestrator_node_id)
    if not orch_sess or not orch_sess.is_running or not orch_sess.pty or not orch_sess.pty.isalive():
        orch_title = orch_node.get("title", "Orquestrador Chefe")
        print(f"[Orchestrate API] Bloqueado: nó Orquestrador [{orch_title}] ({req.orchestrator_node_id}) não está ativo/funcionando.")
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "message": f"O nó Orquestrador [{orch_title}] não está em execução ativa ou foi encerrado. Inicie ou reinicie o terminal do Orquestrador antes de formular e despachar ordens."
            }
        )

    # Find any connected context notes linked to the orchestrator node
    connected_notes = []
    connected_note_id = None
    for e in all_edges:
        if e.get("from") == req.orchestrator_node_id or e.get("to") == req.orchestrator_node_id:
            other_id = e.get("to") if e.get("from") == req.orchestrator_node_id else e.get("from")
            note_obj = next((n for n in all_nodes if n.get("id") == other_id and n.get("type") == "note"), None)
            if note_obj and note_obj.get("text"):
                connected_notes.append(note_obj.get("text"))
                connected_note_id = note_obj.get("id")

    context_note_text = "\n---\n".join(connected_notes) if connected_notes else ""

    # Find connected observer nodes (sensors) to provide situational awareness to the Chefe
    connected_node_ids = set()
    for e in all_edges:
        if e.get("from") == req.orchestrator_node_id:
            connected_node_ids.add(e.get("to"))
        elif e.get("to") == req.orchestrator_node_id:
            connected_node_ids.add(e.get("from"))

    observer_nodes_info = []
    for nid in connected_node_ids:
        n = next((node for node in all_nodes if node.get("id") == nid), None)
        if not n:
            continue
        # Node designated as Observer/Sensor Only
        if n.get("is_controllable") is False:
            if n.get("type") == "terminal":
                sess = terminal_mgr.sessions.get(nid)
                last_out = sess.last_output if sess else ""
                clean_out = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', last_out).strip()
                observer_nodes_info.append({
                    "id": nid,
                    "title": n.get("title", "Terminal Observador"),
                    "type": "terminal",
                    "status_overview": clean_out[-1000:] if clean_out else "(Aguardando atividade)"
                })
            elif n.get("type") == "portal":
                observer_nodes_info.append({
                    "id": nid,
                    "title": "Navegador Web",
                    "type": "portal",
                    "status_overview": f"Visualizando URL: {n.get('url', 'https://google.com')}"
                })

    # Filter target nodes so that NO observer node is ever treated as an execution target
    # Also deduplicate target IDs to ensure no terminal is addressed more than once
    valid_target_ids = []
    for tid in (req.target_node_ids or []):
        if tid in valid_target_ids:
            continue
        t_node = next((n for n in all_nodes if n.get("id") == tid), None)
        if t_node and t_node.get("is_controllable") is not False:
            valid_target_ids.append(tid)

    # Retrieve target nodes and associate each node with its dedicated live connected note!
    target_nodes = []
    for tid in valid_target_ids:
        t_node = next((n for n in all_nodes if n.get("id") == tid), None)
        if not t_node:
            continue
        target_dict = dict(t_node)
        # Find note connected by boundNodeId or edge
        t_note = next((n for n in all_nodes if n.get("type") == "note" and n.get("boundNodeId") == tid), None)
        if not t_note:
            for e in all_edges:
                src, tgt = e.get("from"), e.get("to")
                if src == tid:
                    t_note = next((n for n in all_nodes if n.get("id") == tgt and n.get("type") == "note"), None)
                elif tgt == tid:
                    t_note = next((n for n in all_nodes if n.get("id") == src and n.get("type") == "note"), None)
                if t_note:
                    break
        target_dict["connected_note_text"] = t_note.get("text", "").strip() if t_note else ""
        target_nodes.append(target_dict)

    # 2. Formulate and delegate orders using the Orchestrator's Connected AI
    formulation = await orchestrator.formulate_and_delegate_orders(
        prompt=req.prompt,
        working_dir=working_dir,
        target_nodes=target_nodes,
        orchestrator_node=orch_node,
        context_note=context_note_text,
        observer_nodes=observer_nodes_info
    )

    thought_process = formulation.get("thought_process", "")
    delegations = formulation.get("delegations", [])
    updated_context_note = formulation.get("updated_context_note", "")

    # If there is a connected note node, update its text in the saved workspace state as well
    if connected_note_id and updated_context_note:
        for n in all_nodes:
            if n.get("id") == connected_note_id:
                n["text"] = updated_context_note
                workspace_mgr.save_workspace(ws)
                break

    # 3. Dispatch real directives to the terminals:
    # - Display the thought process in the orchestrator terminal (never executes locally)
    # - Inject hierarchical directives into the subordinate terminals (subordinates follow orders)
    delivered = 0
    if valid_target_ids and req.orchestrator_node_id:
        dispatch_res = await terminal_mgr.dispatch_orchestrator_task(
            orchestrator_id=req.orchestrator_node_id,
            target_ids=valid_target_ids,
            prompt=req.prompt,
            thought_process=thought_process,
            delegations=delegations,
            working_dir=working_dir
        )
        delivered = dispatch_res.get("delivered_to", 0)

    result_payload = {
        "status": "ok",
        "thought_process": thought_process,
        "delegations": delegations,
        "updated_context_note": updated_context_note,
        "delivered_to": delivered,
        "audit_id": formulation.get("audit_id")
    }
    _recent_dispatches[dispatch_key] = {"timestamp": now, "result": result_payload}
    return result_payload

@app.get("/api/tokens/usage")
async def get_token_usage():
    ws = workspace_mgr.get_workspace()
    nodes = ws.get("canvas", {}).get("nodes", [])
    return terminal_mgr.get_token_metrics(nodes)

@app.get("/api/audit")
async def get_audit_trail():
    return orchestrator.get_audit_trail()

# Requirement 3: Terminal Node Update & Creation Endpoints with enriched fields
def _apply_node_data(node: Dict[str, Any], payload: Dict[str, Any]):
    # Basic fields
    for field in ["title", "preset", "command", "cwd", "type", "x", "y", "width", "height", "is_controllable"]:
        if field in payload and payload[field] is not None:
            node[field] = payload[field]

    # Requirement 3: maestro (bool) & is_orchestrator synchronization
    if "maestro" in payload and payload["maestro"] is not None:
        val = bool(payload["maestro"])
        node["maestro"] = val
        node["is_orchestrator"] = val
    elif "is_orchestrator" in payload and payload["is_orchestrator"] is not None:
        val = bool(payload["is_orchestrator"])
        node["is_orchestrator"] = val
        node["maestro"] = val

    # Requirement 3: monitor_activity (bool)
    if "monitor_activity" in payload and payload["monitor_activity"] is not None:
        node["monitor_activity"] = bool(payload["monitor_activity"])

    # Requirement 3: appearance_icon (str)
    if "appearance_icon" in payload and payload["appearance_icon"] is not None:
        icon_val = str(payload["appearance_icon"])
        node["appearance_icon"] = icon_val
        node["icon"] = icon_val

    # Requirement 3: appearance_color (str)
    if "appearance_color" in payload and payload["appearance_color"] is not None:
        col_val = str(payload["appearance_color"])
        node["appearance_color"] = col_val
        node["borderColor"] = col_val

    # Requirement 3: theme (str)
    if "theme" in payload and payload["theme"] is not None:
        theme_val = str(payload["theme"])
        node["theme"] = theme_val
        node["terminalTheme"] = theme_val

    # Requirement 3: role (str)
    if "role" in payload and payload["role"] is not None:
        role_val = str(payload["role"])
        node["role"] = role_val
        resps = node.setdefault("responsibilities", [])
        if role_val not in resps:
            resps.append(role_val)

    if "responsibilities" in payload and isinstance(payload["responsibilities"], list):
        node["responsibilities"] = payload["responsibilities"]


@app.post("/api/nodes")
async def create_node_endpoint(payload: Dict[str, Any]):
    ws = workspace_mgr.get_workspace()
    canvas = ws.setdefault("canvas", {})
    nodes = canvas.setdefault("nodes", [])

    node_id = payload.get("id") or f"term_{int(time.time() * 1000)}"
    default_cmd = "powershell.exe" if sys.platform.startswith("win") else os.environ.get("SHELL", "/bin/bash")
    new_node = {
        "id": node_id,
        "type": payload.get("type", "terminal"),
        "title": payload.get("title", "Terminal"),
        "preset": payload.get("preset", "shell"),
        "command": payload.get("command", default_cmd),
        "cwd": payload.get("cwd") or ws.get("meta", {}).get("working_directory", os.getcwd()),
        "x": payload.get("x", 200),
        "y": payload.get("y", 200),
        "width": payload.get("width", 540),
        "height": payload.get("height", 340),
        "is_orchestrator": bool(payload.get("is_orchestrator", False) or payload.get("maestro", False)),
        "is_controllable": bool(payload.get("is_controllable", True)),
        "responsibilities": payload.get("responsibilities", []),
        "maestro": bool(payload.get("maestro", False) or payload.get("is_orchestrator", False)),
        "monitor_activity": bool(payload.get("monitor_activity", False)),
        "appearance_icon": payload.get("appearance_icon", ""),
        "appearance_color": payload.get("appearance_color", ""),
        "theme": payload.get("theme", "dark"),
        "role": payload.get("role", "")
    }
    _apply_node_data(new_node, payload)
    nodes.append(new_node)
    workspace_mgr.save_workspace(ws)
    return {"status": "ok", "node": new_node}


@app.get("/api/nodes/{node_id}")
async def get_node_endpoint(node_id: str):
    ws = workspace_mgr.get_workspace()
    nodes = ws.get("canvas", {}).get("nodes", [])
    node = next((n for n in nodes if n.get("id") == node_id), None)
    if not node:
        return JSONResponse(status_code=404, content={"status": "error", "message": f"Nó '{node_id}' não encontrado."})
    return {"status": "ok", "node": node}


@app.patch("/api/nodes/{node_id}")
@app.put("/api/nodes/{node_id}")
@app.post("/api/nodes/{node_id}")
async def update_node_endpoint(node_id: str, payload: Dict[str, Any]):
    ws = workspace_mgr.get_workspace()
    nodes = ws.get("canvas", {}).get("nodes", [])
    node = next((n for n in nodes if n.get("id") == node_id), None)
    if not node:
        return JSONResponse(status_code=404, content={"status": "error", "message": f"Nó '{node_id}' não encontrado."})

    _apply_node_data(node, payload)

    # Sync with terminal manager session if running
    if node_id in terminal_mgr.sessions:
        sess = terminal_mgr.sessions[node_id]
        if "title" in node:
            sess.title = node["title"]
        if "role" in node:
            sess.role = node["role"]
        if "appearance_icon" in node:
            sess.appearance_icon = node["appearance_icon"]
        if "appearance_color" in node:
            sess.appearance_color = node["appearance_color"]
        if "theme" in node:
            sess.theme = node["theme"]
        if "monitor_activity" in node:
            sess.monitor_activity = node["monitor_activity"]
        if "maestro" in node:
            sess.maestro = node["maestro"]
            terminal_mgr.set_orchestrator(node_id, node["maestro"])

    workspace_mgr.save_workspace(ws)
    return {"status": "ok", "node": node}


@app.delete("/api/nodes/{node_id}")
async def delete_node_endpoint(node_id: str):
    ws = workspace_mgr.get_workspace()
    nodes = ws.get("canvas", {}).get("nodes", [])
    edges = ws.get("canvas", {}).get("edges", [])

    new_nodes = [n for n in nodes if n.get("id") != node_id]
    if len(new_nodes) == len(nodes):
        return JSONResponse(status_code=404, content={"status": "error", "message": f"Nó '{node_id}' não encontrado."})

    ws["canvas"]["nodes"] = new_nodes
    ws["canvas"]["edges"] = [e for e in edges if e.get("from") != node_id and e.get("to") != node_id]

    await terminal_mgr.remove_session(node_id)
    workspace_mgr.save_workspace(ws)
    return {"status": "ok", "deleted": node_id}


@app.get("/api/nodes/{node_id}/note")
async def get_node_note(node_id: str):
    ws = workspace_mgr.get_workspace()
    nodes = ws.get("canvas", {}).get("nodes", [])
    edges = ws.get("canvas", {}).get("edges", [])

    # Find connected note: either boundNodeId == node_id, or an edge connecting them
    note = next((n for n in nodes if n.get("type") == "note" and n.get("boundNodeId") == node_id), None)
    if not note:
        for e in edges:
            if e.get("from") == node_id:
                note = next((n for n in nodes if n.get("id") == e.get("to") and n.get("type") == "note"), None)
            elif e.get("to") == node_id:
                note = next((n for n in nodes if n.get("id") == e.get("from") and n.get("type") == "note"), None)
            if note:
                break

    if not note:
        return JSONResponse(status_code=404, content={"status": "not_found", "message": "Nenhuma anotação de contexto vinculada a este nó."})

    return {
        "status": "ok",
        "note_id": note.get("id"),
        "boundNodeId": note.get("boundNodeId", node_id),
        "text": note.get("text", "")
    }

@app.post("/api/nodes/{node_id}/note")
async def update_node_note(node_id: str, req: UpdateNoteRequest):
    import time
    ws = workspace_mgr.get_workspace()
    nodes = ws.get("canvas", {}).get("nodes", [])
    edges = ws.get("canvas", {}).get("edges", [])

    # Find existing note
    note = next((n for n in nodes if n.get("type") == "note" and n.get("boundNodeId") == node_id), None)
    if not note:
        for e in edges:
            if e.get("from") == node_id:
                note = next((n for n in nodes if n.get("id") == e.get("to") and n.get("type") == "note"), None)
            elif e.get("to") == node_id:
                note = next((n for n in nodes if n.get("id") == e.get("from") and n.get("type") == "note"), None)
            if note:
                break

    # If no note exists yet, auto-create one connected to this node
    if not note:
        target_node = next((n for n in nodes if n.get("id") == node_id), None)
        title = target_node.get("title", "Agente") if target_node else "Agente"
        note_id = f"note_ctx_{int(time.time() * 1000)}"
        tx = int(target_node.get("x", 0)) + int(target_node.get("width", 500)) + 36 if target_node else 100
        ty = int(target_node.get("y", 0)) if target_node else 100
        note = {
            "id": note_id,
            "type": "note",
            "x": tx,
            "y": ty,
            "width": 320,
            "height": 220,
            "text": f"🧠 [Contexto & Memória: {title}]\n• Papel Atribuído: Ativo\n• Regras & Restrições: [Padrões de projeto]",
            "boundNodeId": node_id
        }
        nodes.append(note)
        edges.append({
            "id": f"edge_ctx_{int(time.time() * 1000)}",
            "from": node_id,
            "to": note_id,
            "style": "orchestrator",
            "color": "#eab308"
        })

    mode = (req.mode or "append").lower()
    if mode == "set":
        note["text"] = req.text
    else:
        clean_text = req.text.strip()
        if mode == "rule" and not clean_text.startswith("•"):
            clean_text = f"• [Regra] {clean_text}"
        elif not clean_text.startswith("•"):
            clean_text = f"• {clean_text}"
        current = (note.get("text") or "").rstrip()
        note["text"] = f"{current}\n{clean_text}" if current else clean_text

    workspace_mgr.save_workspace(ws)
    workspace_mgr.sync_gemini_instructions(ws)

    # Real-time reactive broadcast to canvas frontend (< 5ms)
    await broadcast_event({
        "type": "note_updated",
        "note_id": note.get("id"),
        "boundNodeId": note.get("boundNodeId", node_id),
        "text": note.get("text", "")
    })

    return {
        "status": "ok",
        "note_id": note.get("id"),
        "boundNodeId": note.get("boundNodeId", node_id),
        "text": note.get("text", "")
    }

@app.get("/api/nodes/{node_id}/competencies")
async def get_node_competencies(node_id: str):
    ws = workspace_mgr.get_workspace()
    nodes = ws.get("canvas", {}).get("nodes", [])
    node = next((n for n in nodes if n.get("id") == node_id), None)
    if not node:
        return JSONResponse(status_code=404, content={"status": "not_found", "message": f"Nó {node_id} não encontrado."})

    return {
        "status": "ok",
        "node_id": node_id,
        "title": node.get("title", "Terminal"),
        "responsibilities": node.get("responsibilities", [])
    }

@app.post("/api/nodes/{node_id}/competencies")
async def update_node_competencies(node_id: str, req: UpdateCompetenciesRequest):
    ws = workspace_mgr.get_workspace()
    nodes = ws.get("canvas", {}).get("nodes", [])
    node = next((n for n in nodes if n.get("id") == node_id), None)
    if not node:
        return JSONResponse(status_code=404, content={"status": "not_found", "message": f"Nó {node_id} não encontrado."})

    resps = list(node.get("responsibilities", []))
    action = (req.action or "add").lower()

    if action == "add":
        comp = (req.competency or "").strip()
        if comp and comp not in resps:
            resps.append(comp)
    elif action == "remove":
        comp = (req.competency or "").strip().lower()
        resps = [r for r in resps if comp != r.lower() and comp not in r.lower()]
    elif action == "set":
        if req.responsibilities is not None:
            resps = [r.strip() for r in req.responsibilities if r.strip()]
        elif req.competency:
            resps = [r.strip() for r in req.competency.split(",") if r.strip()]

    node["responsibilities"] = resps
    workspace_mgr.save_workspace(ws)
    return {
        "status": "ok",
        "node_id": node_id,
        "title": node.get("title", "Terminal"),
        "responsibilities": resps
    }

def _find_connected_note(nodes, edges, node_id):
    """Helper: find a note node connected to a given node_id via boundNodeId or edge."""
    note = next((n for n in nodes if n.get("type") == "note" and n.get("boundNodeId") == node_id), None)
    if not note:
        for e in edges:
            if e.get("from") == node_id:
                note = next((n for n in nodes if n.get("id") == e.get("to") and n.get("type") == "note"), None)
            elif e.get("to") == node_id:
                note = next((n for n in nodes if n.get("id") == e.get("from") and n.get("type") == "note"), None)
            if note:
                break
    return note


def _find_connected_peers(nodes, edges, node_id):
    """Helper: find all terminal nodes connected to a given node_id via edges."""
    peers = []
    for e in edges:
        other_id = None
        if e.get("from") == node_id:
            other_id = e.get("to")
        elif e.get("to") == node_id:
            other_id = e.get("from")
        if other_id and other_id != node_id:
            peer = next((n for n in nodes if n.get("id") == other_id and n.get("type") == "terminal"), None)
            if peer:
                peers.append(peer)
    return peers


@app.get("/api/nodes/{node_id}/identity")
async def get_node_identity(node_id: str):
    res = workspace_mgr.get_node_identity(node_id)
    if res.get("status") == "error":
        return JSONResponse(status_code=404, content=res)
    return res


@app.post("/api/nodes/{node_id}/sync-context")
async def sync_node_context(node_id: str, req: SyncContextRequest):
    res = workspace_mgr.sync_node_context(
        node_id=node_id,
        rules=req.rules,
        obligations=req.obligations,
        position=req.position,
        learned=req.learned,
        identity_summary=req.identity_summary,
        what_it_does=req.what_it_does,
    )
    if res.get("status") == "error":
        return JSONResponse(status_code=404, content=res)
    return res


@app.get("/api/edges/{edge_id}/transport")
async def get_edge_transport(edge_id: str):
    res = workspace_mgr.get_edge_transport_info(edge_id)
    if res.get("status") == "error":
        return JSONResponse(status_code=404, content=res)
    return res


@app.post("/api/nodes/{node_id}/push-context")
async def push_context_to_peers(node_id: str):
    identity = workspace_mgr.get_node_identity(node_id)
    if identity.get("status") == "error":
        return JSONResponse(status_code=404, content=identity)

    context_text = identity.get("connected_note", "").strip()
    if not context_text:
        return JSONResponse(status_code=400, content={"status": "error", "message": "Nenhuma anotação de contexto com conteúdo vinculada a este nó."})

    peers = identity.get("connected_peers", [])
    if not peers:
        return JSONResponse(status_code=400, content={"status": "error", "message": "Nenhum terminal conectado para receber o contexto."})

    delivered = 0
    node_title = identity.get("title", node_id)
    banner = (
        f"\r\n\x1b[38;2;245;158;11m╔═══════════════════════════════════════════════════════════════════════════════════════╗\x1b[0m\r\n"
        f"\x1b[38;2;245;158;11m║ 🔗 CONTEXTO TRANSPORTADO VIA CONECTOR (DE: {node_title.upper()[:40]})                     ║\x1b[0m\r\n"
        f"\x1b[38;2;245;158;11m╚═══════════════════════════════════════════════════════════════════════════════════════╝\x1b[0m\r\n"
        f"\x1b[33m{context_text}\x1b[0m\r\n"
        f"\x1b[32m✔ Memória e regras sincronizadas neste agente para evitar alucinações.\x1b[0m\r\n\r\n"
    )

    for peer in peers:
        pid = peer.get("id")
        session = terminal_mgr.sessions.get(pid)
        if session and session.is_running:
            await session.send_output(banner)
            delivered += 1

    return {
        "status": "ok",
        "pushed_to": delivered,
        "total_peers": len(peers),
        "context_preview": context_text[:200]
    }


@app.post("/api/terminal/send-text")
async def send_terminal_text(req: SendTextRequest):
    ws = workspace_mgr.get_workspace()
    nodes = ws.get("canvas", {}).get("nodes", [])
    target_id = req.target_id
    if not target_id and req.target_name:
        match = next((n for n in nodes if req.target_name.lower() in (n.get("title") or "").lower() or n.get("id") == req.target_name), None)
        if match:
            target_id = match.get("id")

    if not target_id:
        return JSONResponse(status_code=400, content={"status": "error", "message": "Nó alvo não encontrado."})

    target = terminal_mgr.sessions.get(target_id)
    if not target or not target.is_running:
        return JSONResponse(status_code=404, content={"status": "error", "message": "Terminal alvo não está ativo."})

    await target.write(f"{req.text}\r\n")
    return {"status": "ok", "delivered_to": target_id}

@app.post("/api/terminal/restart/{session_id}")
async def restart_terminal_endpoint(session_id: str):
    await terminal_mgr.restart_session(session_id)
    return {"status": "ok"}

# Requirement 7: WebSocket terminal running locally on user's machine
@app.websocket("/ws/terminal/{session_id}")
async def websocket_terminal(websocket: WebSocket, session_id: str):
    await websocket.accept()

    preset = websocket.query_params.get("preset", "shell")
    command = websocket.query_params.get("command", "powershell.exe")
    title = websocket.query_params.get("title", "")
    cwd_param = websocket.query_params.get("cwd", "")
    if not cwd_param or not os.path.exists(cwd_param):
        ws_data = workspace_mgr.get_workspace()
        cwd = ws_data.get("meta", {}).get("working_directory", os.getcwd())
    else:
        cwd = cwd_param
    is_orchestrator = websocket.query_params.get("is_orchestrator", "false").lower() == "true"

    session = terminal_mgr.get_or_create(session_id, command=command, cwd=cwd, preset=preset, is_orchestrator=is_orchestrator, title=title)

    async def output_callback(data: str):
        try:
            await websocket.send_text(data)
        except Exception:
            pass

    if not session.is_running:
        await session.start(output_callback)
        # Replay restored history from disk so terminal reopens with full conversation & context
        if session.has_restored_history and session.scrollback_buffer:
            try:
                await websocket.send_text(session.scrollback_buffer)
                restore_notice = "\r\n\x1b[38;2;16,185,129m✔ [Sessão restaurada do disco: histórico e contexto preservados.]\x1b[0m\r\n"
                await websocket.send_text(restore_notice)
            except Exception:
                pass
    else:
        session.output_callback = output_callback
        if session.scrollback_buffer:
            try:
                await websocket.send_text(session.scrollback_buffer)
            except Exception:
                pass

    try:
        while True:
            msg = await websocket.receive_text()
            try:
                parsed = json.loads(msg)
                if parsed.get("type") == "input":
                    await session.write(parsed.get("data", ""))
                elif parsed.get("type") == "resize":
                    await session.resize(parsed.get("cols", 80), parsed.get("rows", 24))
            except json.JSONDecodeError:
                await session.write(msg)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket disconnected in {session_id}: {e}")

# Mount static frontend
if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.get("/favicon.ico")
async def favicon():
    ico_path = os.path.join(FRONTEND_DIR, "favicon.ico")
    if os.path.exists(ico_path):
        return FileResponse(ico_path, media_type="image/x-icon")
    return JSONResponse(status_code=404, content={"status": "not_found"})

@app.get("/manifest.json")
async def manifest():
    m_path = os.path.join(FRONTEND_DIR, "manifest.json")
    if os.path.exists(m_path):
        return FileResponse(m_path, media_type="application/manifest+json")
    return JSONResponse(status_code=404, content={"status": "not_found"})

@app.get("/")
async def root():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse("<h1>Maestri Desktop Online</h1>")
