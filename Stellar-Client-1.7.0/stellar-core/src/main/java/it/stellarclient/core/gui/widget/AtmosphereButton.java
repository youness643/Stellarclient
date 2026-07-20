package it.stellarclient.core.gui.widget;

import it.stellarclient.core.StellarClientMod;
import it.stellarclient.core.config.StellarConfig;
import it.stellarclient.core.gui.render.StellarRender;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.widget.PressableWidget;
import net.minecraft.text.Text;

/**
 * Compact atmosphere selector used by the title screen.
 *
 * The control deliberately contains no text: the current atmosphere is represented by
 * sun, moon, cloud and snowflake glyphs. Each click rotates the glyph through 360 degrees
 * while the background changes immediately. All artwork is rendered from GUI primitives.
 */
public final class AtmosphereButton extends PressableWidget {
    private static final long SPIN_DURATION_NANOS = 520_000_000L;

    private final Runnable action;
    private float hover;
    private long spinStartedAt;

    public AtmosphereButton(int x, int y, int size, Runnable action) {
        super(x, y, size, size, Text.literal("Change Stellar atmosphere"));
        this.action = action;
    }

    @Override
    public void onPress() {
        if (!active) return;
        spinStartedAt = System.nanoTime();
        if (action != null) action.run();
    }

    @Override
    protected void renderWidget(DrawContext context, int mouseX, int mouseY, float delta) {
        float target = isHovered() && active ? 1.0F : 0.0F;
        float speed = Math.min(1.0F, Math.max(0.12F, delta * 0.24F));
        hover += (target - hover) * speed;

        StellarConfig config = StellarClientMod.config();
        int accent = config.accent();
        int base = StellarRender.alpha(config.panel(), 212);
        int hovered = StellarRender.alpha(accent, 104);
        int background = StellarRender.mix(base, hovered, hover);
        int border = StellarRender.mix(0x5D514B60, StellarRender.alpha(accent, 232), hover);

        int x = getX();
        int y = getY();
        StellarRender.shadow(context, x, y, width, height, width / 2);
        StellarRender.roundedBorder(context, x, y, width, height, width / 2, border, background);

        float rotation = currentRotation();
        int color = 0xFFF8F5FF;
        int cx = x + width / 2;
        int cy = y + height / 2;
        switch (config.theme) {
            case "noctis" -> drawMoon(context, cx, cy, rotation, color);
            case "tempest" -> drawCloud(context, cx, cy, rotation, color);
            case "frost" -> drawSnowflake(context, cx, cy, rotation, color);
            default -> drawSun(context, cx, cy, rotation, color);
        }
    }

    private float currentRotation() {
        if (spinStartedAt == 0L) return 0.0F;
        float progress = Math.min(1.0F, (System.nanoTime() - spinStartedAt) / (float) SPIN_DURATION_NANOS);
        float eased = 1.0F - (float) Math.pow(1.0F - progress, 3.0D);
        if (progress >= 1.0F) spinStartedAt = 0L;
        return eased * 360.0F;
    }

    private static void drawSun(DrawContext context, int cx, int cy, float rotation, int color) {
        drawRing(context, cx, cy, 5, rotation, color);
        for (int i = 0; i < 8; i++) {
            double angle = Math.toRadians(rotation + i * 45.0D);
            drawLine(context,
                    cx + (int) Math.round(Math.cos(angle) * 8.0D),
                    cy + (int) Math.round(Math.sin(angle) * 8.0D),
                    cx + (int) Math.round(Math.cos(angle) * 11.0D),
                    cy + (int) Math.round(Math.sin(angle) * 11.0D), color, 1);
        }
    }

    private static void drawMoon(DrawContext context, int cx, int cy, float rotation, int color) {
        for (int i = 42; i <= 318; i += 8) {
            double a = Math.toRadians(i + rotation);
            plot(context, cx + (int) Math.round(Math.cos(a) * 8.0D),
                    cy + (int) Math.round(Math.sin(a) * 8.0D), color, 1);
        }
        for (int i = 76; i <= 284; i += 8) {
            double a = Math.toRadians(i);
            int localX = 3 + (int) Math.round(Math.cos(a) * 6.0D);
            int localY = (int) Math.round(Math.sin(a) * 6.0D);
            int[] point = rotate(localX, localY, rotation);
            plot(context, cx + point[0], cy + point[1], color, 1);
        }
    }

