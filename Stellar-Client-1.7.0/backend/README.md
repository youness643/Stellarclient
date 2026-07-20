# Stellar Social Backend 1.7.0

Backend Node.js senza dipendenze runtime esterne per OAuth Discord, verifica Admin, amici/presenza, annunci, Store, Stellar Coins, Premium, quest, acquisti e audit log.

## Avvio

```powershell
node server.js
```

Usa le variabili mostrate in `.env.example`. I valori pubblici dell'app Discord e del server sono già inseriti; token, client secret e chiavi interne restano vuoti.

## Endpoint pubblici

- `GET /health`
- `GET /announcements`
- `GET /store`
- `GET /bot/invite`
- `POST /interactions`

## Sessione desktop

- `POST /auth/discord/desktop/start`
- `GET /auth/discord/desktop/authorize`
- `GET /auth/discord/callback`
- `GET /auth/discord/desktop/status`
- `GET /client/me`

## Profilo

- `GET /client/quests`
- `POST /client/quests/event`
- `POST /client/quests/claim`
- `GET /client/store`
- `POST /client/store/purchase`
- `GET|POST|DELETE /friends`
- `POST /presence`

## Admin

- `GET /admin/overview`
- `POST /admin/announcements`
- `POST /admin/coins`
- `POST /admin/premium`
- `POST /admin/quests`

Gli endpoint Admin richiedono una sessione Discord verificata come owner, Administrator o ruolo configurato. Per produzione sostituisci il file JSON con un database transazionale, usa HTTPS e session storage condiviso.
