// Generic localStorage + secure-random bridge for dlopen'd web modules.
//
// Not mmkv-specific — any future web module needing small, synchronous
// key/value persistence can use it (first consumer: packages/rayact-mmkv's
// web/wasm32 side module). It is compiled into the HOST, not into a side
// module, and that distinction is load-bearing: EM_JS's JS body is extracted
// by the link step that emits a target's own glue file, which only happens for
// a MAIN_MODULE / plain executable — a `-sSIDE_MODULE=1` build has no such
// step, so EM_JS inside a dlopen'd module silently produces an import nobody
// will ever satisfy (confirmed empirically: the resulting .wasm carries no
// "em_js" custom section, unlike what dylib-loading might suggest). Putting the
// JS here instead, in the host, and exposing it as ordinary exported C
// functions — the same pattern native/web/web_platform_modules.cpp already
// uses for platformCall — is the form that actually works from a dylib.
//
// Kept out of the RayactHost function-pointer table (native/core/rayact_module_abi.h)
// on purpose: that table is the portable, cross-platform ABI shared with
// Android/iOS/desktop, and a browser-storage capability would be meaningless
// there. This sits alongside the libc/libc++ surface in
// native/web/module_sdk_exports.txt as the same kind of thing — a small,
// explicit, additive host capability — rather than reopening the engine itself
// to modules.
//
// Every function is synchronous: EM_ASM/EM_ASM_INT calls into the browser and
// returns before the C call unwinds. Values are treated as opaque bytes (not
// necessarily valid UTF-8), so this base64-encodes them for the underlying
// localStorage string; a caller never needs to know that.
//
// Values are also obfuscated at rest. Storage KEYS stay in the clear — they are
// the localStorage key names, so a developer can still see what an app stores in
// DevTools > Application > Local Storage — while each VALUE is XORed against a
// keystream seeded from a per-install random secret plus a per-value random
// nonce. Doing it here rather than in each caller means @rayact/mmkv and the
// built-in KV get identical treatment from one implementation.
//
// This is deliberately NOT vetted cryptography, and the reason is structural:
// the real primitive (Web Crypto's SubtleCrypto) is Promise-only, while both
// callers must return a value synchronously to match their behaviour on every
// other platform. It raises the cost of casually reading an app's stored data
// out of a browser profile; it is not a defence against an attacker running
// code on the page, who can simply call the same bridge. Anything needing a
// genuine secret store should use @rayact/secure-store — the same guidance as
// on Android/iOS, where MMKV is likewise unencrypted at rest.

#include <emscripten.h>

#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <string>

