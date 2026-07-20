package it.stellarclient.core;

import it.stellarclient.core.config.StellarConfig;
import it.stellarclient.core.gui.HudEditorScreen;
import it.stellarclient.core.gui.StellarScreen;
import it.stellarclient.core.gui.render.StellarRender;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.network.PlayerListEntry;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.item.ItemStack;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import net.minecraft.util.Util;
import net.minecraft.util.math.BlockPos;
import org.lwjgl.glfw.GLFW;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

public final class StellarClientMod implements ClientModInitializer {
    public static final String MOD_NAME = "Stellar Client";
    public static final String VERSION = "1.7.0";
    private static final DateTimeFormatter CLOCK_FORMAT = DateTimeFormatter.ofPattern("HH:mm");
    private static final Deque<Long> CLICK_TIMES = new ArrayDeque<>();
    private static StellarConfig config;
    private static KeyBinding hudEditorKey;
    private static KeyBinding zoomKey;
    private static boolean attackWasPressed;
    private static int titleRefreshTicks;

    @Override
    public void onInitializeClient() {
        config = StellarConfig.load();
        hudEditorKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.stellar_core.hud_editor", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_RIGHT_SHIFT,
                "key.category.stellar_core"));
        zoomKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.stellar_core.zoom", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_Z,
                "key.category.stellar_core"));

        ClientTickEvents.END_CLIENT_TICK.register(StellarClientMod::onClientTick);
        HudElementRegistry.addLast(Identifier.of("stellar_core", "hud"),
                (drawContext, tickCounter) -> renderHud(drawContext));
    }

    private static void onClientTick(MinecraftClient client) {
        while (hudEditorKey.wasPressed()) {
            if (client.player != null && !(client.currentScreen instanceof HudEditorScreen)) {
                client.setScreen(new HudEditorScreen(client.currentScreen));
            }
        }

        boolean attackPressed = client.options.attackKey.isPressed();
        if (attackPressed && !attackWasPressed && client.currentScreen == null) {
            CLICK_TIMES.addLast(System.currentTimeMillis());
        }
        attackWasPressed = attackPressed;
        pruneClicks();

        if (client.player != null && config().toggleSprint && client.currentScreen == null
                && client.options.forwardKey.isPressed() && !client.player.isSneaking()) {
            client.player.setSprinting(true);
        }

        if (++titleRefreshTicks >= 40) {
            titleRefreshTicks = 0;
            client.getWindow().setTitle("stellarClient " + client.getGameVersion());
        }
    }

    public static StellarConfig config() {
        if (config == null) config = StellarConfig.load();
        return config;
    }

    public static void openSettings() {
        MinecraftClient client = MinecraftClient.getInstance();
        client.setScreen(new StellarScreen(client.currentScreen));
    }

    public static void openHudEditor() {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player != null) client.setScreen(new HudEditorScreen(client.currentScreen));
    }

    public static void openStore() {
        openTrusted(config().storeUrl);
    }

    public static void openCommunity() {
        openTrusted(config().socialUrl);
    }

    public static void openTrusted(String url) {
        if (url != null && url.startsWith("https://") && url.length() <= 300) {
            Util.getOperatingSystem().open(url);
        }
    }

    public static boolean isZooming() {
        MinecraftClient client = MinecraftClient.getInstance();
        return config().zoom && zoomKey != null && zoomKey.isPressed() && client.currentScreen == null;
    }

    public static int currentCps() {
        pruneClicks();
        return CLICK_TIMES.size();
    }

    private static void pruneClicks() {
        long oldest = System.currentTimeMillis() - 1000L;
        while (!CLICK_TIMES.isEmpty() && CLICK_TIMES.peekFirst() < oldest) CLICK_TIMES.removeFirst();
    }

    private static void renderHud(DrawContext context) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.options.hudHidden || client.player == null || client.textRenderer == null || client.currentScreen instanceof HudEditorScreen) return;
        StellarConfig settings = config();
        int screenWidth = context.getScaledWindowWidth();
        int screenHeight = context.getScaledWindowHeight();

        if (settings.fps) renderTextWidget(context, client, settings, "fps", client.getCurrentFps() + " FPS", 76, 22, 0xFFF6F2FF);
        if (settings.ping) renderTextWidget(context, client, settings, "ping", getPing(client) + " ms", 76, 22, getPing(client) < 80 ? 0xFF71F39A : 0xFFFFD56A);
        if (settings.cps) renderTextWidget(context, client, settings, "cps", currentCps() + " CPS", 76, 22, 0xFFF6F2FF);
        if (settings.clock) renderTextWidget(context, client, settings, "clock", LocalTime.now().format(CLOCK_FORMAT), 78, 22, 0xFFF6F2FF);
        if (settings.coordinates) renderCoordinates(context, client, settings, screenWidth, screenHeight);
        if (settings.serverBadge && client.getCurrentServerEntry() != null) renderServer(context, client, settings, screenWidth, screenHeight);
        if (settings.keystrokes) renderKeystrokes(context, client, settings, screenWidth, screenHeight);
        if (settings.armorStatus) renderArmor(context, client, settings, screenWidth, screenHeight);
    }

    public static int currentPing() {
        return getPing(MinecraftClient.getInstance());
    }

    private static int getPing(MinecraftClient client) {
        if (client.getNetworkHandler() == null || client.player == null) return 0;
        PlayerListEntry entry = client.getNetworkHandler().getPlayerListEntry(client.player.getUuid());
        return entry == null ? 0 : entry.getLatency();
    }

    private static void renderTextWidget(DrawContext context, MinecraftClient client, StellarConfig settings,
                                         String id, String label, int naturalWidth, int naturalHeight, int color) {
        float scale = globalScale(settings, id);
        int width = Math.max(36, Math.round(naturalWidth * scale));
        int height = Math.max(18, Math.round(naturalHeight * scale));
        int x = settings.widgetX(id, context.getScaledWindowWidth(), width);
        int y = settings.widgetY(id, context.getScaledWindowHeight(), height);
        panel(context, settings, x, y, width, height);
        context.getMatrices().pushMatrix();
        context.getMatrices().translate(x + 6, y + 6);
        context.getMatrices().scale(scale, scale);
        context.drawTextWithShadow(client.textRenderer, Text.literal(label), 0, 0, color);
        context.getMatrices().popMatrix();
    }

    private static void renderCoordinates(DrawContext context, MinecraftClient client, StellarConfig settings, int screenWidth, int screenHeight) {
        float scale = globalScale(settings, "coordinates");
        int width = Math.round(150 * scale);
        int height = Math.round(43 * scale);
        int x = settings.widgetX("coordinates", screenWidth, width);
        int y = settings.widgetY("coordinates", screenHeight, height);
        BlockPos pos = client.player.getBlockPos();
        panel(context, settings, x, y, width, height);
        context.getMatrices().pushMatrix();
        context.getMatrices().translate(x + 6, y + 6);
        context.getMatrices().scale(scale, scale);
        context.drawTextWithShadow(client.textRenderer, Text.literal("X: " + pos.getX() + "  Y: " + pos.getY()), 0, 0, 0xFFF6F2FF);
        context.drawTextWithShadow(client.textRenderer, Text.literal("Z: " + pos.getZ()), 0, 12, 0xFFB8AFC7);
        context.getMatrices().popMatrix();
    }

    private static void renderServer(DrawContext context, MinecraftClient client, StellarConfig settings, int screenWidth, int screenHeight) {
        float scale = globalScale(settings, "server");
        int width = Math.round(132 * scale);
        int height = Math.round(66 * scale);
        int x = settings.widgetX("server", screenWidth, width);
        int y = settings.widgetY("server", screenHeight, height);
        panel(context, settings, x, y, width, height);
        String name = client.getCurrentServerEntry().name;
        String address = client.getCurrentServerEntry().address;
        context.getMatrices().pushMatrix();
        context.getMatrices().translate(x + 6, y + 6);
        context.getMatrices().scale(scale, scale);
        context.drawTextWithShadow(client.textRenderer, Text.literal(name), 0, 0, settings.accent());
        context.drawTextWithShadow(client.textRenderer, Text.literal(address), 0, 14, 0xFFF6F2FF);
        context.drawTextWithShadow(client.textRenderer, Text.literal(getPing(client) + " ms"), 0, 30, 0xFF71F39A);
        context.getMatrices().popMatrix();
    }

    private static void renderKeystrokes(DrawContext context, MinecraftClient client, StellarConfig settings, int screenWidth, int screenHeight) {
        float scale = globalScale(settings, "keystrokes");
        int width = Math.round(84 * scale);
        int height = Math.round(76 * scale);
        int x = settings.widgetX("keystrokes", screenWidth, width);
        int y = settings.widgetY("keystrokes", screenHeight, height);
        panel(context, settings, x, y, width, height);
        context.getMatrices().pushMatrix();
        context.getMatrices().translate(x + 6, y + 5);
        context.getMatrices().scale(scale, scale);
        drawKey(context, client, "W", 23, 0, 20, client.options.forwardKey.isPressed(), settings.accent());
        drawKey(context, client, "A", 0, 23, 20, client.options.leftKey.isPressed(), settings.accent());
        drawKey(context, client, "S", 23, 23, 20, client.options.backKey.isPressed(), settings.accent());
        drawKey(context, client, "D", 46, 23, 20, client.options.rightKey.isPressed(), settings.accent());
        context.drawTextWithShadow(client.textRenderer, Text.literal(currentCps() + " CPS"), 14, 49, 0xFFB8AFC7);
        context.getMatrices().popMatrix();
    }

    private static void drawKey(DrawContext context, MinecraftClient client, String label, int x, int y, int size, boolean pressed, int accent) {
        StellarRender.roundedRect(context, x, y, size, size, 4, pressed ? StellarRender.alpha(accent, 215) : 0xC51A1822);
        context.drawCenteredTextWithShadow(client.textRenderer, Text.literal(label), x + size / 2, y + 6, 0xFFF6F2FF);
    }

    private static void renderArmor(DrawContext context, MinecraftClient client, StellarConfig settings, int screenWidth, int screenHeight) {
        List<String> values = new ArrayList<>();
        for (ItemStack stack : client.player.getArmorItems()) {
            if (!stack.isEmpty() && stack.isDamageable()) {
                int remaining = stack.getMaxDamage() - stack.getDamage();
                int percent = Math.max(0, Math.round(remaining * 100.0F / stack.getMaxDamage()));
                values.add(stack.getName().getString() + "  " + percent + "%");
            }
        }
        if (values.isEmpty()) return;
        float scale = globalScale(settings, "armor");
        int naturalHeight = 20 + values.size() * 12;
        int width = Math.round(138 * scale);
        int height = Math.round(naturalHeight * scale);
        int x = settings.widgetX("armor", screenWidth, width);
        int y = settings.widgetY("armor", screenHeight, height);
        panel(context, settings, x, y, width, height);
        context.getMatrices().pushMatrix();
        context.getMatrices().translate(x + 6, y + 5);
        context.getMatrices().scale(scale, scale);
        context.drawTextWithShadow(client.textRenderer, Text.literal("ARMOR STATUS"), 0, 0, settings.accent());
        for (int i = 0; i < values.size(); i++) {
            context.drawTextWithShadow(client.textRenderer, Text.literal(values.get(i)), 0, 13 + i * 12, 0xFFF6F2FF);
        }
        context.getMatrices().popMatrix();
    }

    private static float globalScale(StellarConfig settings, String id) {
        return settings.hudScale / 100.0F * settings.placement(id).scale / 100.0F;
    }

    private static void panel(DrawContext context, StellarConfig settings, int x, int y, int width, int height) {
        StellarRender.shadow(context, x, y, width, height, 7);
        StellarRender.roundedBorder(context, x, y, width, height, 7, 0x62564E65, 0xB80A0911);
        StellarRender.roundedRect(context, x + 3, y + 3, 2, Math.max(3, height - 6), 1, settings.accent());
    }
}
