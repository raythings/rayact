#include "rayactpack.h"

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>

namespace rayact {

namespace {

constexpr char kMagic[8] = {'R', 'A', 'Y', 'A', 'C', 'T', 'P', 'K'};
constexpr uint32_t kVersion = 1;
constexpr uint32_t kFlagObfuscated = 1u << 0;

// Stable 32-bit FNV-1a. Used (instead of std::hash, which varies by stdlib) so a
// pack obfuscated on the build host decodes correctly on a different device/OS.
uint32_t fnv1a(const std::string& s) {
  uint32_t h = 2166136261u;
  for (unsigned char c : s) {
    h ^= c;
    h *= 16777619u;
  }
  return h;
}

void putU32(std::vector<uint8_t>& b, uint32_t v) {
  b.push_back(v & 0xff);
  b.push_back((v >> 8) & 0xff);
  b.push_back((v >> 16) & 0xff);
  b.push_back((v >> 24) & 0xff);
}

void putU64(std::vector<uint8_t>& b, uint64_t v) {
  for (int i = 0; i < 8; ++i) b.push_back((v >> (8 * i)) & 0xff);
}

uint32_t getU32(const uint8_t* p) {
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

uint64_t getU64(const uint8_t* p) {
  uint64_t v = 0;
  for (int i = 0; i < 8; ++i) v |= (uint64_t)p[i] << (8 * i);
  return v;
}

// XOR a buffer in place with the 4-byte keystream derived from key + "/" + path.
void xorCode(uint8_t* data, size_t n, const std::string& key, const std::string& path) {
  uint32_t k = fnv1a(key + "/" + path);
  const uint8_t* kb = reinterpret_cast<const uint8_t*>(&k);
  for (size_t i = 0; i < n; ++i) data[i] ^= kb[i % 4];
}

bool readWholeFile(const std::string& path, std::vector<uint8_t>& out) {
  std::ifstream f(path, std::ios::binary);
  if (!f) return false;
  f.seekg(0, std::ios::end);
  std::streamoff n = f.tellg();
  f.seekg(0, std::ios::beg);
  out.resize(n > 0 ? (size_t)n : 0);
  if (n > 0) f.read(reinterpret_cast<char*>(out.data()), n);
  return true;
}

std::string toRel(const std::filesystem::path& p, const std::filesystem::path& base) {
  std::string s = std::filesystem::relative(p, base).generic_string();
  return s;
}

// True for the app bytecode/source — always kept in chunk 0 so the loader can
// boot from the base pack alone.
bool isCoreFile(const std::string& rel) {
  return rel == "app.qjsbc" || rel == "app.js";
}

// Serialize one chunk (header + table + blobs) to outPath.
bool writeChunk(const std::vector<std::pair<std::string, std::vector<uint8_t>>>& files,
                const std::string& outPath, const std::string& key) {
  const bool obf = !key.empty();
  std::vector<uint8_t> header;
  header.insert(header.end(), kMagic, kMagic + 8);
  putU32(header, kVersion);
  putU32(header, obf ? kFlagObfuscated : 0u);
  putU32(header, (uint32_t)key.size());
  header.insert(header.end(), key.begin(), key.end());
  putU32(header, (uint32_t)files.size());

  // Table size, to compute absolute offsets.
  size_t tableSize = 0;
  for (auto& f : files) tableSize += 4 + f.first.size() + 8 + 8;
  uint64_t offset = header.size() + tableSize;

  std::vector<uint8_t> table;
  std::vector<uint8_t> payload;
  for (auto& f : files) {
    putU32(table, (uint32_t)f.first.size());
    table.insert(table.end(), f.first.begin(), f.first.end());
    putU64(table, offset);
    putU64(table, (uint64_t)f.second.size());

    std::vector<uint8_t> data = f.second;
    if (obf) xorCode(data.data(), data.size(), key, f.first);
    payload.insert(payload.end(), data.begin(), data.end());
    offset += f.second.size();
  }

  std::ofstream out(outPath, std::ios::binary);
  if (!out) {
    std::fprintf(stderr, "rayactpack: cannot write %s\n", outPath.c_str());
    return false;
  }
  out.write(reinterpret_cast<const char*>(header.data()), header.size());
  out.write(reinterpret_cast<const char*>(table.data()), table.size());
  out.write(reinterpret_cast<const char*>(payload.data()), payload.size());
  return (bool)out;
}

}  // namespace

int writePack(const std::string& stageDir, const std::string& outPath, const PackOptions& opts) {
  namespace fs = std::filesystem;
  fs::path base(stageDir);
  if (!fs::exists(base)) {
    std::fprintf(stderr, "rayactpack: stage dir not found: %s\n", stageDir.c_str());
    return 0;
  }

  // Collect (rel, bytes), core files first.
  std::vector<std::pair<std::string, std::vector<uint8_t>>> all;
  for (auto& e : fs::recursive_directory_iterator(base)) {
    if (!e.is_regular_file()) continue;
    std::string rel = toRel(e.path(), base);
    std::vector<uint8_t> bytes;
    if (!readWholeFile(e.path().string(), bytes)) continue;
    all.emplace_back(std::move(rel), std::move(bytes));
  }
  std::stable_sort(all.begin(), all.end(), [](const auto& a, const auto& b) {
    return isCoreFile(a.first) && !isCoreFile(b.first);
  });

  // Greedy chunking: core files stay in chunk 0; spill the rest by size.
  std::vector<std::vector<std::pair<std::string, std::vector<uint8_t>>>> chunks(1);
  uint64_t running = 0;
  for (auto& f : all) {
    if (!isCoreFile(f.first) && running > 0 && running + f.second.size() > opts.maxChunkSize) {
      chunks.emplace_back();
      running = 0;
    }
    running += f.second.size();
    chunks.back().push_back(std::move(f));
  }

  int written = 0;
  for (size_t i = 0; i < chunks.size(); ++i) {
    std::string path = (i == 0) ? outPath : outPath + "." + std::to_string(i);
    if (!writeChunk(chunks[i], path, opts.obfuscateKey)) return written;
    written++;
  }
  return written;
}

bool RayactPack::open(const std::string& packPath) {
  blob_.clear();
  entries_.clear();
  index_.clear();
  if (!readWholeFile(packPath, blob_)) return false;
  const uint8_t* p = blob_.data();
  size_t n = blob_.size();
  if (n < 24 || std::memcmp(p, kMagic, 8) != 0) return false;
  size_t pos = 8;
  uint32_t version = getU32(p + pos); pos += 4;
  if (version != kVersion) return false;
  uint32_t flags = getU32(p + pos); pos += 4;
  obfuscated_ = (flags & kFlagObfuscated) != 0;
  uint32_t keyLen = getU32(p + pos); pos += 4;
  if (pos + keyLen + 4 > n) return false;
  key_.assign(reinterpret_cast<const char*>(p + pos), keyLen); pos += keyLen;
  uint32_t count = getU32(p + pos); pos += 4;

  for (uint32_t i = 0; i < count; ++i) {
    if (pos + 4 > n) return false;
    uint32_t pathLen = getU32(p + pos); pos += 4;
    if (pos + pathLen + 16 > n) return false;
    RayactPackEntry e;
    e.path.assign(reinterpret_cast<const char*>(p + pos), pathLen); pos += pathLen;
    e.offset = getU64(p + pos); pos += 8;
    e.size = getU64(p + pos); pos += 8;
    if (e.offset + e.size > n) return false;
    index_[e.path] = entries_.size();
    entries_.push_back(std::move(e));
  }
  return true;
}

void RayactPack::decode(const RayactPackEntry& e, std::vector<uint8_t>& out) const {
  out.assign(blob_.begin() + e.offset, blob_.begin() + e.offset + e.size);
  if (obfuscated_) xorCode(out.data(), out.size(), key_, e.path);
}

bool RayactPack::read(const std::string& path, std::vector<uint8_t>& out) const {
  auto it = index_.find(path);
  if (it == index_.end()) return false;
  decode(entries_[it->second], out);
  return true;
}

bool RayactPack::extractAll(const std::string& destDir) const {
  namespace fs = std::filesystem;
  for (const auto& e : entries_) {
    fs::path dest = fs::path(destDir) / e.path;
    std::error_code ec;
    fs::create_directories(dest.parent_path(), ec);
    std::vector<uint8_t> data;
    decode(e, data);
    std::ofstream out(dest, std::ios::binary);
    if (!out) return false;
    if (!data.empty()) out.write(reinterpret_cast<const char*>(data.data()), data.size());
  }
  return true;
}

bool mountPack(const std::string& basePath, const std::string& destDir) {
  RayactPack base;
  if (!base.open(basePath)) return false;
  if (!base.extractAll(destDir)) return false;
  // Sibling chunks: <basePath>.1, .2, …
  for (int i = 1;; ++i) {
    std::string chunk = basePath + "." + std::to_string(i);
    if (!std::filesystem::exists(chunk)) break;
    RayactPack p;
    if (p.open(chunk)) p.extractAll(destDir);
  }
  return true;
}

bool listPack(const std::string& packPath, std::vector<RayactPackEntry>& out, bool& obfuscated) {
  RayactPack p;
  if (!p.open(packPath)) return false;
  out = p.entries();
  obfuscated = p.obfuscated();
  return true;
}

}  // namespace rayact
