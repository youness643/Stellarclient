package it.stellarclient.core.gui.widget;

import it.stellarclient.core.StellarClientMod;
import it.stellarclient.core.gui.render.StellarRender;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.widget.PressableWidget;
import net.minecraft.text.Text;

/**
 * Original Stellar button: rounded, transparent and animated.
 * It draws only GUI primitives and never replaces Minecraft textures or items.
 */
public final class StellarButton extends PressableWidget {
    private final Runnable action;
    private final boolean primary;
    private float hoverProgress;
    private float pressProgress;

    public StellarButton(int x, int y, int width, int height, Text message, Runnable action) {
        this(x, y, width, height, message, action, false);
    }

    public StellarButton(int x, int y, int width, int height, Text message, Runnable action, boolean primary) {
        super(x, y, width, height, message);
        this.action = action;
        this.primary = primary;
    }

    @Override
    public void onPress() {
        if (active && action != null) {
            pressProgress = 1.0F;
            action.run();
        }
    }

    @Override
    protected void renderWidget(DrawContext context, int mouseX, int mouseY, float delta) {
        float target = isHovered() && active ? 1.0F : 0.0F;
        float speed = Math.min(1.0F, Math.max(0.14F, delta * 0.25F));
        hoverProgress += (target - hoverProgress) * speed;
        pressProgress *= Math.max(0.0F, 1.0F - delta * 0.18F);

        int accent = StellarClientMod.config().accent();
        int base = primary ? StellarRender.alpha(accent, active ? 214 : 92) : 0xC9181720;
        int hover = primary ? StellarRender.alpha(StellarRender.brighten(accent, 26), 238) : StellarRender.alpha(accent, 100);
        int background = StellarRender.mix(base, hover, hoverProgress);
        int border = active
                ? StellarRender.mix(0x513B354A, StellarRender.alpha(accent, 220), hoverProgress)
                : 0x302B2735;

        int x = getX();
        int y = getY() + Math.round(pressProgress * 1.0F);
        StellarRender.shadow(context, x, y, width, height, 8);
        StellarRender.roundedBorder(context, x, y, width, height, 8, border, background);
        if (primary) {
            StellarRender.roundedRect(context, x + 4, y + height - 3, width - 8, 2, 1,
                    StellarRender.alpha(StellarRender.brighten(accent, 38), 196));
        }

        MinecraftClient client = MinecraftClient.getInstance();
        int color = active ? 0xFFF8F5FF : 0xFF756D82;
        context.drawCenteredTextWithShadow(client.textRenderer, getMessage(), x + width / 2, y + (height - 8) / 2, color);
    }
}
