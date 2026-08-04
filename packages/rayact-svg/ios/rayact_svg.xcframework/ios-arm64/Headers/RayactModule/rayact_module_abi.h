/*
 * rayact module ABI — stable C interface for optional native plugins.
 *
 * A plugin is a shared library (librayact_<name>.{dylib,so,dll}) dropped into the
 * app's module directory by its npm package. At engine boot the plugin loader
 * dlopen's it and calls the C entry point:
 *
 *     int rayact_module_register(const RayactHost* host);
 *
 * The plugin uses host->register_module(...) to publish one or more named modules
 * into the process-wide bus. Every runtime context (main QuickJS, JS workers, WASM
 * workers) can then invoke a module's methods by name. The engine transports raw
 * bytes only; each module defines its own arg/result encoding.
 *
 * All calls are in-process C function calls (no IPC, no Java marshaling between
 * libraries). Keep this header dependency-free and C-compatible.
 *
 * Versioning
 * ----------
 * The host's capabilities grow by appending to RayactHost; that struct is owned by
 * the engine, so appending is safe. RayactModule's layout is FROZEN: busRegister
 * copies it by value, and growing it would read past the end of a struct compiled
 * against an older header.
 *
 * The compatibility rule, in both directions:
 *
 *   - A module checks `host->abi_version >= N` for the lowest N whose fields it
 *     actually uses. Never check for equality: a newer host is still compatible.
 *   - A host accepts modules reporting any abi_version in 1..RAYACT_MODULE_ABI_VERSION.
 *
 * ABI history:
 *   1  initial: named modules, byte-in/byte-out invoke
 *   2  node kinds (modules can own render nodes), GPU table, shared buffers,
 *      frame requests, WASM host-import registration
 *   3  platform view factories (modules can own composited native views)
 *   4  visual-hosting handles and forwarded pointer/key input
 *   5  off-screen platform-view frame delivery
 */
#ifndef RAYACT_MODULE_ABI_H
#define RAYACT_MODULE_ABI_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define RAYACT_MODULE_ABI_VERSION 5u

typedef struct {
  const uint8_t* ptr;
  size_t len;
} RayactBytes;

/*
 * Invoke a method on a module. Returns 0 on success, negative on error.
 * On success *out points to a buffer owned by the module until release() is
 * called with the same buffer. args.ptr may be NULL when args.len == 0.
 */
typedef int (*RayactInvokeFn)(void* self, const char* method,
                              RayactBytes args, RayactBytes* out);

typedef void (*RayactReleaseFn)(void* self, RayactBytes buf);

/* Layout frozen at ABI 1 — see the versioning note above before adding a field. */
typedef struct {
  uint32_t abi_version;     /* set to RAYACT_MODULE_ABI_VERSION */
  void* self;               /* module instance, passed back to invoke/release */
  RayactInvokeFn invoke;
  RayactReleaseFn release;  /* may be NULL if invoke never allocates *out */
} RayactModule;

/* ---------------------------------------------------------------- ABI 2 ---- */

/* Layout rectangle in dp, handed to a node's draw callback. */
typedef struct {
  float x, y, width, height;
} RayactRect;

/*
 * A node kind lets a module own a native render node — the mechanism behind
 * module-provided components. The engine creates the node, runs layout and style,
 * and calls draw() with the resolved rect; the module owns everything inside it.
 *
 * Threading contract, which the engine does NOT enforce:
 *   create / update / dispose   engine JS thread
 *   draw / gpu_reset / needs_frame   render thread; draw only inside a live frame
 * Those are different threads whenever threaded mode is on, so a module must
 * synchronize its own per-node state.
 *
 * props are UTF-8 JSON; NULL/"" mean "no props". create/update return <0 on
 * error, 0 on success, >0 on success when the change needs another frame drawn.
 * Kinds are never unregistered; the vtable is copied at registration.
 */
typedef struct RayactNodeVTable {
  uint32_t struct_size;     /* sizeof(RayactNodeVTable) — forward compatibility */
  void* self;
  int (*create)(void* self, int32_t node_id, const char* props_json, size_t props_len);
  int (*update)(void* self, int32_t node_id, const char* props_json, size_t props_len);
  void (*draw)(void* self, int32_t node_id, RayactRect layout);
  void (*dispose)(void* self, int32_t node_id);
  void (*gpu_reset)(void* self);   /* graphics device lost; drop GPU objects. May be NULL. */
  int (*needs_frame)(void* self);  /* cheap poll; nonzero schedules a frame. May be NULL. */
} RayactNodeVTable;

/*
 * A platform view factory lets a module own a real OS view composited inside the
 * rayact scene — a WKWebView/NSView on macOS, and the same shape for future hosts
 * (the handle is deliberately void*, so a Linux GTK/WPE widget fits unchanged).
 *
 * Division of labour: the engine owns the surrounding wrapper view, hit-testing,
 * clipping, layout and occlusion; the module owns everything inside its view. This
 * is the desktop counterpart of Android's RayactPlatformRegistry.registerViewFactory
 * and iOS's registerViewFactory, and the naming is kept parallel on purpose.
 *
 * All calls run on the platform main/UI thread. `props_json` is UTF-8 JSON; in the
 * patch passed to set_properties an explicit JSON null means "this prop was
 * removed". As with node kinds, the vtable is copied at registration and kinds are
 * never unregistered.
 */
