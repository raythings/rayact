#pragma once

extern "C" {
#include "quickjs.h"
}

namespace rayact {

struct WorkletRuntime;

WorkletRuntime *workletRuntime();
bool workletRuntimeInit();
void workletRuntimeShutdown();
void workletRuntimeTick(float dtSeconds);

bool workletRegisterAnimatedNode(int nodeId);
void workletSetDirectProp(int nodeId, const char *propName, float value);

JSContext *workletContext();

} // namespace rayact
