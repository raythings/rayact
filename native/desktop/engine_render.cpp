// Rayact engine — render half. Everything that touches the GPU/frame:
// per-screen raym3 render, input dispatch into the committed tree, the
// Android diagnostic paths and the input-debug screenshot harness. Must not
// call into QuickJS; its only inputs are the shared state in
// engine_internal.hpp and the raym3 bridge tree (g_root / screen stack).
#include "engine_internal.hpp"
#include "raym3_bridge.hpp"
#include "js_stdlib.hpp"
#include "commit_queue.hpp"
#include "engine_thread.hpp"
#include "worklet_runtime.hpp"
#include "gesture_recognizer.hpp"
#include "accessibility_bridge.hpp"
#include "../core/engine.hpp"
#include "../core/config_loader.hpp"
#ifndef RAYACT_NO_WORKERS
#include "workers.hpp"
#endif

#include <raym3/raym3.h>
#include <raym3/v2/Renderer.h>
#include <raym3/v2/Ripple.h>
#include <raym3/v2/Input.h>
#include <raym3/v2/View.h>
#include <raym3/v2/Density.h>

#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <mutex>
#include <set>
#include <string>
#include <rlgl.h>

#ifdef RAYACT_ANDROID
static void drawAndroidDiagnosticCube(int width, int height) {
    const float time = static_cast<float>(GetTime());
    struct CubeVertex3 {
        float x;
        float y;
        float z;
    };
    struct CubeFace {
        int i0;
        int i1;
        int i2;
        int i3;
        Color color;
        float depth;
    };

    const float angleY = time * 0.95f;
    const float angleX = time * 0.55f;
    const float cubeSize = 1.25f;
    const float half = cubeSize * 0.5f;
    const float cameraDistance = 4.2f;
    const float focal = 760.0f;
    const float centerX = width * 0.5f;
    const float centerY = height * 0.56f;

    const float sinY = std::sinf(angleY);
    const float cosY = std::cosf(angleY);
    const float sinX = std::sinf(angleX);
    const float cosX = std::cosf(angleX);

    const std::array<CubeVertex3, 8> base = {{
        {-half, -half, -half},
        { half, -half, -half},
        { half,  half, -half},
        {-half,  half, -half},
        {-half, -half,  half},
        { half, -half,  half},
        { half,  half,  half},
        {-half,  half,  half},
    }};

    std::array<CubeVertex3, 8> rotated = {};
    std::array<Vector2, 8> projected = {};
    for (size_t i = 0; i < base.size(); ++i) {
        const CubeVertex3& v = base[i];
        const float xzX = cosY * v.x + sinY * v.z;
        const float xzZ = -sinY * v.x + cosY * v.z;
        const float yzY = cosX * v.y - sinX * xzZ;
        const float yzZ = sinX * v.y + cosX * xzZ;

        rotated[i] = {xzX, yzY, yzZ};

        const float invZ = 1.0f / (cameraDistance - yzZ);
        projected[i] = {
            centerX + xzX * focal * invZ,
            centerY + yzY * focal * invZ
        };
    }

    std::array<CubeFace, 6> faces = {{
        {4, 5, 6, 7, (Color){255, 210, 70, 255}, 0.0f},
        {0, 1, 2, 3, (Color){120, 170, 255, 255}, 0.0f},
        {0, 4, 7, 3, (Color){255, 110, 110, 255}, 0.0f},
        {1, 5, 6, 2, (Color){90, 235, 140, 255}, 0.0f},
        {3, 2, 6, 7, (Color){255, 150, 80, 255}, 0.0f},
        {0, 1, 5, 4, (Color){190, 130, 255, 255}, 0.0f},
    }};

    for (CubeFace& face : faces) {
        face.depth = (rotated[face.i0].z + rotated[face.i1].z + rotated[face.i2].z + rotated[face.i3].z) * 0.25f;
    }

    std::sort(faces.begin(), faces.end(), [](const CubeFace& a, const CubeFace& b) {
        return a.depth < b.depth;
    });

    for (const CubeFace& face : faces) {
        DrawTriangle(projected[face.i0], projected[face.i1], projected[face.i2], face.color);
        DrawTriangle(projected[face.i0], projected[face.i2], projected[face.i3], face.color);
        DrawLineV(projected[face.i0], projected[face.i1], BLACK);
        DrawLineV(projected[face.i1], projected[face.i2], BLACK);
        DrawLineV(projected[face.i2], projected[face.i3], BLACK);
        DrawLineV(projected[face.i3], projected[face.i0], BLACK);
    }
}
#endif

