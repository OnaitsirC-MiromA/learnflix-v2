#!/usr/bin/env python3
"""Inicialização nativa: ambiente privado, sessão própria e abertura do navegador."""
import argparse
import base64
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser

PROGRAM = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROGRAM / 'deploy'))


def data_directory():
    if os.environ.get('LEARNFLIX_DATA_DIR'):
        return Path(os.environ['LEARNFLIX_DATA_DIR']).expanduser().resolve()
    if sys.platform == 'win32':
        return Path(os.environ['LOCALAPPDATA']) / 'Learnflix'
    return Path.home() / '.learnflix'


def environment(data, port, bridge_port):
    env = os.environ.copy()
    private = data / 'telegram'
    env.update({
        'DATA_DIR': str(data), 'BIND': '127.0.0.1', 'PORT': str(port), 'OPEN_BROWSER': '1',
        'TELEGRAM_API_ID_FILE': str(private / 'api_id'),
        'TELEGRAM_API_HASH_FILE': str(private / 'api_hash'),
        'ACCESS_PASSWORD_FILE': str(private / 'access_password'),
        'TELEGRAM_BRIDGE_TOKEN_FILE': str(private / 'bridge.key'),
        'TELEGRAM_SESSION': str(private / 'session' / 'account'),
        'TELEGRAM_BRIDGE_PORT': str(bridge_port),
        'TELEGRAM_BRIDGE_URL': f'http://127.0.0.1:{bridge_port}',
        'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONUNBUFFERED': '1',
    })
    # Um ambiente externo antigo não deve misturar credenciais de outra conta
    # com os arquivos privados desta instalação.
    for key in ('TELEGRAM_API_ID', 'TELEGRAM_API_HASH', 'TELEGRAM_BRIDGE_TOKEN', 'ACCESS_PASSWORD'):
        env.pop(key, None)
    return env


def free_port(preferred):
    for port in range(preferred, min(preferred + 30, 65536)) if preferred else [0]:
        with socket.socket() as sock:
            try:
                sock.bind(('127.0.0.1', port))
                return sock.getsockname()[1]
            except OSError:
                continue
    raise ValueError('Não há uma porta local disponível. Feche outra instância ou escolha LEARNFLIX_PORT.')


def check_components():
    result = {'python': sys.version.split()[0]}
    if sys.version_info < (3, 11):
        raise ValueError('O ambiente precisa de Python 3.11 ou mais recente.')
    for binary in ('node', 'ffmpeg', 'ffprobe'):
        found = shutil.which(binary)
        if not found:
            raise ValueError(f'{binary} não foi encontrado no ambiente. Execute o instalador novamente.')
        output = subprocess.check_output([found, '--version' if binary == 'node' else '-version'], stderr=subprocess.STDOUT, timeout=20).decode(errors='replace')
        result[binary] = output.splitlines()[0]
    version = result['node'].lstrip('v').split('.')
    if tuple(map(int, version[:2])) < (22, 5):
        raise ValueError('O ambiente precisa de Node 22.5 ou mais recente.')
    for package in ('Telethon', 'aiohttp'):
        result[package] = importlib.metadata.version(package)
    return result


def acquire_lock(file):
    handle = file.open('a+b')
    if file.stat().st_size == 0:
        handle.write(b'0'); handle.flush()
    handle.seek(0)
    try:
        if sys.platform == 'win32':
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        handle.close()
        return None
    return handle


def wait_bridge(env, process):
    token = Path(env['TELEGRAM_BRIDGE_TOKEN_FILE']).read_text().strip()
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline and process.poll() is None:
        try:
            req = urllib.request.Request(env['TELEGRAM_BRIDGE_URL'] + '/health', headers={'Authorization': 'Bearer ' + token})
            with urllib.request.urlopen(req, timeout=2) as response:
                if response.status == 200:
                    return
        except OSError:
            time.sleep(0.5)
    raise ValueError('A conexão Telegram não ficou pronta. Use o atalho Configurar ou execute launch.py --configure.')


def run(args):
    if args.check:
        print(json.dumps(check_components(), ensure_ascii=False))
        return 0
    check_components()
    data = data_directory()
    data.mkdir(mode=0o700, parents=True, exist_ok=True)
    record = data / 'native-running.json'
    lock = acquire_lock(data / 'native.lock')
    if lock is None:
        print('O Learnflix já está em execução.')
        try:
            port = json.loads(record.read_text())['port']
            if type(port) is int and 0 < port < 65536:
                webbrowser.open(f'http://localhost:{port}')
        except (OSError, ValueError, KeyError):
            pass
        return 0
    children = []
    try:
        port = int(os.environ.get('LEARNFLIX_PORT', '7777'))
        if not 1 <= port < 65536:
            raise ValueError('LEARNFLIX_PORT precisa ser uma porta válida.')
        env = environment(data, free_port(port), free_port(0))
        missing = any(not Path(env[key]).is_file() for key in (
            'TELEGRAM_API_ID_FILE', 'TELEGRAM_API_HASH_FILE', 'TELEGRAM_BRIDGE_TOKEN_FILE', 'ACCESS_PASSWORD_FILE'))
        session = Path(env['TELEGRAM_SESSION'] + '.session')
        if missing or not session.is_file() or args.configure or args.reconfigure:
            from setup import prepare_files
            print('Primeiro acesso: configure sua própria conta Telegram. As entradas privadas ficam neste computador.')
            prepare_files(env, replace=args.reconfigure, allow_empty_password=True)
            status = subprocess.call([sys.executable, str(PROGRAM / 'integrations/telegram/bridge.py'), 'login'], cwd=PROGRAM, env=env)
            if status:
                return status
        children.append(subprocess.Popen([sys.executable, str(PROGRAM / 'integrations/telegram/bridge.py'), 'serve'], cwd=PROGRAM, env=env))
        print('Conectando ao Telegram…', flush=True)
        wait_bridge(env, children[0])
        children.append(subprocess.Popen(['node', str(PROGRAM / 'dist/learnflix.cjs')], cwd=PROGRAM, env=env))
        record.write_text(json.dumps({'pid': os.getpid(), 'port': int(env['PORT'])}))
        print('Mantenha esta janela aberta. Para encerrar, use Ctrl+C.', flush=True)
        while all(child.poll() is None for child in children):
            time.sleep(0.5)
        return 1 if any(child.returncode not in (None, 0) for child in children) else 0
    finally:
        for child in children:
            if child.poll() is None:
                child.terminate()
        for child in children:
            try:
                child.wait(timeout=15)
            except subprocess.TimeoutExpired:
                child.kill(); child.wait()
        record.unlink(missing_ok=True)
        lock.close()


def main():
    parser = argparse.ArgumentParser(description='Learnflix nativo, sem Docker')
    parser.add_argument('--configure', action='store_true', help='Autenticar a conta Telegram antes de abrir')
    parser.add_argument('--reconfigure', action='store_true', help='Corrigir credenciais e senha local, preservando progresso')
    parser.add_argument('--check', action='store_true', help='Verificar componentes sem autenticar ou alterar dados')
    args = parser.parse_args()
    os.umask(0o077)
    def interrupted(*_):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    try:
        return run(args)
    except (KeyboardInterrupt, EOFError):
        print('\nLearnflix encerrado.')
        return 0
    except (OSError, ValueError, subprocess.SubprocessError, importlib.metadata.PackageNotFoundError):
        print('Não foi possível iniciar. Confira o ambiente e a conexão; para corrigir credenciais, use --reconfigure. Seus dados foram preservados.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
