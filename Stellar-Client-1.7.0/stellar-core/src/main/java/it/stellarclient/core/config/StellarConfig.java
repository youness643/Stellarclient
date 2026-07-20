package it.stellarclient.core.config;

import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;

/**
 * Dependency-free, atomic client configuration.
 *
 * All HUD coordinates are stored as percentages so layouts survive resolution changes.
 * Stellar never writes to vanilla resource packs, item models or registries.
 */
public final class StellarConfig {
    private static final Path CONFIG_PATH = FabricLoader.getInstance()
            .getConfigDir()
            .resolve("stellar-client.properties");

    public static final String[] HUD_WIDGETS = {
            "fps", "ping", "coordinates", "cps", "keystrokes", "armor", "clock", "server"
    };

    // HUD and built-in modules.
    public boolean fps = true;
    public boolean coordinates = true;
    public boolean ping = true;
    public boolean clock = false;
    public boolean armorStatus = true;
    public boolean keystrokes = false;
    public boolean cps = true;
    public boolean serverBadge = true;
    public boolean scoreboard = true;
    public boolean chat = true;
    public boolean autoText = false;
    public boolean zoom = true;
    public boolean toggleSprint = true;
    public boolean waypoints = false;
    public boolean replayIntegration = false;

    // Appearance.
    public boolean cleanPauseMenu = true;
    public boolean customTitleScreen = true;
    public boolean compactHud = false;
    public boolean blurPanels = true;
    public boolean backgroundMotion = true;
    public int hudScale = 100;
    public int panelOpacity = 88;
    public int zoomPercent = 35;
    public String theme = theme(systemProperty("stellar.theme", "aurora"));
    public String activeProfile = "default";

    // Service bridge; no tokens are stored in Minecraft.
    public String storeUrl = safeHttps(systemProperty("stellar.storeUrl", "https://stellarclient.it/store"), "https://stellarclient.it/store");
    public String socialUrl = safeHttps(systemProperty("stellar.socialUrl", "https://stellarclient.it"), "https://stellarclient.it");
    public String discordName = systemProperty("stellar.discordName", "");

    private final Map<String, HudPlacement> placements = new LinkedHashMap<>();

    public StellarConfig() {
        placements.put("fps", new HudPlacement(2, 3, 100));
        placements.put("ping", new HudPlacement(2, 8, 100));
        placements.put("coordinates", new HudPlacement(2, 14, 100));
        placements.put("cps", new HudPlacement(2, 24, 100));
        placements.put("keystrokes", new HudPlacement(82, 12, 100));
        placements.put("armor", new HudPlacement(2, 78, 100));
        placements.put("clock", new HudPlacement(91, 88, 100));
        placements.put("server", new HudPlacement(78, 70, 100));
    }

