# Instalação nativa por usuário: sem Docker, administrador ou mudança global de PATH.
param([switch]$PlanOnly)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Run-Checked([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "O comando terminou com código $LASTEXITCODE. A instalação não foi concluída." }
}
function Write-Utf8NoBom([string]$Path, [string]$Text) {
    [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding($false)))
}
$SourceDir = Split-Path -Parent $PSScriptRoot
if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA não está definido para este usuário.' }
$InstallRoot = if ($env:LEARNFLIX_INSTALL_ROOT) { $env:LEARNFLIX_INSTALL_ROOT } else { Join-Path $env:LOCALAPPDATA 'Learnflix' }
if (-not [IO.Path]::IsPathRooted($InstallRoot)) { throw 'LEARNFLIX_INSTALL_ROOT precisa ser um caminho absoluto.' }
$RuntimeDir = Join-Path $InstallRoot 'runtime'
$ProgramDir = Join-Path $InstallRoot 'program'
$ToolsDir = Join-Path $InstallRoot 'tools'
$Mamba = Join-Path $ToolsDir 'micromamba.exe'
$Architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
if ($Architecture -ne 'AMD64') { throw 'Este pacote Windows foi preparado para x64. Windows ARM64 ainda precisa de validação.' }
$Records = @(Import-Csv -Delimiter "`t" -LiteralPath (Join-Path $PSScriptRoot 'micromamba-platforms.tsv'))
$Record = @($Records | Where-Object { $_.platform -eq 'win-64' })
if ($Record.Count -ne 1 -or $Record[0].sha256 -notmatch '^[a-f0-9]{64}$' -or $Record[0].url -notlike 'https://github.com/mamba-org/micromamba-releases/releases/download/*') {
    throw 'Manifesto de instalação ausente ou inválido.'
}
$Record = $Record[0]
if ($PlanOnly) {
    Write-Host "Plataforma: win-64`nPrograma: $ProgramDir`nAmbiente: $RuntimeDir`nMicromamba: $($Record.version)"
    exit 0
}
if (-not (Test-Path -LiteralPath (Join-Path $SourceDir 'dist\learnflix.cjs')) -or -not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'launch.py'))) {
    throw 'Extraia o pacote completo antes de executar o instalador.'
}
New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null
$Temporary = Join-Path $ToolsDir ('.micromamba-' + [Guid]::NewGuid().ToString('N') + '.exe')
try {
    $NeedsDownload = -not (Test-Path -LiteralPath $Mamba)
    if (-not $NeedsDownload) { $NeedsDownload = (Get-FileHash -LiteralPath $Mamba -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Record.sha256 }
    if ($NeedsDownload) {
        Write-Host 'Learnflix — baixando o preparador oficial...'
        Invoke-WebRequest -Uri $Record.url -OutFile $Temporary -UseBasicParsing
        if ((Get-FileHash -LiteralPath $Temporary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Record.sha256) {
            throw 'O download não confere com o SHA-256 publicado. Nada será executado.'
        }
        Move-Item -LiteralPath $Temporary -Destination $Mamba -Force
    }
    $env:MAMBA_ROOT_PREFIX = Join-Path $InstallRoot 'mamba-cache'
    $Action = if (Test-Path -LiteralPath (Join-Path $RuntimeDir 'conda-meta\history')) { 'install' } else { 'create' }
    Write-Host 'Preparando Node, Python, FFmpeg e FFprobe...'
    Run-Checked $Mamba @('--no-rc', $Action, '--yes', '--prefix', $RuntimeDir, '--override-channels', '--channel', 'conda-forge', '--strict-channel-priority', 'nodejs>=22.5,<23', 'python=3.12', 'pip', 'ffmpeg')
    Run-Checked $Mamba @('--no-rc', 'run', '--prefix', $RuntimeDir, 'python', (Join-Path $PSScriptRoot 'install-support.py'), $SourceDir, $InstallRoot)
} finally {
    if (Test-Path -LiteralPath $Temporary) { Remove-Item -LiteralPath $Temporary -Force }
}
