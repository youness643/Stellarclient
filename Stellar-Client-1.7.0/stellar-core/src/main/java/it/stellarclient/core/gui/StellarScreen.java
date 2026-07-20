package it.stellarclient.core.gui;

import it.stellarclient.core.StellarClientMod;
import it.stellarclient.core.config.StellarConfig;
import it.stellarclient.core.gui.render.StellarRender;
import it.stellarclient.core.gui.widget.StellarButton;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/** Transparent, profile-based module center opened from ESC. */
public final class StellarScreen extends Screen {
    private static final Identifier STELLAR_LOGO = Identifier.of("stellar_core", "textures/gui/stellar_logo.png");
    private static final int PANEL_WIDTH = 780;
    private static final int PANEL_HEIGHT = 470;
    private final Screen parent;
    private final List<ModuleCard> visibleModules = new ArrayList<>();
    private Tab tab = Tab.MODULES;
    private Category category = Category.ALL;

    public StellarScreen(Screen parent) {
        super(Text.literal("Stellar Client"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        visibleModules.clear();
        int panelWidth = Math.min(PANEL_WIDTH, width - 28);
        int panelHeight = Math.min(PANEL_HEIGHT, height - 28);
        int left = (width - panelWidth) / 2;
        int top = (height - panelHeight) / 2;

        addTab(left + 166, top + 18, 104, Tab.MODULES, "MODULI");
        addTab(left + 276, top + 18, 104, Tab.SETTINGS, "IMPOSTAZIONI");
        addTab(left + 386, top + 18, 104, Tab.WAYPOINTS, "WAYPOINTS");
        addDrawableChild(new StellarButton(left + panelWidth - 84, top + 15, 66, 22, Text.literal("CHIUDI"), this::close));

        addProfile(left + 14, top + 76, "default", "DEFAULT");
        addProfile(left + 14, top + 110, "pvp", "PVP PROFILE");
        addProfile(left + 14, top + 144, "uhc", "UHC PROFILE");
        addProfile(left + 14, top + 178, "survival", "SURVIVAL");
        addDrawableChild(new StellarButton(left + 14, top + panelHeight - 46, 126, 23, Text.literal("+ NUOVO PROFILO"), () -> {
            StellarClientMod.config().activeProfile = "custom";
            StellarClientMod.config().save();
            clearAndInit();
        }));

        if (tab == Tab.MODULES) initModules(left, top, panelWidth, panelHeight);
        if (tab == Tab.SETTINGS) initSettings(left, top, panelWidth, panelHeight);
        if (tab == Tab.WAYPOINTS) initWaypoints(left, top, panelWidth, panelHeight);
    }

    private void addTab(int x, int y, int width, Tab target, String label) {
        addDrawableChild(new StellarButton(x, y, width, 24, Text.literal(label), () -> {
            tab = target;
            clearAndInit();
        }, tab == target));
    }

    private void addProfile(int x, int y, String id, String label) {
        boolean selected = StellarClientMod.config().activeProfile.equals(id);
        addDrawableChild(new StellarButton(x, y, 126, 26, Text.literal(label), () -> {
            StellarClientMod.config().activeProfile = id;
            StellarClientMod.config().save();
            clearAndInit();
        }, selected));
    }

    private void initModules(int left, int top, int panelWidth, int panelHeight) {
        int contentLeft = left + 162;
        int categoryY = top + 61;
        int categoryX = contentLeft;
        for (Category item : Category.values()) {
            int buttonWidth = item == Category.ALL ? 54 : 72;
            addDrawableChild(new StellarButton(categoryX, categoryY, buttonWidth, 22, Text.literal(item.label), () -> {
                category = item;
                clearAndInit();
            }, category == item));
            categoryX += buttonWidth + 6;
        }
        addDrawableChild(new StellarButton(left + panelWidth - 158, categoryY, 140, 22, Text.literal("MODRINTH / LAUNCHER"), StellarClientMod::openCommunity));

        List<ModuleCard> modules = moduleDefinitions();
        int cardWidth = Math.max(120, (panelWidth - 204) / 4);
        int cardHeight = 104;
        int index = 0;
        for (ModuleCard module : modules) {
            if (category != Category.ALL && module.category != category) continue;
            if (index >= 12) break;
            int col = index % 4;
            int row = index / 4;
            int x = contentLeft + col * (cardWidth + 8);
            int y = top + 98 + row * (cardHeight + 9);
            ModuleCard placed = module.at(x, y, cardWidth, cardHeight);
            visibleModules.add(placed);
            addDrawableChild(new StellarButton(x + 9, y + cardHeight - 30, cardWidth - 54, 21,
                    Text.literal("OPZIONI"), () -> openModuleOptions(placed)));
            addDrawableChild(new StellarButton(x + cardWidth - 38, y + cardHeight - 30, 29, 21,
                    Text.literal(placed.enabled.getAsBoolean() ? "●" : "○"), () -> {
                placed.setter.accept(!placed.enabled.getAsBoolean());
                StellarClientMod.config().save();
                clearAndInit();
            }, placed.enabled.getAsBoolean()));
            index++;
        }
        addDrawableChild(new StellarButton(contentLeft, top + panelHeight - 46, 164, 23, Text.literal("MODIFICA HUD  ⇧"),
                StellarClientMod::openHudEditor, true));
    }

    private void initSettings(int left, int top, int panelWidth, int panelHeight) {
        StellarConfig config = StellarClientMod.config();
        int x = left + 174;
        int y = top + 80;
        addDrawableChild(toggle(x, y, 244, "MENU PRINCIPALE CUSTOM", () -> config.customTitleScreen, value -> config.customTitleScreen = value));
        addDrawableChild(toggle(x + 256, y, 244, "MENU ESC CUSTOM", () -> config.cleanPauseMenu, value -> config.cleanPauseMenu = value));
        addDrawableChild(toggle(x, y + 38, 244, "SFONDO SFUMATO", () -> config.blurPanels, value -> config.blurPanels = value));
        addDrawableChild(toggle(x + 256, y + 38, 244, "ANIMAZIONI LEGGERE", () -> config.backgroundMotion, value -> config.backgroundMotion = value));
        addDrawableChild(toggle(x, y + 76, 244, "HUD COMPATTO", () -> config.compactHud, value -> config.compactHud = value));
        addDrawableChild(new StellarButton(x + 256, y + 76, 116, 24, Text.literal("OPACITÀ -"), () -> {
            config.panelOpacity = Math.max(55, config.panelOpacity - 5); config.save();
        }));
        addDrawableChild(new StellarButton(x + 384, y + 76, 116, 24, Text.literal("OPACITÀ +"), () -> {
            config.panelOpacity = Math.min(100, config.panelOpacity + 5); config.save();
        }, true));
        addDrawableChild(new StellarButton(x, y + 124, 116, 24, Text.literal("HUD -"), () -> {
            config.hudScale = Math.max(65, config.hudScale - 5); config.save();
        }));
        addDrawableChild(new StellarButton(x + 128, y + 124, 116, 24, Text.literal("HUD +"), () -> {
            config.hudScale = Math.min(160, config.hudScale + 5); config.save();
        }, true));
        addDrawableChild(new StellarButton(x + 256, y + 124, 244, 24, Text.literal("CAMBIA TEMA"), () -> {
            config.cycleTheme(); clearAndInit();
        }));
        addDrawableChild(new StellarButton(x, top + panelHeight - 46, 174, 23, Text.literal("APRI HUD EDITOR"), StellarClientMod::openHudEditor, true));
    }

    private StellarButton toggle(int x, int y, int width, String label, BooleanSupplier getter, Consumer<Boolean> setter) {
        return new StellarButton(x, y, width, 25, Text.literal(label + (getter.getAsBoolean() ? "   ON" : "   OFF")), () -> {
            setter.accept(!getter.getAsBoolean());
            StellarClientMod.config().save();
            clearAndInit();
        }, getter.getAsBoolean());
    }

    private void initWaypoints(int left, int top, int panelWidth, int panelHeight) {
        int x = left + 174;
        int y = top + 90;
        addDrawableChild(new StellarButton(x, y, 238, 26, Text.literal("WAYPOINTS: " + (StellarClientMod.config().waypoints ? "ON" : "OFF")), () -> {
            StellarClientMod.config().waypoints = !StellarClientMod.config().waypoints;
            StellarClientMod.config().save();
            clearAndInit();
        }, StellarClientMod.config().waypoints));
        addDrawableChild(new StellarButton(x + 250, y, 238, 26, Text.literal("GESTISCI DAL LAUNCHER"), StellarClientMod::openCommunity));
    }

    private void openModuleOptions(ModuleCard module) {
        if (client != null) client.setScreen(new ModuleOptionsScreen(this, module.id, module.title));
    }

    private List<ModuleCard> moduleDefinitions() {
        StellarConfig c = StellarClientMod.config();
        List<ModuleCard> result = new ArrayList<>();
        result.add(module("fps", "FPS", "Fotogrammi in tempo reale", Category.HUD, () -> c.fps, value -> c.fps = value));
        result.add(module("hud", "HUD", "Editor e layout responsive", Category.HUD, () -> true, ignored -> {}));
        result.add(module("scoreboard", "Scoreboard", "Mostra o nasconde la sidebar", Category.HUD, () -> c.scoreboard, value -> c.scoreboard = value));
        result.add(module("chat", "Chat", "Visibilità chat vanilla", Category.CHAT, () -> c.chat, value -> c.chat = value));
        result.add(module("autotext", "AutoText", "Messaggi rapidi per profilo", Category.CHAT, () -> c.autoText, value -> c.autoText = value));
        result.add(module("zoom", "Zoom", "Zoom fluido con tasto Z", Category.UTILITY, () -> c.zoom, value -> c.zoom = value));
        result.add(module("armor", "Armor Status", "Durabilità senza cambiare item", Category.HUD, () -> c.armorStatus, value -> c.armorStatus = value));
        result.add(module("keys", "Keystrokes", "WASD, mouse e CPS", Category.PVP, () -> c.keystrokes, value -> c.keystrokes = value));
        result.add(module("cps", "CPS", "Click al secondo", Category.PVP, () -> c.cps, value -> c.cps = value));
        result.add(module("sprint", "Toggle Sprint", "Mantiene lo sprint attivo", Category.PVP, () -> c.toggleSprint, value -> c.toggleSprint = value));
        result.add(module("waypoints", "Waypoints", "Punti salvati per profilo", Category.UTILITY, () -> c.waypoints, value -> c.waypoints = value));
        result.add(module("replay", "Replay", FabricLoader.getInstance().isModLoaded("replaymod") ? "ReplayMod rilevata" : "Integrazione installabile", Category.RENDER, () -> c.replayIntegration, value -> c.replayIntegration = value));
        result.add(module("coords", "Coordinates", "XYZ e bioma", Category.HUD, () -> c.coordinates, value -> c.coordinates = value));
        result.add(module("ping", "Ping", "Latenza server", Category.HUD, () -> c.ping, value -> c.ping = value));
        result.add(module("clock", "Clock", "Ora locale", Category.HUD, () -> c.clock, value -> c.clock = value));
        result.add(module("server", "Server", "Badge e stato server", Category.HUD, () -> c.serverBadge, value -> c.serverBadge = value));
        return result;
    }

    private ModuleCard module(String id, String title, String description, Category category, BooleanSupplier enabled, Consumer<Boolean> setter) {
        return new ModuleCard(id, title, description, category, enabled, setter, 0, 0, 0, 0);
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        renderBackground(context, mouseX, mouseY, delta);
        context.fill(0, 0, width, height, 0x54040509);
        int panelWidth = Math.min(PANEL_WIDTH, width - 28);
        int panelHeight = Math.min(PANEL_HEIGHT, height - 28);
        int left = (width - panelWidth) / 2;
        int top = (height - panelHeight) / 2;
        StellarRender.shadow(context, left, top, panelWidth, panelHeight, 16);
        StellarRender.roundedBorder(context, left, top, panelWidth, panelHeight, 16, 0x75554D65, StellarClientMod.config().panel());
        context.fill(left + 150, top + 52, left + 151, top + panelHeight - 16, 0x403B3547);
        context.drawTexturedQuad(STELLAR_LOGO, left + 16, top + 15, left + 48, top + 47, 0.0F, 1.0F, 0.0F, 1.0F);
        context.drawTextWithShadow(textRenderer, Text.literal("STELLAR CLIENT"), left + 56, top + 20, 0xFFF8F5FF);
        context.drawTextWithShadow(textRenderer, Text.literal("CORE " + StellarClientMod.VERSION), left + 56, top + 34, StellarClientMod.config().accent());
        context.drawTextWithShadow(textRenderer, Text.literal("PROFILI"), left + 18, top + 60, 0xFF90879E);

        if (tab == Tab.MODULES) {
            for (ModuleCard card : visibleModules) drawModuleCard(context, card, mouseX, mouseY);
        } else if (tab == Tab.SETTINGS) {
            drawSettingsInfo(context, left, top);
        } else {
            context.drawTextWithShadow(textRenderer, Text.literal("I waypoint restano separati per profilo e versione."), left + 174, top + 142, 0xFFB8AFC7);
            context.drawTextWithShadow(textRenderer, Text.literal("Nessun item, blocco o registro vanilla viene modificato."), left + 174, top + 160, 0xFF8F879E);
        }
        super.render(context, mouseX, mouseY, delta);
    }

    private void drawModuleCard(DrawContext context, ModuleCard card, int mouseX, int mouseY) {
        boolean hovered = mouseX >= card.x && mouseX <= card.x + card.width && mouseY >= card.y && mouseY <= card.y + card.height;
        int border = hovered ? StellarRender.alpha(StellarClientMod.config().accent(), 170) : 0x58423B4E;
        int fill = card.enabled.getAsBoolean() ? 0xC9111018 : 0xB90D0C12;
        StellarRender.roundedBorder(context, card.x, card.y, card.width, card.height, 10, border, fill);
        int iconColor = card.enabled.getAsBoolean() ? StellarClientMod.config().accent() : 0xFF756D82;
        StellarRender.roundedRect(context, card.x + 10, card.y + 10, 28, 28, 9, StellarRender.alpha(iconColor, 72));
        context.drawCenteredTextWithShadow(textRenderer, Text.literal(card.title.substring(0, 1).toUpperCase(Locale.ROOT)), card.x + 24, card.y + 20, iconColor);
        context.drawTextWithShadow(textRenderer, Text.literal(card.title), card.x + 46, card.y + 13, 0xFFF5F2FA);
        context.drawTextWithShadow(textRenderer, Text.literal(card.description), card.x + 10, card.y + 48, 0xFF8F879E);
    }

    private void drawSettingsInfo(DrawContext context, int left, int top) {
        StellarConfig config = StellarClientMod.config();
        context.drawTextWithShadow(textRenderer, Text.literal("TEMA ATTIVO"), left + 174, top + 238, 0xFF8F879E);
        context.drawTextWithShadow(textRenderer, Text.literal(config.theme.toUpperCase(Locale.ROOT)), left + 174, top + 255, config.accent());
        context.drawTextWithShadow(textRenderer, Text.literal("HUD " + config.hudScale + "%  •  PANNELLI " + config.panelOpacity + "%"), left + 174, top + 278, 0xFFB8AFC7);
        context.drawTextWithShadow(textRenderer, Text.literal("Le impostazioni vengono salvate automaticamente."), left + 174, top + 310, 0xFF8F879E);
    }

    @Override
    public void close() {
        StellarClientMod.config().save();
        if (client != null) client.setScreen(parent);
    }

    @Override
    public boolean shouldPause() {
        return true;
    }

    private enum Tab { MODULES, SETTINGS, WAYPOINTS }
    private enum Category {
        ALL("TUTTE"), HUD("HUD"), PVP("PVP"), UTILITY("UTILITY"), CHAT("CHAT"), RENDER("RENDER");
        final String label;
        Category(String label) { this.label = label; }
    }

    private record ModuleCard(String id, String title, String description, Category category,
                              BooleanSupplier enabled, Consumer<Boolean> setter,
                              int x, int y, int width, int height) {
        ModuleCard at(int x, int y, int width, int height) {
            return new ModuleCard(id, title, description, category, enabled, setter, x, y, width, height);
        }
    }
}
