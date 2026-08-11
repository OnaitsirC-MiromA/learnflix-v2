# Instalador do Learnflix para Windows.
#
#   irm https://raw.githubusercontent.com/OnaitsirC-MiromA/learnflix-v2/main/install.ps1 | iex
#
# Baixa o executável, confere a soma SHA-256 e põe no PATH do usuário.
# Não precisa de Node, nem de npm, nem de conta de administrador.

$ErrorActionPreference = 'Stop'

$Repo = 'OnaitsirC-MiromA/learnflix-v2'
# Sobrescrevível para testar contra uma release local antes de publicar.
$BaseUrl = if ($env:LEARNFLIX_BASE_URL) { $env:LEARNFLIX_BASE_URL } else { "https://github.com/$Repo/releases/latest/download" }

function Falhar($mensagem) {
  Write-Host ''
  Write-Host "  $mensagem" -ForegroundColor Red
  Write-Host ''
  exit 1
}

# --- qual executável baixar ---
$Arquitetura = switch ($env:PROCESSOR_ARCHITECTURE) {
  'AMD64' { 'x64' }
  'ARM64' { 'arm64' }
  default { Falhar "Processador não suportado: $($env:PROCESSOR_ARCHITECTURE)." }
}
$Alvo = "learnflix-win32-$Arquitetura.exe"

# --- onde instalar ---
# Pasta do usuário: não exige administrador, e é onde o Windows espera
# aplicativos instalados sem elevação.
$Destino = Join-Path $env:LOCALAPPDATA 'Programs\Learnflix'
New-Item -ItemType Directory -Force -Path $Destino | Out-Null
$Executavel = Join-Path $Destino 'learnflix.exe'

$Temporario = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Force -Path $Temporario | Out-Null

try {
  Write-Host ''
  Write-Host "  Learnflix — baixando para win32-$Arquitetura..."

  $Baixado = Join-Path $Temporario 'learnflix.exe'
  try {
    Invoke-WebRequest -Uri "$BaseUrl/$Alvo" -OutFile $Baixado -UseBasicParsing
  } catch {
    Falhar "Falha ao baixar $BaseUrl/$Alvo"
  }

  # --- conferir a soma ---
  # Um binário corrompido no caminho falharia de um jeito confuso; a soma
  # transforma isso numa mensagem clara.
  try {
    $Somas = Join-Path $Temporario 'checksums.txt'
    Invoke-WebRequest -Uri "$BaseUrl/checksums.txt" -OutFile $Somas -UseBasicParsing
    $Linha = Select-String -Path $Somas -Pattern "\s$([regex]::Escape($Alvo))$" | Select-Object -First 1
    if ($Linha) {
      $Esperado = ($Linha.Line -split '\s+')[0]
      $Obtido = (Get-FileHash -Path $Baixado -Algorithm SHA256).Hash.ToLower()
      if ($Obtido -ne $Esperado.ToLower()) {
        Falhar 'O arquivo baixado não confere com a soma publicada. Não vou instalar.'
      }
      Write-Host '  soma SHA-256 confere'
    }
  } catch {
    if ($_.Exception.Message -like '*não confere*') { throw }
    # sem checksums publicados: segue sem conferir
  }

  Move-Item -Force -Path $Baixado -Destination $Executavel
  Write-Host "  instalado em $Executavel"
  Write-Host ''

  # --- PATH do usuário ---
  $PathAtual = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($PathAtual -notlike "*$Destino*") {
    [Environment]::SetEnvironmentVariable('Path', "$PathAtual;$Destino", 'User')
    Write-Host '  Adicionado ao seu PATH.'
    Write-Host '  Abra um terminal NOVO (o atual não enxerga a mudança) e rode:'
  } else {
    Write-Host '  Pronto. Para começar:'
  }
  Write-Host ''
  Write-Host '      learnflix'
  Write-Host ''
} finally {
  Remove-Item -Recurse -Force -Path $Temporario -ErrorAction SilentlyContinue
}
