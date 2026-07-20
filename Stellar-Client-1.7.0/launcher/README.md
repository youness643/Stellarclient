# Stellar Client Launcher 1.7.0

Launcher originale per Minecraft: Java Edition con interfaccia frameless, temi e integrazioni desktop.

## Incluso

- login Microsoft tramite device-code OAuth;
- collegamento Discord tramite Authorization Code + PKCE e callback loopback;
- invito del bot Discord e Rich Presence locale;
- verifica della proprietà di Minecraft Java;
- elenco dinamico release/snapshot dal manifest Mojang;
- profili Vanilla e Fabric separati;
- download di client, librerie, asset e natives;
- catalogo Modrinth filtrato per versione e loader;
- installazione con un clic e dipendenze obbligatorie ricorsive;
- preset Performance, Essential e PvP;
- gestione mod per profilo;
- amici, annunci, store, log e impostazioni;
- temi Aurora, Noctis, Frost e Tempest;
- finestra personalizzata senza cornice Windows.

## Avvio e controlli

```powershell
npm install
npm run check
npm start
```

## Discord OAuth desktop

Imposta l'Application ID e registra esattamente il redirect `http://127.0.0.1:8787/auth/discord/callback`. L'app deve consentire il flusso public-client; non inserire un client secret nel launcher. Il token OAuth viene cifrato tramite `safeStorage` di Electron quando disponibile.

## Build

```powershell
npm run dist:win
```

La consegna include anche `installer-bootstrap`, che scarica il runtime Electron ufficiale, verifica il checksum, installa `Minecraft.exe` nella cartella Stellar Client e crea collegamenti con il logo Stellar.

## Note legali

Stellar Client non è affiliato a Mojang Studios, Microsoft, Discord, Modrinth, Lunar Client o Feather/Dawn. Il design e il codice sono originali e non vengono distribuiti file di gioco Minecraft.
