"""
Maestri CLI Dispatcher (v2.0).
Provides lightning-fast command-line dispatching, context memory inspection/updates,
dynamic competencies management, and inter-node messaging for AI agents and terminals.
"""
import sys
import os
import json
import time
import urllib.request
import urllib.error

def get_api_url():
    env_url = os.environ.get("MAESTRI_API_URL")
    if env_url:
        return env_url.rstrip("/")

    # Dynamic port probing: check 8001 first, then 8000, then 8080
    for port in [8001, 8000, 8080]:
        test_url = f"http://127.0.0.1:{port}"
        try:
            req = urllib.request.Request(f"{test_url}/api/workspace")
            with urllib.request.urlopen(req, timeout=0.6) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    if "canvas" in data or "meta" in data:
                        return test_url
        except Exception:
            continue

    return "http://127.0.0.1:8001"

API_URL = get_api_url()

def get_workspace():
    try:
        req = urllib.request.Request(f"{API_URL}/api/workspace")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"\x1b[31m[Maestri CLI] Erro ao conectar ao servidor Maestri (porta 8000): {e}\x1b[0m")
        return None

def get_current_node_id(ws=None):
    # 1. Environment variable injected by Maestri ConPTY
    env_id = os.environ.get("MAESTRI_NODE_ID")
    if env_id:
        return env_id

    # 2. Fallback: Orchestrator node
    if not ws:
        ws = get_workspace()
    if ws:
        orch = ws.get("meta", {}).get("orchestrator_node_id")
        if orch:
            return orch
        nodes = ws.get("canvas", {}).get("nodes", [])
        for n in nodes:
            if n.get("is_orchestrator"):
                return n.get("id")
        # Fallback to first terminal
        for n in nodes:
            if n.get("type") == "terminal":
                return n.get("id")
    return None

def find_orchestrator_and_targets(ws):
    nodes = ws.get("canvas", {}).get("nodes", [])
    edges = ws.get("canvas", {}).get("edges", [])
    orch_node = next((n for n in nodes if n.get("is_orchestrator")), None)
    if not orch_node:
        orch_node = next((n for n in nodes if n.get("type") == "terminal"), None)

    if not orch_node:
        return None, []

    orch_id = orch_node.get("id")
    target_ids = []
    # Only target controllable terminals (exclude nodes in observer mode)
    controllable_terminal_ids = {
        n.get("id") for n in nodes 
        if n.get("type") == "terminal" and n.get("is_controllable") is not False
    }
    for e in edges:
        if e.get("from") == orch_id and e.get("to") in controllable_terminal_ids:
            target_ids.append(e.get("to"))
        elif e.get("to") == orch_id and e.get("from") in controllable_terminal_ids:
            target_ids.append(e.get("from"))

    if not target_ids:
        target_ids = [n.get("id") for n in nodes if n.get("id") != orch_id and n.get("id") in controllable_terminal_ids]

    return orch_node, target_ids

def dispatch_order(prompt: str, target_name: str = None):
    ws = get_workspace()
    if not ws:
        return False

    orch_node, target_ids = find_orchestrator_and_targets(ws)
    if not orch_node:
        print("\x1b[33m[Maestri CLI] Nenhum nó Chefe/Orquestrador encontrado no canvas.\x1b[0m")
        return False

    nodes = ws.get("canvas", {}).get("nodes", [])
    selected_targets = target_ids

    if target_name:
        match = [n for n in nodes if (target_name.lower() in (n.get("title") or "").lower() or n.get("id") == target_name) and n.get("type") == "terminal"]
        if match:
            target_node = match[0]
            if target_node.get("is_controllable") is False:
                print(f"\x1b[33m[Maestri CLI] O nó [{target_node.get('title')}] está em modo APENAS OBSERVADOR / SENSOR.\x1b[0m")
                print(f"\x1b[33mEle serve para enviar a situação e ajudar a IA a enxergar, mas NÃO recebe ordens nem executa comandos.\x1b[0m")
                return False
            selected_targets = [target_node.get("id")]

    if not selected_targets:
        print("\x1b[33m[Maestri CLI] Nenhum nó subordinado conectado para receber ordens.\x1b[0m")
        return False

    target_titles = [(next((n.get("title") for n in nodes if n.get("id") == tid), None) or tid) for tid in selected_targets]
    print(f"\x1b[38;2;250;204;21m👑 [Maestri Chefe]\x1b[0m Despachando ordem instantânea para: \x1b[36m{', '.join(target_titles)}\x1b[0m")

    payload = {
        "prompt": prompt,
        "orchestrator_node_id": orch_node.get("id"),
        "target_node_ids": selected_targets
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{API_URL}/api/orchestrate",
            data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=25.0) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            if res.get("status") == "ok":
                del_count = res.get("delivered_to", len(selected_targets))
                print(f"\x1b[32m✔ Ordem despachada com sucesso para {del_count} nó(s) orquestrado(s)!\x1b[0m")
                for d in res.get("delegations", []):
                    t = d.get("target_title", "Nó")
                    print(f"  • \x1b[33m[{t}]\x1b[0m: {d.get('order_directive')}")
                return True
            else:
                print(f"\x1b[31mErro na resposta: {res.get('message')}\x1b[0m")
                return False
    except Exception as e:
        print(f"\x1b[31m[Maestri CLI] Falha na comunicação: {e}\x1b[0m")
        return False

