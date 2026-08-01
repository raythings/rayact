#include "system_appearance.hpp"
#include "theme_bridge.hpp"

#include <raym3/platform/SystemAppearance.h>
#include <raym3/styles/Theme.h>

#if defined(__EMSCRIPTEN__)
#include <emscripten.h>
#include <atomic>

// The browser reports colour-scheme changes through a media-query listener, and
// there is no watcher thread on web (pthreads needs cross-origin isolation).
// Mirror the Android host: the event only raises a flag, and the engine's
// regular pump applies it on the JS thread.
static std::atomic<bool> g_webAppearanceDirty{false};

extern "C" EMSCRIPTEN_KEEPALIVE void rayactWebSetColorSchemeDirty(void) {
    g_webAppearanceDirty.store(true, std::memory_order_release);
}
#endif

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

#if defined(__EMSCRIPTEN__)
    EM_ASM({
        if (!window.matchMedia || Module.__rayactColorSchemeWatcher) return;
        var query = window.matchMedia('(prefers-color-scheme: dark)');
        Module.__rayactColorSchemeWatcher = query;
        var notify = function() {
            if (Module._rayactWebSetColorSchemeDirty) Module._rayactWebSetColorSchemeDirty();
        };
        if (query.addEventListener) query.addEventListener('change', notify);
        else if (query.addListener) query.addListener(notify);
    });
#endif
}

void tickSystemAppearance(JSContext* ctx) {
#if defined(__EMSCRIPTEN__)
    if (!g_webAppearanceDirty.exchange(false, std::memory_order_acq_rel)) return;
    if (raym3::Theme::GetColorSchemePreference() != raym3::ColorSchemePreference::System)
        return;
    applyEffectiveAppearance(ctx, true);
#else
    (void)ctx;
#endif
}

void shutdownSystemAppearance() {
    raym3::SystemAppearance::StopWatching();
    g_appearanceCtx = nullptr;
}
