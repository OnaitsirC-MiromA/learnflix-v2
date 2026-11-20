#!/usr/bin/env bash
# Instalação nativa por usuário; não altera o PATH nem os programas do sistema.
set -euo pipefail

fail() { printf '\n%s\n' "$*" >&2; exit 1; }
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SOURCE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
INSTALL_ROOT="${LEARNFLIX_INSTALL_ROOT:-$HOME/.local/share/learnflix}"
case "$INSTALL_ROOT" in /*) ;; *) fail 'LEARNFLIX_INSTALL_ROOT precisa ser um caminho absoluto.' ;; esac
RUNTIME_DIR="$INSTALL_ROOT/runtime"
PROGRAM_DIR="$INSTALL_ROOT/program"
TOOLS_DIR="$INSTALL_ROOT/tools"
MAMBA="$TOOLS_DIR/micromamba"

case "$(uname -s):$(uname -m)" in
  Linux:x86_64|Linux:amd64) PLATFORM=linux-64 ;;
  Linux:aarch64|Linux:arm64) PLATFORM=linux-aarch64 ;;
  Darwin:x86_64) PLATFORM=osx-64 ;;
  Darwin:arm64) PLATFORM=osx-arm64 ;;
  *) fail 'Sistema/processador ainda não suportado por este instalador.' ;;
esac
if [[ "$PLATFORM" == linux-* ]] && command -v ldd >/dev/null 2>&1; then
  if ldd --version 2>&1 | grep -qi musl; then
    fail 'Esta versão Linux exige glibc. Alpine/musl ainda não é suportado.'
  fi
fi
URL=''; EXPECTED=''; VERSION=''
while IFS=$'\t' read -r record_platform record_url record_sha record_version; do
  if [[ "$record_platform" == "$PLATFORM" ]]; then
    URL="$record_url"; EXPECTED="$record_sha"; VERSION="$record_version"; break
  fi
done < "$SCRIPT_DIR/micromamba-platforms.tsv"
[[ "$URL" == https://github.com/mamba-org/micromamba-releases/releases/download/* && "$EXPECTED" =~ ^[0-9a-f]{64}$ ]] || fail 'Manifesto de instalação ausente ou inválido.'
if [[ "${1:-}" == '--plan' ]]; then
  printf 'Plataforma: %s\nPrograma: %s\nAmbiente: %s\nMicromamba: %s\n' "$PLATFORM" "$PROGRAM_DIR" "$RUNTIME_DIR" "$VERSION"
  exit 0
fi
[[ $# -eq 0 ]] || fail 'Uso: bash native/install.sh [--plan]'
[[ -f "$SOURCE_DIR/dist/learnflix.cjs" && -f "$SCRIPT_DIR/launch.py" ]] || fail 'Extraia o pacote completo antes de executar o instalador.'
if command -v sha256sum >/dev/null 2>&1; then
  digest() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  digest() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  fail 'É necessário sha256sum ou shasum para verificar o download com segurança.'
fi
if command -v curl >/dev/null 2>&1; then
  download() { curl --fail --location --retry 3 --silent --show-error "$1" --output "$2"; }
elif command -v wget >/dev/null 2>&1; then
  download() { wget --quiet --output-document="$2" "$1"; }
else
  fail 'É necessário curl ou wget para baixar os componentes.'
fi
umask 077
mkdir -p -- "$TOOLS_DIR"
TEMP_FILE="$(mktemp "$TOOLS_DIR/.micromamba.XXXXXX")"
trap 'rm -f -- "$TEMP_FILE"' EXIT
printf '\nLearnflix — preparando Node, Python, FFmpeg e FFprobe para %s.\n' "$PLATFORM"
if [[ ! -f "$MAMBA" || "$(digest "$MAMBA")" != "$EXPECTED" ]]; then
  download "$URL" "$TEMP_FILE"
  [[ "$(digest "$TEMP_FILE")" == "$EXPECTED" ]] || fail 'O download não confere com o SHA-256 publicado. Nada será executado.'
  chmod 700 "$TEMP_FILE"
  mv -f -- "$TEMP_FILE" "$MAMBA"
fi
export MAMBA_ROOT_PREFIX="$INSTALL_ROOT/mamba-cache"
ACTION=create
[[ -f "$RUNTIME_DIR/conda-meta/history" ]] && ACTION=install
"$MAMBA" --no-rc "$ACTION" --yes --prefix "$RUNTIME_DIR" --override-channels --channel conda-forge --strict-channel-priority 'nodejs>=22.5,<23' 'python=3.12' pip ffmpeg
# O Python instalado faz a cópia sem interpretar caminhos como comandos.
"$MAMBA" --no-rc run --prefix "$RUNTIME_DIR" python - "$SOURCE_DIR" "$PROGRAM_DIR" <<'PY'
from pathlib import Path
import shutil, sys
source, destination = map(Path, sys.argv[1:])
if source.resolve() != destination.resolve():
    destination.mkdir(parents=True, exist_ok=True)
    ignore = shutil.ignore_patterns('.venv', '__pycache__', '*.session', '*.session-*', '*.key', '.env*')
    for name in ('dist', 'deploy', 'integrations', 'native'):
        item = source / name
        if item.is_dir(): shutil.copytree(item, destination / name, dirs_exist_ok=True, ignore=ignore)
    for name in ('LICENSE', 'INSTALAR.md', 'INSTALAR-NATIVO.md'):
        item = source / name
        if item.is_file(): shutil.copy2(item, destination / name)
PY
"$MAMBA" --no-rc run --prefix "$RUNTIME_DIR" python -m pip install --disable-pip-version-check -r "$PROGRAM_DIR/integrations/telegram/requirements.txt"
# Apenas o diretório do usuário recebe um iniciador. O PATH global fica intacto.
LAUNCHER="$INSTALL_ROOT/Abrir-Learnflix.command"
if [[ -e "$LAUNCHER" ]] && ! grep -Fq '# Learnflix: iniciador nativo gerenciado' "$LAUNCHER" 2>/dev/null; then
  fail "O arquivo $LAUNCHER já existe e foi preservado."
fi
{
  printf '#!/usr/bin/env bash\n# Learnflix: iniciador nativo gerenciado\n'
  printf 'export MAMBA_ROOT_PREFIX=%q\n' "$MAMBA_ROOT_PREFIX"
  printf 'exec %q --no-rc run --prefix %q python %q "$@"\n' "$MAMBA" "$RUNTIME_DIR" "$PROGRAM_DIR/native/launch.py"
} > "$LAUNCHER"
chmod 700 "$LAUNCHER"
if [[ -z "${LEARNFLIX_INSTALL_ROOT:-}" ]]; then
  mkdir -p -- "$HOME/.local/bin"
  SHORTCUT="$HOME/.local/bin/learnflix"
  if [[ ! -e "$SHORTCUT" ]] || grep -Fq '# Learnflix: iniciador nativo gerenciado' "$SHORTCUT" 2>/dev/null; then
    {
      printf '#!/usr/bin/env bash\n# Learnflix: iniciador nativo gerenciado\n'
      printf 'exec %q "$@"\n' "$LAUNCHER"
    } > "$SHORTCUT"
    chmod 700 "$SHORTCUT"
  else
    printf 'O iniciador já existente em %s foi preservado.\n' "$SHORTCUT"
  fi
fi
"$MAMBA" --no-rc run --prefix "$RUNTIME_DIR" python "$PROGRAM_DIR/native/launch.py" --check
printf '\nInstalado. Para abrir novamente: %s\n' "$LAUNCHER"
if [[ "${LEARNFLIX_SKIP_LAUNCH:-0}" != 1 ]]; then
  "$MAMBA" --no-rc run --prefix "$RUNTIME_DIR" python "$PROGRAM_DIR/native/launch.py" --configure
fi
