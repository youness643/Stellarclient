# Discord Setup — Stellar Client 1.7.0

## Valori pubblici già configurati

```text
Application ID: 1251494893407305791
Public Key: 320679e9439c7359477205ae68f2072c45999fd9ad0a36490a2464cc04500d84
Guild ID: 1528382367100571668
Redirect locale: http://127.0.0.1:8787/auth/discord/callback
```

## Developer Portal

1. Apri OAuth2 e aggiungi il redirect locale esatto.
2. Abilita l'applicazione come public client quando richiesto per i flussi desktop.
3. Aggiungi il bot al server con gli scope `bot` e `applications.commands`.
4. Registra i comandi con `npm run register` nella cartella `discord-bot`.
5. Per le interazioni HTTP, configura l'endpoint pubblico `/interactions` sul tuo dominio HTTPS.

## Avvio sicuro

Esegui dalla radice:

```powershell
./configure-test.ps1
./start-test.ps1
```

Lo script di configurazione richiede un token bot e client secret nuovi. Non scrive i segreti nei file.

## Accesso Admin

Il backend concede Admin al proprietario del server, a chi possiede il permesso `Administrator` oppure a un ruolo elencato in `ADMIN_ROLE_IDS` (ID separati da virgola). Lasciando `ADMIN_ROLE_IDS` vuoto, funzionano proprietario e permesso Administrator.