typedef struct RayactViewFactory {
  uint32_t struct_size;     /* sizeof(RayactViewFactory) — forward compatibility */
  void* self;
  /*
   * Create an instance for one node. Returns an opaque instance handle (NULL on
   * failure) and writes the platform view the host should embed into
   * *out_native_view (an NSView* on macOS).
   */
  void* (*create)(void* self, int32_t node_id, const char* props_json,
                  size_t props_len, void** out_native_view);
  int (*set_properties)(void* instance, const char* props_patch_json, size_t len);
  /*
   * The host sized the view. The first call carries the first non-zero bounds,
   * which is the hook a web view needs: WKWebView silently refuses to load while
   * its frame is empty, and `create` necessarily runs before the first layout.
   * May be NULL.
   */
  void (*notify_layout)(void* instance, float width, float height);
  void (*dispose)(void* instance);
  /*
   * ABI 4, and only for visual-hosted views. A view composited as a bare visual
   * owns no window, so the OS never routes input to it — the host forwards what
   * lands inside the view's bounds instead. Both may be NULL, and a host must
   * check struct_size before reading them.
   *
   * Coordinates are in view-local dp, origin top-left. `kind` is 0=move, 1=down,
   * 2=up for pointers and 0=down, 1=up, 2=char for keys; `buttons` is a bitmask
   * of held buttons (1=left, 2=right, 4=middle); `wheel` is in detents.
   * Windows platform views that host a window of their own ignore these.
   */
  void (*notify_pointer)(void* instance, int32_t kind, float x, float y,
                         int32_t buttons, float wheel);
  void (*notify_key)(void* instance, int32_t kind, int32_t key_code,
                     int32_t modifiers, uint32_t text_codepoint);
  /*
   * ABI 5. Optional off-screen frame producer. A factory that implements this
   * returns NULL in *out_native_view from create(); the host then calls this
   * function on its render thread and paints the returned pixels as the
   * external view's ordinary scene texture. This avoids native-window airspace
   * and gives framework content above and below the view exact pixel ordering.
   *
   * Pixels are premultiplied BGRA8, top row first. `generation` is in/out: the
   * caller supplies the generation it already uploaded. Return 0 when no newer
   * frame exists, a positive required byte count when `dst` is NULL/too small,
   * or the copied byte count on success. width/height/stride are always filled
   * when a frame exists. The producer retains ownership of its source buffer;
   * the callback must copy before returning.
   */
  int (*copy_frame_bgra8)(void* instance, uint8_t* dst, size_t capacity,
                          int32_t* width, int32_t* height, int32_t* stride,
                          uint64_t* generation);
} RayactViewFactory;

/*
 * The drawing subset that behaves identically across every raylib backend rayact
 * ships (desktop GL, rlvk/Vulkan, rlmt/Metal, rlwg/WebGPU). Deliberately narrow:
 * no stencil (dead on three of the four), no shaders (three source languages), no
 * vertex arrays (a no-op on rlwg). Values mirror rlgl's own constants.
 */
typedef struct {
  uint32_t id;
  int32_t width, height, mipmaps, format;
} RayactGpuTexture;

#define RAYACT_GPU_TRIANGLES       0x0004 /* RL_TRIANGLES */
#define RAYACT_GPU_FILTER_POINT    0
#define RAYACT_GPU_FILTER_BILINEAR 1
#define RAYACT_GPU_WRAP_REPEAT     0
#define RAYACT_GPU_WRAP_CLAMP      1

typedef struct RayactGpuApi {
  uint32_t struct_size;
  void (*begin)(int mode);
  void (*end)(void);
  void (*vertex2f)(float x, float y);
  void (*color4ub)(unsigned char r, unsigned char g, unsigned char b, unsigned char a);
  void (*tex_coord2f)(float u, float v);
  void (*set_texture)(uint32_t id);
  uint32_t (*default_texture_id)(void);
  void (*push_matrix)(void);
  void (*pop_matrix)(void);
  void (*translatef)(float x, float y, float z);
  void (*rotatef)(float angle_deg, float x, float y, float z);
  void (*scalef)(float x, float y, float z);
  int (*check_render_batch_limit)(int vertex_count);
  RayactGpuTexture (*load_texture_rgba8)(const void* pixels, int width, int height);
  void (*update_texture_rgba8)(RayactGpuTexture tex, const void* pixels);
  void (*unload_texture)(RayactGpuTexture tex);
  void (*set_texture_filter)(RayactGpuTexture tex, int filter);
  void (*set_texture_wrap)(RayactGpuTexture tex, int wrap);
  void (*begin_scissor)(int x, int y, int width, int height);
  void (*end_scissor)(void);
} RayactGpuApi;

