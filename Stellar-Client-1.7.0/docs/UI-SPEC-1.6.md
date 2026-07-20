# Stellar Client UI 1.6

## Main menu atmosphere control

- One circular, icon-only control in the upper-left corner.
- Click order: sun → moon → cloud/storm → snowflake → sun.
- Each click performs a 360-degree eased rotation while switching the active background.
- Background uses Minecraft’s rotating cube-map panorama, with slow continuous movement, atmosphere-specific tint/effects and a light blur before UI panels are drawn.
- No theme labels or thumbnail strip are displayed in the center or bottom of the title screen.
- Every menu option uses the same smooth purple hover language as the Stellar Client primary action.

## Compatibility

The launcher lists official Minecraft Java releases from 1.8 onward. When Fabric or a matching Stellar Core adapter is unavailable, the profile is retained and launched as clean Vanilla with the default Minecraft title, singleplayer and multiplayer screens. Each version has an isolated instance folder.