def show_note():
    node_id = get_current_node_id()
    if not node_id:
        print("\x1b[33m[Maestri CLI] Nó terminal não identificado no ambiente.\x1b[0m")
        return

    try:
        req = urllib.request.Request(f"{API_URL}/api/nodes/{node_id}/note")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"\n\x1b[38;2;250;204;21m🧠 === Anotação de Contexto & Memória Conectada [{node_id}] ===\x1b[0m")
            print(data.get("text", "(Anotação vazia)").strip())
            print()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print("\x1b[33m[Maestri CLI] Nenhuma anotação de contexto conectada a este nó.\x1b[0m")
            print("Use: maestri note add '<regra>' para criar e anotar automaticamente.")
        else:
            print(f"\x1b[31m[Maestri CLI] Erro ao buscar anotação: {e}\x1b[0m")
    except Exception as e:
        print(f"\x1b[31m[Maestri CLI] Falha ao consultar anotação: {e}\x1b[0m")

def update_note(text: str, mode: str = "rule"):
    node_id = get_current_node_id()
    if not node_id:
        print("\x1b[33m[Maestri CLI] Nó terminal não identificado no ambiente.\x1b[0m")
        return

    payload = {"text": text, "mode": mode}
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{API_URL}/api/nodes/{node_id}/note",
            data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            action_desc = "adicionada" if mode in ["rule", "append"] else "atualizada"
            print(f"\x1b[32m✔ Regra/Contexto {action_desc} com sucesso na anotação conectada!\x1b[0m")
            print(f"\x1b[36m--- Conteúdo Atualizado ---\x1b[0m")
            print(res.get("text", "").strip())
            print()
    except Exception as e:
        print(f"\x1b[31m[Maestri CLI] Falha ao atualizar anotação: {e}\x1b[0m")

def show_role():
    node_id = get_current_node_id()
    if not node_id:
        print("\x1b[33m[Maestri CLI] Nó terminal não identificado no ambiente.\x1b[0m")
        return

    try:
        req = urllib.request.Request(f"{API_URL}/api/nodes/{node_id}/competencies")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            title = data.get("title", "Terminal")
            resps = data.get("responsibilities", [])
            print(f"\n\x1b[38;2;56;189;248m🎯 === Competências & Papel: {title} [{node_id}] ===\x1b[0m")
            if resps:
                for r in resps:
                    print(f" • \x1b[32m{r}\x1b[0m")
            else:
                print(" • \x1b[33m(Geral / Sem competências específicas atribuídas)\x1b[0m")
            print()
    except Exception as e:
        print(f"\x1b[31m[Maestri CLI] Falha ao consultar competências: {e}\x1b[0m")

def update_role(action: str, competency: str):
    node_id = get_current_node_id()
    if not node_id:
        print("\x1b[33m[Maestri CLI] Nó terminal não identificado no ambiente.\x1b[0m")
        return

    payload = {"action": action, "competency": competency}
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{API_URL}/api/nodes/{node_id}/competencies",
            data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            print(f"\x1b[32m✔ Competências atualizadas com sucesso para [{res.get('title')}]!\x1b[0m")
            print(f"Novas competências: \x1b[36m{', '.join(res.get('responsibilities', [])) or '(Geral)'}\x1b[0m\n")
    except Exception as e:
        print(f"\x1b[31m[Maestri CLI] Falha ao atualizar competências: {e}\x1b[0m")

