// rayact_tool — headless Rayact build toolchain.
//
// Carries the build-time subcommands that historically lived on the
// rayact_desktop host, so producing bundles and .rayactpack containers does
// not require a GUI-capable binary (no raylib, raym3, GL or window-system
// libraries — QuickJS only). The desktop host keeps the same flags as a
// deprecated fallback for older toolchains.
//
//   rayact_tool --compile <src.js> [out.qjsbc]
//   rayact_tool --pack <stageDir> <out.rayactpack> [--obfuscate <key>]
//   rayact_tool --verify <pack.rayactpack>
//   rayact_tool --check <file.qjsbc|.rayactpack|.js>
//   rayact_tool --version
//
// Note: --check here validates artifact structure (bytecode readability /
// container integrity). Full engine boot verification stays on
// `rayact_desktop --check`.

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "quickjs.h"
#include "qjs_compile.h"
#include "rayactpack.h"

#ifndef RAYACT_TOOL_VERSION
#define RAYACT_TOOL_VERSION "dev"
#endif

namespace {

std::string getArgValue(int argc, char** argv, const std::string& name) {
    for (int i = 1; i < argc - 1; i++) {
        if (argv[i] && name == argv[i]) {
            return argv[i + 1] ? argv[i + 1] : "";
        }
    }
    return "";
}

bool hasSuffix(const std::string& s, const char* suffix) {
    const size_t n = strlen(suffix);
    return s.size() >= n && s.compare(s.size() - n, n, suffix) == 0;
}

bool readFile(const char* path, std::vector<uint8_t>& out) {
    FILE* f = fopen(path, "rb");
    if (!f) return false;
    fseek(f, 0, SEEK_END);
    long len = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (len < 0) { fclose(f); return false; }
    out.resize((size_t)len);
    const size_t got = len ? fread(out.data(), 1, (size_t)len, f) : 0;
    fclose(f);
    return got == (size_t)len;
}

struct QjsScope {
    JSRuntime* rt = nullptr;
    JSContext* ctx = nullptr;
    QjsScope() {
        rt = JS_NewRuntime();
        if (rt) ctx = JS_NewContext(rt);
    }
    ~QjsScope() {
        if (ctx) JS_FreeContext(ctx);
        if (rt) JS_FreeRuntime(rt);
    }
    bool ok() const { return ctx != nullptr; }
};

// Structure-level artifact validation: container listing for .rayactpack,
// bytecode deserialization for .qjsbc, compile-only parse for everything else.
int runCheck(const char* path) {
    const std::string p(path);
    if (hasSuffix(p, ".rayactpack")) {
        std::vector<rayact::RayactPackEntry> entries;
        bool obfuscated = false;
        if (!rayact::listPack(path, entries, obfuscated)) {
            fprintf(stderr, "check: FAILED (%s): unreadable container\n", path);
            return 1;
        }
        printf("check: OK (%s): %zu files%s\n", path, entries.size(),
               obfuscated ? ", obfuscated" : "");
        return 0;
    }

    QjsScope qjs;
    if (!qjs.ok()) { fprintf(stderr, "check: cannot create QuickJS runtime\n"); return 1; }

    std::vector<uint8_t> buf;
    if (!readFile(path, buf)) {
        fprintf(stderr, "check: FAILED (%s): cannot read file\n", path);
        return 1;
    }

    JSValue v;
    if (hasSuffix(p, ".qjsbc") || hasSuffix(p, ".jsc")) {
        v = JS_ReadObject(qjs.ctx, buf.data(), buf.size(), JS_READ_OBJ_BYTECODE);
    } else {
        v = JS_Eval(qjs.ctx, reinterpret_cast<const char*>(buf.data()), buf.size(),
                    path, JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_COMPILE_ONLY);
    }
    const bool ok = !JS_IsException(v);
    if (!ok) {
        JSValue exc = JS_GetException(qjs.ctx);
        const char* s = JS_ToCString(qjs.ctx, exc);
        fprintf(stderr, "check: FAILED (%s): %s\n", path, s ? s : "?");
        if (s) JS_FreeCString(qjs.ctx, s);
        JS_FreeValue(qjs.ctx, exc);
    } else {
        printf("check: OK (%s)\n", path);
    }
    JS_FreeValue(qjs.ctx, v);
    return ok ? 0 : 1;
}

int usage() {
    fprintf(stderr,
            "rayact_tool %s — headless Rayact build toolchain\n"
            "\n"
            "  rayact_tool --compile <src.js> [out.qjsbc]\n"
            "  rayact_tool --pack <stageDir> <out.rayactpack> [--obfuscate <key>]\n"
            "  rayact_tool --verify <pack.rayactpack>\n"
            "  rayact_tool --check <file.qjsbc|.rayactpack|.js>\n"
            "  rayact_tool --version\n",
            RAYACT_TOOL_VERSION);
    return 2;
}

} // namespace

int main(int argc, char** argv) {
    if (argc < 2) return usage();
    const std::string cmd = argv[1];

    if (cmd == "--version") {
        printf("rayact_tool %s\n", RAYACT_TOOL_VERSION);
        return 0;
    }

    if (cmd == "--compile" && argc >= 3) {
        QjsScope qjs;
        if (!qjs.ok()) { fprintf(stderr, "compile: cannot create QuickJS runtime\n"); return 1; }
        const char* out = argc >= 4 ? argv[3] : nullptr;
        return compileJSToBytecode(qjs.ctx, argv[2], out).empty() ? 1 : 0;
    }

    if (cmd == "--pack" && argc >= 4) {
        rayact::PackOptions opts;
        std::string key = getArgValue(argc, argv, "--obfuscate");
        if (!key.empty()) opts.obfuscateKey = key;
        int chunks = rayact::writePack(argv[2], argv[3], opts);
        if (chunks <= 0) { fprintf(stderr, "pack: failed\n"); return 1; }
        printf("Wrote %s (%d chunk%s)\n", argv[3], chunks, chunks == 1 ? "" : "s");
        return 0;
    }

    if (cmd == "--verify" && argc >= 3) {
        std::vector<rayact::RayactPackEntry> entries;
        bool obfuscated = false;
        if (!rayact::listPack(argv[2], entries, obfuscated)) {
            fprintf(stderr, "verify: cannot read %s\n", argv[2]);
            return 1;
        }
        unsigned long long total = 0;
        printf("%s (%zu files%s)\n", argv[2], entries.size(), obfuscated ? ", obfuscated" : "");
        for (auto& e : entries) {
            printf("  %s (%llu bytes)\n", e.path.c_str(), (unsigned long long)e.size);
            total += e.size;
        }
        printf("Total: %zu files, %llu bytes\n", entries.size(), total);
        return 0;
    }

    if (cmd == "--check" && argc >= 3) {
        return runCheck(argv[2]);
    }

    return usage();
}
