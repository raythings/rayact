#pragma once
#include "workers.hpp"
#include <string>
#include <memory>

void spawnJSWorker(int workerId,
                   std::string filePath,
                   std::string initialDataJSON,
                   std::shared_ptr<WorkerEntry> entry);