def send_text_to_node(target: str, message: str):
    payload = {"target_name": target, "text": message}
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{API_URL}/api/terminal/send-text",
            data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            print(f"\x1b[32m✔ Mensagem enviada para nó [{target}] com sucesso!\x1b[0m")
    except Exception as e:
        print(f"\x1b[31m[Maestri CLI] Falha ao enviar mensagem para [{target}]: {e}\x1b[0m")

def check_target_output(target: str):
    ws = get_workspace()
    if not ws:
        return
    nodes = ws.get("canvas", {}).get("nodes", [])
    node = next((n for n in nodes if target.lower() in (n.get("title") or "").lower() or n.get("id") == target), None)
    if not node:
        print(f"\x1b[31m[Maestri CLI] Nó [{target}] não encontrado.\x1b[0m")
        return

    node_id = node.get("id")
    try:
        req = urllib.request.Request(f"{API_URL}/api/terminal/history/{node_id}")
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            history = data.get("history", "")
            print(f"\n\x1b[38;2;56;189;248m💻 === Saída do Terminal [{node.get('title')}] ({node_id}) ===\x1b[0m")
            print(history[-3000:] if len(history) > 3000 else history or "(Sem saída recente)")
            print()
    except Exception as e:
        print(f"\x1b[31m[Maestri CLI] Falha ao ler histórico de [{target}]: {e}\x1b[0m")

