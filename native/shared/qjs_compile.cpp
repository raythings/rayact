#include "qjs_compile.h"

#include <cstdio>

#include "quickjs.h"

// Compile a JS source file to QuickJS bytecode and write a .qjsbc file.
// Returns the output path on success, empty string on failure.
std::string compileJSToBytecode(JSContext* ctx, const char* srcFile, const char* outFile) {
    FILE* f = fopen(srcFile, "r");
    if (!f) { fprintf(stderr, "compile: cannot open %s\n", srcFile); return ""; }
    fseek(f, 0, SEEK_END);
    long len = ftell(f);
    fseek(f, 0, SEEK_SET);
    std::string src(len, '\0');
    fread(&src[0], 1, len, f);
    fclose(f);

    // Compile to bytecode (no eval)
    JSValue fn = JS_Eval(ctx, src.c_str(), src.size(), srcFile,
                         JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_COMPILE_ONLY);
    if (JS_IsException(fn)) {
        JSValue exc = JS_GetException(ctx);
        const char* s = JS_ToCString(ctx, exc);
        fprintf(stderr, "compile error in '%s': %s\n", srcFile, s ? s : "?");
        if (s) JS_FreeCString(ctx, s);
        JS_FreeValue(ctx, exc);
        JS_FreeValue(ctx, fn);
        return "";
    }

    size_t outLen = 0;
    // STRIP_SOURCE drops the embedded source text (smaller release bytecode);
    // matches the fovea packer's ScriptCompiler. Read path is unaffected.
    uint8_t* bytes = JS_WriteObject(ctx, &outLen, fn,
                                    JS_WRITE_OBJ_BYTECODE | JS_WRITE_OBJ_STRIP_SOURCE);
    JS_FreeValue(ctx, fn);
    if (!bytes) { fprintf(stderr, "compile: JS_WriteObject failed\n"); return ""; }

    // Determine output path
    std::string out;
    if (outFile) {
        out = outFile;
    } else {
        out = srcFile;
        if (out.size() >= 3 && out.substr(out.size() - 3) == ".js")
            out = out.substr(0, out.size() - 3) + ".qjsbc";
        else
            out += ".qjsbc";
    }
    FILE* of = fopen(out.c_str(), "wb");
    if (!of) {
        fprintf(stderr, "compile: cannot write %s\n", out.c_str());
        js_free(ctx, bytes);
        return "";
    }
    fwrite(bytes, 1, outLen, of);
    fclose(of);
    js_free(ctx, bytes);
    printf("Compiled %s → %s (%zu bytes)\n", srcFile, out.c_str(), outLen);
    return out;
}
