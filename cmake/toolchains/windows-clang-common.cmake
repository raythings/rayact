# Shared logic for cross-compiling to Windows (MSVC ABI) from macOS/Linux with
# clang-cl + lld-link + an xwin-splatted MSVC CRT / Windows SDK.
#
# Do not use this file directly; use windows-clang-x64.cmake or
# windows-clang-arm64.cmake, which set _RLB_WIN_TARGET/_RLB_WIN_MACHINE first.
#
# Prereqs (macOS):
#   brew install llvm lld            # clang-cl, lld-link, llvm-rc, llvm-mt, llvm-lib
#   cargo install xwin --locked
#   xwin --accept-license --arch x86_64,aarch64 splat --output <dir>
#   export XWIN_DIR=<dir>
#
# Alternative without the MS EULA question: llvm-mingw (GNU ABI) — one tarball,
# includes aarch64; swap the compiler/linker and drop the xwin flags.

set(CMAKE_SYSTEM_NAME Windows)

if(NOT DEFINED XWIN_DIR OR XWIN_DIR STREQUAL "")
    set(XWIN_DIR "$ENV{XWIN_DIR}")
endif()
if(XWIN_DIR STREQUAL "")
    message(FATAL_ERROR
        "XWIN_DIR is not set. Run `xwin --accept-license splat --arch x86_64,aarch64 "
        "--output <dir>` and pass -DXWIN_DIR=<dir> (or export XWIN_DIR).")
endif()
if(NOT EXISTS "${XWIN_DIR}/crt" OR NOT EXISTS "${XWIN_DIR}/sdk")
    message(FATAL_ERROR "XWIN_DIR='${XWIN_DIR}' does not look like xwin splat output (missing crt/ or sdk/)")
endif()

set(_rlb_llvm_hints
    /opt/homebrew/opt/llvm/bin
    /opt/homebrew/opt/lld/bin
    /usr/local/opt/llvm/bin
    /usr/local/opt/lld/bin
    /usr/lib/llvm/bin)

find_program(CMAKE_C_COMPILER   clang-cl    HINTS ${_rlb_llvm_hints} REQUIRED)
find_program(CMAKE_CXX_COMPILER clang-cl    HINTS ${_rlb_llvm_hints} REQUIRED)
find_program(CMAKE_LINKER       lld-link    HINTS ${_rlb_llvm_hints} REQUIRED)
find_program(CMAKE_AR           llvm-lib    HINTS ${_rlb_llvm_hints} REQUIRED)
find_program(CMAKE_RC_COMPILER  llvm-rc     HINTS ${_rlb_llvm_hints} REQUIRED)
find_program(CMAKE_MT           llvm-mt     HINTS ${_rlb_llvm_hints})

set(CMAKE_C_COMPILER_TARGET   "${_RLB_WIN_TARGET}")
set(CMAKE_CXX_COMPILER_TARGET "${_RLB_WIN_TARGET}")

# clang-cl finds the CRT/SDK headers; lld-link finds the .lib directories.
# -Wno-unused-command-line-argument: third-party projects pass MSVC-only flags
# (libwebsockets sends /Zc:preprocessor) that clang-cl accepts but does not act
# on. Harmless, except those projects also build with /WX, which turns the
# resulting warning into a hard error.
set(_rlb_cl_flags "/vctoolsdir \"${XWIN_DIR}/crt\" /winsdkdir \"${XWIN_DIR}/sdk\" -Wno-unused-command-line-argument")
set(CMAKE_C_FLAGS_INIT   "${_rlb_cl_flags}")
set(CMAKE_CXX_FLAGS_INIT "${_rlb_cl_flags}")

# Explicit /libpath entries: xwin's default splat layout uses LLVM arch names
# (x86_64/aarch64), which lld-link's /winsdkdir probing does not understand.
set(_rlb_link_flags "/libpath:${XWIN_DIR}/crt/lib/${_RLB_WIN_LIBARCH} /libpath:${XWIN_DIR}/sdk/lib/um/${_RLB_WIN_LIBARCH} /libpath:${XWIN_DIR}/sdk/lib/ucrt/${_RLB_WIN_LIBARCH} /machine:${_RLB_WIN_MACHINE}")
set(CMAKE_EXE_LINKER_FLAGS_INIT    "${_rlb_link_flags}")
set(CMAKE_SHARED_LINKER_FLAGS_INIT "${_rlb_link_flags}")
set(CMAKE_MODULE_LINKER_FLAGS_INIT "${_rlb_link_flags}")

# Always the release DLL CRT, in every configuration. Two reasons:
#   - xwin does not splat the debug CRT by default, so anything that links
#     msvcrtd.lib fails — including CMake's own try_compile probes, which run
#     as Debug and silently take down feature checks like check_type_size.
#   - host and plugin DLLs must share one CRT (std::mutex/locale/stdio state is
#     not safe across two), and /MD is what the modules already build with.
set(CMAKE_POLICY_DEFAULT_CMP0091 NEW)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreadedDLL")
# CMAKE_MSVC_RUNTIME_LIBRARY only applies under CMP0091 NEW. Dependencies with an
# old cmake_minimum_required (libwebsockets) keep the pre-policy behavior, where
# the CRT is baked into the per-config flags — and CMake's own compiler probe runs
# as Debug, so it would still reach for msvcrtd. Override the Debug flags to the
# release CRT as well (and drop /RTC1, which needs the debug runtime).
set(CMAKE_C_FLAGS_DEBUG_INIT   "/MD /Zi /Ob0 /Od")
set(CMAKE_CXX_FLAGS_DEBUG_INIT "/MD /Zi /Ob0 /Od")

# NOTE: deliberately NOT setting CMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY.
# It makes configure-time probes cheaper, but a static-library try_compile never
# links, so every link-based feature check silently succeeds. Dependencies then
# "detect" libraries that do not exist on Windows (libwebsockets concluded it had
# libcap, FindThreads concluded it had pthreads) and fail later at a confusing
# point. Full executable probes are correct here and work with the link flags set
# above, so the false positives cannot happen.

set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