/*
 * A host function a module contributes to WASM workers, callable from wasm under
 * the namespace it was registered with. signature uses wasm3's grammar —
 * result '(' params ')' over the letters v i I f F, e.g. "i(iii)".
 *
 * mem/mem_size are the calling module's linear memory; any pointer a module reads
 * out of args must be bounds-checked against them. Return <0 to trap the call.
 */
typedef int (*RayactWasmHostFn)(void* self, uint8_t* mem, size_t mem_size,
                                const uint64_t* args, uint64_t* results);

typedef struct {
  const char* name;
  const char* signature;
  RayactWasmHostFn fn;
  void* self;
} RayactWasmImport;

/*
 * Engine capabilities handed to a plugin at registration time. A plugin may call
 * back into the bus (e.g. to use the built-in "kv" module as its substrate) and
 * reach platform handles it needs.
 *
 * Append-only. Check host->abi_version before using anything below the ABI 1 mark.
 */
typedef struct RayactHost {
  uint32_t abi_version;
  /* --- ABI 1. Layout frozen. --- */
  const char* (*data_dir)(void);
  int (*register_module)(const char* name, const RayactModule* mod);
  int (*invoke)(const char* name, const char* method, RayactBytes args,
                RayactBytes* out, RayactReleaseFn* out_release, void** out_self);
  void (*random_bytes)(uint8_t* out, size_t n);
  void (*log)(int level, const char* msg);
  void* (*get_java_vm)(void); /* JavaVM* on Android, NULL elsewhere */
  /* --- ABI 2. --- */
  int (*register_node_kind)(const char* kind, const RayactNodeVTable* vtable);
  const RayactGpuApi* (*gpu)(void);
  /*
   * Shared buffers are zero-copy scalar slabs a module publishes to JS, which sees
   * them as an ArrayBuffer via __rayact_module_buffer(id). Intended for hot
   * per-frame data that would otherwise be re-encoded every frame.
   *
   * Treat them as module-lifetime allocations: drop is for teardown, not churn.
   * Readers and writers race by design, so keep the contents plain scalars and
   * publish a generation counter — a torn read must cost at most one stale frame.
   */
  int32_t (*shared_buffer_create)(size_t size, void** out_ptr); /* >=0 id, <0 error */
  void* (*shared_buffer_ptr)(int32_t id, size_t* out_size);
  int (*shared_buffer_drop)(int32_t id);
  void (*request_frame)(void); /* wake an idle on-demand host */
  int (*register_wasm_imports)(const char* ns, const RayactWasmImport* imports,
                               size_t count);
  /* --- ABI 3. --- */
  int (*register_view_factory)(const char* kind, const RayactViewFactory* factory);
  /*
   * Deliver an event envelope from a module-owned view up to the node's JS
   * handler (the same channel the engine's own platform views use). The payload
   * is UTF-8 JSON, by convention {"type": "...", "data": "..."}. Main thread only;
   * silently dropped when the node has no JS handler attached.
   */
  void (*emit_view_event)(int32_t node_id, const char* json_utf8, size_t len);
  /* --- ABI 4. --- */
  /*
   * Handles a visual-hosted platform view needs from the host. Both are NULL on
   * platforms where a module simply hands back its own view (macOS/iOS: AppKit
   * and UIKit composite an NSView/UIView with no host handles involved).
   *
   * native_window: the host's top-level window — HWND on Windows.
   * compositor:    the host's compositor device, whose visual tree a module must
   *                allocate from for its visuals to be composable with the
   *                host's — IDCompositionDevice* on Windows.
   *
   * A Windows module using DirectComposition needs both: its visual must come
   * from the host's device and receives input through notify_pointer/notify_key.
   * ABI-5 off-screen modules can ignore compositor and return frame pixels.
   */
  void* (*native_window)(void);
  void* (*compositor)(void);
  /* --- ABI 5. --- */
  /* ABI 5 is carried by RayactViewFactory::copy_frame_bgra8. No new host
   * function is required: frame wakeups use the ABI-2 request_frame callback. */
} RayactHost;

/*
 * Export marker for a plugin's entry points.
 *
 * Mach-O and ELF give every symbol default visibility, so the entry point was
 * historically declared bare. A Windows DLL exports nothing unless asked, and
 * the loader's GetProcAddress would come back empty — so entry points must be
 * marked. Applies to the dynamic (dlopen'd) entry point only; iOS links its
 * modules statically and needs no marker.
 */
#if defined(_WIN32)
  #define RAYACT_MODULE_EXPORT __declspec(dllexport)
#elif defined(__GNUC__) || defined(__clang__)
  #define RAYACT_MODULE_EXPORT __attribute__((visibility("default")))
#else
  #define RAYACT_MODULE_EXPORT
#endif

/* Plugin entry point. Implemented by every plugin. */
typedef int (*RayactModuleRegisterFn)(const RayactHost* host);

#ifdef __cplusplus
} /* extern "C" */
#endif

#endif /* RAYACT_MODULE_ABI_H */
