#!/usr/bin/env bash
# Cross-build the desktop host's third-party dependencies for Windows
# (x64 + arm64, MSVC ABI) from macOS/Linux with clang-cl + lld-link + xwin.
#
#   XWIN_DIR=~/.cache/xwin-splat scripts/build-windows-deps.sh [x64|arm64] [lib...]
#
# On Linux these come from apt and on macOS from Homebrew; Windows has no such
# source, so we build them. Everything lands in third_party/windows-deps/<arch>/
# as static libs, which native/desktop/CMakeLists.txt picks up instead of
# pkg-config.
#
#   mbedtls  - TLS for libwebsockets (libcurl uses Schannel instead, so OpenSSL
#              is not needed at all on Windows)
#   curl     - HTTP for net.cpp, TLS via Schannel (native cert store + proxy)
#   lws      - WebSockets for net.cpp
#   glslang  - runtime GLSL->SPIR-V for rlvk (keeps View3D custom shaders)
#   webview2 - WebView2 SDK headers + loader lib for @rayact/webview
#   quickjs  - the JS engine, built from the in-tree submodule
#
# Each step is skipped when its output already exists, so re-running resumes.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
XWIN_DIR="${XWIN_DIR:-$HOME/.cache/xwin-splat}"
export XWIN_DIR
SRC_CACHE="$ROOT/build/windows-deps-src"
LLVM_BIN="${LLVM_BIN:-/opt/homebrew/opt/llvm/bin}"

# mbedTLS 2.28 LTS, not 3.x: libwebsockets 4.3's mbedTLS wrapper reaches for
# internals (mbedtls_x509_get_name) that 3.x made private, so lws+mbedtls-3.6
# does not compile. Revisit when moving to lws 4.4+.
MBEDTLS_VER=2.28.9
CURL_VER=8.11.1
WEBVIEW2_VER=1.0.2903.40
LWS_VER=4.3.3
GLSLANG_VER=15.4.0   # match the version rayact builds against on macOS (brew glslang);
                     # 14.x predates glslang_shader_set_entry_point in the C API