def ask_target(target: str, prompt: str, timeout: float = 45.0):
    ws = get_workspace()
    if not ws:
        return
    nodes = ws.get("canvas", {}).get("nodes", [])
    node = next((n for n in nodes if target.lower() in (n.get("title") or "").lower() or n.get("id") == target), None)
    if not node:
        print(f"\x1b[31m[Maestri CLI] Nó [{target}] não encontrado.\x1b[0m")
        return

    node_id = node.get("id")
    initial_len = 0
    try:
        req = urllib.request.Request(f"{API_URL}/api/terminal/history/{node_id}")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            initial_len = len(data.get("history", ""))
    except Exception:
        pass

    print(f"\x1b[38;2;2;181;226m▶ [Maestri CLI] Enviando solicitação para [{node.get('title')}]...\x1b[0m")
    payload = {"target_name": target, "text": prompt}
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(f"{API_URL}/api/terminal/send-text", data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            pass
    except Exception as e:
        print(f"\x1b[31m[Maestri CLI] Falha ao enviar para [{target}]: {e}\x1b[0m")
        return

    start_time = time.time()
    last_len = initial_len
    stable_cycles = 0
    collected_output = ""

    while time.time() - start_time < timeout:
        time.sleep(1.0)
        try:
            req = urllib.request.Request(f"{API_URL}/api/terminal/history/{node_id}")
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                hist = data.get("history", "")
                curr_len = len(hist)
                if curr_len > last_len:
                    last_len = curr_len
                    stable_cycles = 0
                    collected_output = hist[initial_len:]
                elif curr_len > initial_len:
                    stable_cycles += 1
                    if stable_cycles >= 2:
                        break
        except Exception:
            pass

    print(f"\n\x1b[38;2;16;185;129m✔ === Resposta de [{node.get('title')}] ===\x1b[0m")
    print(collected_output.strip() or "(Comando executado, sem saída adicional)")
    print()

def recruit_agent(name: str, preset: str = "shell", role: str = "Geral"):
    payload = {
        "type": "terminal",
        "title": name,
        "preset": preset,
        "responsibilities": [role] if role else ["Geral"]
    }
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(f"{API_URL}/api/nodes/create", data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            print(f"\x1b[32m✔ Agente [{name}] recrutado com sucesso! (ID: {res.get('node', {}).get('id')})\x1b[0m")
    except Exception as e:
        print(f"\x1b[31m[Maestri CLI] Falha ao recrutar agente: {e}\x1b[0m")

def dismiss_agent(target: str):
    ws = get_workspace()
    if not ws:
        return
    nodes = ws.get("canvas", {}).get("nodes", [])
    node = next((n for n in nodes if target.lower() in (n.get("title") or "").lower() or n.get("id") == target), None)
    if not node:
        print(f"\x1b[31m[Maestri CLI] Nó [{target}] não encontrado.\x1b[0m")
        return
    node_id = node.get("id")
    try:
        req = urllib.request.Request(f"{API_URL}/api/nodes/{node_id}", method="DELETE")
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            print(f"\x1b[32m✔ Agente [{node.get('title')}] dispensado do canvas.\x1b[0m")
    except Exception as e:
        print(f"\x1b[31m[Maestri CLI] Falha ao dispensar nó: {e}\x1b[0m")

def list_nodes():
    ws = get_workspace()
    if not ws:
        return
    nodes = ws.get("canvas", {}).get("nodes", [])
    print("\n\x1b[38;2;250;204;21m=== Nós do Workspace Maestri ===\x1b[0m")
    for n in nodes:
        if n.get("type") not in ["terminal", "portal"]:
            continue
        is_ctrl = n.get("is_controllable") is not False
        if n.get("is_orchestrator"):
            role = "\x1b[38;2;250;204;21m👑 CHEFE (Orquestrador)\x1b[0m"
        elif not is_ctrl:
            role = "\x1b[36m👁️ OBSERVADOR (Apenas Visão/Sensor)\x1b[0m"
        else:
            role = "\x1b[32m⚡ EXECUTOR (Controlado)\x1b[0m"
        resps = ", ".join(n.get("responsibilities", [])) or "Geral"
        title = n.get("title") or n.get("id")
        icon = n.get("icon", "💻" if n.get("type") == "terminal" else "🌐")
        print(f" • [{n.get('id')}] {icon} \x1b[37m{title}\x1b[0m - {role} (Papel: {resps})")
    print()

def toggle_node_mode(target_name: str, new_mode: str = None):
    ws = get_workspace()
    if not ws:
        return False
    nodes = ws.get("canvas", {}).get("nodes", [])
    target = next((n for n in nodes if (target_name.lower() in (n.get("title") or "").lower() or n.get("id") == target_name)), None)
    if not target:
        print(f"\x1b[31m[Maestri CLI] Nó [{target_name}] não encontrado no workspace.\x1b[0m")
        return False

    if new_mode:
        if new_mode.lower() in ["obs", "observer", "observador", "sensor", "olhos", "view"]:
            target["is_controllable"] = False
        else:
            target["is_controllable"] = True
    else:
        target["is_controllable"] = not (target.get("is_controllable") is not False)

    mode_label = "👁️ Apenas Observador / Sensor" if target["is_controllable"] is False else "⚡ Sistema Controlado / Executor"
    try:
        data = json.dumps(ws).encode("utf-8")
        req = urllib.request.Request(f"{API_URL}/api/workspace/save", data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            print(f"\x1b[32m✔ Nó [{target.get('title')}] alterado para: {mode_label}\x1b[0m")
            return True
    except Exception as e:
        print(f"\x1b[31mErro ao salvar alteração de modo: {e}\x1b[0m")
        return False


def show_identity():
    node_id = get_current_node_id()
    if not node_id:
        print("\x1b[33m[Maestri CLI] Nó terminal não identificado no ambiente.\x1b[0m")
        return

    try:
        req = urllib.request.Request(f"{API_URL}/api/nodes/{node_id}/identity")
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))

            title = data.get("title", "Terminal")
            preset = data.get("preset", "shell")
            is_orch = data.get("is_orchestrator", False)
            resps = data.get("responsibilities", [])
            note_text = data.get("connected_note", "")
            position = data.get("position_in_workspace", "")
            peers = data.get("connected_peers", [])
            cwd = data.get("working_directory", "")

            role_icon = "👑" if is_orch else "⚙️"
            role_label = "Orquestrador / Chefe" if is_orch else "Executor Subordinado"

            print(f"\n\x1b[38;2;250;204;21m╔══════════════════════════════════════════════════╗\x1b[0m")
            print(f"\x1b[38;2;250;204;21m║  {role_icon} CARTÃO DE IDENTIDADE — MAESTRI NODE         ║\x1b[0m")
            print(f"\x1b[38;2;250;204;21m╚══════════════════════════════════════════════════╝\x1b[0m")

            print(f"\n\x1b[36m  Quem sou eu:\x1b[0m {title} ({role_label})")
            print(f"\x1b[36m  Preset:\x1b[0m      {preset}")
            print(f"\x1b[36m  Node ID:\x1b[0m     {node_id}")
            print(f"\x1b[36m  Posição:\x1b[0m      {position}")
            print(f"\x1b[36m  Diretório:\x1b[0m    {cwd}")

            if resps:
                print(f"\n\x1b[36m  Competências:\x1b[0m")
                for r in resps:
                    print(f"    • \x1b[32m{r}\x1b[0m")
            else:
                print(f"\n\x1b[36m  Competências:\x1b[0m \x1b[33m(Geral / nenhuma específica)\x1b[0m")

            if peers:
                print(f"\n\x1b[36m  Nós Conectados:\x1b[0m")
                for p in peers:
                    p_icon = "👑" if p.get("is_orchestrator") else "💻"
                    p_resps = ", ".join(p.get("responsibilities", [])) or "Geral"
                    print(f"    {p_icon} \x1b[33m{p.get('title', p.get('id'))}\x1b[0m — {p_resps}")
            else:
                print(f"\n\x1b[36m  Nós Conectados:\x1b[0m \x1b[33m(nenhum)\x1b[0m")

            if note_text:
                print(f"\n\x1b[36m  Anotação de Contexto:\x1b[0m")
                for line in note_text.strip().split("\n"):
                    print(f"    {line}")

            print()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"\x1b[33m[Maestri CLI] Nó {node_id} não encontrado no workspace.\x1b[0m")
        else:
            print(f"\x1b[31m[Maestri CLI] Erro ao buscar identidade: {e}\x1b[0m")
    except Exception as e:
        print(f"\x1b[31m[Maestri CLI] Falha ao consultar identidade: {e}\x1b[0m")


