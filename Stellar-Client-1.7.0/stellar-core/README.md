# Stellar Core 1.7.0 — Minecraft 1.21.8

Mod Fabric client-side che aggiunge:

- menu principale Stellar personalizzato;
- pulsanti Singleplayer, Multiplayer, Stellar Client, Store e Impostazioni;
- menu ESC trasparente/sfocato con hover viola, profilo, mod, HUD Editor, store e amici;
- pannello in-game a schede Moduli, Aspetto e Social;
- HUD FPS, coordinate, ping, CPS, server e orologio;
- keystrokes e stato durabilità armatura;
- scala HUD e temi icon-only Aurora, Noctis, Frost e Tempest;
- lettura sicura di store, social e nome Discord passati dal launcher come proprietà JVM.

## Build

Con Java 21 e Gradle 8.14.3:

```powershell
gradle clean build
```

Il file risultante è `build/libs/stellar-core-1.7.0.jar`.

## Compatibilità

Questa sorgente è impostata per Minecraft 1.21.8, Yarn `1.21.8+build.1`, Fabric Loader `0.19.3` e Fabric API `0.133.4+1.21.8`. Per altre versioni crea moduli separati e aggiorna mapping/API, poi verifica mixin e firme dei metodi.
