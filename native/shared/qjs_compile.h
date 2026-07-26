// Shared QuickJS bytecode compiler used by the rayact_desktop host
// (--compile, deprecated) and the headless rayact_tool build binary.
// Pure QuickJS — no engine, renderer or platform dependencies.
#pragma once

#include <string>

struct JSContext;

// Compile a JS source file to QuickJS bytecode and write a .qjsbc file.
// Returns the output path on success, empty string on failure.
std::string compileJSToBytecode(JSContext* ctx, const char* srcFile, const char* outFile);
