package it.stellarclient.core.mixin;

import it.stellarclient.core.StellarClientMod;
import it.stellarclient.core.config.StellarConfig;
import it.stellarclient.core.gui.render.StellarRender;
import it.stellarclient.core.gui.widget.AtmosphereButton;
import it.stellarclient.core.gui.widget.StellarButton;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.TitleScreen;
import net.minecraft.client.gui.screen.multiplayer.MultiplayerScreen;
import net.minecraft.client.gui.screen.option.OptionsScreen;
import net.minecraft.client.gui.screen.world.SelectWorldScreen;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Original Stellar title screen. It overlays client UI and never replaces vanilla item assets. */
@Mixin(TitleScreen.class)
public abstract class TitleScreenMixin extends Screen {
    private static final Identifier STELLAR_LOGO = Identifier.of("stellar_core", "textures/gui/stellar_logo.png");


    protected TitleScreenMixin(Text title) {
        super(title);
    }

    @Inject(method = "init", at = @At("HEAD"), cancellable = true)
    private void stellar$init(CallbackInfo ci) {
        if (!StellarClientMod.config().customTitleScreen || client == null) return;
        clearChildren();

        int buttonWidth = Math.min(252, Math.max(200, width / 4));
        int x = Math.max(width / 2 + 12, width - buttonWidth - 42);
        int y = Math.max(88, height / 2 - 94);
        Screen current = (Screen) (Object) this;

        addDrawableChild(new AtmosphereButton(18, 14, 38, () -> StellarClientMod.config().cycleTheme()));
        addDrawableChild(new StellarButton(x, y, buttonWidth, 26, Text.literal("SINGLEPLAYER"),
                () -> client.setScreen(new SelectWorldScreen(current))));
        addDrawableChild(new StellarButton(x, y + 32, buttonWidth, 26, Text.literal("MULTIPLAYER"),
                () -> client.setScreen(new MultiplayerScreen(current))));
        addDrawableChild(new StellarButton(x, y + 64, buttonWidth, 26, Text.literal("STELLAR CLIENT"),
                StellarClientMod::openSettings, true));
        addDrawableChild(new StellarButton(x, y + 96, buttonWidth, 24, Text.literal("MODS"),
                StellarClientMod::openSettings));
        addDrawableChild(new StellarButton(x, y + 126, buttonWidth, 24, Text.literal("STORE"),
                StellarClientMod::openStore));
        addDrawableChild(new StellarButton(x, y + 156, (buttonWidth - 6) / 2, 22, Text.literal("OPTIONS"),
                () -> client.setScreen(new OptionsScreen(current, client.options))));
        addDrawableChild(new StellarButton(x + (buttonWidth + 6) / 2, y + 156, (buttonWidth - 6) / 2, 22,
                Text.literal("QUIT"), client::scheduleStop));
        ci.cancel();
    }

