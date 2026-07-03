#include "android_engine_instance.hpp"

#include "../desktop/raym3_bridge.hpp"
#include <raym3/fonts/FontManager.h>
#include <raym3/v2/IconRenderer.h>

extern "C" {
#include "rcore_android_surface.h"
void CloseWindow(void);
}
#include <raylib.h>

extern JavaVM* g_jvm;
// Process-wide engine lock (defined in jni_bridge.cpp). Render threads hold it
// for the whole of nativeRenderFrame; graphics teardown must take it too so
// CloseWindow can never run while a frame is in flight (vkWaitForFences on a
// destroyed device → SIGSEGV).
extern std::mutex g_engineMutex;

namespace {

std::mutex g_instancesMutex;
std::map<jlong, std::unique_ptr<AndroidEngineInstance>> g_instances;
jlong g_nextInstanceId = 1;
// Process-wide (NOT thread_local): the engine globals this mirrors
// (g_surfaces, g_ctx, …) are process-wide, so a per-thread notion of
// "current" was a lie — each new thread's first call reloaded a stale
// member mirror over the live globals. All switches happen under
// g_engineMutex; the pointer itself is atomic so fast-path reads on other
// threads are well-defined.
std::atomic<AndroidEngineInstance*> g_currentInstance{nullptr};

std::mutex g_graphicsLeaseMutex;
jlong g_graphicsLeaseHolder = 0;

static std::string jstr(JNIEnv* env, jstring s) {
    if (!s) return {};
    const char* c = env->GetStringUTFChars(s, nullptr);
    std::string out(c ? c : "");
    if (c) env->ReleaseStringUTFChars(s, c);
    return out;
}

static bool attachEnv(JNIEnv** outEnv, bool* outNeedDetach) {
    if (!g_jvm || !outEnv || !outNeedDetach) return false;
    *outEnv = nullptr;
    *outNeedDetach = false;
    jint rs = g_jvm->GetEnv((void**)outEnv, JNI_VERSION_1_6);
    if (rs == JNI_EDETACHED) {
        if (g_jvm->AttachCurrentThread(outEnv, nullptr) != JNI_OK) return false;
        *outNeedDetach = true;
        return true;
    }
    return rs == JNI_OK;
}

} // namespace

AndroidEngineInstance* androidEngineCurrent() {
    return g_currentInstance.load(std::memory_order_acquire);
}

void androidEngineSetCurrent(AndroidEngineInstance* inst) {
    g_currentInstance.store(inst, std::memory_order_release);
}

AndroidEngineInstance* androidEngineInstanceFromHandle(jlong handle) {
    std::lock_guard<std::mutex> lock(g_instancesMutex);
    auto it = g_instances.find(handle);
    return it != g_instances.end() ? it->second.get() : nullptr;
}

// Callers must hold g_engineMutex (or be on the single boot path before any
// render thread exists): switching instances swaps the process globals.
void AndroidEngineInstance::setCurrent() {
    AndroidEngineInstance* current = androidEngineCurrent();
    if (current == this) {
        // Already current: the process globals are the authoritative state.
        // Reloading the (possibly stale) member mirror here would clobber
        // g_surfaces while a render frame iterates it — every touch event
        // used to do exactly that, corrupting the surface map mid-frame.
        runtime.activate();
        return;
    }
    if (current) {
        androidEngineSaveInstanceState(current);
        current->runtime.deactivate();
    }
    runtime.activate();
    androidEngineLoadInstanceState(this);
    androidEngineSetCurrent(this);
}

void AndroidEngineInstance::registerHost(JNIEnv* env, jobject callbacks) {
    if (hostCallbacksGlobal) {
        env->DeleteGlobalRef(hostCallbacksGlobal);
        hostCallbacksGlobal = nullptr;
    }
    if (callbacks) hostCallbacksGlobal = env->NewGlobalRef(callbacks);
}

void AndroidEngineInstance::releaseHost(JNIEnv* env) {
    if (hostCallbacksGlobal) {
        env->DeleteGlobalRef(hostCallbacksGlobal);
        hostCallbacksGlobal = nullptr;
    }
}

static jobject hostObj(JNIEnv* env, const AndroidEngineInstance* inst) {
    return inst ? inst->hostCallbacksGlobal : nullptr;
}

