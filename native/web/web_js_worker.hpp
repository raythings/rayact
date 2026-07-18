#pragma once

#include <memory>
#include <string>

struct WorkerEntry;

namespace rayact {

bool webSpawnJSWorker(int workerId,
                      const std::string& filePath,
                      const std::string& source,
                      const std::string& initialDataJSON,
                      std::shared_ptr<WorkerEntry> entry);
bool webPostToJSWorker(int workerId, const std::string& payloadJSON);
bool webTerminateJSWorker(int workerId);
bool webIsJSWorker(int workerId);

}
