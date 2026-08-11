#!/bin/sh
# Instalador do Learnflix para macOS e Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/OnaitsirC-MiromA/learnflix-v2/main/install.sh | sh
#
# Baixa o executável do seu sistema, confere a soma SHA-256 e põe no PATH.
# Não precisa de Node, nem de npm, nem de permissão de administrador.
#
# POSIX sh de propósito: `sh` existe em qualquer lugar, `bash` não.
set -eu

REPO="OnaitsirC-MiromA/learnflix-v2"
# Sobrescrevível para testar o instalador contra uma release local antes de
# publicar de verdade.
BASE_URL="${LEARNFLIX_BASE_URL:-https://github.com/$REPO/releases/latest/download}"

erro() {
  echo "" >&2
  echo "  $1" >&2
  echo "" >&2
  exit 1
}

# --- qual executável baixar ---
case "$(uname -s)" in
  Darwin) SO="darwin" ;;
  Linux)  SO="linux" ;;
  *) erro "Sistema não suportado: $(uname -s). No Windows, use o install.ps1." ;;
esac

case "$(uname -m)" in
  arm64|aarch64) ARQ="arm64" ;;
  x86_64|amd64)  ARQ="x64" ;;
  *) erro "Processador não suportado: $(uname -m)." ;;
esac

ALVO="learnflix-$SO-$ARQ"

# --- como baixar ---
if command -v curl >/dev/null 2>&1; then
  baixar() { curl -fsSL "$1" -o "$2"; }
elif command -v wget >/dev/null 2>&1; then
  baixar() { wget -qO "$2" "$1"; }
else
  erro "Preciso do curl ou do wget para baixar. Instale um dos dois e rode de novo."
fi

# --- onde instalar ---
# ~/.local/bin primeiro: não pede senha e é o padrão moderno. /usr/local/bin só
# se já for gravável — pedir sudo num script vindo de um pipe é um mau hábito
# que este instalador não vai ensinar.
if [ -w "/usr/local/bin" ] 2>/dev/null; then
  DESTINO="/usr/local/bin"
else
  DESTINO="$HOME/.local/bin"
  mkdir -p "$DESTINO"
fi

TMP="$(mktemp -d)"
# shellcheck disable=SC2064
trap "rm -rf '$TMP'" EXIT INT TERM

echo ""
# Chaves em volta do nome: sem elas, o caractere multibyte logo depois (…) é
# lido como parte do nome da variável e o `set -u` derruba o script.
echo "  Learnflix — baixando para ${SO}-${ARQ}…"

baixar "$BASE_URL/$ALVO" "$TMP/learnflix" || erro "Falha ao baixar $BASE_URL/$ALVO"

# --- conferir a soma ---
# Um binário corrompido no meio do caminho falharia de um jeito confuso; a soma
# transforma isso numa mensagem clara.
if baixar "$BASE_URL/checksums.txt" "$TMP/checksums.txt" 2>/dev/null; then
  ESPERADO="$(grep " $ALVO\$" "$TMP/checksums.txt" | awk '{print $1}' || true)"
  if [ -n "$ESPERADO" ]; then
    if command -v sha256sum >/dev/null 2>&1; then
      OBTIDO="$(sha256sum "$TMP/learnflix" | awk '{print $1}')"
    elif command -v shasum >/dev/null 2>&1; then
      OBTIDO="$(shasum -a 256 "$TMP/learnflix" | awk '{print $1}')"
    else
      OBTIDO=""
    fi
    if [ -n "$OBTIDO" ] && [ "$OBTIDO" != "$ESPERADO" ]; then
      erro "O arquivo baixado não confere com a soma publicada. Não vou instalar."
    fi
    [ -n "$OBTIDO" ] && echo "  soma SHA-256 confere"
  fi
fi

chmod +x "$TMP/learnflix"
mv "$TMP/learnflix" "$DESTINO/learnflix"

echo "  instalado em $DESTINO/learnflix"
echo ""

# --- o PATH já alcança? ---
if command -v learnflix >/dev/null 2>&1; then
  echo "  Pronto. Para começar:"
  echo ""
  echo "      learnflix"
else
  echo "  Falta só uma linha: $DESTINO não está no seu PATH."
  echo "  Acrescente ao seu ~/.zshrc ou ~/.bashrc:"
  echo ""
  echo "      export PATH=\"\$PATH:$DESTINO\""
  echo ""
  echo "  Depois abra um terminal novo e rode: learnflix"
fi
echo ""
