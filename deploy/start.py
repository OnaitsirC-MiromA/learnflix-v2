"""Executa a ponte opcional e o Learnflix no mesmo ambiente de rede privado."""
import os
from pathlib import Path
import signal
import subprocess
import time
import urllib.request

children = []
ready = False
stopping = False

def stop(*_):
    global stopping
    stopping = True
    for child in children:
        if child.poll() is None:
            child.terminate()

signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
try:
    children.append(subprocess.Popen(['python3', '-u', 'integrations/telegram/bridge.py', 'serve']))
    token = Path(os.environ['TELEGRAM_BRIDGE_TOKEN_FILE']).read_text().strip()
    ready = False
    for _ in range(60):
        if stopping or children[0].poll() is not None:
            break
        try:
            request = urllib.request.Request('http://127.0.0.1:8099/health', headers={'Authorization': 'Bearer ' + token})
            with urllib.request.urlopen(request, timeout=2) as response:
                ready = response.status == 200
            if ready:
                break
        except (OSError, TimeoutError):
            time.sleep(1)
    if not ready:
        raise RuntimeError('A ponte Telegram não ficou pronta. Confira a sessão privada.')
    children.append(subprocess.Popen(['node', 'dist/learnflix.cjs']))
    while not stopping and all(c.poll() is None for c in children):
        time.sleep(0.5)
finally:
    stop()
    for child in children:
        try:
            child.wait(timeout=15)
        except subprocess.TimeoutExpired:
            child.kill()
    if not ready:
        raise SystemExit(1)
