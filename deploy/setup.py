"""Configuração pessoal no volume privado do pacote Docker; sem segredos no ZIP."""
import argparse
import getpass
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile


def prepare_files(env=os.environ, ask=input, ask_secret=getpass.getpass, replace=False, allow_empty_password=False):
    paths = {name: Path(env[name]) for name in (
        'TELEGRAM_API_ID_FILE', 'TELEGRAM_API_HASH_FILE',
        'TELEGRAM_BRIDGE_TOKEN_FILE', 'ACCESS_PASSWORD_FILE')}
    values = {}
    if replace or not paths['TELEGRAM_API_ID_FILE'].is_file():
        raw = ask('API ID da sua aplicação em my.telegram.org: ').strip()
        if not raw.isdecimal() or not 0 < int(raw) < 2**31:
            raise ValueError('O API ID precisa ser um número positivo válido.')
        values['TELEGRAM_API_ID_FILE'] = raw
    if replace or not paths['TELEGRAM_API_HASH_FILE'].is_file():
        raw = ask_secret('API hash da sua aplicação (entrada oculta): ').strip()
        if len(raw) != 32 or any(c not in '0123456789abcdefABCDEF' for c in raw):
            raise ValueError('O API hash precisa ter 32 caracteres hexadecimais.')
        values['TELEGRAM_API_HASH_FILE'] = raw
    if replace or not paths['ACCESS_PASSWORD_FILE'].is_file():
        prompt = 'Senha do Learnflix (opcional; Enter para acesso local sem senha): ' if allow_empty_password else 'Crie uma senha para abrir o Learnflix (mínimo 8 caracteres): '
        password = ask_secret(prompt).strip()
        if (password or not allow_empty_password) and len(password) < 8:
            raise ValueError('Use uma senha de pelo menos 8 caracteres.')
        if password and password != ask_secret('Repita a senha do Learnflix: ').strip():
            raise ValueError('As senhas não coincidem.')
        values['ACCESS_PASSWORD_FILE'] = password
    if not paths['TELEGRAM_BRIDGE_TOKEN_FILE'].is_file():
        values['TELEGRAM_BRIDGE_TOKEN_FILE'] = secrets.token_urlsafe(48)
    # Só grava depois de validar todas as entradas. Uma falha não substitui
    # credenciais já existentes nem deixa uma configuração nova pela metade.
    for name, value in values.items():
        file = paths[name]
        file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        file.parent.chmod(0o700)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', dir=file.parent, prefix='.setup-', delete=False) as handle:
                temporary = Path(handle.name)
                handle.write(value)
            temporary.chmod(0o600)
            os.replace(temporary, file)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
    Path(env['DATA_DIR']).mkdir(parents=True, exist_ok=True)
    Path(env['TELEGRAM_SESSION']).parent.mkdir(parents=True, exist_ok=True, mode=0o700)


def main():
    parser = argparse.ArgumentParser(description='Configuração pessoal do Learnflix')
    parser.add_argument('--reconfigure', action='store_true', help='Informar novamente API ID/hash e senha do Learnflix, preservando sessão e progresso')
    args = parser.parse_args()
    os.umask(0o077)
    print('Learnflix: configuração pessoal. Use sua própria aplicação e conta Telegram.')
    try:
        prepare_files(replace=args.reconfigure)
        result = subprocess.run([sys.executable, 'integrations/telegram/bridge.py', 'login'], check=False)
        if result.returncode:
            print('O login não foi concluído. Confira os dados. Para corrigir credenciais já salvas, execute a configuração com --reconfigure.', file=sys.stderr)
            return result.returncode
        print('Pronto. Inicie o serviço e abra http://localhost:7778. Usuário: learnflix.')
        return 0
    except (ValueError, OSError, KeyError) as error:
        print(str(error) if isinstance(error, ValueError) else 'Não foi possível preparar o volume privado. Confira a configuração do Docker.', file=sys.stderr)
        return 1
    except (KeyboardInterrupt, EOFError):
        print('\nConfiguração interrompida. Execute novamente quando quiser continuar.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
