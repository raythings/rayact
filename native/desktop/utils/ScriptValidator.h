#pragma once
#include <string>
#include <vector>

namespace Fovea {

struct ScriptError {
    std::string message;
    uint32_t line;
    uint32_t column;
    uint32_t startByte;
    uint32_t endByte;
};

class ScriptValidator {
public:
    static bool Validate(const std::string& source, const std::string& filePath, std::vector<ScriptError>& errors);
    static bool IsValid(const std::string& source, const std::string& filePath);
};

} // namespace Fovea
