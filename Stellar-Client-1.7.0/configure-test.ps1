$ErrorActionPreference = 'Stop'
Write-Host 'Stellar Client - configurazione test sicura' -ForegroundColor Magenta
Write-Host 'Le chiavi pubbliche e gli ID sono gia configurati. Inserisci solo credenziali NUOVE e rigenerate.' -ForegroundColor Yellow

function Read-PlainSecret([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

$botToken = Read-PlainSecret 'Nuovo Discord Bot Token'
$clientSecret = Read-PlainSecret 'Nuovo Discord Client Secret'
$apiKey = Read-PlainSecret 'Scegli una STELLAR_API_KEY lunga'
$sessionSecret = Read-PlainSecret 'Scegli una SESSION_SECRET lunga'
$adminRoles = Read-Host 'ADMIN_ROLE_IDS separati da virgola (vuoto = owner o permesso Administrator)'

$values = @{
  DISCORD_APPLICATION_ID = '1251494893407305791'
  DISCORD_PUBLIC_KEY = '320679e9439c7359477205ae68f2072c45999fd9ad0a36490a2464cc04500d84'
  DISCORD_GUILD_ID = '1528382367100571668'
  DISCORD_REDIRECT_URI = 'http://127.0.0.1:8787/auth/discord/callback'
  DISCORD_BOT_TOKEN = $botToken
  DISCORD_CLIENT_SECRET = $clientSecret
  STELLAR_API_KEY = $apiKey
  SESSION_SECRET = $sessionSecret
  ADMIN_ROLE_IDS = $adminRoles
  STELLAR_BACKEND_URL = 'http://127.0.0.1:8787'
}
foreach ($entry in $values.GetEnumerator()) {
  [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'User')
  Set-Item -Path "Env:$($entry.Key)" -Value $entry.Value
}
Write-Host 'Configurazione salvata nelle variabili utente di Windows. Nessun segreto e stato scritto nei sorgenti.' -ForegroundColor Green
