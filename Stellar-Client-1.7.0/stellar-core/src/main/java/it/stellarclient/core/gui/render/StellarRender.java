package it.stellarclient.core.gui.render;

import net.minecraft.client.gui.DrawContext;

/** Small GUI primitives built only from DrawContext fills. */
public final class StellarRender {
    private StellarRender() {}

    public static void roundedRect(DrawContext context, int x, int y, int width, int height, int radius, int color) {
        if (width <= 0 || height <= 0) return;
        int r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
        if (r <= 1) {
            context.fill(x, y, x + width, y + height, color);
            return;
        }
        context.fill(x + r, y, x + width - r, y + height, color);
        context.fill(x, y + r, x + width, y + height - r, color);
        for (int i = 0; i < r; i++) {
            double normalized = (r - i - 0.5D) / r;
            int inset = (int) Math.ceil(r - Math.sqrt(Math.max(0.0D, 1.0D - normalized * normalized)) * r);
            context.fill(x + inset, y + i, x + width - inset, y + i + 1, color);
            context.fill(x + inset, y + height - i - 1, x + width - inset, y + height - i, color);
        }
    }

    public static void roundedBorder(DrawContext context, int x, int y, int width, int height, int radius, int border, int fill) {
        roundedRect(context, x, y, width, height, radius, border);
        roundedRect(context, x + 1, y + 1, width - 2, height - 2, Math.max(1, radius - 1), fill);
    }

    public static void shadow(DrawContext context, int x, int y, int width, int height, int radius) {
        roundedRect(context, x - 4, y - 2, width + 8, height + 9, radius + 5, 0x26000000);
        roundedRect(context, x - 2, y - 1, width + 4, height + 5, radius + 3, 0x36000000);
    }

    public static int alpha(int color, int alpha) {
        return ((alpha & 0xFF) << 24) | (color & 0x00FFFFFF);
    }

    public static int brighten(int color, int amount) {
        int r = Math.min(255, ((color >> 16) & 0xFF) + amount);
        int g = Math.min(255, ((color >> 8) & 0xFF) + amount);
        int b = Math.min(255, (color & 0xFF) + amount);
        return (r << 16) | (g << 8) | b;
    }

    public static int mix(int first, int second, float amount) {
        float t = Math.max(0.0F, Math.min(1.0F, amount));
        int a = (int) (((first >>> 24) & 0xFF) * (1.0F - t) + ((second >>> 24) & 0xFF) * t);
        int r = (int) (((first >>> 16) & 0xFF) * (1.0F - t) + ((second >>> 16) & 0xFF) * t);
        int g = (int) (((first >>> 8) & 0xFF) * (1.0F - t) + ((second >>> 8) & 0xFF) * t);
        int b = (int) ((first & 0xFF) * (1.0F - t) + (second & 0xFF) * t);
        return (a << 24) | (r << 16) | (g << 8) | b;
    }
}
