# Cross-compile to Windows arm64 (MSVC ABI) with clang-cl + lld-link + xwin.
# See windows-clang-common.cmake for prerequisites. Note: Wine on macOS only
# runs x64 binaries (Rosetta); arm64 output is build/link-verified only.
set(CMAKE_SYSTEM_PROCESSOR ARM64)
set(_RLB_WIN_TARGET  "aarch64-pc-windows-msvc")
set(_RLB_WIN_MACHINE "arm64")
set(_RLB_WIN_LIBARCH "aarch64")
include("${CMAKE_CURRENT_LIST_DIR}/windows-clang-common.cmake")
