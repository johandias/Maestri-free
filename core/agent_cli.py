import sys
import os
import time
import subprocess
from typing import Optional

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stdin.reconfigure(encoding="utf-8")
    except Exception:
        pass

AGENT_NAMES = {
    "agy": "Antigravity",
    "antigravity": "Antigravity",
    "codex": "Codex",
    "claude": "Claude"
}

def find_real_agent_binary(agent_key: str) -> Optional[str]:
    candidates = []
    if agent_key in ["agy", "antigravity"]:
        candidates = [
            os.path.expandvars(r"%USERPROFILE%\.gemini\bin\agy.exe"),
            os.path.expandvars(r"%LOCALAPPDATA%\agy\bin\agy.exe"),
        ]
    elif agent_key == "codex":
        candidates = [
            os.path.expandvars(r"%USERPROFILE%\.codex\bin\codex.exe"),
            os.path.expandvars(r"%APPDATA%\npm\codex.cmd"),
        ]
    elif agent_key == "claude":
        candidates = [
            os.path.expandvars(r"%USERPROFILE%\.claude\bin\claude.exe"),
            os.path.expandvars(r"%APPDATA%\npm\claude.cmd"),
        ]

    for c in candidates:
        if os.path.exists(c):
            return c
    return None

def execute_task(agent_name: str, agent_key: str, prompt: str):
    real_bin = find_real_agent_binary(agent_key)

    if real_bin:
        print(f"[*] Consultando IA ({agent_name})...\n")
        try:
            # Chama o executável real da IA no modo print (-p) para streaming nativo da resposta
            subprocess.run([real_bin, "-p", prompt], cwd=os.getcwd(), text=True)
            print()
            return
        except Exception as e:
            print(f"[ERRO ao invocar {agent_name}]: {e}\n")
            return

    # Fallback local se o binário real não for encontrado
    print("[*] Analisando instrução...")
    time.sleep(0.15)
    p_lower = prompt.lower()
    
    if any(w in p_lower for w in ["listar", "arquivos", "ls", "dir"]):
        try:
            files = os.listdir(os.getcwd())
            print(f"{agent_name}: {len(files)} itens no diretório:")
            for f in files[:20]:
                is_dir = os.path.isdir(f)
                prefix = "<DIR>" if is_dir else "     "
                print(f"  {prefix}  {f}")
            if len(files) > 20:
                print(f"  ... e mais {len(files) - 20} itens.")
        except Exception as e:
            print(f"[ERRO] {e}")
    elif any(w in p_lower for w in ["status", "git"]):
        print(f"{agent_name}: Verificando repositório Git local...")
        os.system("git status -s" if os.path.exists(".git") else "echo [Nenhum repositório Git nesta pasta]")
    elif any(w in p_lower for w in ["ajuda", "help", "?"]):
        print(f"{agent_name} - Comandos:")
        print("  - Digite qualquer pergunta ou instrução em linguagem natural")
        print("  - Exemplo: 'como criar uma rota no fastapi', 'listar arquivos'")
        print("  - Digite 'sair' para voltar ao PowerShell")
    else:
        print(f"{agent_name}: Instrução recebida: \"{prompt}\"")
        print(f"Nota: Binário real de {agent_name} não encontrado neste caminho.")

def main():
    agent_key = sys.argv[1].lower() if len(sys.argv) > 1 else "agy"
    args = sys.argv[2:]

    agent_name = AGENT_NAMES.get(agent_key, "Antigravity")

    # Se o prompt foi passado diretamente: agy "minha pergunta"
    if args:
        prompt = " ".join(args)
        execute_task(agent_name, agent_key, prompt)
        return

    # Sessão interativa contínua
    print(f"\n--- {agent_name} CLI (Conectado à IA) ---")
    print(f"Diretório: {os.getcwd()}")
    print("Digite 'sair' para voltar ao prompt.\n")

    while True:
        try:
            user_input = input(f"{agent_key}> ")
            if not user_input.strip():
                continue
            if user_input.strip().lower() in ["sair", "exit", "quit", "q"]:
                print(f"[Sessão {agent_name} finalizada.]")
                break

            execute_task(agent_name, agent_key, user_input.strip())
        except (KeyboardInterrupt, EOFError):
            print("\n[Interrompido]")
            break

if __name__ == "__main__":
    main()
