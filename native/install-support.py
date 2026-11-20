"""Etapa nativa depois de preparar o ambiente; nunca recebe senhas por argumento."""
from pathlib import Path
import os
import shutil
import subprocess
import sys

MARKER = 'rem Learnflix: iniciador nativo gerenciado'


def copy_payload(source: Path, destination: Path):
    if source.resolve() == destination.resolve():
        return
    destination.mkdir(parents=True, exist_ok=True)
    ignore = shutil.ignore_patterns('.venv', '__pycache__', '*.session', '*.session-*', '*.key', '.env*')
    for name in ('dist', 'deploy', 'integrations', 'native'):
        item = source / name
        if item.is_dir():
            shutil.copytree(item, destination / name, dirs_exist_ok=True, ignore=ignore)
    for name in ('LICENSE', 'INSTALAR.md', 'INSTALAR-NATIVO.md'):
        item = source / name
        if item.is_file():
            shutil.copy2(item, destination / name)


def write_windows_launchers(root: Path):
    # Conteúdo ASCII e caminhos relativos: perfis como "João" não dependem da
    # página de código do cmd.exe para encontrar o programa.
    launcher = root / 'Abrir-Learnflix.cmd'
    if launcher.exists() and MARKER not in launcher.read_text(errors='replace'):
        raise FileExistsError(f'O arquivo {launcher} já existe e foi preservado.')
    launcher.write_bytes(('\r\n'.join([
        '@echo off', MARKER, 'setlocal',
        'set "MAMBA_ROOT_PREFIX=%~dp0mamba-cache"',
        '"%~dp0tools\\micromamba.exe" --no-rc run --prefix "%~dp0runtime" python "%~dp0program\\native\\launch.py" %*',
        'if errorlevel 1 pause', '',
    ])).encode('ascii'))
    if os.environ.get('LEARNFLIX_INSTALL_ROOT'):
        return launcher
    # Os caminhos das pastas conhecidas vêm do próprio Windows, sem presumir que
    # Desktop/Start Menu ficam em C:\\Users ou fora de um perfil redirecionado.
    folders_code = "[Environment]::GetFolderPath('Desktop'); Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs'"
    result = subprocess.run(['powershell.exe', '-NoLogo', '-NoProfile', '-Command',
        "[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); " + folders_code],
        check=True, capture_output=True, encoding='utf-8')
    shortcut_text = ('@echo off\r\n' + MARKER + '\r\n"%LOCALAPPDATA%\\Learnflix\\Abrir-Learnflix.cmd" %*\r\n').encode('ascii')
    for raw in result.stdout.splitlines():
        if not raw.strip():
            continue
        folder = Path(raw.strip())
        folder.mkdir(parents=True, exist_ok=True)
        shortcut = folder / 'Learnflix.cmd'
        if shortcut.exists() and MARKER not in shortcut.read_text(errors='replace'):
            print(f'Preservado o arquivo já existente em {shortcut}.')
            continue
        shortcut.write_bytes(shortcut_text)
    return launcher


def main():
    if len(sys.argv) != 3:
        print('Uso interno: install-support.py ORIGEM RAIZ', file=sys.stderr)
        return 1
    source, root = map(Path, sys.argv[1:])
    if not source.is_absolute() or not root.is_absolute():
        print('Os caminhos da instalação precisam ser absolutos.', file=sys.stderr)
        return 1
    program, runtime = root / 'program', root / 'runtime'
    mamba = root / 'tools' / ('micromamba.exe' if os.name == 'nt' else 'micromamba')
    copy_payload(source, program)
    subprocess.run([str(mamba), '--no-rc', 'run', '--prefix', str(runtime), 'python', '-m', 'pip',
        'install', '--disable-pip-version-check', '-r', str(program / 'integrations/telegram/requirements.txt')], check=True)
    launcher = write_windows_launchers(root) if os.name == 'nt' else None
    subprocess.run([str(mamba), '--no-rc', 'run', '--prefix', str(runtime), 'python',
        str(program / 'native/launch.py'), '--check'], check=True)
    print(f'Instalado. Para abrir novamente: {launcher or program / "native/launch.py"}')
    if os.environ.get('LEARNFLIX_SKIP_LAUNCH') != '1':
        return subprocess.call([str(mamba), '--no-rc', 'run', '--prefix', str(runtime), 'python',
            str(program / 'native/launch.py'), '--configure'])
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, subprocess.CalledProcessError) as error:
        print(f'A instalação não foi concluída: {error}', file=sys.stderr)
        sys.exit(1)
