// Source for kv_probe.wasm — the WASM-worker side of the module-bus test
// (apps/desktop/kv_wasm_test.tsx). Reads a key the main thread wrote into the
// built-in KV store, through the native module bus (sys_invoke), and posts the
// retrieved value back to the main thread (sys_post_message).
//
// Build (see build-kv_probe.sh):
//   clang --target=wasm32 -O2 -nostdlib \
//     -Wl,--no-entry -Wl,--allow-undefined -Wl,--export=_start \
//     -o kv_probe.wasm kv_probe.c

__attribute__((import_module("env"), import_name("sys_invoke")))
int sys_invoke(const char* name, int nameLen,
               const char* method, int methodLen,
               const char* args, int argsLen,
               char* out, int outCap);

__attribute__((import_module("env"), import_name("sys_post_message")))
void sys_post_message(const char* ptr, int len);

static char out[256];
static int slen(const char* s) { int i = 0; while (s[i]) i++; return i; }

__attribute__((export_name("_start")))
int _start(void) {
  // Read the key the main thread wrote, through the native module bus.
  int n = sys_invoke("kv", 2, "get", 3, "wasmprobe", 9, out, 256);
  if (n < 0) {
    const char* e = "WASM_ERR_no_value";
    sys_post_message(e, slen(e));
    return 0;
  }
  // Prefix so the app can show provenance, then the retrieved bytes.
  static char msg[300];
  const char* pre = "wasm-read:";
  int i = 0;
  for (; pre[i]; i++) msg[i] = pre[i];
  for (int j = 0; j < n; j++) msg[i++] = out[j];
  sys_post_message(msg, i);
  return 0;
}