    private static void drawCloud(DrawContext context, int cx, int cy, float rotation, int color) {
        int[][] points = {
                {-9, 4}, {-7, 1}, {-4, 0}, {-3, -4}, {1, -6}, {5, -4},
                {7, -1}, {10, 0}, {11, 4}, {8, 6}, {-7, 6}, {-9, 4}
        };
        for (int i = 0; i < points.length - 1; i++) {
            int[] a = rotate(points[i][0], points[i][1], rotation);
            int[] b = rotate(points[i + 1][0], points[i + 1][1], rotation);
            drawLine(context, cx + a[0], cy + a[1], cx + b[0], cy + b[1], color, 1);
        }
        for (int x = -5; x <= 5; x += 5) {
            int[] a = rotate(x, 9, rotation);
            int[] b = rotate(x - 1, 12, rotation);
            drawLine(context, cx + a[0], cy + a[1], cx + b[0], cy + b[1], 0xFFBCA8FF, 1);
        }
    }

    private static void drawSnowflake(DrawContext context, int cx, int cy, float rotation, int color) {
        for (int axis = 0; axis < 3; axis++) {
            double angle = Math.toRadians(rotation + axis * 60.0D);
            int x1 = cx + (int) Math.round(Math.cos(angle) * 10.0D);
            int y1 = cy + (int) Math.round(Math.sin(angle) * 10.0D);
            int x2 = cx - (int) Math.round(Math.cos(angle) * 10.0D);
            int y2 = cy - (int) Math.round(Math.sin(angle) * 10.0D);
            drawLine(context, x1, y1, x2, y2, color, 1);
            for (int direction : new int[]{-1, 1}) {
                double tipAngle = angle + (direction < 0 ? Math.PI : 0.0D);
                int bx = cx + (int) Math.round(Math.cos(tipAngle) * 7.0D);
                int by = cy + (int) Math.round(Math.sin(tipAngle) * 7.0D);
                for (int branch : new int[]{-1, 1}) {
                    double branchAngle = tipAngle + branch * Math.toRadians(35.0D);
                    drawLine(context, bx, by,
                            bx - (int) Math.round(Math.cos(branchAngle) * 4.0D),
                            by - (int) Math.round(Math.sin(branchAngle) * 4.0D), color, 1);
                }
            }
        }
    }

    private static void drawRing(DrawContext context, int cx, int cy, int radius, float rotation, int color) {
        for (int i = 0; i < 360; i += 16) {
            double angle = Math.toRadians(i + rotation);
            plot(context, cx + (int) Math.round(Math.cos(angle) * radius),
                    cy + (int) Math.round(Math.sin(angle) * radius), color, 1);
        }
    }

    private static int[] rotate(int x, int y, float degrees) {
        double angle = Math.toRadians(degrees);
        return new int[]{
                (int) Math.round(x * Math.cos(angle) - y * Math.sin(angle)),
                (int) Math.round(x * Math.sin(angle) + y * Math.cos(angle))
        };
    }

    private static void drawLine(DrawContext context, int x0, int y0, int x1, int y1, int color, int thickness) {
        int dx = Math.abs(x1 - x0);
        int sx = x0 < x1 ? 1 : -1;
        int dy = -Math.abs(y1 - y0);
        int sy = y0 < y1 ? 1 : -1;
        int error = dx + dy;
        while (true) {
            plot(context, x0, y0, color, thickness);
            if (x0 == x1 && y0 == y1) break;
            int twice = 2 * error;
            if (twice >= dy) {
                error += dy;
                x0 += sx;
            }
            if (twice <= dx) {
                error += dx;
                y0 += sy;
            }
        }
    }

    private static void plot(DrawContext context, int x, int y, int color, int thickness) {
        int radius = Math.max(0, thickness - 1);
        context.fill(x - radius, y - radius, x + radius + 1, y + radius + 1, color);
    }
}
