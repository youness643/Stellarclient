package it.stellarclient.core.mixin;

import it.stellarclient.core.StellarClientMod;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.hud.InGameHud;
import net.minecraft.client.render.RenderTickCounter;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Lets the built-in Chat and Scoreboard modules hide only their vanilla overlays. */
@Mixin(InGameHud.class)
public abstract class InGameHudMixin {
    @Inject(method = "renderChat", at = @At("HEAD"), cancellable = true)
    private void stellar$renderChat(DrawContext context, RenderTickCounter tickCounter, CallbackInfo ci) {
        if (!StellarClientMod.config().chat) ci.cancel();
    }

    @Inject(method = "renderScoreboardSidebar", at = @At("HEAD"), cancellable = true)
    private void stellar$renderScoreboard(DrawContext context, RenderTickCounter tickCounter, CallbackInfo ci) {
        if (!StellarClientMod.config().scoreboard) ci.cancel();
    }
}