jint AndroidEngineInstance::callHostInt(const char* method) const {
    if (!g_jvm || !hostCallbacksGlobal) return 0;
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return 0;
    jint result = 0;
    jclass cls = env->GetObjectClass(hostCallbacksGlobal);
    if (cls) {
        jmethodID m = env->GetMethodID(cls, method, "()I");
        if (m) result = env->CallIntMethod(hostCallbacksGlobal, m);
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) { env->ExceptionDescribe(); env->ExceptionClear(); }
    if (needDetach) g_jvm->DetachCurrentThread();
    return result;
}

void AndroidEngineInstance::callHostVoid(const char* method) const {
    if (!g_jvm || !hostCallbacksGlobal) return;
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return;
    jclass cls = env->GetObjectClass(hostCallbacksGlobal);
    if (cls) {
        jmethodID m = env->GetMethodID(cls, method, "()V");
        if (m) env->CallVoidMethod(hostCallbacksGlobal, m);
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) { env->ExceptionDescribe(); env->ExceptionClear(); }
    if (needDetach) g_jvm->DetachCurrentThread();
}

std::string AndroidEngineInstance::callHostString(const char* method) const {
    if (!g_jvm || !hostCallbacksGlobal) return {};
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return {};
    std::string result;
    jclass cls = env->GetObjectClass(hostCallbacksGlobal);
    if (cls) {
        jmethodID m = env->GetMethodID(cls, method, "()Ljava/lang/String;");
        if (m) {
            jstring js = (jstring)env->CallObjectMethod(hostCallbacksGlobal, m);
            result = jstr(env, js);
            if (js) env->DeleteLocalRef(js);
        }
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) { env->ExceptionDescribe(); env->ExceptionClear(); }
    if (needDetach) g_jvm->DetachCurrentThread();
    return result;
}

void AndroidEngineInstance::callHostReleaseSurface(int surfaceId) const {
    if (!g_jvm || !hostCallbacksGlobal) return;
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return;
    jclass cls = env->GetObjectClass(hostCallbacksGlobal);
    if (cls) {
        jmethodID m = env->GetMethodID(cls, "releaseSurface", "(I)V");
        if (m) env->CallVoidMethod(hostCallbacksGlobal, m, (jint)surfaceId);
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) { env->ExceptionDescribe(); env->ExceptionClear(); }
    if (needDetach) g_jvm->DetachCurrentThread();
}

void AndroidEngineInstance::callHostOrderSurfaces(const int* ids, int count) const {
    if (!g_jvm || !hostCallbacksGlobal || !ids || count <= 0) return;
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return;
    jintArray arr = env->NewIntArray((jsize)count);
    if (arr) {
        env->SetIntArrayRegion(arr, 0, (jsize)count, reinterpret_cast<const jint*>(ids));
        jclass cls = env->GetObjectClass(hostCallbacksGlobal);
        if (cls) {
            jmethodID m = env->GetMethodID(cls, "orderSurfaces", "([I)V");
            if (m) env->CallVoidMethod(hostCallbacksGlobal, m, arr);
            env->DeleteLocalRef(cls);
        }
        env->DeleteLocalRef(arr);
    }
    if (env->ExceptionCheck()) { env->ExceptionDescribe(); env->ExceptionClear(); }
    if (needDetach) g_jvm->DetachCurrentThread();
}

void AndroidEngineInstance::callHostIme(
    const char* method, int nodeId, const std::string& value,
    const std::string& inputType, bool autocorrect, bool secure,
    const std::string& imeAction) const {
    if (!g_jvm || !hostCallbacksGlobal) return;
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return;
    jclass cls = env->GetObjectClass(hostCallbacksGlobal);
    if (cls) {
        jmethodID m = env->GetMethodID(
            cls, method,
            "(ILjava/lang/String;Ljava/lang/String;ZZLjava/lang/String;)V");
        if (m) {
            jstring jVal = env->NewStringUTF(value.c_str());
            jstring jInputType = env->NewStringUTF(inputType.c_str());
            jstring jImeAction = env->NewStringUTF(imeAction.c_str());
            env->CallVoidMethod(hostCallbacksGlobal, m, (jint)nodeId, jVal, jInputType,
                                (jboolean)autocorrect, (jboolean)secure, jImeAction);
            env->DeleteLocalRef(jImeAction);
            env->DeleteLocalRef(jInputType);
            env->DeleteLocalRef(jVal);
        }
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) { env->ExceptionDescribe(); env->ExceptionClear(); }
    if (needDetach) g_jvm->DetachCurrentThread();
}