ARCHES=("${1:-both}")
[[ "${ARCHES[0]}" == "both" ]] && ARCHES=(x64 arm64)
shift || true
WANT=("$@")
want() { [[ ${#WANT[@]} -eq 0 ]] || printf '%s\n' "${WANT[@]}" | grep -qx "$1"; }

[[ -d "$XWIN_DIR/crt" && -d "$XWIN_DIR/sdk" ]] || {
  echo "error: XWIN_DIR='$XWIN_DIR' is not an xwin splat" >&2; exit 1; }

mkdir -p "$SRC_CACHE"

fetch() { # <url> <dir-name>
  local url="$1" name="$2"
  [[ -d "$SRC_CACHE/$name" ]] && return 0
  echo "  fetching $name"
  local tarball="$SRC_CACHE/${name}${url##*/}"
  curl -sSL -o "$tarball" "$url"
  mkdir -p "$SRC_CACHE/$name"
  tar xf "$tarball" -C "$SRC_CACHE/$name" --strip-components=1
  rm -f "$tarball"
}

for arch in "${ARCHES[@]}"; do
  PREFIX="$ROOT/third_party/windows-deps/$arch"
  TOOLCHAIN="$ROOT/cmake/toolchains/windows-clang-$arch.cmake"
  mkdir -p "$PREFIX"
  echo "=================== $arch ==================="

  cmake_build() { # <src> <build-subdir> <extra cmake args...>
    local src="$1" name="$2"; shift 2
    cmake -G Ninja -S "$src" -B "$ROOT/build/windows-deps/$arch/$name" \
      -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN" \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX="$PREFIX" \
      -DBUILD_SHARED_LIBS=OFF \
      -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
      "$@" > "$ROOT/build/windows-deps/$arch/$name-configure.log" 2>&1 \
      || { echo "  CONFIGURE FAILED ($name) — see build/windows-deps/$arch/$name-configure.log" >&2; return 1; }
    cmake --build "$ROOT/build/windows-deps/$arch/$name" --target install \
      > "$ROOT/build/windows-deps/$arch/$name-build.log" 2>&1 \
      || { echo "  BUILD FAILED ($name) — see build/windows-deps/$arch/$name-build.log" >&2; return 1; }
  }
  mkdir -p "$ROOT/build/windows-deps/$arch"

  # ── mbedTLS ────────────────────────────────────────────────────────────────
  if want mbedtls && [[ ! -f "$PREFIX/lib/mbedtls.lib" ]]; then
    echo "-> mbedtls $MBEDTLS_VER"
    fetch "https://github.com/Mbed-TLS/mbedtls/releases/download/mbedtls-$MBEDTLS_VER/mbedtls-$MBEDTLS_VER.tar.bz2" mbedtls
    cmake_build "$SRC_CACHE/mbedtls" mbedtls \
      -DENABLE_TESTING=OFF -DENABLE_PROGRAMS=OFF -DMBEDTLS_FATAL_WARNINGS=OFF
  fi

  # ── libcurl (Schannel, no OpenSSL) ─────────────────────────────────────────
  if want curl && [[ ! -f "$PREFIX/lib/libcurl.lib" ]]; then
    echo "-> curl $CURL_VER"
    fetch "https://curl.se/download/curl-$CURL_VER.tar.gz" curl
    cmake_build "$SRC_CACHE/curl" curl \
      -DCURL_USE_SCHANNEL=ON -DCURL_USE_OPENSSL=OFF -DCURL_USE_LIBPSL=OFF \
      -DCURL_USE_LIBSSH2=OFF -DUSE_LIBIDN2=OFF -DCURL_ZLIB=OFF -DCURL_BROTLI=OFF \
      -DCURL_ZSTD=OFF -DBUILD_CURL_EXE=OFF -DBUILD_TESTING=OFF \
      -DCURL_DISABLE_LDAP=ON -DCURL_DISABLE_LDAPS=ON -DENABLE_UNIX_SOCKETS=OFF
  fi

  # ── libwebsockets (mbedTLS) ────────────────────────────────────────────────
  if want lws && [[ ! -f "$PREFIX/lib/websockets_static.lib" ]]; then
    echo "-> libwebsockets $LWS_VER"
    fetch "https://github.com/warmcat/libwebsockets/archive/refs/tags/v$LWS_VER.tar.gz" lws
    # lws hard-codes /WX (warnings-as-errors) for MSVC with no option to opt out.
    # clang-cl surfaces warnings MSVC does not (documentation, padding, undef),
    # so the build dies on diagnostics that are not actually defects.
    sed -i.bak 's|add_compile_options(/W3 /WX)|add_compile_options(/W3)|' \
      "$SRC_CACHE/lws/CMakeLists.txt"
    # lws 4.3.x still declares cmake_minimum_required(2.8); CMake 4 removed that
    # compatibility, so opt back in rather than carrying a patch.
    # DISABLE_WERROR: lws adds /Zc:preprocessor for MSVC, which clang-cl accepts
    # but does not act on, and -Werror then promotes that unused-argument warning
    # to a hard error.
    cmake_build "$SRC_CACHE/lws" lws \
      -DDISABLE_WERROR=ON \
      -DLWS_WITH_MBEDTLS=ON \
      -DLWS_MBEDTLS_INCLUDE_DIRS="$PREFIX/include" \
      -DMBEDTLS_LIBRARY="$PREFIX/lib/mbedtls.lib" \
      -DMBEDX509_LIBRARY="$PREFIX/lib/mbedx509.lib" \
      -DMBEDCRYPTO_LIBRARY="$PREFIX/lib/mbedcrypto.lib" \
      -DLWS_WITH_STATIC=ON -DLWS_WITH_SHARED=OFF \
      -DLWS_WITHOUT_TESTAPPS=ON -DLWS_WITHOUT_TEST_SERVER=ON \
      -DLWS_WITHOUT_TEST_CLIENT=ON -DLWS_WITH_MINIMAL_EXAMPLES=OFF \
      -DLWS_WITH_SSL=ON -DLWS_HAVE_TLS_CLIENT_METHOD=ON
  fi

  # ── glslang (runtime GLSL -> SPIR-V for rlvk) ──────────────────────────────
  # Built from raygpu's amalgamated copy, NOT upstream: rlvk calls
  # glslang_shader_set_entry_point(), which upstream's C interface does not
  # expose at any released version. This is the same glslang the Android build
  # sources via -PRAYGPU_DIR, so Windows and Android share one shader front end.
  if want glslang && [[ ! -f "$PREFIX/lib/glslang.lib" ]]; then
    GLSLANG_SRC="${RAYGPU_DIR:-$ROOT/third_party/raygpu}/amalgamation/glslang"
    if [[ ! -f "$GLSLANG_SRC/CMakeLists.txt" ]]; then
      echo "  error: glslang source not found at $GLSLANG_SRC" >&2
      echo "         set RAYGPU_DIR to a raygpu checkout, or pass GLSLANG off" >&2
      exit 1
    fi
    echo "-> glslang (raygpu amalgamation)"
    cmake_build "$GLSLANG_SRC" glslang \
      -DENABLE_OPT=OFF -DENABLE_GLSLANG_BINARIES=OFF -DBUILD_TESTING=OFF \
      -DGLSLANG_TESTS=OFF -DENABLE_SPVREMAPPER=OFF -DENABLE_HLSL=OFF
  fi

  # ── WebView2 SDK (headers + loader import lib) ─────────────────────────────
  # Ships as a NuGet package, which is just a zip. Only the headers and the small
  # loader lib are vendored — the browser engine itself is the system-wide
  # WebView2 Runtime, so nothing Chromium-sized enters the app.
  if want webview2 && [[ ! -f "$PREFIX/lib/WebView2LoaderStatic.lib" ]]; then
    echo "-> WebView2 SDK $WEBVIEW2_VER"
    if [[ ! -d "$SRC_CACHE/webview2" ]]; then
      mkdir -p "$SRC_CACHE/webview2"
      curl -sSL -o "$SRC_CACHE/webview2.zip" \
        "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$WEBVIEW2_VER"
      unzip -q -o "$SRC_CACHE/webview2.zip" -d "$SRC_CACHE/webview2"
      rm -f "$SRC_CACHE/webview2.zip"
    fi
    [[ "$arch" == "arm64" ]] && wv_arch=arm64 || wv_arch=x64
    mkdir -p "$PREFIX/include" "$PREFIX/lib"
    cp "$SRC_CACHE/webview2/build/native/include/"*.h "$PREFIX/include/"
    cp "$SRC_CACHE/webview2/build/native/$wv_arch/WebView2LoaderStatic.lib" "$PREFIX/lib/"
    echo "     headers + WebView2LoaderStatic.lib ($wv_arch)"
  fi

  # ── quickjs (in-tree submodule) ────────────────────────────────────────────
  if want quickjs && [[ ! -f "$PREFIX/lib/qjs.lib" ]]; then
    echo "-> quickjs (third_party/quickjs)"
    cmake_build "$ROOT/third_party/quickjs" quickjs \
      -DBUILD_QJS_LIBC=ON -DQJS_BUILD_LIBC=ON \
      -DBUILD_EXAMPLES=OFF -DBUILD_TESTING=OFF
  fi

  echo "   libs in $PREFIX/lib:"
  ls "$PREFIX/lib" 2>/dev/null | sed 's/^/     /' || echo "     (none)"
done
