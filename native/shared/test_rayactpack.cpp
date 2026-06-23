// Standalone round-trip test for the rayactpack container. Build + run:
//   c++ -std=c++17 native/shared/rayactpack.cpp native/shared/test_rayactpack.cpp \
//       -o /tmp/rayactpack_test && /tmp/rayactpack_test
// Exits non-zero on first failure. Wired into CI (Phase 6) and runnable locally.
#include "rayactpack.h"

#include <cassert>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

namespace fs = std::filesystem;

static int g_fail = 0;
#define CHECK(cond, msg) do { if (!(cond)) { std::printf("FAIL: %s\n", msg); g_fail++; } else { std::printf("ok: %s\n", msg); } } while (0)

static void writeFile(const fs::path& p, const std::string& data) {
  fs::create_directories(p.parent_path());
  std::ofstream f(p, std::ios::binary);
  f.write(data.data(), data.size());
}

static std::string readFile(const fs::path& p) {
  std::ifstream f(p, std::ios::binary);
  std::string s((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
  return s;
}

int main() {
  fs::path tmp = fs::temp_directory_path() / "rayactpack-test";
  fs::remove_all(tmp);
  fs::path stage = tmp / "stage";

  const std::string appBytes = std::string("\x01\x02QJSBC\x00\xff", 9);
  const std::string css = "body{margin:0}";
  const std::string font = std::string(2048, 'F');
  writeFile(stage / "app.qjsbc", appBytes);
  writeFile(stage / "runtime" / "styles.css", css);
  writeFile(stage / "runtime" / "resources" / "fonts" / "icons.bin", font);

  // --- plain pack round-trip ---
  fs::path out = tmp / "app.rayactpack";
  rayact::PackOptions opts;
  int chunks = rayact::writePack(stage.string(), out.string(), opts);
  CHECK(chunks == 1, "single chunk written");

  rayact::RayactPack pak;
  CHECK(pak.open(out.string()), "open pack");
  CHECK(pak.entries().size() == 3, "3 entries");
  CHECK(!pak.obfuscated(), "plain (not obfuscated)");
  CHECK(pak.has("app.qjsbc"), "has app.qjsbc");
  CHECK(pak.has("runtime/styles.css"), "has runtime/styles.css");

  std::vector<uint8_t> got;
  CHECK(pak.read("app.qjsbc", got) && std::string(got.begin(), got.end()) == appBytes, "app.qjsbc bytes match");
  CHECK(pak.read("runtime/styles.css", got) && std::string(got.begin(), got.end()) == css, "css bytes match");

  // --- extract / mount ---
  fs::path ex = tmp / "extract";
  CHECK(rayact::mountPack(out.string(), ex.string()), "mountPack");
  CHECK(readFile(ex / "app.qjsbc") == appBytes, "extracted app.qjsbc matches");
  CHECK(readFile(ex / "runtime" / "styles.css") == css, "extracted css matches");

  // --- obfuscated round-trip (XOR symmetric, key embedded) ---
  fs::path outObf = tmp / "app-obf.rayactpack";
  rayact::PackOptions oopts;
  oopts.obfuscateKey = "rayact-demo";
  CHECK(rayact::writePack(stage.string(), outObf.string(), oopts) == 1, "obfuscated chunk written");
  // Raw bytes on disk must differ from plaintext (proves obfuscation applied).
  std::string rawObf = readFile(outObf);
  CHECK(rawObf.find(css) == std::string::npos, "css not present in clear in obfuscated pack");
  rayact::RayactPack pakObf;
  CHECK(pakObf.open(outObf.string()) && pakObf.obfuscated(), "open obfuscated pack");
  CHECK(pakObf.read("runtime/styles.css", got) && std::string(got.begin(), got.end()) == css, "obfuscated css decodes");

  // --- chunk splitting: tiny maxChunkSize spills assets, core stays in chunk 0 ---
  fs::path outC = tmp / "chunked.rayactpack";
  rayact::PackOptions copts;
  copts.maxChunkSize = 512;  // < the 2048-byte font, forces a spill
  int nch = rayact::writePack(stage.string(), outC.string(), copts);
  CHECK(nch >= 2, "chunk split produced >= 2 chunks");
  rayact::RayactPack core;
  CHECK(core.open(outC.string()) && core.has("app.qjsbc"), "core chunk contains app.qjsbc");

  // --- bad magic rejected ---
  fs::path bad = tmp / "bad.rayactpack";
  writeFile(bad, "NOTAPACK........");
  rayact::RayactPack bp;
  CHECK(!bp.open(bad.string()), "bad magic rejected");

  fs::remove_all(tmp);
  std::printf(g_fail ? "\n%d FAILURE(S)\n" : "\nALL PASS\n", g_fail);
  return g_fail ? 1 : 0;
}