    @Inject(method = "render", at = @At("HEAD"), cancellable = true)
    private void stellar$render(DrawContext context, int mouseX, int mouseY, float delta, CallbackInfo ci) {
        StellarConfig config = StellarClientMod.config();
        if (!config.customTitleScreen || client == null) return;

        client.gameRenderer.getRotatingPanoramaRenderer().render(context, width, height, config.backgroundMotion);
        renderAtmosphereTint(context, config);
        if (config.blurPanels) context.applyBlur();
        renderMotion(context, config);
        context.fill(0, 0, width, height, 0x2402060D);

        int logoPanelX = Math.max(24, width / 12);
        int logoPanelY = Math.max(45, height / 2 - 90);
        int logoPanelW = Math.min(420, Math.max(300, width / 3));
        int logoPanelH = 180;
        StellarRender.shadow(context, logoPanelX, logoPanelY, logoPanelW, logoPanelH, 18);
        StellarRender.roundedBorder(context, logoPanelX, logoPanelY, logoPanelW, logoPanelH, 18,
                StellarRender.alpha(config.accent(), 92), StellarRender.alpha(config.panel(), 205));
        context.drawTexturedQuad(STELLAR_LOGO, logoPanelX + 28, logoPanelY + 35,
                logoPanelX + 126, logoPanelY + 133, 0.0F, 1.0F, 0.0F, 1.0F);
        context.drawTextWithShadow(textRenderer, Text.literal("STELLAR"), logoPanelX + 142, logoPanelY + 59, 0xFFF9F7FF);
        context.drawTextWithShadow(textRenderer, Text.literal("CLIENT"), logoPanelX + 142, logoPanelY + 82, config.accent());
        context.drawTextWithShadow(textRenderer, Text.literal("Minimal. Fast. Yours."), logoPanelX + 142, logoPanelY + 110, 0xFFB8AFC7);
        StellarRender.roundedRect(context, logoPanelX + 142, logoPanelY + 132, Math.min(180, logoPanelW - 170), 2, 1,
                StellarRender.alpha(config.accent(), 190));

        int buttonWidth = Math.min(252, Math.max(200, width / 4));
        int buttonX = Math.max(width / 2 + 12, width - buttonWidth - 42);
        int buttonY = Math.max(88, height / 2 - 94);
        StellarRender.shadow(context, buttonX - 14, buttonY - 18, buttonWidth + 28, 218, 17);
        StellarRender.roundedBorder(context, buttonX - 14, buttonY - 18, buttonWidth + 28, 218, 17,
                0x65483F59, StellarRender.alpha(config.panel(), 220));

        String account = config.discordName.isBlank() ? "DISCORD NOT LINKED" : config.discordName;
        context.drawTextWithShadow(textRenderer, Text.literal(account), 68, 28, 0xFFD6CEE3);
        String version = "stellarClient " + client.getGameVersion();
        context.drawTextWithShadow(textRenderer, Text.literal(version), width - textRenderer.getWidth(version) - 24, 18, 0xFFD6CEE3);

        super.render(context, mouseX, mouseY, delta);
        ci.cancel();
    }

    @Unique
    private void renderAtmosphereTint(DrawContext context, StellarConfig config) {
        int tint = switch (config.theme) {
            case "noctis" -> 0x5F050818;
            case "tempest" -> 0x58070A12;
            case "frost" -> 0x2875B9E8;
            default -> 0x18D6766C;
        };
        context.fill(0, 0, width, height, tint);
    }

    @Unique
    private void renderMotion(DrawContext context, StellarConfig config) {
        if (!config.backgroundMotion) return;
        long time = System.currentTimeMillis();
        int accent = config.accent() & 0x00FFFFFF;
        switch (config.theme) {
            case "frost" -> {
                for (int i = 0; i < 30; i++) {
                    int x = Math.floorMod(i * 97 + (int) (time / 26), Math.max(1, width));
                    int y = Math.floorMod(i * 53 + (int) (time / 45), Math.max(1, height));
                    int size = 1 + (i % 2);
                    context.fill(x, y, x + size, y + size, 0xB8FFFFFF);
                }
            }
            case "tempest" -> {
                for (int i = 0; i < 14; i++) {
                    int x = Math.floorMod(i * 143 + (int) (time / 18), Math.max(1, width + 80)) - 40;
                    int y = Math.floorMod(i * 61 + (int) (time / 31), Math.max(1, height));
                    context.fill(x, y, x + 1, Math.min(height, y + 16), 0x407E9CFF);
                }
                if ((time / 2600L) % 5L == 0L) context.fill(0, 0, width, height, 0x12FFFFFF);
            }
            case "noctis" -> {
                for (int i = 0; i < 22; i++) {
                    int x = Math.floorMod(i * 151 + (int) (time / 120), Math.max(1, width));
                    int y = Math.floorMod(i * 73, Math.max(1, height));
                    int alpha = 52 + (i % 3) * 18;
                    context.fill(x, y, x + 1, y + 1, (alpha << 24) | 0x00E8ECFF);
                }
            }
            default -> {
                for (int i = 0; i < 18; i++) {
                    int x = Math.floorMod(i * 151 + (int) (time / 85), Math.max(1, width));
                    int y = Math.floorMod(i * 79, Math.max(1, height));
                    int alpha = 28 + (i % 4) * 12;
                    context.fill(x, y, x + 2, y + 2, (alpha << 24) | accent);
                }
            }
        }
    }
}
