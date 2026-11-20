@echo off
setlocal
rem Bootstrap normal com comandos estaticos. Nenhuma politica de seguranca e alterada.
set "LF_SOURCE=%~dp0.."
set "LF_INSTALL_ROOT=%LOCALAPPDATA%\Learnflix"
if defined LEARNFLIX_INSTALL_ROOT set "LF_INSTALL_ROOT=%LEARNFLIX_INSTALL_ROOT%"
if not defined LOCALAPPDATA (
  echo LOCALAPPDATA nao esta definido para este usuario.
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $arch=if($env:PROCESSOR_ARCHITEW6432){$env:PROCESSOR_ARCHITEW6432}else{$env:PROCESSOR_ARCHITECTURE}; if($arch -ne 'AMD64'){throw 'Este instalador Windows exige x64; ARM64 ainda nao foi validado.'}; if(-not [IO.Path]::IsPathRooted($env:LF_INSTALL_ROOT)){throw 'A raiz da instalacao precisa ser absoluta.'}; $rows=@(Import-Csv -Delimiter ([char]9) -LiteralPath (Join-Path $env:LF_SOURCE 'native\micromamba-platforms.tsv') | Where-Object {$_.platform -eq 'win-64'}); if($rows.Count -ne 1){throw 'Manifesto invalido.'}; $r=$rows[0]; if($r.sha256 -notmatch '^[a-f0-9]{64}$' -or $r.url -notlike 'https://github.com/mamba-org/micromamba-releases/releases/download/*'){throw 'Manifesto invalido.'}; $tools=Join-Path $env:LF_INSTALL_ROOT 'tools'; New-Item -ItemType Directory -Force -Path $tools | Out-Null; $dest=Join-Path $tools 'micromamba.exe'; $needed=-not(Test-Path -LiteralPath $dest); if(-not $needed){$needed=(Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant() -ne $r.sha256}; if($needed){$temp=Join-Path $tools ('.micromamba-'+[Guid]::NewGuid().ToString('N')+'.exe'); try{Invoke-WebRequest -Uri $r.url -OutFile $temp -UseBasicParsing; if((Get-FileHash -LiteralPath $temp -Algorithm SHA256).Hash.ToLowerInvariant() -ne $r.sha256){throw 'Download recusado: SHA256 nao confere.'}; Move-Item -LiteralPath $temp -Destination $dest -Force}finally{if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Force}}}"
if errorlevel 1 goto failed
if not exist "%LF_SOURCE%\native\launch.py" (
  echo Extraia o pacote completo antes de executar o instalador.
  goto failed
)
if not exist "%LF_SOURCE%\dist\learnflix.cjs" (
  echo Extraia o pacote completo antes de executar o instalador.
  goto failed
)
set "MAMBA_ROOT_PREFIX=%LF_INSTALL_ROOT%\mamba-cache"
set "LF_ACTION=create"
if exist "%LF_INSTALL_ROOT%\runtime\conda-meta\history" set "LF_ACTION=install"
echo Preparando Node, Python, FFmpeg e FFprobe...
"%LF_INSTALL_ROOT%\tools\micromamba.exe" --no-rc %LF_ACTION% --yes --prefix "%LF_INSTALL_ROOT%\runtime" --override-channels --channel conda-forge --strict-channel-priority "nodejs>=22.5,<23" "python=3.12" pip ffmpeg
if errorlevel 1 goto failed
"%LF_INSTALL_ROOT%\tools\micromamba.exe" --no-rc run --prefix "%LF_INSTALL_ROOT%\runtime" python "%LF_SOURCE%\native\install-support.py" "%LF_SOURCE%" "%LF_INSTALL_ROOT%"
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo A instalacao nao foi concluida. Leia a mensagem acima.
echo Se o Windows ou uma politica de seguranca bloquear, nao contorne o bloqueio.
pause
exit /b 1