    public static StellarConfig load() {
        StellarConfig config = new StellarConfig();
        if (!Files.isRegularFile(CONFIG_PATH)) {
            config.save();
            return config;
        }

        Properties properties = new Properties();
        try (InputStream input = Files.newInputStream(CONFIG_PATH)) {
            properties.load(input);
            config.fps = bool(properties, "module.fps", config.fps);
            config.coordinates = bool(properties, "module.coordinates", config.coordinates);
            config.ping = bool(properties, "module.ping", config.ping);
            config.clock = bool(properties, "module.clock", config.clock);
            config.armorStatus = bool(properties, "module.armorStatus", config.armorStatus);
            config.keystrokes = bool(properties, "module.keystrokes", config.keystrokes);
            config.cps = bool(properties, "module.cps", config.cps);
            config.serverBadge = bool(properties, "module.serverBadge", config.serverBadge);
            config.scoreboard = bool(properties, "module.scoreboard", config.scoreboard);
            config.chat = bool(properties, "module.chat", config.chat);
            config.autoText = bool(properties, "module.autoText", config.autoText);
            config.zoom = bool(properties, "module.zoom", config.zoom);
            config.toggleSprint = bool(properties, "module.toggleSprint", config.toggleSprint);
            config.waypoints = bool(properties, "module.waypoints", config.waypoints);
            config.replayIntegration = bool(properties, "module.replayIntegration", config.replayIntegration);

            config.cleanPauseMenu = bool(properties, "menu.pause", config.cleanPauseMenu);
            config.customTitleScreen = bool(properties, "menu.title", config.customTitleScreen);
            config.compactHud = bool(properties, "hud.compact", config.compactHud);
            config.blurPanels = bool(properties, "appearance.blur", config.blurPanels);
            config.backgroundMotion = bool(properties, "appearance.motion", config.backgroundMotion);
            config.hudScale = integer(properties, "hud.scale", 65, 160, config.hudScale);
            config.panelOpacity = integer(properties, "appearance.opacity", 55, 100, config.panelOpacity);
            config.zoomPercent = integer(properties, "module.zoomPercent", 15, 70, config.zoomPercent);
            config.theme = theme(properties.getProperty("appearance.theme", config.theme));
            config.activeProfile = cleanProfile(properties.getProperty("profile.active", config.activeProfile));
            config.storeUrl = safeHttps(properties.getProperty("service.store", config.storeUrl), config.storeUrl);
            config.socialUrl = safeHttps(properties.getProperty("service.social", config.socialUrl), config.socialUrl);
            config.discordName = cleanLabel(properties.getProperty("account.discord", config.discordName));

            for (String widget : HUD_WIDGETS) {
                HudPlacement fallback = config.placement(widget);
                int x = integer(properties, "hud." + widget + ".x", 0, 100, fallback.x);
                int y = integer(properties, "hud." + widget + ".y", 0, 100, fallback.y);
                int scale = integer(properties, "hud." + widget + ".scale", 60, 180, fallback.scale);
                config.placements.put(widget, new HudPlacement(x, y, scale));
            }
        } catch (IOException ignored) {
            // Keep safe defaults when the file is unreadable.
        }
        return config;
    }