namespace {

constexpr size_t kNonceLen = 12;
constexpr size_t kSecretLen = 32;

// Raw (unobfuscated) localStorage access, used for the secret itself and as the
// primitive the public API layers obfuscation on top of.
int rawGet(const char* key, uint8_t** outPtr) {
    return EM_ASM_INT({
        var raw = null;
        try { raw = localStorage.getItem(UTF8ToString($0)); } catch (e) {}
        if (raw === null) return -1;
        var binary = atob(raw);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        var ptr = _malloc(bytes.length || 1);
        HEAPU8.set(bytes, ptr);
        setValue($1, ptr, 'i32');
        return bytes.length;
    }, key, outPtr);
}

void rawSet(const char* key, const uint8_t* value, int valueLen) {
    EM_ASM({
        var bytes = HEAPU8.slice($1, $1 + $2);
        var binary = '';
        var chunk = 0x8000; // chunked: avoids a stack overflow on fromCharCode.apply
        for (var i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        try { localStorage.setItem(UTF8ToString($0), btoa(binary)); } catch (e) {}
    }, key, value, valueLen);
}

void randomBytes(uint8_t* buf, int len) {
    EM_ASM({
        var bytes = new Uint8Array($1);
        (self.crypto || window.crypto).getRandomValues(bytes);
        HEAPU8.set(bytes, $0);
    }, buf, len);
}

const uint8_t* installSecret() {
    static uint8_t secret[kSecretLen];
    static bool loaded = false;
    if (loaded) return secret;
    loaded = true;
    uint8_t* existing = nullptr;
    int len = rawGet("__rayact_storage_secret", &existing);
    if (len == (int)kSecretLen) {
        memcpy(secret, existing, kSecretLen);
    } else {
        randomBytes(secret, kSecretLen);
        rawSet("__rayact_storage_secret", secret, (int)kSecretLen);
    }
    if (existing) free(existing);
    return secret;
}

uint32_t fnv1aSeed(const uint8_t* data, size_t len) {
    uint32_t h = 0x811c9dc5u;
    for (size_t i = 0; i < len; ++i) {
        h ^= data[i];
        h *= 0x01000193u;
    }
    return h;
}

// mulberry32 — small, fast, deterministic given a seed. The point is an
// unpredictable-enough per-nonce byte stream, not cryptographic strength.
void keystream(uint32_t seed, uint8_t* out, size_t len) {
    for (size_t i = 0; i < len; ++i) {
        seed += 0x6D2B79F5u;
        uint32_t t = seed;
        t = (t ^ (t >> 15)) * (t | 1u);
        t ^= t + (t ^ (t >> 7)) * (t | 61u);
        out[i] = (uint8_t)(((t ^ (t >> 14)) >> 8) & 0xff);
    }
}

// XOR is its own inverse, so this both encrypts and decrypts.
std::string xorWithNonce(const uint8_t* bytes, size_t len, const uint8_t* nonce) {
    const uint8_t* secret = installSecret();
    uint8_t seedBuf[kNonceLen + kSecretLen];
    memcpy(seedBuf, nonce, kNonceLen);
    memcpy(seedBuf + kNonceLen, secret, kSecretLen);
    std::string ks(len, '\0');
    keystream(fnv1aSeed(seedBuf, sizeof(seedBuf)), (uint8_t*)ks.data(), len);
    std::string out(len, '\0');
    for (size_t i = 0; i < len; ++i) out[i] = (char)(bytes[i] ^ (uint8_t)ks[i]);
    return out;
}

} // namespace

extern "C" {

// Returns the value's length, or -1 if absent. On success, *outPtr receives a
// malloc'd buffer (caller frees) holding the decoded, deobfuscated bytes.
EMSCRIPTEN_KEEPALIVE
int rayactWebLocalStorageGet(const char* key, uint8_t** outPtr) {
    uint8_t* stored = nullptr;
    int len = rawGet(key, &stored);
    if (len < 0) return -1;
    // Too short to carry a nonce: not something this API wrote (a foreign or
    // truncated entry). Report absent rather than handing back garbage.
    if (len < (int)kNonceLen) {
        if (stored) free(stored);
        return -1;
    }
    std::string plain = xorWithNonce(stored + kNonceLen, (size_t)len - kNonceLen, stored);
    free(stored);
    uint8_t* buf = (uint8_t*)malloc(plain.size() ? plain.size() : 1);
    if (!plain.empty()) memcpy(buf, plain.data(), plain.size());
    *outPtr = buf;
    return (int)plain.size();
}

// Stores raw bytes (arbitrary — not necessarily valid UTF-8) under key. The
// stored form is nonce || XOR(value), base64'd.
EMSCRIPTEN_KEEPALIVE
void rayactWebLocalStorageSet(const char* key, const uint8_t* value, int valueLen) {
    uint8_t nonce[kNonceLen];
    randomBytes(nonce, (int)kNonceLen);
    std::string cipher = xorWithNonce(value, (size_t)valueLen, nonce);
    std::string combined((const char*)nonce, kNonceLen);
    combined += cipher;
    rawSet(key, (const uint8_t*)combined.data(), (int)combined.size());
}

EMSCRIPTEN_KEEPALIVE
void rayactWebLocalStorageRemove(const char* key) {
    EM_ASM({
        try { localStorage.removeItem(UTF8ToString($0)); } catch (e) {}
    }, key);
}

// Every localStorage key starting with `prefix`, prefix stripped, as a repeated
// (u32 LE len | bytes) block — the same shape mmkv's own "keys" response uses,
// so the caller building that response does no further transformation. Returns
// the block's total length, or 0 if nothing matched; *outPtr is set only when
// the return is > 0 (caller frees).
EMSCRIPTEN_KEEPALIVE
int rayactWebLocalStorageKeysWithPrefix(const char* prefix, uint8_t** outPtr) {
    return EM_ASM_INT({
        var prefix_ = UTF8ToString($0);
        var names = [];
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k.indexOf(prefix_) === 0) names.push(k.slice(prefix_.length));
        }
        var encoded = names.map(function(n) { return new TextEncoder().encode(n); });
        var total = encoded.reduce(function(n, b) { return n + 4 + b.length; }, 0);
        if (total === 0) return 0;
        var ptr = _malloc(total);
        var off = 0;
        encoded.forEach(function(b) {
            // Write the u32 length a byte at a time rather than with
            // setValue(..., 'i32'). setValue compiles to HEAP32[addr >> 2], which
            // ROUNDS THE ADDRESS DOWN to a 4-byte boundary — and these records are
            // packed, so every length after the first lands unaligned. The silent
            // result is each length overwriting the tail of the previous key
            // ("count" arriving as "coun", then a garbage length, then a parse that
            // gives up halfway through the list).
            HEAPU8[ptr + off] = b.length & 0xff;
            HEAPU8[ptr + off + 1] = (b.length >>> 8) & 0xff;
            HEAPU8[ptr + off + 2] = (b.length >>> 16) & 0xff;
            HEAPU8[ptr + off + 3] = (b.length >>> 24) & 0xff;
            off += 4;
            HEAPU8.set(b, ptr + off);
            off += b.length;
        });
        // $1 is a caller-provided uint8_t**, always 4-byte aligned, so setValue is
        // safe here — unlike the packed record lengths above.
        setValue($1, ptr, 'i32');
        return total;
    }, prefix, outPtr);
}

// Fills buf (caller-allocated, e.g. a stack array) with `len` cryptographically
// random bytes via crypto.getRandomValues — the one Web Crypto primitive that is
// synchronous (SubtleCrypto's digest/encrypt/decrypt are Promise-only).
EMSCRIPTEN_KEEPALIVE
void rayactWebLocalStorageRandomBytes(uint8_t* buf, int len) {
    randomBytes(buf, len);
}

} // extern "C"
