# Version support

## Launcher

The launcher reads Mojang's official version manifest at runtime and can create isolated Vanilla profiles for official releases from the 1.8 generation through the current 26.x generation. Snapshots are optional. The exact Java requirement is read from each version JSON and validated before launch.

Fabric appears only when Fabric Meta publishes a compatible loader for the selected Minecraft version. Forge, NeoForge and Quilt require separate installers and are not falsely exposed as working loaders in this build.

## Stellar Core in-game GUI

A custom menu/HUD mod cannot be one universal JAR across 1.8–26.x because Minecraft GUI classes, mappings, loader APIs and Java requirements changed repeatedly.

| Family | Intended loader | Core status in this delivery |
|---|---|---|
| 1.8.9 | Forge legacy | adapter specification only |
| 1.12.2 | Forge legacy | adapter specification only |
| 1.16.5 | Fabric/Forge | adapter specification only |
| 1.20.1 | Fabric | adapter specification only |
| 1.21.8 | Fabric | source implementation included |
| 26.1/26.2 | Fabric where available | adapter specification only |

Only the 1.21.8 Fabric source is implemented here. Each other family must be compiled and tested as a separate module before it may be published in a signed Core catalog.
