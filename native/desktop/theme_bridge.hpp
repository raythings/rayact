#pragma once

extern "C" {
#include "quickjs.h"
}

void registerThemeBindings(JSContext* ctx);
void notifyColorSchemeChange(JSContext* ctx, bool isDark);
