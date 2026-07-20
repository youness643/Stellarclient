# Stellar Client 1.7.0 — Complete Source

Progetto originale per Minecraft Java composto da launcher Windows, Stellar Core Fabric, backend social/economia, bot Discord e setup grafico.

## Novità 1.7.0

- Selettore atmosfera compatto in alto a sinistra: sole, luna, nuvola/tempesta e fiocco di neve.
- Rotazione completa a 360° con easing, nessuna tendina o miniatura al centro del menu.
- Panorama cubico Minecraft con rotazione continua, tinte atmosferiche e sfocatura leggera prima dei pannelli.
- Le versioni senza Fabric/Stellar Core restano selezionabili e partono automaticamente in Vanilla, senza nascondere Singleplayer o Multiplayer.
- Cartelle istanza, mod, config, shaderpack e salvataggi restano separate per versione e loader.

## Componenti

- `launcher/`: Electron frameless, Microsoft login, profili Vanilla/Fabric, Modrinth, amici, annunci, Store, Quest, Stellar Coins, Premium e Admin.
- `stellar-core/`: mod client-side Fabric 1.21.8 con logo ufficiale, menu principale, menu ESC, pannello moduli, HUD e pulsanti originali Stellar.
- `backend/`: OAuth Discord server-side, verifica membership/Administrator/ruoli, sessioni desktop, Stellar Coins, Premium, inventario, quest, acquisti e audit log.
- `discord-bot/`: slash command per stato, saldo, quest, Premium e gestione Coins riservata agli amministratori.
- `installer-bootstrap/`: setup Windows x64 con il logo caricato dall'utente, riprodotto più lentamente in loop durante l'installazione.

## Configurazione Discord già inserita

I valori pubblici sono già configurati:

```env
DISCORD_APPLICATION_ID=1251494893407305791
DISCORD_PUBLIC_KEY=320679e9439c7359477205ae68f2072c45999fd9ad0a36490a2464cc04500d84
DISCORD_GUILD_ID=1528382367100571668
DISCORD_REDIRECT_URI=http://127.0.0.1:8787/auth/discord/callback
```

Il pannello Admin viene mostrato solo se il backend verifica una di queste condizioni nel server configurato:

- proprietario del server;
- permesso Discord `Administrator`;
- ruolo presente in `ADMIN_ROLE_IDS`.

## Segreti

`DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_SECRET`, `STELLAR_API_KEY` e `SESSION_SECRET` non sono inclusi nei sorgenti. Esegui `configure-test.ps1` e inserisci credenziali nuove/rigenerate: lo script le salva nelle variabili utente di Windows, non nel repository.

## Avvio test su Windows

1. Installa Node.js 22 e Java 21.
2. Esegui `configure-test.ps1`.
3. Esegui `start-test.ps1`.
4. Avvia `Minecraft.exe` (bootstrap/setup).
5. Nel Discord Developer Portal registra il redirect locale indicato sopra.

## Protezione Minecraft vanilla

Stellar Core e il launcher non sostituiscono gli item, gli ID, i modelli o le texture vanilla. Le mod sono conservate in istanze separate per versione/loader. I cosmetici descritti nello Store sono entitlement del profilo; il rendering cosmetico multiplayer completo richiede il relativo modulo server/client futuro.

## Build

La workflow `.github/workflows/build.yml` esegue i controlli JavaScript, compila Stellar Core con Java 21/Gradle, prepara il pacchetto embedded e genera il setup Windows.

```powershell
./build-all.ps1
```

Stellar Core 1.7.0 è sorgente per Minecraft 1.21.8. Per altre famiglie di versioni servono moduli compilati separatamente, perché mapping e API cambiano.

## Stato della consegna

- launcher, backend, bot e setup: sorgenti completi e controlli sintattici superati;
- setup Windows x64: compilato;
- backend e bot: controlli sintattici eseguiti; i flussi Discord richiedono credenziali rigenerate e un test sul server reale;
- Stellar Core: sorgenti completi, ma la JAR non è stata compilata in questo ambiente perché il download di Gradle/Maven era bloccato dalla rete; la workflow GitHub inclusa la compila automaticamente.

Stellar Client non è affiliato a Mojang Studios, Microsoft, Discord, Modrinth, Lunar Client o Feather/Dawn. Non contiene asset o codice proprietari di altri client.