#if defined(RAYACT_ANDROID) && defined(RAYACT_ANDROID_3D_SMOKE)
static void drawAndroid3DSmoke() {
    static bool initialized = false;
    static Shader smokeShader = { 0 };
    static Texture2D smokeTex0 = { 0 };
    static Texture2D smokeTex1 = { 0 };
    static RenderTexture2D smokeTarget = { 0 };
    static int smokeTex0Loc = -1;
    static int smokeTex1Loc = -1;

    if (!initialized) {
        Image img0 = GenImageGradientRadial(256, 256, 0.0f, RED, MAROON);
        Image img1 = GenImageChecked(256, 256, 32, 32, (Color){ 20, 80, 255, 255 }, (Color){ 240, 240, 255, 255 });
        smokeTex0 = LoadTextureFromImage(img0);
        smokeTex1 = LoadTextureFromImage(img1);
        UnloadImage(img0);
        UnloadImage(img1);
        const char *vs = R"(#version 330
in vec2 vertexPosition;
in vec2 vertexTexCoord;
in vec4 vertexColor;
uniform mat4 mvp;
out vec2 fragTexCoord;
out vec4 fragColor;
void main() {
    fragTexCoord = vertexTexCoord;
    fragColor = vertexColor;
    gl_Position = mvp * vec4(vertexPosition, 0.0, 1.0);
}
)";
        const char *fs = R"(#version 330
in vec2 fragTexCoord;
in vec4 fragColor;
out vec4 finalColor;
uniform sampler2D texture0;
uniform sampler2D texture1;
uniform vec4 colDiffuse;
void main() {
    vec4 a = texture(texture0, fragTexCoord);
    vec4 b = texture(texture1, fragTexCoord);
    finalColor = mix(a, b, 0.5) * colDiffuse * fragColor;
}
)";
        smokeShader = LoadShaderFromMemory(vs, fs);
        smokeTex0Loc = GetShaderLocation(smokeShader, "texture0");
        smokeTex1Loc = GetShaderLocation(smokeShader, "texture1");
        smokeTarget = LoadRenderTexture(640, 360);
        initialized = true;
    }

    BeginTextureMode(smokeTarget);
    ClearBackground(BLACK);
    BeginShaderMode(smokeShader);
    if (smokeTex0Loc >= 0) SetShaderValueTexture(smokeShader, smokeTex0Loc, smokeTex0);
    if (smokeTex1Loc >= 0) SetShaderValueTexture(smokeShader, smokeTex1Loc, smokeTex1);
    DrawRectangle(40, 40, 560, 280, WHITE);
    EndShaderMode();
    EndTextureMode();
    DrawTextureRec(smokeTarget.texture, (Rectangle){ 0, 0, (float)smokeTarget.texture.width, -(float)smokeTarget.texture.height }, (Vector2){ 0, 0 }, WHITE);
}
#endif
float getRenderScaleDpi() {
    float dp = GetWindowScaleDPI().x;
    int screenW = GetScreenWidth();
    int renderW = GetRenderWidth();
    if (screenW > 0 && renderW > 0) {
        dp = std::max(dp, (float)renderW / (float)screenW);
    }
    raym3::v2::Density::SetPlatformDensity(dp);
#if defined(RAYACT_ANDROID)
    // Layout density is owned by setRaym3AndroidDensity (390dp-normalized policy).
    if (raym3::v2::Density::GetLayoutDensity() <= 0.0f)
        raym3::v2::Density::SetLayoutDensity(dp);
#else
    raym3::v2::Density::SetLayoutDensity(dp);
#endif
    return raym3::v2::Density::GetLayoutDensity();
}

