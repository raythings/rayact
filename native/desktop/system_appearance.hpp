#pragma once

extern "C" {
#include "quickjs.h"
}

void initSystemAppearance(JSContext* ctx);
void tickSystemAppearance(JSContext* ctx);
void shutdownSystemAppearance();
