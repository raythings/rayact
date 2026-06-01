#include "system_appearance.hpp"
#include "theme_bridge.hpp"

#include <raym3/platform/SystemAppearance.h>
#include <raym3/styles/Theme.h>

static JSContext* g_appearanceCtx = nullptr;

static void applyEffectiveAppearance(JSContext* ctx, bool notifyJs) {
    raym3::Theme::ApplyEffectiveColorScheme();
    if (notifyJs) {
        notifyColorSchemeChange(ctx, raym3::Theme::IsDarkMode());
    }
}

void initSystemAppearance(JSContext* ctx) {
    g_appearanceCtx = ctx;
    applyEffectiveAppearance(ctx, false);

    raym3::SystemAppearance::StartWatching([ctx](bool /*isDark*/) {
        if (raym3::Theme::GetColorSchemePreference() != raym3::ColorSchemePreference::System)
            return;
        applyEffectiveAppearance(ctx, true);
    });
}

void tickSystemAppearance(JSContext* ctx) {
    (void)ctx;
}

void shutdownSystemAppearance() {
    raym3::SystemAppearance::StopWatching();
    g_appearanceCtx = nullptr;
}