void AndroidEngineInstance::callHostCopyToClipboard(const std::string& text) const {
    if (!g_jvm || !hostCallbacksGlobal) return;
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return;
    jclass cls = env->GetObjectClass(hostCallbacksGlobal);
    if (cls) {
        jmethodID m = env->GetMethodID(cls, "copyToClipboard", "(Ljava/lang/String;)V");
        if (m) {
            jstring js = env->NewStringUTF(text.c_str());
            env->CallVoidMethod(hostCallbacksGlobal, m, js);
            env->DeleteLocalRef(js);
        }
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) { env->ExceptionDescribe(); env->ExceptionClear(); }
    if (needDetach) g_jvm->DetachCurrentThread();
}

void AndroidEngineInstance::callHostUpdateImeState(
    int nodeId, int selectionStart, int selectionEnd,
    int composingStart, int composingEnd, const char* text) const {
    if (!g_jvm || !hostCallbacksGlobal) return;
    JNIEnv* env = nullptr;
    bool needDetach = false;
    if (!attachEnv(&env, &needDetach)) return;
    jclass cls = env->GetObjectClass(hostCallbacksGlobal);
    if (cls) {
        jmethodID m = env->GetMethodID(
            cls, "updateImeState",
            "(IIIILjava/lang/String;)V");
        if (m) {
            jstring jText = text ? env->NewStringUTF(text) : nullptr;
            env->CallVoidMethod(hostCallbacksGlobal, m, (jint)nodeId,
                                (jint)selectionStart, (jint)selectionEnd,
                                (jint)composingStart, (jint)composingEnd, jText);
            if (jText) env->DeleteLocalRef(jText);
        }
        env->DeleteLocalRef(cls);
    }
    if (env->ExceptionCheck()) { env->ExceptionDescribe(); env->ExceptionClear(); }
    if (needDetach) g_jvm->DetachCurrentThread();
}

static std::atomic<bool> g_graphicsValid{false};
void androidEngineSetGraphicsValid(bool valid) {
    g_graphicsValid.store(valid, std::memory_order_release);
}
bool androidEngineGraphicsValid() {
    return g_graphicsValid.load(std::memory_order_acquire);
}

static void releaseGraphicsLocked(AndroidEngineInstance* inst) {
    if (!inst || !inst->graphicsActive.load(std::memory_order_acquire)) return;
    // Exclude in-flight render frames: nativeRenderFrame holds g_engineMutex
    // for the whole frame, so once we own it no thread is inside Vulkan.
    std::lock_guard<std::mutex> lock(g_engineMutex);
    if (androidEngineCurrent() == inst) {
        // Globals are authoritative while current; refresh the member mirror
        // so the surface walk below sees the live surface set.
        androidEngineSaveInstanceState(inst);
    }
    inst->setCurrent();
    if (!inst->surfaces.empty()) {
        std::vector<int> ids;
        ids.reserve(inst->surfaces.size());
        for (auto& [id, s] : inst->surfaces) ids.push_back(id);
        for (auto it = ids.rbegin(); it != ids.rend(); ++it) {
            AndroidEngineSurface& s = inst->surfaces[*it];
            RcoreAndroidSurface_DestroyWindow(s.windowId);
            s.window = nullptr;
            const bool isRoot = (*it == inst->rootScreenId);
            if (!isRoot) engineDestroyScreen(*it);
        }
        inst->surfaces.clear();
    }
    if (IsWindowReady()) CloseWindow();
    raym3::FontManager::ResetDeviceCache();
    raym3::v2::IconRendererResetDeviceCache();
    inst->graphicsActive.store(false, std::memory_order_release);
    // The global raym3/raylib device caches were just torn down (CloseWindow +
    // ResetDeviceCache above). No instance may render until nativeCreateSurface
    // rebuilds them.
    g_graphicsValid.store(false, std::memory_order_release);
    // Publish the cleared surface set back to the globals (inst is current
    // after setCurrent above) so the render path can't see destroyed windows.
    androidEngineLoadInstanceState(inst);
}

