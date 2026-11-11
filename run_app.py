"""
Desktop Application Launcher for Maestri Desktop (Python Edition).
Starts the FastAPI server and opens a dedicated, native standalone app window across platforms (Windows, Linux, macOS).
"""
import sys
import os
import time
import subprocess
import threading
import webbrowser
import socket
import shutil
import uvicorn

HOST = "127.0.0.1"
IS_WINDOWS = sys.platform.startswith("win")
IS_MACOS = sys.platform == "darwin"


def is_maestri_alive(port):
    """Checks if Maestri server is already responding on this port."""
    try:
        import urllib.request
        with urllib.request.urlopen(f"http://{HOST}:{port}/api/workspace", timeout=0.6) as resp:
            return resp.status == 200
    except Exception:
        return False


def get_active_or_free_port():
    """Finds currently active Maestri instance port or finds a clean free port."""
    if "PORT" in os.environ:
        try:
            return int(os.environ["PORT"]), False
        except ValueError:
            pass

    # 1. Procura se Maestri já está rodando em portas padrão
    for p in [8001, 8000, 8080]:
        if is_maestri_alive(p):
            return p, True

    # 2. Encontra uma porta limpa e livre para iniciar novo servidor
    for p in [8001, 8080, 8888, 8000]:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex((HOST, p)) != 0:
                return p, False

    return 8001, False


PORT, ALREADY_RUNNING = get_active_or_free_port()
URL = f"http://{HOST}:{PORT}"


def start_server():
    config = uvicorn.Config("server:app", host=HOST, port=PORT, log_level="warning", reload=True)
    server = uvicorn.Server(config)
    server.run()


def find_standalone_browser():
    """Finds a Chromium-based browser supporting --app= mode across Windows, Linux, and macOS."""
    if IS_WINDOWS:
        # Check standard Windows paths first
        windows_paths = [
            os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%LocalAppData%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%LocalAppData%\BraveSoftware\Brave-Browser\Application\brave.exe"),
            os.path.expandvars(r"%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"),
        ]
        for p in windows_paths:
            if os.path.exists(p):
                return p
        for cmd in ["msedge", "chrome", "brave"]:
            p = shutil.which(cmd)
            if p:
                return p
    elif IS_MACOS:
        mac_paths = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ]
        for p in mac_paths:
            if os.path.exists(p):
                return p
        for cmd in ["google-chrome", "chromium", "microsoft-edge", "brave-browser", "brave"]:
            p = shutil.which(cmd)
            if p:
                return p
    else:
        # Linux / Unix candidates in PATH
        linux_candidates = [
            "google-chrome",
            "google-chrome-stable",
            "chromium-browser",
            "chromium",
            "microsoft-edge",
            "microsoft-edge-stable",
            "brave-browser",
            "brave",
        ]
        for cmd in linux_candidates:
            p = shutil.which(cmd)
            if p:
                return p
    return None


def open_desktop_window():
    time.sleep(1.2)

    browser_bin = find_standalone_browser()
    if browser_bin:
        try:
            browser_name = os.path.basename(browser_bin)
            app_profile = os.path.join(os.path.expanduser("~"), ".maestri", "app_profile")
            os.makedirs(app_profile, exist_ok=True)
            print(f"[Maestri] Abrindo aplicativo desktop nativo via {browser_name} (--app={URL})...")
            cmd = [
                browser_bin,
                f"--app={URL}",
                f"--user-data-dir={app_profile}",
                "--window-size=1440,920",
                "--class=Maestri",
                "--name=Maestri",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-features=Translate,OptimizationHints",
            ]
            subprocess.Popen(cmd)
            return
        except Exception as e:
            print(f"[Maestri] Aviso: Falha ao abrir janela standalone ({e}). Usando navegador padrão...")

    # Fallback to default browser
    print(f"[Maestri] Abrindo no navegador padrão...")
    webbrowser.open(URL)


if __name__ == "__main__":
    print("=" * 60)
    print("  Maestri Desktop - Orquestrador IA em Python (Tema Escuro)")
    print(f"  Acessível em: {URL}")
    print("=" * 60)

    if not ALREADY_RUNNING:
        t = threading.Thread(target=start_server, daemon=True)
        t.start()
    else:
        print(f"[Maestri] Instância ativa detectada na porta {PORT}. Conectando aplicativo...")

    open_desktop_window()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[Maestri] Encerrando aplicativo.")
