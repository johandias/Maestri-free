"""
Desktop Application Launcher for Maestri Desktop (Python Edition).
Starts the FastAPI server and opens a dedicated, native app window on Windows.
"""
import sys
import os
import time
import subprocess
import threading
import webbrowser
import socket
import uvicorn

PORT = 8000
HOST = "127.0.0.1"
URL = f"http://{HOST}:{PORT}"

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((HOST, port)) == 0

def start_server():
    config = uvicorn.Config("server:app", host=HOST, port=PORT, log_level="warning", reload=True)
    server = uvicorn.Server(config)
    server.run()

def open_desktop_window():
    time.sleep(1.2)
    
    # Try Microsoft Edge in standalone App mode (available by default on Windows)
    edge_paths = [
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%LocalAppData%\Microsoft\Edge\Application\msedge.exe")
    ]
    for p in edge_paths:
        if os.path.exists(p):
            print(f"[Maestri] Abrindo janela dedicada do App via Microsoft Edge...")
            subprocess.Popen([p, f"--app={URL}", "--window-size=1400,900"])
            return

    # Try Google Chrome in standalone App mode
    chrome_paths = [
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe")
    ]
    for p in chrome_paths:
        if os.path.exists(p):
            print(f"[Maestri] Abrindo janela dedicada do App via Google Chrome...")
            subprocess.Popen([p, f"--app={URL}", "--window-size=1400,900"])
            return

    # Fallback to default browser
    print(f"[Maestri] Abrindo no navegador padrão...")
    webbrowser.open(URL)

if __name__ == "__main__":
    print("=" * 60)
    print("  Maestri Desktop - Orquestrador IA em Python (Tema Escuro)")
    print(f"  Acessível em: {URL}")
    print("=" * 60)

    if not is_port_in_use(PORT):
        t = threading.Thread(target=start_server, daemon=True)
        t.start()
    else:
        print("[Maestri] Servidor já ativo na porta 8000.")

    open_desktop_window()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[Maestri] Encerrando aplicativo.")
