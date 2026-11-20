#!/bin/bash
# Entrada para macOS; toda a instalação fica a cargo do mesmo script Unix.
set -eu
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
exec /bin/bash "$SCRIPT_DIR/install.sh"
