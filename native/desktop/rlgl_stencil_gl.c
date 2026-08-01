// GL implementations of the extended rlgl stencil API for the plain-OpenGL
// desktop path (Linux, and macOS with RAYACT_DESKTOP_USE_METAL=OFF).
//
// raym3's rounded-corner clipping calls the rlStencil* family, which the
// Metal (rlmt) and Vulkan (rlvk) backends implement — but this build's rcore
// compiles raylib's vanilla rlgl, which has no stencil API at all, so the
// symbols were simply absent and the Linux link failed the moment raym3
// started using them. raym3 passes genuine GL enum values through this API
// (see the RAYM3_GL_* constants in third_party/raym3/src/raym3.cpp), so a
// 1:1 passthrough is the correct implementation here, not a stub: rounded
// clips actually render on GL. The GLFW default framebuffer carries an 8-bit
// stencil attachment, so no pixel-format work is needed.
//
// If the desktop GL path is ever replaced by the rlvk/rlmt rcore overlay,
// remove this file — the backend then provides these symbols and keeping both
// would be a duplicate-symbol error.
#if defined(__APPLE__)
    #include <TargetConditionals.h>
#endif

// The iOS target globs this directory, and there is no desktop GL path there
// (rlmt/Metal provides the stencil API) — compiling it would fail on the
// missing OpenGL headers, so the whole translation unit drops out.
#if defined(__APPLE__) && TARGET_OS_IPHONE

typedef int rlgl_stencil_gl_unused_translation_unit;

#else

#if defined(__APPLE__)
    #include <OpenGL/gl.h>   // macOS GL fallback (RAYACT_DESKTOP_USE_METAL=OFF)
#else
    #include <GL/gl.h>
#endif

void rlEnableStencilTest(void) { glEnable(GL_STENCIL_TEST); }
void rlDisableStencilTest(void) { glDisable(GL_STENCIL_TEST); }
void rlStencilFunc(int func, int ref, int mask)
{
    glStencilFunc((GLenum)func, ref, (GLuint)mask);
}
void rlStencilOp(int fail, int zfail, int zpass)
{
    glStencilOp((GLenum)fail, (GLenum)zfail, (GLenum)zpass);
}
void rlStencilMask(int mask) { glStencilMask((GLuint)mask); }
void rlClearStencilBuffer(unsigned int value)
{
    glClearStencil((GLint)value);
    glClear(GL_STENCIL_BUFFER_BIT);
}

#endif  // !(__APPLE__ && TARGET_OS_IPHONE)
