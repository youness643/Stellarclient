package it.stellarclient.core.mixin;

import it.stellarclient.core.StellarClientMod;
import it.stellarclient.core.config.StellarConfig;
import it.stellarclient.core.gui.render.StellarRender;
import it.stellarclient.core.gui.widget.StellarButton;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.GameMenuScreen;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.option.OptionsScreen;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Rounded, transparent pause menu with purple hover animation and a compact status card. */
@Mixin(GameMenuScreen.class)
public abstract class GameMenuScreenMixin extends Screen {
    private static final Identifier STELLAR_LOGO = Identifier.of("stellar_core", "textures/gui/stellar_logo.png");

    protected GameMenuScreenMixin(Text title) {
        super(title);
    }

    @Inject(method = "initWidgets", at = @At("HEAD"), cancellable = true)
    private void stellar$initWidgets(CallbackInfo ci) {
        if (!StellarClientMod.config().cleanPauseMenu || client == null) return;
        clearChildren();
        int panelX = Math.max(24, width / 2 - 292);
        int panelY = Math.max(28, height / 2 - 150);
        int menuW = 225;
        Screen current = (Screen) (Object) this;

        addDrawableChild(new StellarButton(panelX + 16, panelY + 56, menuW - 32, 26, Text.literal("RESUME GAME"),
                () -> client.setScreen(null), true));
        addDrawableChild(new StellarButton(panelX + 16, panelY + 89, menuW - 32, 25, Text.literal("STELLAR CLIENT"),
                StellarClientMod::openSettings));
        addDrawableChild(new StellarButton(panelX + 16, panelY + 120, menuW - 32, 25, Text.literal("MODS"),
                StellarClientMod::openSettings));
        addDrawableChild(new StellarButton(panelX + 16, panelY + 151, menuW - 32, 25, Text.literal("HUD EDITOR"),
                StellarClientMod::openHudEditor));
        addDrawableChild(new StellarButton(panelX + 16, panelY + 182, menuW - 32, 25, Text.literal("STORE"),
                StellarClientMod::openStore));
        addDrawableChild(new StellarButton(panelX + 16, panelY + 213, menuW - 32, 25, Text.literal("FRIENDS"),
                StellarClientMod::openCommunity));
        addDrawableChild(new StellarButton(panelX + 16, panelY + 244, menuW - 32, 25, Text.literal("OPTIONS"),
                () -> client.setScreen(new OptionsScreen(current, client.options))));
        addDrawableChild(new StellarButton(panelX + 16, panelY + 275, menuW - 32, 23, Text.literal("DISCONNECT"),
                client::disconnectWithSavingScreen));
        ci.cancel();
    }

    @Inject(method = "render", at = @At("HEAD"), cancellable = true)
    private void stellar$render(DrawContext context, int mouseX, int mouseY, float delta, CallbackInfo ci) {
        StellarConfig config = StellarClientMod.config();
        if (!config.cleanPauseMenu || client == null) return;

        if (config.blurPanels) context.applyBlur();
        context.fill(0, 0, width, height, 0x66020408);

        int panelX = Math.max(24, width / 2 - 292);
        int panelY = Math.max(28, height / 2 - 150);
        int menuW = 225;
        int menuH = 316;
        int cardX = panelX + menuW + 20;
        int cardW = Math.min(320, Math.max(236, width - cardX - 24));

        StellarRender.shadow(context, panelX, panelY, menuW, menuH, 18);
        StellarRender.roundedBorder(context, panelX, panelY, menuW, menuH, 18,
                StellarRender.alpha(config.accent(), 88), StellarRender.alpha(config.panel(), 218));
        context.drawTexturedQuad(STELLAR_LOGO, panelX + 16, panelY + 13, panelX + 48, panelY + 45,
                0.0F, 1.0F, 0.0F, 1.0F);
        context.drawTextWithShadow(textRenderer, Text.literal("stellarClient"), panelX + 56, panelY + 22, 0xFFF8F5FF);
        context.drawTextWithShadow(textRenderer, Text.literal(client.getGameVersion()), panelX + 145, panelY + 22, config.accent());

        StellarRender.shadow(context, cardX, panelY + 35, cardW, 238, 18);
        StellarRender.roundedBorder(context, cardX, panelY + 35, cardW, 238, 18,
                0x664A4356, StellarRender.alpha(config.panel(), 212));
        String playerName = client.player == null ? "StellarPlayer" : client.player.getName().getString();
        StellarRender.roundedRect(context, cardX + 18, panelY + 55, 38, 38, 11,
                StellarRender.alpha(config.accent(), 78));
        context.drawCenteredTextWithShadow(textRenderer, Text.literal(playerName.substring(0, 1).toUpperCase()),
                cardX + 37, panelY + 69, 0xFFF9F6FF);
        context.drawTextWithShadow(textRenderer, Text.literal(playerName), cardX + 70, panelY + 58, 0xFFF8F5FF);
        context.drawTextWithShadow(textRenderer, Text.literal(config.discordName.isBlank() ? "LOCAL PROFILE" : "DISCORD CONNECTED"),
                cardX + 70, panelY + 76, config.accent());

        int rowY = panelY + 112;
        drawRow(context, cardX, cardW, rowY, "FPS", Integer.toString(client.getCurrentFps()), 0xFFDCCFFF);
        drawRow(context, cardX, cardW, rowY + 29, "PING", StellarClientMod.currentPing() + " ms", 0xFF71F39A);
        String server = client.getCurrentServerEntry() == null ? "Singleplayer" : client.getCurrentServerEntry().address;
        drawRow(context, cardX, cardW, rowY + 58, "SERVER", server, config.accent());
        drawRow(context, cardX, cardW, rowY + 87, "PROFILE", config.activeProfile.toUpperCase(), 0xFFDCCFFF);

        StellarRender.roundedBorder(context, cardX + 16, panelY + 238, cardW - 32, 25, 8,
                0x4D5D536B, 0x9A111019);
        context.drawTextWithShadow(textRenderer, Text.literal("Discord Activity"), cardX + 28, panelY + 246, 0xFFE8E1F0);
        context.drawTextWithShadow(textRenderer, Text.literal(config.discordName.isBlank() ? "OFFLINE" : "CONNECTED"),
                cardX + cardW - 28 - textRenderer.getWidth(config.discordName.isBlank() ? "OFFLINE" : "CONNECTED"),
                panelY + 246, config.discordName.isBlank() ? 0xFF8D8597 : 0xFF71F39A);

        context.drawCenteredTextWithShadow(textRenderer, Text.literal("Right Shift  •  HUD Editor"), width / 2, height - 18, 0xFFB9AFC5);
        super.render(context, mouseX, mouseY, delta);
        ci.cancel();
    }

    private void drawRow(DrawContext context, int x, int width, int y, String label, String value, int color) {
        context.drawTextWithShadow(textRenderer, Text.literal(label), x + 20, y, 0xFF968DA2);
        int max = width - 96;
        String shown = value.length() > 26 ? value.substring(0, 23) + "..." : value;
        context.drawTextWithShadow(textRenderer, Text.literal(shown), x + width - 20 - Math.min(max, textRenderer.getWidth(shown)), y, color);
    }
}