    public synchronized void save() {
        Properties properties = new Properties();
        properties.setProperty("module.fps", Boolean.toString(fps));
        properties.setProperty("module.coordinates", Boolean.toString(coordinates));
        properties.setProperty("module.ping", Boolean.toString(ping));
        properties.setProperty("module.clock", Boolean.toString(clock));
        properties.setProperty("module.armorStatus", Boolean.toString(armorStatus));
        properties.setProperty("module.keystrokes", Boolean.toString(keystrokes));
        properties.setProperty("module.cps", Boolean.toString(cps));
        properties.setProperty("module.serverBadge", Boolean.toString(serverBadge));
        properties.setProperty("module.scoreboard", Boolean.toString(scoreboard));
        properties.setProperty("module.chat", Boolean.toString(chat));
        properties.setProperty("module.autoText", Boolean.toString(autoText));
        properties.setProperty("module.zoom", Boolean.toString(zoom));
        properties.setProperty("module.toggleSprint", Boolean.toString(toggleSprint));
        properties.setProperty("module.waypoints", Boolean.toString(waypoints));
        properties.setProperty("module.replayIntegration", Boolean.toString(replayIntegration));
        properties.setProperty("menu.pause", Boolean.toString(cleanPauseMenu));
        properties.setProperty("menu.title", Boolean.toString(customTitleScreen));
        properties.setProperty("hud.compact", Boolean.toString(compactHud));
        properties.setProperty("appearance.blur", Boolean.toString(blurPanels));
        properties.setProperty("appearance.motion", Boolean.toString(backgroundMotion));
        properties.setProperty("appearance.opacity", Integer.toString(panelOpacity));
        properties.setProperty("appearance.theme", theme(theme));
        properties.setProperty("hud.scale", Integer.toString(hudScale));
        properties.setProperty("module.zoomPercent", Integer.toString(zoomPercent));
        properties.setProperty("profile.active", cleanProfile(activeProfile));
        properties.setProperty("service.store", safeHttps(storeUrl, "https://stellarclient.it/store"));
        properties.setProperty("service.social", safeHttps(socialUrl, "https://stellarclient.it"));
        properties.setProperty("account.discord", cleanLabel(discordName));
        for (String widget : HUD_WIDGETS) {
            HudPlacement placement = placement(widget);
            properties.setProperty("hud." + widget + ".x", Integer.toString(placement.x));
            properties.setProperty("hud." + widget + ".y", Integer.toString(placement.y));
            properties.setProperty("hud." + widget + ".scale", Integer.toString(placement.scale));
        }

        try {
            Files.createDirectories(CONFIG_PATH.getParent());
            Path temp = CONFIG_PATH.resolveSibling(CONFIG_PATH.getFileName() + ".tmp");
            try (OutputStream output = Files.newOutputStream(temp)) {
                properties.store(output, "Stellar Client settings");
            }
            try {
                Files.move(temp, CONFIG_PATH, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException unsupportedAtomicMove) {
                Files.move(temp, CONFIG_PATH, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException ignored) {
            // Read-only config folders must never crash Minecraft.
        }
    }

    public HudPlacement placement(String widget) {
        return placements.computeIfAbsent(widget, ignored -> new HudPlacement(2, 2, 100));
    }

    public void movePlacement(String widget, int xPercent, int yPercent) {
        HudPlacement current = placement(widget);
        placements.put(widget, new HudPlacement(clamp(xPercent, 0, 100), clamp(yPercent, 0, 100), current.scale));
    }

    public void scalePlacement(String widget, int scale) {
        HudPlacement current = placement(widget);
        placements.put(widget, new HudPlacement(current.x, current.y, clamp(scale, 60, 180)));
    }

    public int widgetX(String widget, int screenWidth, int widgetWidth) {
        int room = Math.max(0, screenWidth - widgetWidth);
        return Math.round(room * (placement(widget).x / 100.0F));
    }

    public int widgetY(String widget, int screenHeight, int widgetHeight) {
        int room = Math.max(0, screenHeight - widgetHeight);
        return Math.round(room * (placement(widget).y / 100.0F));
    }

    public void cycleTheme() {
        theme = switch (theme(theme)) {
            case "aurora" -> "noctis";
            case "noctis" -> "tempest";
            case "tempest" -> "frost";
            default -> "aurora";
        };
        save();
    }

    public void setTheme(String nextTheme) {
        theme = theme(nextTheme);
        save();
    }

    public int accent() {
        return switch (theme(theme)) {
            case "noctis" -> 0xFF9D7BFF;
            case "frost" -> 0xFF70D5FF;
            case "tempest" -> 0xFF8B6CFF;
            default -> 0xFFA66CFF;
        };
    }

    public int accentSoft() {
        return (accent() & 0x00FFFFFF) | 0x52000000;
    }

    public int panel() {
        int alpha = clamp(Math.round(255 * panelOpacity / 100.0F), 0, 255);
        int rgb = switch (theme(theme)) {
            case "frost" -> 0x081018;
            case "tempest" -> 0x090B12;
            default -> 0x090810;
        };
        return (alpha << 24) | rgb;
    }

    public static String theme(String value) {
        String normalized = String.valueOf(value).trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "noctis", "frost", "tempest" -> normalized;
            default -> "aurora";
        };
    }

    private static boolean bool(Properties properties, String key, boolean fallback) {
        String value = properties.getProperty(key);
        return value == null ? fallback : Boolean.parseBoolean(value);
    }

    private static int integer(Properties properties, String key, int min, int max, int fallback) {
        try {
            int value = Integer.parseInt(properties.getProperty(key, Integer.toString(fallback)));
            return clamp(value, min, max);
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static String safeHttps(String value, String fallback) {
        String url = String.valueOf(value).trim();
        return url.startsWith("https://") && url.length() <= 300 ? url : fallback;
    }

    private static String systemProperty(String key, String fallback) {
        String value = System.getProperty(key, fallback);
        return value == null ? fallback : value;
    }

    private static String cleanLabel(String value) {
        String cleaned = String.valueOf(value == null ? "" : value).replaceAll("[\\r\\n\\t]", " ").trim();
        return cleaned.length() > 64 ? cleaned.substring(0, 64) : cleaned;
    }

    private static String cleanProfile(String value) {
        String cleaned = String.valueOf(value == null ? "default" : value)
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9_-]", "-");
        if (cleaned.isBlank()) return "default";
        return cleaned.length() > 24 ? cleaned.substring(0, 24) : cleaned;
    }

    public static final class HudPlacement {
        public final int x;
        public final int y;
        public final int scale;

        public HudPlacement(int x, int y, int scale) {
            this.x = x;
            this.y = y;
            this.scale = scale;
        }
    }
}
