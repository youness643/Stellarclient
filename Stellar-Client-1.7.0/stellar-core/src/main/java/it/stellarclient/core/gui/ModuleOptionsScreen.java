package it.stellarclient.core.gui;

import it.stellarclient.core.StellarClientMod;
import it.stellarclient.core.config.StellarConfig;
import it.stellarclient.core.gui.render.StellarRender;
import it.stellarclient.core.gui.widget.StellarButton;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;

/** Compact per-module options page. */
public final class ModuleOptionsScreen extends Screen {
    private final Screen parent;
    private final String moduleId;
    private final String moduleName;

    public ModuleOptionsScreen(Screen parent, String moduleId, String moduleName) {
        super(Text.literal(moduleName + " options"));
        this.parent = parent;
        this.moduleId = moduleId;
        this.moduleName = moduleName;
    }

    @Override
    protected void init() {
        int panelWidth = Math.min(420, width - 32);
        int left = (width - panelWidth) / 2;
        int top = Math.max(50, height / 2 - 130);
        StellarConfig config = StellarClientMod.config();

        addDrawableChild(new StellarButton(left + 18, top + 202, 92, 23, Text.literal("INDIETRO"), this::close));
        if (moduleId.equals("zoom")) {
            addDrawableChild(new StellarButton(left + 18, top + 92, 116, 25, Text.literal("ZOOM -"), () -> {
                config.zoomPercent = Math.max(15, config.zoomPercent - 5); config.save();
            }));
            addDrawableChild(new StellarButton(left + 146, top + 92, 116, 25, Text.literal("ZOOM +"), () -> {
                config.zoomPercent = Math.min(70, config.zoomPercent + 5); config.save();
            }, true));
        } else if (isHudModule()) {
            addDrawableChild(new StellarButton(left + 18, top + 92, 244, 25, Text.literal("APRI HUD EDITOR"), StellarClientMod::openHudEditor, true));
        } else if (moduleId.equals("replay") || moduleId.equals("waypoints") || moduleId.equals("autotext")) {
            addDrawableChild(new StellarButton(left + 18, top + 92, 244, 25, Text.literal("GESTISCI DAL LAUNCHER"), StellarClientMod::openCommunity, true));
        }
    }

    private boolean isHudModule() {
        return moduleId.equals("fps") || moduleId.equals("hud") || moduleId.equals("armor") ||
                moduleId.equals("keys") || moduleId.equals("cps") || moduleId.equals("coords") ||
                moduleId.equals("ping") || moduleId.equals("clock") || moduleId.equals("server");
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        renderBackground(context, mouseX, mouseY, delta);
        context.fill(0, 0, width, height, 0x50040509);
        int panelWidth = Math.min(420, width - 32);
        int left = (width - panelWidth) / 2;
        int top = Math.max(50, height / 2 - 130);
        StellarRender.shadow(context, left, top, panelWidth, 244, 16);
        StellarRender.roundedBorder(context, left, top, panelWidth, 244, 16, 0x75554D65, StellarClientMod.config().panel());
        context.drawTextWithShadow(textRenderer, Text.literal(moduleName.toUpperCase()), left + 18, top + 20, 0xFFF8F5FF);
        context.drawTextWithShadow(textRenderer, Text.literal("IMPOSTAZIONI MODULO"), left + 18, top + 38, StellarClientMod.config().accent());

        if (moduleId.equals("zoom")) {
            context.drawTextWithShadow(textRenderer, Text.literal("Intensità zoom: " + StellarClientMod.config().zoomPercent + "%"), left + 18, top + 65, 0xFFB8AFC7);
            context.drawTextWithShadow(textRenderer, Text.literal("Tieni premuto Z durante il gioco."), left + 18, top + 132, 0xFF8F879E);
        } else if (isHudModule()) {
            context.drawTextWithShadow(textRenderer, Text.literal("Posizione, scala e trasparenza vengono gestite nell'HUD Editor."), left + 18, top + 65, 0xFFB8AFC7);
            context.drawTextWithShadow(textRenderer, Text.literal("Scorciatoia predefinita: Maiusc destro."), left + 18, top + 132, 0xFF8F879E);
        } else {
            context.drawTextWithShadow(textRenderer, Text.literal("Questo modulo usa il profilo attivo del launcher."), left + 18, top + 65, 0xFFB8AFC7);
            context.drawTextWithShadow(textRenderer, Text.literal("Le dipendenze esterne vengono installate solo su richiesta."), left + 18, top + 132, 0xFF8F879E);
        }
        super.render(context, mouseX, mouseY, delta);
    }

    @Override
    public void close() {
        if (client != null) client.setScreen(parent);
    }
}
