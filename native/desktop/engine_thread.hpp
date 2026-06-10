#pragma once

#include "../core/engine.hpp"

#include <atomic>
#include <condition_variable>
#include <mutex>
#include <thread>

namespace rayact {

bool engineThreadedModeEnabled();
void engineStartJSThread();
void engineStopJSThread();
void engineSignalVsync();
bool engineWaitForCommit(int timeoutMs);

} // namespace rayact
