// rayactpack — single-file container for Rayact-internal release assets.
//
// Mirrors the layout of the fovea packer (../../fovea/packer/PakBuilder.cpp):
// a magic, a file table of (path, offset, size), then concatenated blobs. Rayact
// extends the header with a flags word and an embedded obfuscation key so a pack
// is self-describing (no external project file needed at load time).
//
// Format (all integers little-endian):
//   magic     : "RAYACTPK"           (8 bytes)
//   version   : u32 = 1
//   flags     : u32                  (bit0 = obfuscated)
//   keyLen    : u32                  (obfuscation key length; 0 if not obfuscated)
//   key       : keyLen bytes         (rayactAppKey used to derive the XOR keystream)
//   fileCount : u32
//   table     : fileCount × { u32 pathLen, path[pathLen], u64 offset, u64 size }
//   blobs     : payload (XOR-encoded iff obfuscated)
//
// The container carries Rayact-internal files only (qjsbc + css + fonts + images);
// .wasm is intentionally excluded. Obfuscation is light tamper-resistance (XOR),
// not encryption — the key is embedded, exactly like fovea stores its project UUID.
#pragma once

#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

namespace rayact {

struct RayactPackEntry {
  std::string path;   // forward-slash, relative to the staged root
  uint64_t offset;    // absolute byte offset of the blob within the file
  uint64_t size;      // blob byte length
};

struct PackOptions {
  // Non-empty => XOR-obfuscate entries with a key derived from this string
  // (typically rayactAppKey). Empty => store plain.
  std::string obfuscateKey;
  // Files beyond this running total spill into sibling chunks (<out>.1, <out>.2,
  // …). app.qjsbc / app.js are always kept in chunk 0. Default 100 MB.
  uint64_t maxChunkSize = 100ull * 1024 * 1024;
};

// Recursively pack every regular file under `stageDir` into `outPath` (chunk 0)
// and, if needed, sibling chunks. Returns the number of chunks written, or 0 on
// failure.
int writePack(const std::string& stageDir, const std::string& outPath, const PackOptions& opts);

// In-memory reader: loads the whole pack file, parses the table, decodes lazily.
class RayactPack {
 public:
  bool open(const std::string& packPath);
  bool has(const std::string& path) const { return index_.count(path) != 0; }
  // Reads (and decodes if obfuscated) the entry named `path` into `out`.
  bool read(const std::string& path, std::vector<uint8_t>& out) const;
  // Writes every entry (decoded) under destDir, creating subdirs as needed.
  bool extractAll(const std::string& destDir) const;
  const std::vector<RayactPackEntry>& entries() const { return entries_; }
  bool obfuscated() const { return obfuscated_; }

 private:
  std::vector<uint8_t> blob_;
  std::vector<RayactPackEntry> entries_;
  std::unordered_map<std::string, size_t> index_;
  bool obfuscated_ = false;
  std::string key_;
  void decode(const RayactPackEntry& e, std::vector<uint8_t>& out) const;
};

// Open `basePath` and any sibling chunks (<basePath>.1, .2, …) and extract them
// all into destDir. Returns false if the base pack can't be read.
bool mountPack(const std::string& basePath, const std::string& destDir);

// --verify helper: list entries of a single pack file. Fills `obfuscated`.
bool listPack(const std::string& packPath, std::vector<RayactPackEntry>& out, bool& obfuscated);

}  // namespace rayact
