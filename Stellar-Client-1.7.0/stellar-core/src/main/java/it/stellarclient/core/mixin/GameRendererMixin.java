package it.stellarclient.core.mixin;

import it.stellarclient.core.StellarClientMod;
import net.minecraft.client.render.Camera;
import net.minecraft.client.render.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Smooth, client-only zoom. It changes camera FOV only while the configured key is held. */
@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
    @Inject(method = "getFov", at = @At("RETURN"), cancellable = true)
    private void stellar$zoom(Camera camera, float tickProgress, boolean changingFov, CallbackInfoReturnable<Float> cir) {
        if (!StellarClientMod.isZooming()) return;
        float factor = Math.max(0.15F, Math.min(0.70F, StellarClientMod.config().zoomPercent / 100.0F));
        cir.setReturnValue(Math.max(8.0F, cir.getReturnValue() * factor));
    }
}
