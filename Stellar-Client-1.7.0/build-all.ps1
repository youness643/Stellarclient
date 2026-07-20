$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Push-Location (Join-Path $root 'launcher')
npm run check
Pop-Location

Push-Location (Join-Path $root 'backend')
npm run check
Pop-Location

Push-Location (Join-Path $root 'discord-bot')
npm run check
Pop-Location

& (Join-Path $root 'stellar-core\build.ps1')

$embed = Join-Path $root 'installer-bootstrap\embed'
$appZip = Join-Path $embed 'app.zip'
if (Test-Path $appZip) { Remove-Item -Force $appZip }
Push-Location (Join-Path $root 'launcher')
Compress-Archive -Force -Path package.json,src,build,LICENSE,THIRD_PARTY_NOTICES.md,README.md -DestinationPath $appZip
Pop-Location
Copy-Item -Force (Join-Path $root 'launcher\src\renderer\assets\logo-loop.mp4') (Join-Path $embed 'logo-loop.mp4')
Set-Content -NoNewline (Join-Path $embed 'app-version.txt') '1.7.0'

if (Get-Command go -ErrorAction SilentlyContinue) {
  Push-Location (Join-Path $root 'installer-bootstrap')
  $env:GOOS='windows'; $env:GOARCH='amd64'; $env:CGO_ENABLED='0'
  go build -trimpath -ldflags '-H=windowsgui -s -w' -o (Join-Path $root 'Stellar-Client-Setup-1.7.0.exe') .
  Pop-Location
}
Write-Host 'Build Stellar Client completata.' -ForegroundColor Green