def remember_fact(fact: str):
    node_id = get_current_node_id()
    if not node_id:
        print("\x1b[33m[Maestri CLI] Nó terminal não identificado no ambiente.\x1b[0m")
        return

    payload = {"learned": [fact]}
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{API_URL}/api/nodes/{node_id}/sync-context",
            data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            print(f"\x1b[32m✔ Fato/regra memorizado com sucesso na seção [Aprendizados]!\x1b[0m")
            print(f"\x1b[36m--- Contexto Atualizado ---\x1b[0m")
            print(res.get("text", "").strip())
            print()
    except Exception as e:
        print(f"\x1b[31m[Maestri CLI] Falha ao memorizar fato: {e}\x1b[0m")


def update_position(description: str):
    node_id = get_current_node_id()
    if not node_id:
        print("\x1b[33m[Maestri CLI] Nó terminal não identificado no ambiente.\x1b[0m")
        return

    payload = {"position": description}
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{API_URL}/api/nodes/{node_id}/sync-context",
            data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            print(f"\x1b[32m✔ Posição atualizada com sucesso no contexto!\x1b[0m")
            print(f"\x1b[36m--- Contexto Atualizado ---\x1b[0m")
            print(res.get("text", "").strip())
            print()
    except Exception as e:
        print(f"\x1b[31m[Maestri CLI] Falha ao atualizar posição: {e}\x1b[0m")


def push_context():
    node_id = get_current_node_id()
    if not node_id:
        print("\x1b[33m[Maestri CLI] Nó terminal não identificado no ambiente.\x1b[0m")
        return

    try:
        req = urllib.request.Request(
            f"{API_URL}/api/nodes/{node_id}/push-context",
            data=b"{}",
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            pushed = res.get("pushed_to", 0)
            total = res.get("total_peers", 0)
            print(f"\x1b[32m✔ Contexto propagado para {pushed}/{total} terminal(is) conectado(s)!\x1b[0m")
            preview = res.get("context_preview", "")
            if preview:
                print(f"\x1b[36m--- Preview do Contexto Enviado ---\x1b[0m")
                print(f"{preview}{'...' if len(preview) >= 200 else ''}")
            print()
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode("utf-8"))
            print(f"\x1b[33m[Maestri CLI] {err_body.get('message', str(e))}\x1b[0m")
        except Exception:
            print(f"\x1b[31m[Maestri CLI] Erro ao propagar contexto: {e}\x1b[0m")
    except Exception as e:
        print(f"\x1b[31m[Maestri CLI] Falha ao propagar contexto: {e}\x1b[0m")


