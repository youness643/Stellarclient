# Sicurezza delle credenziali

## Credenziali pubbliche

Application ID, Guild ID e Public Key Discord possono essere distribuiti nel client.

## Credenziali private

Non mettere mai nei sorgenti, nello ZIP o nel launcher:

- bot token;
- OAuth client secret;
- chiavi API backend;
- session secret;
- token OAuth degli utenti.

Il file `.env.example` contiene soltanto campi vuoti per questi valori. `configure-test.ps1` chiede segreti nuovi tramite input protetto e li salva nelle variabili ambiente dell'utente Windows.

Qualunque bot token o client secret inviato in chat, log o repository va rigenerato prima dei test.

## Admin

L'interfaccia non decide autonomamente chi è amministratore. Il backend legge membership e permessi Discord dopo OAuth e restituisce una sessione breve. Tutti gli endpoint `/admin/*` ripetono il controllo server-side.

## Economia

Stellar Coins, Premium, inventario, quest e acquisti sono salvati nel backend. Il launcher visualizza i dati ma non può assegnarsi Coins o Premium senza un endpoint autorizzato. Le azioni amministrative vengono registrate nell'audit log.
