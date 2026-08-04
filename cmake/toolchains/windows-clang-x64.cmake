# Cross-compile to Windows x64 (MSVC ABI) with clang-cl + lld-link + xwin.
# See windows-clang-common.cmake for prerequisites.
set(CMAKE_SYSTEM_PROCESSOR AMD64)
set(_RLB_WIN_TARGET  "x86_64-pc-windows-msvc")
set(_RLB_WIN_MACHINE "x64")
set(_RLB_WIN_LIBARCH "x86_64")
include("${CMAKE_CURRENT_LIST_DIR}/windows-clang-common.cmake")
