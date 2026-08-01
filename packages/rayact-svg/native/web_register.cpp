// @rayact/svg — web registration.
//
// The role of android/RayactSvgRegistration.kt and ios/RayactSvgRegistration.swift:
// the translation unit that publishes the module to one platform's host, with the
// actual <Svg> implementation shared in svg_plugin.cpp. Unlike those it sits here
// in native/, not in web/ — platform folders hold platform-language bindings and
// build output only (Kotlin, Swift, browser JS, arch subfolders of artifacts);
// C++ always lives in native/, and web's entry happens to be C++ because its host
// is. web/ therefore contains just wasm32/rayact_svg.wasm.
//
// On web the module is an Emscripten SIDE_MODULE — packages/rayact-svg/web/wasm32/
// rayact_svg.wasm, built by scripts/build-web-module-artifacts.sh and dlopen'd at
// boot, the same shape as desktop/darwin-arm64/librayact_svg.dylib. Two consequences
// are specific to that build and are why this file exists rather than reusing
// svg_plugin.cpp's own entry point:
//
//   * The side module links its OWN copy of raysvg (see `web.sources`). The host
//     deliberately does not contain raysvg — nothing in the engine calls rsvg*, so
//     linking it there would put a second copy in every app, including apps that
//     never render an <Svg>. Verified by the module's import table: every rsvg::
//     and mapbox::earcut symbol resolves within the module and none is requested
//     from the host (tools/web/module-imports.mjs).
//
//   * RAYACT_SVG_USE_GPU_SHIM is therefore ON here, unlike the statically linked
//     iOS build. A side module has no raylib of its own and the host does not
//     export rl* — the shim routes raysvg's draw calls through the RayactHost
//     function-pointer table instead. That indirection is what keeps the host's
//     export surface to libc/libc++ (native/web/module_sdk_exports.txt) rather
//     than the whole renderer.

#include "rayact_module_abi.h"

// Implemented in svg_plugin.cpp, shared with every other platform.
extern "C" int rayact_svg_register(const RayactHost* host);

// The entry every dynamically loaded rayact module exports, on every platform;
// the web host's dlsym looks up exactly this name (native/web/web_plugin_loader.cpp).
extern "C" int rayact_module_register(const RayactHost* host) {
    if (!host) return -1;
    return rayact_svg_register(host);
}