namespace rayact {
// rlgl matrix stack (C linkage) — used for the Android dp content scale.
extern "C" { void rlPushMatrix(void); void rlPopMatrix(void); void rlScalef(float, float, float); void rlSetLineWidth(float); }

static std::mutex g_surfaceRelayoutMutex;
static std::set<int> g_surfaceRelayoutScreens;
static std::atomic<bool> g_relayoutOnSurfaceResize{false};

void engineSetRelayoutOnSurfaceResize(bool enabled) {
    g_relayoutOnSurfaceResize.store(enabled, std::memory_order_release);
}

bool engineRelayoutOnSurfaceResizeEnabled() {
    return g_relayoutOnSurfaceResize.load(std::memory_order_acquire);
}

void engineRequestSurfaceRelayout(int screenId) {
    if (screenId <= 0) return;
    std::lock_guard<std::mutex> lock(g_surfaceRelayoutMutex);
    g_surfaceRelayoutScreens.insert(screenId);
}

static bool engineConsumeSurfaceRelayout(int screenId) {
    std::lock_guard<std::mutex> lock(g_surfaceRelayoutMutex);
    auto it = g_surfaceRelayoutScreens.find(screenId);
    if (it == g_surfaceRelayoutScreens.end()) return false;
    g_surfaceRelayoutScreens.erase(it);
    return true;
}

// Per-screen render body. Caller must have:
//   - bound the right EGL surface (raylib BindWindow equivalent), or be running
//     in single-surface desktop mode (default window is fine).
//   - bound the right engine screen via engineBindScreenRoot(screenId) so
//     g_root points at the tree to render.
//   - called raym3::BeginFrame() (once per frame, not per screen).
// On return, g_root is still bound to screenId (caller can move it back if it
// wants to keep state isolated).
//
// Clears the surface with the app's background color. This must be shared by
// desktop and Android so a single layered Rayact tree has the same uncovered
// ─── Input debug harness (opt-in via RAYACT_INPUT_DEBUG) ───────────────────
// Logs each press/release (timestamp + the resolved hit target) and captures
// three screenshots per gesture: at mouse-down, at mouse-up, and 500ms after
// release — so we can see exactly what the unified input pass resolved.
struct InputDebugState {
    int state = -1; // -1 uninit, 0 off, 1 on
    int seq = 0;
    double pressTime = 0.0;
    bool shotPress = false;
    bool shotRelease = false;
    std::string pressName, releaseName, afterName;
    double afterTime = -1.0;
};
static InputDebugState g_inputDebug;

static bool inputDebugEnabled() {
    if (g_inputDebug.state < 0)
        g_inputDebug.state = std::getenv("RAYACT_INPUT_DEBUG") ? 1 : 0;
    return g_inputDebug.state == 1;
}

static const char* nodeKindName(raym3::v2::NodeKind k) {
    using K = raym3::v2::NodeKind;
    switch (k) {
        case K::View: return "View";
        case K::Text: return "Text";
        case K::TextInput: return "TextInput";
        case K::Button: return "Button";
        case K::Custom: return "Custom";
        case K::Slider: return "Slider";
        case K::RangeSlider: return "RangeSlider";
        case K::Switch: return "Switch";
        case K::Checkbox: return "Checkbox";
        case K::RadioButton: return "RadioButton";
    }
    return "?";
}

static std::string describeInputTarget(raym3::v2::NodeId id) {
    if (!id) return std::string("(none)");
    auto* n = reinterpret_cast<raym3::v2::Node*>(id);
    char buf[256];
    std::snprintf(buf, sizeof(buf),
                  "%s id='%s' text='%.24s' rect=(%.0f,%.0f %.0fx%.0f) z=%d%s",
                  nodeKindName(n->kind), n->id.c_str(), n->text.c_str(),
                  n->layout.x, n->layout.y, n->layout.width, n->layout.height,
                  n->zIndex, n->hasScrim ? " scrim" : "");
    return std::string(buf);
}

// Called once per frame from the input dispatch, AFTER ResolveInput.
// `preActive` is the activeId captured BEFORE ResolveInput (the node being
// released this frame, since ResolveInput clears activeId on release).
static void inputDebugOnFrame(Vector2 ptDp, bool pressed, bool released,
                              raym3::v2::NodeId preActive) {
    if (!inputDebugEnabled()) return;
    double t = GetTime();
    if (pressed) {
        int n = ++g_inputDebug.seq;
        g_inputDebug.pressTime = t;
        std::string target = describeInputTarget(raym3::v2::GetActiveId());
        raym3::v2::NodePtr owner = raym3::v2::InputOwnerAt(ptDp);
        raym3::v2::NodePtr inter = raym3::v2::InteractiveTargetAt(ptDp);
        TraceLog(LOG_INFO, "RAYACT_INPUT[%d] OWNER=%s INTERACTIVE=%s",
                 n,
                 owner ? describeInputTarget(raym3::v2::IdOf(owner)).c_str() : "(none)",
                 inter ? describeInputTarget(raym3::v2::IdOf(inter)).c_str() : "(none)");
        TraceLog(LOG_INFO, "RAYACT_INPUT[%d] DOWN  t=%.3f pos=(%.1f,%.1f) target=%s",
                 n, t, ptDp.x, ptDp.y, target.c_str());
        g_inputDebug.pressName = std::string(TextFormat("input_%03d_1_down.png", n));
        g_inputDebug.shotPress = true;
    }
    if (released) {
        int n = g_inputDebug.seq;
        std::string target = describeInputTarget(preActive);
        TraceLog(LOG_INFO,
                 "RAYACT_INPUT[%d] UP    t=%.3f (held %.0fms) pos=(%.1f,%.1f) target=%s",
                 n, t, (t - g_inputDebug.pressTime) * 1000.0, ptDp.x, ptDp.y,
                 target.c_str());
        g_inputDebug.releaseName = std::string(TextFormat("input_%03d_2_up.png", n));
        g_inputDebug.shotRelease = true;
        g_inputDebug.afterName = std::string(TextFormat("input_%03d_3_after500ms.png", n));
        g_inputDebug.afterTime = t + 0.5;
    }
}

// Called from mainLoop AFTER the frame is presented (EndDrawing) so the
// framebuffer reflects the just-drawn state.
void inputDebugTakeScreenshots() {
    if (!inputDebugEnabled()) return;
    if (g_inputDebug.shotPress) {
        TakeScreenshot(g_inputDebug.pressName.c_str());
        TraceLog(LOG_INFO, "RAYACT_INPUT screenshot -> %s", g_inputDebug.pressName.c_str());
        g_inputDebug.shotPress = false;
    }
    if (g_inputDebug.shotRelease) {
        TakeScreenshot(g_inputDebug.releaseName.c_str());
        TraceLog(LOG_INFO, "RAYACT_INPUT screenshot -> %s", g_inputDebug.releaseName.c_str());
        g_inputDebug.shotRelease = false;
    }
    if (g_inputDebug.afterTime > 0.0 && GetTime() >= g_inputDebug.afterTime) {
        TakeScreenshot(g_inputDebug.afterName.c_str());
        TraceLog(LOG_INFO, "RAYACT_INPUT screenshot -> %s", g_inputDebug.afterName.c_str());
        g_inputDebug.afterTime = -1.0;
    }
}

static void engineRenderScreenInSurface(int screenId, int width, int height, bool dispatchInput) {
    {
        const AppConfig& cfg = engineAppConfig();
        Color bg = { cfg.backgroundColor[0], cfg.backgroundColor[1],
                     cfg.backgroundColor[2], cfg.backgroundColor[3] };
        ClearBackground(bg);
    }
    if (!g_root) {
        // Fallback: immediate-mode shapes (backward compat). Only the focused
        // screen draws shapes — backgrounds behind the focused screen would
        // cover input regions otherwise.
        if (!dispatchInput) return;
        for (const Shape& shape : g_shapes) {
            Color c = {
                (unsigned char)((shape.color >> 24) & 0xFF),
                (unsigned char)((shape.color >> 16) & 0xFF),
                (unsigned char)((shape.color >>  8) & 0xFF),
                (unsigned char)( shape.color        & 0xFF)
            };
            switch (shape.type) {
                case 0: DrawRectangle(shape.x, shape.y, shape.width, shape.height, c); break;
                case 1: DrawCircle(shape.x, shape.y, shape.radius, c); break;
                case 2: DrawLine(shape.x1, shape.y1, shape.x2, shape.y2, c); break;
            }
        }
        return;
    }
    // raym3 v2 retained-mode path — render the current surface's tree.
    // Layout is in dp (so a 200dp box is the same physical size on a 1x and
    // 4x device); render is in px. Push dp-scale on the matrix stack so the
    // children draw at the right physical size.
    const float logicalW = raym3::v2::Density::PxToDp((float)width);
    const float logicalH = raym3::v2::Density::PxToDp((float)height);
    Rectangle bounds = {0.0f, 0.0f, logicalW, logicalH};
    const bool forceLayout = engineConsumeSurfaceRelayout(screenId);
    float dp = getRenderScaleDpi();
    applyAnimatedStylesToNodes();
    raym3::v2::TickScrollMomentum(g_root);
    raym3::v2::TickTransitions(g_root);
    raym3::v2::UpdateLayout(g_root, bounds);
    resolvePopoverAnchors();

    Vector2 mouse = GetMousePosition();
    // Android/iOS touch positions are physical pixels; macOS/desktop GLFW mouse
    // positions are already logical window coords even when the Metal drawable
    // is supersampled.
#if defined(RAYACT_ANDROID) || defined(RAYACT_IOS)
    Vector2 mouseDp = raym3::v2::Density::PxToDp(mouse);
#else
    Vector2 mouseDp = mouse;
#endif
    float wheelY = GetMouseWheelMove();
    bool pressed  = IsMouseButtonPressed(MOUSE_LEFT_BUTTON);
    bool released = IsMouseButtonReleased(MOUSE_LEFT_BUTTON);
    bool down     = IsMouseButtonDown(MOUSE_LEFT_BUTTON);
#if defined(RAYACT_ANDROID) || defined(RAYACT_IOS)
    const bool useQueuedTouch = true;
#else
    // Desktop: opt into the queued-touch source for scripted input
    // (RAYACT_SCRIPT harness drives engineQueueTouch from the main loop).
    static const bool useQueuedTouch = std::getenv("RAYACT_SYNTH_INPUT") != nullptr;
#endif
    if (useQueuedTouch) {
        std::lock_guard<std::mutex> lock(g_touchMutex);
        // Always use g_queuedTouch as the authoritative touch source on Android.
        // IsMouseButton* reflect raylib's PollInputEvents state which can fire
        // spurious released events when DOWN+UP arrive in the same poll cycle.
        mouse = g_queuedTouch.position;
#if defined(RAYACT_ANDROID) || defined(RAYACT_IOS)
        mouseDp = raym3::v2::Density::PxToDp(mouse);
#else
        mouseDp = mouse;
#endif
        pressed = g_queuedTouch.pressed;
        released = g_queuedTouch.released;
        down = g_queuedTouch.down;
        if (pressed && released) {
            // DOWN and UP arrived within one JS pump (fast tap / scripted
            // input). Dispatch DOWN this frame and hold UP for the next so
            // the release lands on the node activated by the press.
            released = false;
            down = true;
            g_queuedTouch.pressed = false; // keep .released queued
        } else {
            g_queuedTouch.pressed = false;
            g_queuedTouch.released = false;
        }
    }
#ifndef RAYACT_NO_WORKERS
    // Route hover/move/drag/down/up to any worker canvas node
    processWorkerInputEvents(mouse.x, mouse.y, pressed, released, down);
#endif

    // Unified per-frame input: controls/buttons first, then scroll (touch-slop +
    // directional claim). Scroll never preempts ResolveInput.
    if (dispatchInput) {
        raym3::v2::BeginInputFrame(mouseDp, down, pressed, released, wheelY);
        raym3::v2::NodeId preActive = raym3::v2::GetActiveId();
        raym3::v2::ResolveInput(g_root);
        raym3::v2::ResolveTextInput(g_root);
        raym3::v2::ResolveScrollInput(g_root);
        inputDebugOnFrame(mouseDp, pressed, released, preActive);
        rayactDrainDeferredInputCallbacks();
#if defined(RAYACT_ANDROID) || defined(RAYACT_IOS)
        if (released) {
            std::lock_guard<std::mutex> lock(g_touchMutex);
            g_touchPressFired = true;
        }
#endif
    }

    rlPushMatrix();
    rlScalef(dp, dp, 1.0f);
#if defined(RAYACT_ANDROID) || defined(RAYACT_IOS)
    SetMouseScale(1.0f / dp, 1.0f / dp); // M3 components call GetMousePosition() in dp space
#else
    SetMouseScale(1.0f, 1.0f); // Desktop mouse positions are already logical.
#endif
    raym3::v2::Render(g_root, bounds, /*layoutAlreadyComputed=*/!forceLayout);
    drawInspectorHighlight();
    SetMouseScale(1.0f, 1.0f);
    rlPopMatrix();
}

// Desktop legacy single-surface render frame.
void engineRenderFrame(int width, int height) {
    if (engineThreadedModeEnabled()) {
        engineSignalVsync();
        mutationBatchPushToRenderQueue();
    }

    workletRuntimeTick(GetFrameTime());

    const bool canIdleSkip = engineThreadedModeEnabled() && !engineNeedsAnotherFrame();
    if (canIdleSkip && g_root && raym3::v2::ShouldSkipRender(g_root)) {
        if (engineThreadedModeEnabled())
            engineWaitForCommit(16);
        return;
    }

    BeginDrawing();
#if defined(RAYACT_ANDROID_3D_SMOKE)
    ClearBackground((Color){20, 20, 30, 255});
    drawAndroid3DSmoke();
    EndDrawing();
    return;
#endif
#if defined(RAYACT_ANDROID) && defined(RAYACT_ANDROID_DIAGNOSTIC)
    ClearBackground((Color){20, 20, 30, 255});
    drawAndroidDiagnosticCube(width, height);
    DrawText("ROTATING CUBE SMOKE TEST", 80, 120, 52, (Color){235, 235, 245, 255});
    EndDrawing();
    return;
#endif
    raym3::BeginFrame();

    // Multi-screen render path: iterate the visible stack bottom→top. Each
    // screen's root is bound into the file-static g_root via engineBindScreenRoot
    // before rendering. Input is dispatched only on the focused (top) screen.
    // If no stack is active (legacy single-screen mode), fall through to the
    // g_root path with input enabled. Per-surface ClearBackground is done
    // inside engineRenderScreenInSurface.
    if (engineHasScreenStack()) {
        int focused = engineGetFocusedScreenId();
        engineForEachVisibleScreen([&](int id, const raym3::v2::NodePtr&) {
            engineBindScreenRoot(id); // moves this screen's root into g_root
            engineRenderScreenInSurface(id, width, height, id == focused);
        });
    } else {
        engineRenderScreenInSurface(engineGetCurrentScreenId(), width, height, true);
    }

    raym3::EndFrame();
    if (g_root) accessibilityBridge().rebuild(g_root);
    raym3::v2::ClearDirtyRects();
    EndDrawing();
}

// Android multi-surface render frame. The JNI layer binds one SurfaceView's
// EGL window before each call and passes the matching engine screen id. Android
// then composites those SurfaceViews in ViewGroup z-order, so this function
// renders exactly one screen tree into the currently bound window.
void engineRenderFrameAndroid(int screenId, int width, int height) {
    if (!engineHasScreenStack()) return; // legacy desktop path uses engineRenderFrame
    mutationBatchPushToRenderQueue();
    // BeginDrawing/EndDrawing are the raylib frame boundaries. On the RLVK
    // (Vulkan) backend they drive swapchain acquire + submit + present — the
    // custom external-surface SwapScreenBuffer() is a no-op for RLVK, so
    // without these the frame is rendered but never presented (black screen).
    // The caller has already bound the right window (RcoreAndroidSurface_BindWindow
    // → rlvkSetNativeWindow), so present targets the correct surface.
    //
    // Rendering is READ-ONLY w.r.t. screen state: g_currentScreenId and the
    // per-screen save/load are owned exclusively by JS (setCurrentScreen). We
    // snapshot the JS-owned globals, point g_root at this surface's tree just
    // long enough to draw/hit-test it, then restore.
    const int savedCurrent = engineGetCurrentScreenId();
    raym3::v2::NodePtr savedRoot = g_root; // the JS-current screen's live tree
    raym3::v2::NodePtr screenRoot =
        (screenId == savedCurrent) ? savedRoot : engineGetScreenRoot(screenId);
    if (!screenRoot) return;
    BeginDrawing();
    raym3::BeginFrame();
    const int focused = engineGetFocusedScreenId();
    g_root = screenRoot;
    engineRenderScreenInSurface(screenId, width, height, screenId == focused);
    raym3::EndFrame();
    EndDrawing();
    g_root = savedRoot; // restore JS-owned state untouched
}

bool engineNeedsAnotherFrame() {
    {
        // A queued touch event (e.g. the deferred UP of a one-pump tap) must
        // get a frame to dispatch in.
        std::lock_guard<std::mutex> lock(g_touchMutex);
        if (g_queuedTouch.pressed || g_queuedTouch.released)
            return true;
    }
    if (raym3::v2::HasActiveRipples())
        return true;
    // JS-driven animation sources: queued requestAnimationFrame callbacks and
    // in-flight setStyleAnimation transitions both need the next vsync.
    if (hasPendingAnimationFrames())
        return true;
    // Pending QuickJS jobs (promise reactions, microtasks — e.g. a React
    // commit scheduled by an onPress that fired during this frame's input
    // phase) only run inside the per-frame JS pump, so they need a frame.
    if (JSContext* ctx = engineContext()) {
        if (JS_IsJobPending(JS_GetRuntime(ctx)))
            return true;
    }
    // A setTimeout/setInterval that is already due also needs a frame to fire
    // in. Future deadlines are handled by the host's delayed wakeup (see
    // engineNextJSTimerDelayMs / RenderThread.postDelayed on Android).
    {
        const double timerDelay = nextJSTimerDelayMs();
        if (timerDelay >= 0.0 && timerDelay <= 0.5)
            return true;
    }
    if (hasActiveStyleAnimations())
        return true;
    bool needs = false;
    engineForEachVisibleScreen([&](int, const raym3::v2::NodePtr &root) {
        if (root && raym3::v2::NeedsAnotherFrame(root))
            needs = true;
    });
    if (!engineHasScreenStack() && g_root && raym3::v2::NeedsAnotherFrame(g_root))
        needs = true;
    return needs;
}

} // namespace rayact