void androidEngineReleaseGraphics(jlong handle) {
    std::lock_guard<std::mutex> leaseLock(g_graphicsLeaseMutex);
    AndroidEngineInstance* inst = androidEngineInstanceFromHandle(handle);
    if (!inst) return;
    releaseGraphicsLocked(inst);
    if (g_graphicsLeaseHolder == handle) g_graphicsLeaseHolder = 0;
}

bool androidEngineAcquireGraphics(jlong handle) {
    std::lock_guard<std::mutex> leaseLock(g_graphicsLeaseMutex);
    if (g_graphicsLeaseHolder == handle) {
        AndroidEngineInstance* inst = androidEngineInstanceFromHandle(handle);
        if (inst) inst->graphicsActive = true;
        return true;
    }
    if (g_graphicsLeaseHolder != 0) {
        AndroidEngineInstance* prev = androidEngineInstanceFromHandle(g_graphicsLeaseHolder);
        // Stealing the lease (e.g. DevLauncherActivity.onStart runs before
        // ProjectActivity.onStop on back-navigation). The previous session's
        // render thread is still alive — stop it synchronously before tearing
        // down the Vulkan device it renders with.
        if (prev) prev->callHostVoid("stopRenderScheduler");
        releaseGraphicsLocked(prev);
        g_graphicsLeaseHolder = 0;
    }
    AndroidEngineInstance* inst = androidEngineInstanceFromHandle(handle);
    if (!inst) return false;
    {
        std::lock_guard<std::mutex> lock(g_engineMutex);
        inst->setCurrent();
    }
    inst->graphicsActive = true;
    g_graphicsLeaseHolder = handle;
    return true;
}

jlong androidEngineInstanceCreate(const std::string& dataPath) {
    auto inst = std::make_unique<AndroidEngineInstance>();
    inst->dataPath = dataPath;
    {
        // EngineRuntime::create() flips the process-global active-runtime slot
        // (its activate()/deactivate() round-trip to seed storage) and touches
        // the shared js-stdlib timer/rAF lists. That MUST be serialized against
        // the render loop — a render thread holds g_engineMutex for the whole
        // frame — or the second instance's creation races the first instance's
        // JS pump and crashes in JS_FreeValue (SIGSEGV on first launcher→project
        // open). Restore the previously-active runtime afterward so the visible
        // pane keeps its live JS context.
        std::lock_guard<std::mutex> lock(g_engineMutex);
        rayact::EngineRuntime* prev = rayact::engineRuntimeActive();
        if (!inst->runtime.create(dataPath)) return 0;
        if (prev) prev->activate();
    }
    inst->engineReady = true;
    std::lock_guard<std::mutex> lock(g_instancesMutex);
    inst->id = g_nextInstanceId++;
    jlong handle = inst->id;
    g_instances[handle] = std::move(inst);
    return handle;
}

void androidEngineInstanceDestroy(jlong handle) {
    {
        std::lock_guard<std::mutex> leaseLock(g_graphicsLeaseMutex);
        if (g_graphicsLeaseHolder == handle) {
            AndroidEngineInstance* inst = androidEngineInstanceFromHandle(handle);
            releaseGraphicsLocked(inst);
            g_graphicsLeaseHolder = 0;
        }
    }
    std::unique_ptr<AndroidEngineInstance> owned;
    AndroidEngineInstance* resumeInstance = nullptr;
    {
        std::lock_guard<std::mutex> lock(g_instancesMutex);
        auto it = g_instances.find(handle);
        if (it == g_instances.end()) return;
        AndroidEngineInstance* current = androidEngineCurrent();
        if (current && current != it->second.get())
            resumeInstance = current;
        owned = std::move(it->second);
        g_instances.erase(it);
    }
    std::lock_guard<std::mutex> lock(g_engineMutex);
    if (owned) {
        owned->setCurrent();
        owned->runtime.destroy();
    }
    if (resumeInstance) {
        resumeInstance->setCurrent();
    } else if (androidEngineCurrent() == owned.get()) {
        androidEngineSetCurrent(nullptr);
    }
}
