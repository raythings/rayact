// Web module loading — the peer of native/desktop/plugin_loader.cpp.
//
// A web module is an Emscripten SIDE_MODULE (packages/<pkg>/web/wasm32/rayact_<name>.wasm),
// dlopen'd at boot exactly as desktop dlopens .dylib and Android dlopens .so. The
// host side of the contract is -sMAIN_MODULE=2 plus the runtime export surface in
// native/web/module_sdk_exports.txt (see apps/web/CMakeLists.txt).
//
// Three web-specific constraints shape this file:
//
//   * dlopen cannot be synchronous. Browsers refuse synchronous WebAssembly
//     compilation above 4 KB on the main thread, and a module is far larger than
//     that, so plain dlopen() would throw. emscripten_dlopen() compiles
//     asynchronously and calls back; by the time loadPlugins() runs, the library is
//     already in LDSO, so the registration path below is ordinary synchronous dlsym.
//
//   * dlopen must happen AFTER runtime initialisation, which is why this runs from
//     the boot sequence rather than from the page's preRun. Emscripten places a side
//     module's data segment with getMemory(), and getMemory() only calls malloc()
//     once runtimeInitialized is set; before that it bump-allocates from the heap
//     base, and the allocator later hands the same region out again. The symptom is
//     brutal and far from the cause: the engine dies with "memory access out of
//     bounds" during engineCreate, before any module code has run. A module with no
//     data segment appears to work fine, which makes it look module-specific.
//     The page still fetches the bytes into MEMFS during preRun — that part is safe,
//     and it keeps the network wait off the boot path.
//
//   * Loading must still finish before the app mounts. Registration hands the engine
//     node kinds and view factories; if an <Svg> mounted before @rayact/svg
//     registered, the kind would be unknown at create time. Desktop gets this for
//     free because dlopen is synchronous inside engineCreate. Here the boot sequence
//     chains: modules load, then the WebGPU device is acquired, then engineCreate
//     runs loadPlugins() below.
//
// A failed module is reported and skipped, never fatal: an app whose module is
// missing renders without that node kind rather than refusing to boot.
//
// Debugging note: do not add printf/fprintf to the load path expecting to see it.
// Loading runs in preRun, and Emscripten initialises the stdout/stderr FS devices in
// initRuntime, which is later — anything written before that is silently discarded.
// Log from the registration path below (it runs inside engineCreate) or via EM_ASM
// console.log, which works at any point.

#include <dirent.h>
#include <dlfcn.h>
#include <emscripten/emscripten.h>

#include <cstdio>
#include <string>
#include <vector>

#include "rayact_module_abi.h"

namespace rayact {

const RayactHost* busHost();

namespace {

struct LoadedModule {
    std::string path;
    void* handle;
};

std::vector<LoadedModule> g_modules;
bool g_registered = false;

// The directory shell.html stages module bytes into during preRun.
const char* kModuleDir = "/rayact-modules";

int g_pending = 0;
void (*g_onAllLoaded)(void*) = nullptr;
void* g_onAllLoadedUser = nullptr;

void finishIfDone() {
    if (g_pending > 0) return;
    void (*done)(void*) = g_onAllLoaded;
    void* user = g_onAllLoadedUser;
    g_onAllLoaded = nullptr;
    g_onAllLoadedUser = nullptr;
    if (done) done(user);
}

void onModuleLoaded(void* userData, void* handle) {
    std::string* path = static_cast<std::string*>(userData);
    g_modules.push_back({*path, handle});
    delete path;
    --g_pending;
    finishIfDone();
}

void onModuleError(void* userData) {
    std::string* path = static_cast<std::string*>(userData);
    // Most often a symbol the host does not export. Say so, because the browser's
    // own message ("LinkError: import object field '_ZNSt...' is not a Function")
    // gives no hint about where the contract lives.
    // dlerror() carries emscripten's own reason (dlSetError in libdylink.js); without
    // it the failure is just "the module is missing" with no way to tell a bad path
    // from an unresolved import.
    const char* reason = dlerror();
    fprintf(stderr,
            "[plugin] %s: failed to load: %s\n"
            "[plugin] If that names a missing import, the module needs a symbol outside "
            "the host's export surface - see native/web/module_sdk_exports.txt.\n",
            path->c_str(), reason ? reason : "no reason reported");
    delete path;
    --g_pending;
    finishIfDone();
}

} // namespace

// Load every staged module, then invoke `done`. Called from the boot sequence once
// the runtime is up (see the getMemory note at the top of this file); `done` resumes
// booting, so it runs even when there is nothing to load or a module fails.
void webLoadModules(void (*done)(void*), void* user) {
    g_onAllLoaded = done;
    g_onAllLoadedUser = user;

    DIR* dir = opendir(kModuleDir);
    if (dir) {
        while (struct dirent* entry = readdir(dir)) {
            std::string name = entry->d_name;
            if (name.size() < 6 || name.compare(name.size() - 5, 5, ".wasm") != 0) continue;
            std::string* path = new std::string(std::string(kModuleDir) + "/" + name);
            ++g_pending;
            // RTLD_LOCAL is load-bearing, exactly as on desktop. Emscripten maps its
            // absence to loadDynamicLibrary's `global: true`, which merges the module's
            // exports into the global symbol table - and a side module exports its own
            // copy of every weak symbol it uses (operator new, dozens of std::string and
            // template instantiations). Those would then interpose on the host's.
            emscripten_dlopen(path->c_str(), RTLD_NOW | RTLD_LOCAL, path, onModuleLoaded,
                              onModuleError);
        }
        closedir(dir);
    }
    finishIfDone();
}

void loadPlugins(const std::string& /*extraDir*/) {
    if (g_registered) return;
    g_registered = true;

    for (const LoadedModule& module : g_modules) {
        auto fn = (RayactModuleRegisterFn)dlsym(module.handle, "rayact_module_register");
        if (!fn) {
            fprintf(stderr, "[plugin] %s: no rayact_module_register symbol\n",
                    module.path.c_str());
            continue;
        }
        int rc = fn(busHost());
        if (rc != 0) {
            // Same diagnosis as desktop: overwhelmingly a module built against a
            // different engine, which rejects this host by ABI version.
            fprintf(stderr,
                    "[plugin] %s: rayact_module_register returned %d — the module "
                    "rejected this host (ABI %u). Rebuild it for this engine version.\n",
                    module.path.c_str(), rc, (unsigned)RAYACT_MODULE_ABI_VERSION);
        } else {
            fprintf(stderr, "[plugin] loaded %s\n", module.path.c_str());
        }
    }
}

} // namespace rayact
