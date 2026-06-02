// Android stub for the system-appearance (dark/light) watcher. The desktop
// version observes mac/win/linux OS appearance; on Android the dark-mode signal
// comes from the Activity (UiModeManager / Configuration.uiMode) and will be
// pushed in via a JNI call in a later pass. For now these are no-ops so the
// engine links and runs; the JS theme defaults apply.
#include "../desktop/system_appearance.hpp"

void initSystemAppearance(JSContext* /*ctx*/) {}
void tickSystemAppearance(JSContext* /*ctx*/) {}
void shutdownSystemAppearance() {}
