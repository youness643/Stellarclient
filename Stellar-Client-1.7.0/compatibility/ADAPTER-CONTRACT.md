# Stellar Core adapter contract

Every version adapter must provide the same user-facing contract:

- custom title screen and rounded pause screen;
- Right Shift HUD editor;
- FPS, ping, coordinates, CPS, keystrokes, armor, clock and server widgets;
- Chat and Scoreboard visibility toggles;
- client-only zoom;
- no item, block, registry or vanilla resource replacement;
- config stored inside the isolated profile;
- semantic version and SHA-512 published in the Core catalog.

Adapters are separate build targets. They must not share obfuscated class names or copy proprietary client assets.