def update_obligation(obligation: str):
    node_id = get_current_node_id()
    if not node_id:
        print("\x1b[33m[Maestri CLI] Nó terminal não identificado no ambiente.\x1b[0m")
        return

    payload = {"obligations": obligation}
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{API_URL}/api/nodes/{node_id}/sync-context",
            data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            print(f"\x1b[32m✔ Obrigação/Missão atualizada com sucesso no contexto!\x1b[0m")
            print(f"\x1b[36m--- Contexto Atualizado ---\x1b[0m")
            print(res.get("text", "").strip())
            print()
    except Exception as e:
        print(f"\x1b[31m[Maestri CLI] Falha ao atualizar obrigação: {e}\x1b[0m")


def add_rule(rule_text: str):
    node_id = get_current_node_id()
    if not node_id:
        print("\x1b[33m[Maestri CLI] Nó terminal não identificado no ambiente.\x1b[0m")
        return

    payload = {"rules": [rule_text]}
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{API_URL}/api/nodes/{node_id}/sync-context",
            data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            print(f"\x1b[32m✔ Regra anti-alucinação registrada com sucesso no contexto!\x1b[0m")
            print(f"\x1b[36m--- Contexto Atualizado ---\x1b[0m")
            print(res.get("text", "").strip())
            print()
    except Exception as e:
        print(f"\x1b[31m[Maestri CLI] Falha ao adicionar regra: {e}\x1b[0m")


def sync_full_context():
    node_id = get_current_node_id()
    if not node_id:
        print("\x1b[33m[Maestri CLI] Nó terminal não identificado no ambiente.\x1b[0m")
        return

    payload = {}
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{API_URL}/api/nodes/{node_id}/sync-context",
            data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            print(f"\x1b[32m✔ Contexto e conexões do nó sincronizados com sucesso!\x1b[0m")
            print(f"\x1b[36m--- Contexto Ativo ---\x1b[0m")
            print(res.get("text", "").strip())
            print()
    except Exception as e:
        print(f"\x1b[31m[Maestri CLI] Falha ao sincronizar contexto: {e}\x1b[0m")


def show_status():
    node_id = get_current_node_id()
    if not node_id:
        print("\x1b[33m[Maestri CLI] Nó terminal não identificado no ambiente.\x1b[0m")
        return

    try:
        req = urllib.request.Request(f"{API_URL}/api/nodes/{node_id}/identity")
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))

            title = data.get("title", "Terminal")
            is_orch = data.get("is_orchestrator", False)
            resps = data.get("responsibilities", [])
            peers = data.get("connected_peers", [])
            note_text = data.get("connected_note", "")
            cwd = data.get("working_directory", "")

            role_icon = "👑" if is_orch else "⚙️"
            role_label = "Chefe" if is_orch else "Executor"

            print(f"\n{role_icon} \x1b[36m{title}\x1b[0m [{role_label}] — {node_id}")
            print(f"  📂 {cwd}")
            if resps:
                print(f"  🎯 {', '.join(resps)}")
            print(f"  🔗 {len(peers)} nó(s) conectado(s)", end="")
            if peers:
                peer_names = [p.get("title", p.get("id")) for p in peers]
                print(f": {', '.join(peer_names)}", end="")
            print()
            has_note = "✅" if note_text.strip() else "❌"
            print(f"  🧠 Anotação de contexto: {has_note}")
            print()
    except Exception as e:
        print(f"\x1b[31m[Maestri CLI] Falha ao consultar status: {e}\x1b[0m")

