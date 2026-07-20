$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$required = @('DISCORD_BOT_TOKEN','DISCORD_CLIENT_SECRET','STELLAR_API_KEY','SESSION_SECRET')
foreach ($name in $required) {
  $value = [Environment]::GetEnvironmentVariable($name, 'User')
  if (-not $value) { throw "Variabile $name mancante. Avvia prima configure-test.ps1" }
  Set-Item -Path "Env:$name" -Value $value
}

$public = @{
  DISCORD_APPLICATION_ID='1251494893407305791';
  DISCORD_PUBLIC_KEY='320679e9439c7359477205ae68f2072c45999fd9ad0a36490a2464cc04500d84';
  DISCORD_GUILD_ID='1528382367100571668';
  DISCORD_REDIRECT_URI='http://127.0.0.1:8787/auth/discord/callback';
  PUBLIC_BASE_URL='http://127.0.0.1:8787';
  STELLAR_BACKEND_URL='http://127.0.0.1:8787'
}
foreach ($entry in $public.GetEnumerator()) { Set-Item -Path "Env:$($entry.Key)" -Value $entry.Value }
$adminRoles = [Environment]::GetEnvironmentVariable('ADMIN_ROLE_IDS', 'User')
if ($adminRoles) { $env:ADMIN_ROLE_IDS = $adminRoles }

if (-not (Test-Path (Join-Path $root 'discord-bot\node_modules\discord.js'))) {
  Write-Host 'Installazione dipendenze Discord bot...' -ForegroundColor Cyan
  Push-Location (Join-Path $root 'discord-bot')
  npm install
  Pop-Location
}

Write-Host 'Registrazione slash command nel server di test...' -ForegroundColor Cyan
Push-Location (Join-Path $root 'discord-bot')
npm run register
Pop-Location

Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$root\backend'; node server.js"
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$root\discord-bot'; node bot.js"
Write-Host 'Backend e bot avviati su http://127.0.0.1:8787.' -ForegroundColor Green
