package it.stellarclient.core.gui;

import it.stellarclient.core.StellarClientMod;
import it.stellarclient.core.config.StellarConfig;
import it.stellarclient.core.gui.render.StellarRender;
import it.stellarclient.core.gui.widget.StellarButton;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Drag-and-resize HUD editor. Opened with Right Shift or from the pause menu.
 * Coordinates are resolution-independent and saved atomically on close.
 */
public final class HudEditorScreen extends Screen {
    private final Screen parent;
    private final Map<String, Bounds> bounds = new LinkedHashMap<>();
    private String selected = "fps";
    private boolean dragging;
    private double dragOffsetX;
    private double dragOffsetY;

    public HudEditorScreen(Screen parent) {
        super(Text.literal("Stellar HUD Editor"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        int top = 14;
        addDrawableChild(new StellarButton(14, top, 96, 22, Text.literal("INDIETRO"), this::close));
        addDrawableChild(new StellarButton(width - 226, top, 66, 22, Text.literal("-"), () -> resizeSelected(-5)));
        addDrawableChild(new StellarButton(width - 154, top, 66, 22, Text.literal("+"), () -> resizeSelected(5), true));
        addDrawableChild(new StellarButton(width - 82, top, 68, 22, Text.literal("RESET"), this::resetSelected));
    }

    private void resizeSelected(int amount) {
        StellarConfig config = StellarClientMod.config();
        config.scalePlacement(selected, config.placement(selected).scale + amount);
        config.save();
    }

    private void resetSelected() {
        StellarConfig config = StellarClientMod.config();
        switch (selected) {
            case "ping" -> config.movePlacement(selected, 2, 8);
            case "coordinates" -> config.movePlacement(selected, 2, 14);
            case "cps" -> config.movePlacement(selected, 2, 24);
            case "keystrokes" -> config.movePlacement(selected, 82, 12);
            case "armor" -> config.movePlacement(selected, 2, 78);
            case "clock" -> config.movePlacement(selected, 91, 88);
            case "server" -> config.movePlacement(selected, 78, 70);
            default -> config.movePlacement(selected, 2, 3);
        }
        config.scalePlacement(selected, 100);
        config.save();
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        renderBackground(context, mouseX, mouseY, delta);
        context.fill(0, 0, width, height, 0x6005060B);
        StellarRender.roundedRect(context, 8, 8, width - 16, 34, 11, 0xD90A0911);
        context.drawCenteredTextWithShadow(textRenderer, Text.literal("HUD EDITOR  •  MAIUSC DESTRO"), width / 2, 20, 0xFFF7F4FF);
        context.drawTextWithShadow(textRenderer, Text.literal("Trascina gli elementi. Rotella o + / - per ridimensionare."), 14, 50, 0xFFB5ADC2);

        bounds.clear();
        drawWidget(context, "fps", 76, 24, mouseX, mouseY);
        drawWidget(context, "ping", 76, 24, mouseX, mouseY);
        drawWidget(context, "coordinates", 150, 43, mouseX, mouseY);
        drawWidget(context, "cps", 76, 24, mouseX, mouseY);
        drawWidget(context, "keystrokes", 84, 76, mouseX, mouseY);
        drawWidget(context, "armor", 126, 74, mouseX, mouseY);
        drawWidget(context, "clock", 78, 24, mouseX, mouseY);
        drawWidget(context, "server", 132, 92, mouseX, mouseY);

        String label = selected.toUpperCase() + "  •  " + StellarClientMod.config().placement(selected).scale + "%";
        int labelWidth = textRenderer.getWidth(label) + 20;
        StellarRender.roundedRect(context, width / 2 - labelWidth / 2, height - 32, labelWidth, 22, 8, 0xD90A0911);
        context.drawCenteredTextWithShadow(textRenderer, Text.literal(label), width / 2, height - 25, StellarClientMod.config().accent());
        super.render(context, mouseX, mouseY, delta);
    }

    private void drawWidget(DrawContext context, String id, int naturalWidth, int naturalHeight, int mouseX, int mouseY) {
        if (!isEnabled(id)) return;
        StellarConfig config = StellarClientMod.config();
        float scale = config.hudScale / 100.0F * config.placement(id).scale / 100.0F;
        int widgetWidth = Math.max(34, Math.round(naturalWidth * scale));
        int widgetHeight = Math.max(18, Math.round(naturalHeight * scale));
        int x = config.widgetX(id, width, widgetWidth);
        int y = config.widgetY(id, height, widgetHeight);
        if (y < 60) y = 60;
        Bounds box = new Bounds(x, y, widgetWidth, widgetHeight);
        bounds.put(id, box);

        boolean active = id.equals(selected);
        boolean hovered = box.contains(mouseX, mouseY);
        int border = active ? config.accent() : hovered ? StellarRender.alpha(config.accent(), 180) : 0x805B536A;
        StellarRender.roundedBorder(context, x, y, widgetWidth, widgetHeight, 7, border, 0xB70A0911);
        if (active) {
            drawHandle(context, x - 2, y - 2);
            drawHandle(context, x + widgetWidth - 4, y - 2);
            drawHandle(context, x - 2, y + widgetHeight - 4);
            drawHandle(context, x + widgetWidth - 4, y + widgetHeight - 4);
        }

        context.getMatrices().pushMatrix();
        context.getMatrices().translate(x + 6, y + 5);
        context.getMatrices().scale(scale, scale);
        drawPreview(context, id);
        context.getMatrices().popMatrix();
    }

    private void drawPreview(DrawContext context, String id) {
        switch (id) {
            case "fps" -> context.drawTextWithShadow(textRenderer, Text.literal("148 FPS"), 0, 0, 0xFFF8F6FF);
            case "ping" -> context.drawTextWithShadow(textRenderer, Text.literal("23 ms"), 0, 0, 0xFF71F39A);
            case "coordinates" -> {
                context.drawTextWithShadow(textRenderer, Text.literal("X: 123.7  Y: 64"), 0, 0, 0xFFF8F6FF);
                context.drawTextWithShadow(textRenderer, Text.literal("Z: -45.2  •  Plains"), 0, 12, 0xFFB8AFC8);
            }
            case "cps" -> context.drawTextWithShadow(textRenderer, Text.literal("0 CPS"), 0, 0, 0xFFF8F6FF);
            case "keystrokes" -> {
                context.drawTextWithShadow(textRenderer, Text.literal("   W"), 0, 0, 0xFFF8F6FF);
                context.drawTextWithShadow(textRenderer, Text.literal("A  S  D"), 0, 14, 0xFFF8F6FF);
                context.drawTextWithShadow(textRenderer, Text.literal("LMB RMB"), 0, 28, 0xFFB8AFC8);
                context.drawTextWithShadow(textRenderer, Text.literal("0 CPS"), 0, 42, 0xFFB8AFC8);
            }
            case "armor" -> {
                context.drawTextWithShadow(textRenderer, Text.literal("ARMOR STATUS"), 0, 0, StellarClientMod.config().accent());
                context.drawTextWithShadow(textRenderer, Text.literal("Helmet   100%"), 0, 14, 0xFF71F39A);
                context.drawTextWithShadow(textRenderer, Text.literal("Chest    100%"), 0, 27, 0xFF71F39A);
                context.drawTextWithShadow(textRenderer, Text.literal("Boots     92%"), 0, 40, 0xFFFFD56A);
            }
            case "clock" -> context.drawTextWithShadow(textRenderer, Text.literal("20:42"), 0, 0, 0xFFF8F6FF);
            case "server" -> {
                context.drawTextWithShadow(textRenderer, Text.literal("STELLARPVP"), 0, 0, StellarClientMod.config().accent());
                context.drawTextWithShadow(textRenderer, Text.literal("Online  148"), 0, 14, 0xFF71F39A);
                context.drawTextWithShadow(textRenderer, Text.literal("Kills     2"), 0, 28, 0xFFF8F6FF);
                context.drawTextWithShadow(textRenderer, Text.literal("stellarclient.it"), 0, 50, 0xFFB8AFC8);
            }
            default -> { }
        }
    }

    private void drawHandle(DrawContext context, int x, int y) {
        StellarRender.roundedRect(context, x, y, 6, 6, 3, StellarClientMod.config().accent());
    }

    private boolean isEnabled(String id) {
        StellarConfig config = StellarClientMod.config();
        return switch (id) {
            case "fps" -> config.fps;
            case "ping" -> config.ping;
            case "coordinates" -> config.coordinates;
            case "cps" -> config.cps;
            case "keystrokes" -> config.keystrokes;
            case "armor" -> config.armorStatus;
            case "clock" -> config.clock;
            case "server" -> config.serverBadge;
            default -> false;
        };
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (button == 0) {
            for (Map.Entry<String, Bounds> entry : bounds.entrySet()) {
                if (entry.getValue().contains(mouseX, mouseY)) {
                    selected = entry.getKey();
                    dragging = true;
                    dragOffsetX = mouseX - entry.getValue().x;
                    dragOffsetY = mouseY - entry.getValue().y;
                    return true;
                }
            }
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseDragged(double mouseX, double mouseY, int button, double deltaX, double deltaY) {
        if (dragging && button == 0) {
            Bounds current = bounds.get(selected);
            if (current != null) {
                int roomX = Math.max(1, width - current.width);
                int roomY = Math.max(1, height - current.height);
                int xPercent = (int) Math.round(((mouseX - dragOffsetX) / roomX) * 100.0D);
                int yPercent = (int) Math.round(((mouseY - dragOffsetY) / roomY) * 100.0D);
                StellarClientMod.config().movePlacement(selected, xPercent, yPercent);
                return true;
            }
        }
        return super.mouseDragged(mouseX, mouseY, button, deltaX, deltaY);
    }

    @Override
    public boolean mouseReleased(double mouseX, double mouseY, int button) {
        if (dragging && button == 0) {
            dragging = false;
            StellarClientMod.config().save();
            return true;
        }
        return super.mouseReleased(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontalAmount, double verticalAmount) {
        if (bounds.getOrDefault(selected, Bounds.EMPTY).contains(mouseX, mouseY)) {
            resizeSelected(verticalAmount > 0 ? 5 : -5);
            return true;
        }
        return super.mouseScrolled(mouseX, mouseY, horizontalAmount, verticalAmount);
    }

    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        if (keyCode == org.lwjgl.glfw.GLFW.GLFW_KEY_RIGHT_SHIFT) {
            close();
            return true;
        }
        return super.keyPressed(keyCode, scanCode, modifiers);
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

    private record Bounds(int x, int y, int width, int height) {
        private static final Bounds EMPTY = new Bounds(-1, -1, 0, 0);
        boolean contains(double mouseX, double mouseY) {
            return mouseX >= x && mouseX <= x + width && mouseY >= y && mouseY <= y + height;
        }
    }
}
