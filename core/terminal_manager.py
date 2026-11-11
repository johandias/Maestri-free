"""
Terminal and Process Manager for Maestri Desktop (v2.2).
Runs real native Windows PowerShell using ConPTY (pywinpty) matching VS Code / Windows Terminal.
Full ANSI/VT escape sequence support, native prompt, real cursor positioning, and UTF-8 encoding.
"""
import asyncio
import os
import sys
import threading
from typing import Dict, Any, Optional, Callable, List

try:
    from winpty import PtyProcess
    HAS_WINPTY = True
except ImportError:
    HAS_WINPTY = False

BIN_DIR = os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(__file__)), "bin"))
SESSIONS_LOG_DIR = os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "sessions"))
os.makedirs(SESSIONS_LOG_DIR, exist_ok=True)

class TerminalSession:
    def __init__(self, session_id: str, command: str = "powershell.exe", cwd: str = None, preset: str = "shell", is_orchestrator: bool = False, title: str = ""):
        self.session_id = session_id
        self.title = title or session_id
        self.command = command or "powershell.exe"
        self.cwd = os.path.abspath(cwd) if cwd and os.path.exists(cwd) else os.getcwd()
        self.preset = preset.lower()
        self.is_orchestrator = is_orchestrator
        self.process: Optional[asyncio.subprocess.Process] = None
        self.pty: Optional[Any] = None
        self.is_running = False
        self.output_callback: Optional[Callable[[str], Any]] = None
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self._read_task: Optional[asyncio.Task] = None
        self.last_output = ""
        self.scrollback_buffer = ""
        self.cols = 80
        self.rows = 24
        self.tokens_used = 120  # Base initial session tokens
        self.last_dispatched_order = ""
        self.last_dispatched_timestamp = 0.0
        self.log_file = os.path.join(SESSIONS_LOG_DIR, f"{self.session_id}.log")
        self.has_restored_history = False
        self._load_persisted_history()

    def is_duplicate_order(self, order_text: str, cooldown_seconds: float = 8.0) -> bool:
        """Prevents repeated identical commands from bombarding the terminal in rapid succession."""
        import time
        now = time.time()
        normalized = order_text.strip()
        if (
            normalized 
            and normalized == self.last_dispatched_order 
            and (now - self.last_dispatched_timestamp) < cooldown_seconds
        ):
            return True
        return False

    def record_dispatched_order(self, order_text: str):
        import time
        self.last_dispatched_order = order_text.strip()
        self.last_dispatched_timestamp = time.time()

    def _load_persisted_history(self):
        """Loads previous terminal logs from disk to guarantee zero context loss across app restarts."""
        if os.path.exists(self.log_file):
            try:
                with open(self.log_file, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
                    if content:
                        self.scrollback_buffer = content[-80000:]
                        self.last_output = content[-4000:]
                        self.has_restored_history = True
            except Exception as e:
                print(f"[TerminalSession] Erro ao carregar histórico persistido de {self.session_id}: {e}")

    def _append_to_log(self, text: str):
        """Persists terminal scrollback chunks to disk (buffered for performance)."""
        if not text:
            return
        if not hasattr(self, '_log_handle') or self._log_handle is None or self._log_handle.closed:
            try:
                self._log_handle = open(self.log_file, "a", encoding="utf-8", errors="replace", buffering=8192)
            except Exception:
                return
        try:
            self._log_handle.write(text)
        except Exception:
            try:
                self._log_handle.close()
            except Exception:
                pass
            self._log_handle = None

    def flush_log(self):
        """Ensures all session output is safely flushed to disk."""
        if hasattr(self, '_log_handle') and self._log_handle and not self._log_handle.closed:
            try:
                self._log_handle.flush()
            except Exception:
                pass
        elif self.scrollback_buffer and not os.path.exists(self.log_file):
            try:
                with open(self.log_file, "w", encoding="utf-8", errors="replace") as f:
                    f.write(self.scrollback_buffer)
            except Exception:
                pass

    async def start(self, output_callback: Callable[[str], Any]):
        self.output_callback = output_callback
        self.loop = asyncio.get_running_loop()
        self.is_running = True

        # Build clean environment with BIN_DIR & Antigravity in PATH
        env = os.environ.copy()
        gemini_bin = os.path.expandvars(r"%USERPROFILE%\.gemini\bin")
        paths_to_add = [p for p in [gemini_bin, BIN_DIR] if p not in env.get("PATH", "")]
        if paths_to_add:
            env["PATH"] = ";".join(paths_to_add) + ";" + env.get("PATH", "")
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"
        env["PWD"] = self.cwd
        env["INIT_CWD"] = self.cwd
        env["MAESTRI_NODE_ID"] = self.session_id
        env["MAESTRI_NODE_TITLE"] = self.title or self.session_id
        env["MAESTRI_IS_ORCHESTRATOR"] = "1" if self.is_orchestrator else "0"
        env["MAESTRI_API_URL"] = "http://127.0.0.1:8000"

        cmd = (self.command or "").strip()
        preset = (self.preset or "shell").lower()

        preset_ai_map = {
            "antigravity": "agy",
            "claude": "claude",
            "codex": "codex"
        }

        safe_cwd = self.cwd.replace("'", "''")
        cd_prefix = f"Set-Location -LiteralPath '{safe_cwd}'; "

        ai_cmd = preset_ai_map.get(preset)
        if ai_cmd:
            if not cmd or cmd.lower() in ["powershell.exe", "powershell", "cmd.exe", "cmd", preset, ai_cmd]:
                cmd_to_run = f'powershell.exe -NoLogo -NoExit -Command "{cd_prefix}{ai_cmd}"'
            elif "powershell" in cmd.lower() and "-command" not in cmd.lower():
                cmd_to_run = f'{cmd} -NoLogo -NoExit -Command "{cd_prefix}{ai_cmd}"'
            else:
                if "powershell" in cmd.lower() and "-nologo" not in cmd.lower():
                    cmd_to_run = f"{cmd} -NoLogo -NoExit"
                else:
                    cmd_to_run = f'powershell.exe -NoLogo -NoExit -Command "{cd_prefix}{cmd}"'
        else:
            if not cmd or cmd.lower() in ["powershell.exe", "powershell"]:
                cmd_to_run = f'powershell.exe -NoLogo -NoExit -Command "{cd_prefix}"'
            elif "powershell" in cmd.lower() and "-nologo" not in cmd.lower():
                cmd_to_run = f"{cmd} -NoLogo -NoExit"
            else:
                cmd_to_run = cmd

        # 1. Primary Engine: Native Windows ConPTY (Identical to VS Code / Windows Terminal)
        if HAS_WINPTY:
            try:
                self.pty = PtyProcess.spawn(
                    cmd_to_run,
                    cwd=self.cwd,
                    env=env,
                    dimensions=(self.rows, self.cols)
                )

                def _reader():
                    while self.is_running and self.pty and self.pty.isalive():
                        try:
                            data = self.pty.read(4096)
                            if not data:
                                break
                            self.last_output = (self.last_output + data)[-4000:]
                            self.scrollback_buffer = (self.scrollback_buffer + data)[-80000:]
                            self._append_to_log(data)
                            if self.output_callback and self.loop and self.loop.is_running():
                                asyncio.run_coroutine_threadsafe(self.send_output(data), self.loop)
                        except (EOFError, OSError):
                            break
                        except Exception:
                            break
                    self.is_running = False

                self._thread = threading.Thread(target=_reader, daemon=True)
                self._thread.start()
                if self.is_orchestrator:
                    asyncio.create_task(self._delayed_welcome_banner())
                return
            except Exception as e:
                print(f"[TerminalSession] Falha ao iniciar com ConPTY, usando fallback: {e}")

        # 2. Fallback Engine: Subprocess Shell (in case winpty is unavailable)
        try:
            self.process = await asyncio.create_subprocess_shell(
                cmd_to_run,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=self.cwd,
                env=env
            )
            self._read_task = asyncio.create_task(self._listen_subprocess_output())
        except Exception as e:
            await self.send_output(f"\r\n\x1b[31m[Erro ao iniciar terminal: {e}]\x1b[0m\r\nPS {self.cwd}> ")

    async def _listen_subprocess_output(self):
        import codecs
        decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
        try:
            while self.is_running and self.process and self.process.stdout:
                chunk = await self.process.stdout.read(1024)
                if not chunk:
                    break
                try:
                    text = decoder.decode(chunk)
                except Exception:
                    text = chunk.decode("cp850", errors="replace")

                self.last_output = (self.last_output + text)[-4000:]
                self.scrollback_buffer = (self.scrollback_buffer + text)[-80000:]
                self._append_to_log(text)
                await self.send_output(text)
        except asyncio.CancelledError:
            pass
        except Exception:
            pass
        finally:
            self.is_running = False

    async def write(self, data: str):
        if not data:
            return
        self.tokens_used += max(1, len(data) // 4)
        if self.pty and self.pty.isalive():
            try:
                self.pty.write(data)
                return
            except Exception:
                pass
        elif self.process and self.process.stdin and self.is_running:
            try:
                self.process.stdin.write(data.encode("utf-8", errors="replace"))
                await self.process.stdin.drain()
            except Exception:
                pass

    async def resize(self, cols: int, rows: int):
        self.cols = max(15, cols)
        self.rows = max(4, rows)
        if self.pty and self.pty.isalive():
            try:
                self.pty.setwinsize(self.rows, self.cols)
            except Exception:
                pass

    async def send_output(self, text: str):
        if text:
            self.tokens_used += max(1, len(text) // 4)
        if self.output_callback:
            try:
                res = self.output_callback(text)
                if asyncio.iscoroutine(res):
                    await res
            except Exception:
                pass

    async def _delayed_welcome_banner(self):
        await asyncio.sleep(0.35)
        banner = (
            f"\r\n\x1b[38;2;250;204;21m╔═══════════════════════════════════════════════════════════════════════════════════════╗\x1b[0m\r\n"
            f"\x1b[38;2;250;204;21m║ 👑 NÓ CHEFE / ORQUESTRADOR MAESTRI ATIVADO                                            ║\x1b[0m\r\n"
            f"\x1b[38;2;250;204;21m╚═══════════════════════════════════════════════════════════════════════════════════════╝\x1b[0m\r\n"
            f"\x1b[37mPrincípio Fundamental:\x1b[0m \x1b[33mO Orquestrador SÓ PENSA, CONTEXTUALIZA E FORMULA ORDENS.\x1b[0m\r\n"
            f"\x1b[37mEle NUNCA executa trabalho técnico diretamente, delegando sempre aos nós conectados.\x1b[0m\r\n"
            f"\x1b[32mUse o botão '👑 Despachar Ordens (IA)' ou '▶ Orquestrar' para formular e enviar missões.\x1b[0m\r\n\r\n"
        )
        await self.send_output(banner)

    async def close(self):
        self.is_running = False
        self.flush_log()
        if self.pty:
            try:
                self.pty.terminate()
            except Exception:
                pass
        if self._read_task:
            self._read_task.cancel()
        if self.process:
            try:
                self.process.terminate()
            except Exception:
                pass

class TerminalManager:
    def __init__(self):
        self.sessions: Dict[str, TerminalSession] = {}

    def flush_all_logs(self):
        """Flushes all active sessions to disk to guarantee zero context loss."""
        for s in self.sessions.values():
            s.flush_log()

    def get_session_history(self, session_id: str) -> str:
        """Retrieves session scrollback from memory or persistent disk log."""
        session = self.sessions.get(session_id)
        if session and session.scrollback_buffer:
            return session.scrollback_buffer
        log_file = os.path.join(SESSIONS_LOG_DIR, f"{session_id}.log")
        if os.path.exists(log_file):
            try:
                with open(log_file, "r", encoding="utf-8", errors="replace") as f:
                    return f.read()[-80000:]
            except Exception:
                pass
        return ""

    def get_or_create(self, session_id: str, command: str = "powershell.exe", cwd: str = None, preset: str = "shell", is_orchestrator: bool = False, title: str = "") -> TerminalSession:
        preset_clean = (preset or "shell").lower()
        existing = self.sessions.get(session_id)
        if existing:
            # If the preset, command OR working directory changed,
            # terminate old process so new process boots cleanly in the correct directory!
            cwd_changed = bool(cwd and os.path.exists(cwd) and os.path.abspath(existing.cwd) != os.path.abspath(cwd))
            if existing.preset != preset_clean or (command and existing.command != command) or cwd_changed:
                print(f"[TerminalManager] Recriando sessão {session_id} devido a mudança de configuração/diretório (cwd={cwd}, preset={preset_clean})")
                asyncio.create_task(existing.close())
                del self.sessions[session_id]
                existing = None

        if not existing:
            self.sessions[session_id] = TerminalSession(session_id, command, cwd, preset_clean, is_orchestrator, title=title)
        else:
            self.sessions[session_id].is_orchestrator = is_orchestrator
            if title:
                self.sessions[session_id].title = title
            if cwd and os.path.exists(cwd):
                self.sessions[session_id].cwd = os.path.abspath(cwd)
        return self.sessions[session_id]

    async def update_all_sessions_cwd(self, new_cwd: str):
        """Propagates updated workspace directory to all active terminal sessions."""
        if not new_cwd or not os.path.exists(new_cwd):
            return
        abs_cwd = os.path.abspath(new_cwd)
        for sid, sess in list(self.sessions.items()):
            if os.path.abspath(sess.cwd) != abs_cwd:
                print(f"[TerminalManager] Atualizando diretório da sessão {sid} -> {abs_cwd}")
                sess.cwd = abs_cwd
                if sess.is_running and sess.pty and sess.pty.isalive():
                    if sess.preset == "shell":
                        safe_path = abs_cwd.replace("'", "''")
                        await sess.write(f"\r\nSet-Location -LiteralPath '{safe_path}'\r\n")
                    else:
                        # For AI CLI sessions (agy, claude, codex), close so they restart cleanly with new context
                        await sess.close()
                        if sid in self.sessions:
                            del self.sessions[sid]

    async def restart_session(self, session_id: str):
        if session_id in self.sessions:
            await self.sessions[session_id].close()
            del self.sessions[session_id]

    def set_orchestrator(self, session_id: str, is_orchestrator: bool):
        if session_id in self.sessions:
            orch = self.sessions[session_id]
            orch.is_orchestrator = is_orchestrator
            if is_orchestrator and orch.is_running:
                banner = (
                    f"\r\n\x1b[38;2;250;204;21m╔═══════════════════════════════════════════════════════════════════════════════════════╗\x1b[0m\r\n"
                    f"\x1b[38;2;250;204;21m║ 👑 NÓ PROMOVIDO A CHEFE / ORQUESTRADOR MAESTRI                                        ║\x1b[0m\r\n"
                    f"\x1b[38;2;250;204;21m╚═══════════════════════════════════════════════════════════════════════════════════════╝\x1b[0m\r\n"
                    f"\x1b[37mPrincípio Fundamental:\x1b[0m \x1b[33mO Orquestrador SÓ PENSA, CONTEXTUALIZA E FORMULA ORDENS.\x1b[0m\r\n"
                    f"\x1b[37mEle NUNCA executa o trabalho técnico diretamente, delegando sempre aos subordinados.\x1b[0m\r\n"
                    f"\x1b[32mPronto para formular e despachar ordens com IA aos agentes conectados.\x1b[0m\r\n\r\n"
                )
                if orch.loop:
                    asyncio.run_coroutine_threadsafe(orch.send_output(banner), orch.loop)

    async def broadcast_context(self, source_id: str, target_ids: List[str]) -> Dict[str, Any]:
        source = self.sessions.get(source_id)
        if not source:
            return {"status": "error", "message": "Source node not found"}

        data_to_send = f"\r\n\x1b[36m--- [Contexto Recebido de {source_id}] ---\x1b[0m\r\n{source.last_output}\r\n\x1b[36m-----------------------------------------\x1b[0m\r\n"
        delivered = 0
        for tid in target_ids:
            target = self.sessions.get(tid)
            if target and target.is_running:
                await target.send_output(data_to_send)
                delivered += 1

        return {"status": "ok", "delivered_to": delivered}

    async def dispatch_orchestrator_task(
        self,
        orchestrator_id: str,
        target_ids: List[str],
        prompt: str,
        thought_process: str = "",
        delegations: List[Dict[str, Any]] = None,
        working_dir: str = ""
    ) -> Dict[str, Any]:
        """
        Orchestration Dispatch:
        1. Emits Strategic Thought Process to the Orchestrator Terminal (Orchestrator never executes).
        2. Injects Hierarchical Superior Directives into Subordinate Terminals (Subordinates follow orders).
        """
        orch = self.sessions.get(orchestrator_id)
        delegations = delegations or []

        # 1. Display Thinking & Contextualization in Orchestrator Terminal
        if orch and orch.is_running:
            del_lines = []
            for d in delegations:
                t_name = d.get("target_title", d.get("node_id"))
                d_role = d.get("role", "Subordinado")
                d_ord = d.get("order_directive", prompt)
                del_lines.append(f"  \x1b[38;2;56;189;248m• Nó [{t_name}] ({d_role}):\x1b[0m \x1b[33m{d_ord}\x1b[0m")

            del_block = "\r\n".join(del_lines) if del_lines else "  \x1b[33m(Nenhum nó subordinado selecionado)\x1b[0m"

            banner_orch = (
                f"\r\n\x1b[38;2;250;204;21m╔═══════════════════════════════════════════════════════════════════════════════════════╗\x1b[0m\r\n"
                f"\x1b[38;2;250;204;21m║ 👑 ORQUESTRADOR CENTRAL (CHEFE) - PENSAMENTO ESTRATÉGICO & DELEGAÇÃO                  ║\x1b[0m\r\n"
                f"\x1b[38;2;250;204;21m╚═══════════════════════════════════════════════════════════════════════════════════════╝\x1b[0m\r\n"
                f"\x1b[36m🎯 Objetivo Solicitado:\x1b[0m {prompt}\r\n"
                f"\x1b[35m📂 Diretório do Projeto:\x1b[0m {working_dir or os.getcwd()}\r\n\r\n"
                f"\x1b[38;2;168;85;247m🧠 [Raciocínio & Contextualização da IA]:\x1b[0m\r\n"
                f"{thought_process or 'Analisando e distribuindo tarefas com base no ecossistema multiagentes...'}\r\n\r\n"
                f"\x1b[38;2;250;204;21m📋 [Ordens Formuladas para os Subordinados]:\x1b[0m\r\n"
                f"{del_block}\r\n\r\n"
                f"\x1b[32m⚡ [Princípio Maestri]: Como Orquestrador, não executo tarefas locais.\x1b[0m\r\n"
                f"\x1b[32m   Ordens despachadas instantaneamente para {len(delegations)} nó(s) subordinado(s).\x1b[0m\r\n\r\n"
            )
            await orch.send_output(banner_orch)

        # 2. Dispatch Directives to Each Subordinate Node (Deduplicated targets)
        delivered = 0
        del_map = {d["node_id"]: d for d in delegations}
        unique_targets = list(dict.fromkeys(target_ids))

        for tid in unique_targets:
            target = self.sessions.get(tid)
            if not target or not target.is_running:
                continue

            # Check if the terminal process is alive and responsive
            if target.pty and not target.pty.isalive():
                print(f"[TerminalManager] Nó [{target.title}] ({tid}) processo PTY está finalizado. Ignorando envio.")
                target.is_running = False
                continue

            if target and target.is_running:
                # Enforce that the target terminal is aligned with the active project working directory
                if working_dir and os.path.exists(working_dir):
                    abs_wd = os.path.abspath(working_dir)
                    if os.path.abspath(target.cwd) != abs_wd:
                        target.cwd = abs_wd
                        if (target.preset or "shell").lower() == "shell":
                            safe_wd = abs_wd.replace("'", "''")
                            await target.write(f"\r\nSet-Location -LiteralPath '{safe_wd}'\r\n")

                d = del_map.get(tid, {})
                role = d.get("role", "Agente Subordinado")
                directive = d.get("order_directive", prompt)
                cmd_to_run = d.get("command_to_run", directive)

                # Format command for specific agent preset
                preset = (target.preset or "shell").lower()
                safe_cmd = cmd_to_run.replace('"', '`"')
                # If preset already boots directly into the AI CLI interactive session,
                # send the clean directive as prompt rather than nesting another CLI call!
                if preset in ["antigravity", "agy", "claude", "codex"]:
                    input_text = directive
                else:
                    if not cmd_to_run.startswith("agy ") and preset in ["antigravity", "agy"]:
                        input_text = f'agy "{safe_cmd}"'
                    elif not cmd_to_run.startswith("codex ") and preset == "codex":
                        input_text = f'codex "{safe_cmd}"'
                    elif not cmd_to_run.startswith("claude ") and preset == "claude":
                        input_text = f'claude "{safe_cmd}"'
                    else:
                        input_text = cmd_to_run

                # Anti-repetition check: prevent identical commands from bombarding the same terminal repeatedly
                if target.is_duplicate_order(input_text, cooldown_seconds=8.0):
                    print(f"\x1b[33m[TerminalManager] Ignorado reenvio de ordem idêntica para o nó [{target.title}] ({tid})\x1b[0m")
                    continue

                target.record_dispatched_order(input_text)

                banner_target = (
                    f"\r\n\x1b[38;2;250;204;21m╔═══════════════════════════════════════════════════════════════════════════════════════╗\x1b[0m\r\n"
                    f"\x1b[38;2;250;204;21m║ 👑 DIRETIVA SUPERIOR RECEBIDA DO ORQUESTRADOR (CHEFE)                                 ║\x1b[0m\r\n"
                    f"\x1b[38;2;250;204;21m║ Papel: AGENTE SUBORDINADO | Status: SEGUINDO ORDENS                                   ║\x1b[0m\r\n"
                    f"\x1b[38;2;250;204;21m╚═══════════════════════════════════════════════════════════════════════════════════════╝\x1b[0m\r\n"
                    f"\x1b[36m🎯 Papel Atribuído:\x1b[0m \x1b[37m{role}\x1b[0m\r\n"
                    f"\x1b[33m📋 Ordem Superior:\x1b[0m \x1b[1;33m{directive}\x1b[0m\r\n"
                    f"\x1b[38;2;56;189;248m⚙️ Executando ordem imediatamente...\x1b[0m\r\n"
                )
                await target.send_output(banner_target)

                # Inject formulated command into the subordinate terminal
                await target.write(f"{input_text}\r\n")
                delivered += 1

        return {"status": "ok", "delivered_to": delivered}

    async def remove_session(self, session_id: str):
        if session_id in self.sessions:
            await self.sessions[session_id].close()
            del self.sessions[session_id]

    def get_token_metrics(self, nodes: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculates token availability and consumption for every active AI model/preset."""
        ai_specs = {
            "antigravity": {
                "name": "Antigravity (Gemini)",
                "icon": "✨",
                "model": "Gemini 3.8 Flash",
                "limit": 1000000,
                "color": "#38bdf8"
            },
            "claude": {
                "name": "Claude Code",
                "icon": "🟣",
                "model": "Claude 3.5 Sonnet / Opus",
                "limit": 200000,
                "color": "#c084fc"
            },
            "codex": {
                "name": "OpenAI Codex",
                "icon": "🟢",
                "model": "Codex / GPT-4o",
                "limit": 128000,
                "color": "#34d399"
            }
        }

        results = {}
        for preset_key, spec in ai_specs.items():
            preset_nodes = [
                n for n in nodes 
                if (n.get("preset") or "").lower() == preset_key or preset_key in (n.get("title") or "").lower()
            ]
            if not preset_nodes and preset_key == "antigravity":
                orch = next((n for n in nodes if n.get("is_orchestrator")), None)
                if orch:
                    preset_nodes = [orch]

            if preset_nodes:
                total_used = 0
                node_details = []
                for n in preset_nodes:
                    nid = n.get("id")
                    session = self.sessions.get(nid)
                    used = session.tokens_used if session else 450
                    total_used += used
                    avail = max(0, spec["limit"] - used)
                    pct = round((avail / spec["limit"]) * 100, 1)
                    node_details.append({
                        "node_id": nid,
                        "title": n.get("title", "Terminal"),
                        "used": used,
                        "available": avail,
                        "percent_available": pct
                    })

                avail_pool = max(0, spec["limit"] - total_used)
                pct_pool = round((avail_pool / spec["limit"]) * 100, 1)

                if avail_pool >= 1000000:
                    formatted_avail = f"{avail_pool / 1000000:.1f}M"
                elif avail_pool >= 1000:
                    formatted_avail = f"{avail_pool // 1000}k"
                else:
                    formatted_avail = str(avail_pool)

                results[preset_key] = {
                    "key": preset_key,
                    "name": spec["name"],
                    "icon": spec["icon"],
                    "model": spec["model"],
                    "limit": spec["limit"],
                    "used": total_used,
                    "available": avail_pool,
                    "formatted_available": formatted_avail,
                    "percent_available": pct_pool,
                    "color": spec["color"],
                    "nodes_count": len(preset_nodes),
                    "node_details": node_details
                }

        # If no explicit AI nodes yet, show Antigravity as available default
        if not results:
            results["antigravity"] = {
                "key": "antigravity",
                "name": "Antigravity (Gemini)",
                "icon": "✨",
                "model": "Gemini 3.8 Flash",
                "limit": 1000000,
                "used": 420,
                "available": 999580,
                "formatted_available": "999k",
                "percent_available": 100.0,
                "color": "#38bdf8",
                "nodes_count": 1,
                "node_details": []
            }

        return {
            "status": "ok",
            "active_ais": list(results.values())
        }