def print_help():
    print("""
\x1b[38;2;250;204;21m👑 Maestri CLI - Orquestrador de Terminais & Multiagentes (v2.0)\x1b[0m

Comandos de Identidade & Status:
  maestri whoami | identity               - Exibe o cartão de identidade completo deste nó
  maestri status                           - Exibe um resumo compacto do nó e conexões

Comandos de Memória Viva & Anotações Conectadas:
  maestri note                           - Lê a anotação de contexto e regras vinculada a esta IA
  maestri note add "<regra/contexto>"    - Anota nova regra ou aprendizado na anotação conectada
  maestri note set "<conteudo>"          - Substitui o conteúdo da anotação conectada
  maestri remember "<fato ou regra>"     - Memoriza um fato na seção [Aprendizados] do contexto
  maestri rule "<regra anti-alucinação>" - Adiciona regra anti-alucinação no contexto
  maestri position "<descrição>"         - Atualiza a posição deste nó no workspace
  maestri obligation "<sua obrigação>"   - Atualiza a obrigação/missão ativa deste nó
  maestri push-context                   - Propaga a anotação de contexto para todos os nós conectados
  maestri sync                           - Sincroniza e recalcula o contexto do nó e conexões

Comandos de Competências do Agente:
  maestri role                           - Lista as competências/papéis atuais desta IA
  maestri role add "<competencia>"       - Adiciona uma nova competência ao seu perfil
  maestri role remove "<competencia>"    - Remove uma competência do seu perfil
  maestri role set "Comp 1, Comp 2"      - Redefine as competências desta IA

Comandos de Orquestração & Comunicação:
  maestri order "<ordem>"                - (Chefe) Formula e despacha ordem aos subordinados
  maestri delegate <alvo> "<ordem>"      - (Chefe) Despacha ordem para um subordinado específico
  maestri say <alvo> "<mensagem>"        - Envia texto/mensagem direta para outro terminal
  maestri mode <alvo> [obs|exec]         - Alterna nó entre Controlado/Executor e Apenas Observador
  maestri nodes                          - Lista todos os nós e papéis conectados no canvas
  maestri --help | -h                    - Exibe esta mensagem de ajuda
""")

