#pragma once
#include <cstdio>
#include <string>

namespace Fovea {

class Logger {
public:
    static Logger& GetInstance() { static Logger inst; return inst; }
    void Error(const char* tag, const char* msg) { fprintf(stderr, "[%s] ERROR: %s\n", tag, msg); }
    void Warn(const char* tag, const char* msg)  { fprintf(stderr, "[%s] WARN:  %s\n", tag, msg); }
    void Info(const char* tag, const char* msg)  { fprintf(stderr, "[%s] INFO:  %s\n", tag, msg); }
private:
    Logger() = default;
};

} // namespace Fovea
