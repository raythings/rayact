#include "../desktop/system_appearance.hpp"
#include "../desktop/theme_bridge.hpp"

#include <raym3/platform/SystemAppearance.h>
#include <raym3/styles/Theme.h>

#include <atomic>

namespace {
std::atomic<bool> g_systemDark{false};
std::atomic<bool> g_appearanceDirty{false};
}

namespace raym3 {

bool platformReadSystemDarkMode() {
    return g_systemDark.load(std::memory_order_acquire);
}

} // namespace raym3

// Configuration.uiMode can arrive before QuickJS/raym3 initialization. Publish
// the value here; theme and JS mutations stay on the engine pump.
void rayactAndroidSetSystemDarkMode(bool isDark) {
    const bool previous =
        g_systemDark.exchange(isDark, std::memory_order_acq_rel);
    if (previous != isDark)
        g_appearanceDirty.store(true, std::memory_order_release);
}

void initSystemAppearance(JSContext* /*ctx*/) {
    raym3::Theme::ApplyEffectiveColorScheme();
    g_appearanceDirty.store(false, std::memory_order_release);
}

void tickSystemAppearance(JSContext* ctx) {
    if (!g_appearanceDirty.exchange(false, std::memory_order_acq_rel))
        return;
    if (raym3::Theme::GetColorSchemePreference() !=
        raym3::ColorSchemePreference::System)
        return;
    raym3::Theme::ApplyEffectiveColorScheme();
    notifyColorSchemeChange(ctx, raym3::Theme::IsDarkMode());
}

void shutdownSystemAppearance() {}