def main():
    if len(sys.argv) < 2 or sys.argv[1].lower() in ["--help", "-h", "help", "/?"]:
        print_help()
        sys.exit(0)

    cmd = sys.argv[1].lower()

    if cmd in ["whoami", "identity", "identidade"]:
        show_identity()

    elif cmd in ["status", "stat"]:
        show_status()

    elif cmd in ["remember", "lembrar", "learn", "aprender"]:
        if len(sys.argv) < 3:
            print("Informe o fato ou aprendizado. Exemplo: maestri remember 'O endpoint correto é /v2/auth'")
            sys.exit(1)
        fact = " ".join(sys.argv[2:])
        remember_fact(fact)

    elif cmd in ["rule", "regra"]:
        if len(sys.argv) < 3:
            print("Informe a regra anti-alucinação. Exemplo: maestri rule 'Nunca alterar arquivos fora da pasta src'")
            sys.exit(1)
        sub_arg = sys.argv[2].lower()
        if sub_arg in ["add", "adicionar"] and len(sys.argv) > 3:
            rule_text = " ".join(sys.argv[3:])
        else:
            rule_text = " ".join(sys.argv[2:])
        add_rule(rule_text)

    elif cmd in ["position", "posicao"]:
        if len(sys.argv) < 3:
            print("Informe a posição deste nó. Exemplo: maestri position 'Backend Lead — responsável por APIs e DB'")
            sys.exit(1)
        desc = " ".join(sys.argv[2:])
        update_position(desc)

    elif cmd in ["obligation", "obrigacao", "mission", "missao"]:
        if len(sys.argv) < 3:
            print("Informe a sua obrigação no workspace. Exemplo: maestri obligation 'Implementar autenticação JWT sem bibliotecas externas'")
            sys.exit(1)
        ob = " ".join(sys.argv[2:])
        update_obligation(ob)

    elif cmd in ["push-context", "push", "propagate", "propagar"]:
        push_context()

    elif cmd in ["sync", "sincronizar"]:
        sync_full_context()

    elif cmd in ["order", "ordem", "mandar", "enviar"]:
        if len(sys.argv) < 3:
            print("Informe a ordem a ser enviada. Exemplo: maestri order 'criar endpoint de login'")
            sys.exit(1)
        prompt = " ".join(sys.argv[2:])
        dispatch_order(prompt)

    elif cmd in ["delegate", "delegar"]:
        if len(sys.argv) < 4:
            print("Informe o alvo e a ordem. Exemplo: maestri delegate backend 'adicionar rota'")
            sys.exit(1)
        target = sys.argv[2]
        prompt = " ".join(sys.argv[3:])
        dispatch_order(prompt, target_name=target)

    elif cmd in ["say", "dizer", "falar", "send"]:
        if len(sys.argv) < 4:
            print("Informe o alvo e a mensagem. Exemplo: maestri say backend 'Olá'")
            sys.exit(1)
        target = sys.argv[2]
        msg = " ".join(sys.argv[3:])
        send_text_to_node(target, msg)

    elif cmd in ["mode", "modo", "toggle-mode"]:
        if len(sys.argv) < 3:
            print("Informe o alvo e opcionalmente o modo. Exemplo: maestri mode backend obs")
            sys.exit(1)
        target = sys.argv[2]
        new_mode = sys.argv[3] if len(sys.argv) > 3 else None
        toggle_node_mode(target, new_mode)

    elif cmd in ["note", "nota", "memoria", "context", "contexto"]:
        if len(sys.argv) == 2:
            show_note()
        else:
            sub = sys.argv[2].lower()
            if sub in ["get", "mostrar", "ver", "read", "ler", "show"]:
                show_note()
            elif sub in ["add", "adicionar", "regra", "rule", "append"]:
                if len(sys.argv) < 4:
                    print("Informe o texto da regra. Exemplo: maestri note add 'Nunca usar var'")
                    sys.exit(1)
                text = " ".join(sys.argv[3:])
                update_note(text, mode="rule")
            elif sub in ["set", "definir", "salvar", "update", "atualizar", "substituir"]:
                if len(sys.argv) < 4:
                    print("Informe o texto completo. Exemplo: maestri note set 'Texto completo'")
                    sys.exit(1)
                text = " ".join(sys.argv[3:])
                update_note(text, mode="set")
            else:
                full_text = " ".join(sys.argv[2:])
                # If text looks like a full context block, treat as set; otherwise add as rule
                if full_text.startswith("🧠") or "•" in full_text or len(full_text) > 80:
                    update_note(full_text, mode="set")
                else:
                    update_note(full_text, mode="rule")

    elif cmd in ["role", "papel", "competencia", "competencias", "roles"]:
        if len(sys.argv) == 2:
            show_role()
        else:
            sub = sys.argv[2].lower()
            if sub in ["add", "adicionar"]:
                if len(sys.argv) < 4:
                    print("Informe a competência. Exemplo: maestri role add 'Especialista em Testes'")
                    sys.exit(1)
                comp = " ".join(sys.argv[3:])
                update_role("add", comp)
            elif sub in ["remove", "remover", "del"]:
                if len(sys.argv) < 4:
                    print("Informe a competência a remover. Exemplo: maestri role remove 'Especialista em Testes'")
                    sys.exit(1)
                comp = " ".join(sys.argv[3:])
                update_role("remove", comp)
            elif sub in ["set", "definir"]:
                if len(sys.argv) < 4:
                    print("Informe as competências. Exemplo: maestri role set 'Frontend, UI/UX'")
                    sys.exit(1)
                comp = " ".join(sys.argv[3:])
                update_role("set", comp)
            else:
                comp = " ".join(sys.argv[2:])
                update_role("add", comp)

    elif cmd in ["ask", "perguntar", "solicitar"]:
        if len(sys.argv) < 4:
            print("Informe o alvo e a solicitação. Exemplo: maestri ask Claude 'Revise o PR'")
            sys.exit(1)
        target = sys.argv[2]
        prompt = " ".join(sys.argv[3:])
        ask_target(target, prompt)

    elif cmd in ["check", "checar", "verificar", "output"]:
        if len(sys.argv) < 3:
            print("Informe o alvo. Exemplo: maestri check Claude")
            sys.exit(1)
        target = sys.argv[2]
        check_target_output(target)

    elif cmd in ["recruit", "recrutar", "spawn"]:
        if len(sys.argv) < 3:
            print("Informe o nome do agente. Exemplo: maestri recruit 'Tester' --preset shell --role 'Testes'")
            sys.exit(1)
        name = sys.argv[2]
        preset = "shell"
        role = "Geral"
        args = sys.argv[3:]
        i = 0
        while i < len(args):
            if args[i] == "--preset" and i + 1 < len(args):
                preset = args[i+1]
                i += 2
            elif args[i] == "--role" and i + 1 < len(args):
                role = args[i+1]
                i += 2
            else:
                i += 1
        recruit_agent(name, preset, role)

    elif cmd in ["dismiss", "dispensar", "kill", "remover-agente"]:
        if len(sys.argv) < 3:
            print("Informe o alvo. Exemplo: maestri dismiss 'Tester'")
            sys.exit(1)
        target = sys.argv[2]
        dismiss_agent(target)

    elif cmd in ["nodes", "nos", "list"]:
        list_nodes()

    else:
        # Treat entire argument list as direct order
        prompt = " ".join(sys.argv[1:])
        dispatch_order(prompt)

if __name__ == "__main__":
    main()
