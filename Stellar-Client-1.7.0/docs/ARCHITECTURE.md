# Architettura Stellar Client 1.7.0

## Launcher desktop

Electron usa `contextIsolation`, preload limitato e IPC espliciti. Le credenziali Microsoft e Discord vengono salvate con `safeStorage` quando disponibile. Il launcher non riceve né conserva il token del bot Discord.

Il flusso Discord desktop usa Authorization Code con PKCE, `state` casuale e callback HTTP loopback. L'invito bot è un flusso separato con scope `bot applications.commands`.

## Minecraft runtime

Il motore risolve manifest Mojang, librerie, asset e natives. Ogni profilo usa una directory isolata. Il catalogo Modrinth filtra per versione/loader e installa ricorsivamente le dipendenze obbligatorie prima della mod principale, verificando hash e dimensione quando forniti.

## Stellar Core

Mod Fabric client-side compilata per una famiglia precisa di Minecraft. Mixin separati personalizzano TitleScreen e GameMenuScreen. La configurazione locale è una properties atomica e non contiene token.

## Backend e bot

Il backend espone friends/presence/announcements/store e un callback OAuth Discord server-side destinato a sito/dashboard. Il bot usa `discord.js`, slash command e consulta il backend tramite HTTP. Token e client secret devono rimanere nelle variabili del server.

## Store

La consegna contiene UI e catalogo di esempio, non un sistema di pagamento. Un checkout reale richiede un provider di pagamento, webhook verificati, database, inventario cosmetici e controllo server-side delle entitlement.
