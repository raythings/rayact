#include "desktop_dev_loader.hpp"

#include <curl/curl.h>

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <map>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace rayact {
namespace {

constexpr size_t kMaxFileBytes = 4 * 1024 * 1024;
constexpr size_t kMaxTotalBytes = 16 * 1024 * 1024;
constexpr size_t kMaxAssets = 32;

struct CachedResource {
    std::string baseUrl;
    int revision = -1;
    std::string bytes;
};

struct PrefetchState {
    std::mutex mutex;
    std::map<std::string, CachedResource> resources;
    std::map<std::string, int> activeRevisions;
    std::set<std::string> warming;
};

// Intentionally process-lifetime storage: detached utility work must never race
// static destruction while the desktop window is closing.
PrefetchState& state() {
    static auto* value = new PrefetchState();
    return *value;
}

std::string normalizeBase(std::string value) {
    value.erase(value.begin(), std::find_if(value.begin(), value.end(), [](unsigned char c) {
        return !std::isspace(c);
    }));
    while (!value.empty() && (std::isspace(static_cast<unsigned char>(value.back())) || value.back() == '/'))
        value.pop_back();
    if (value.rfind("http://", 0) != 0 && value.rfind("https://", 0) != 0)
        value = "http://" + value;
    return value;
}

size_t appendBody(char* data, size_t size, size_t count, void* user) {
    auto* output = static_cast<std::string*>(user);
    const size_t bytes = size * count;
    output->append(data, bytes);
    return bytes;
}

bool fetch(const std::string& url, std::string& body) {
    static std::once_flag curlInit;
    std::call_once(curlInit, [] { curl_global_init(CURL_GLOBAL_ALL); });
    CURL* curl = curl_easy_init();
    if (!curl) return false;
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, appendBody);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &body);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT_MS, 60000L);
    curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT_MS, 2500L);
    const CURLcode result = curl_easy_perform(curl);
    long status = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &status);
    curl_easy_cleanup(curl);
    return result == CURLE_OK && status >= 200 && status < 300;
}

std::string jsonString(const std::string& json, const std::string& key, size_t from = 0) {
    const std::string marker = "\"" + key + "\"";
    size_t pos = json.find(marker, from);
    if (pos == std::string::npos) return {};
    pos = json.find(':', pos + marker.size());
    if (pos == std::string::npos) return {};
    pos = json.find('"', pos + 1);
    if (pos == std::string::npos) return {};
    std::string out;
    for (++pos; pos < json.size(); ++pos) {
        const char c = json[pos];
        if (c == '"') break;
        if (c == '\\' && pos + 1 < json.size()) {
            const char escaped = json[++pos];
            out += escaped == '/' ? '/' : escaped;
        } else {
            out += c;
        }
    }
    return out;
}

int jsonInt(const std::string& json, const std::string& key, size_t from = 0) {
    const std::string marker = "\"" + key + "\"";
    size_t pos = json.find(marker, from);
    if (pos == std::string::npos) return -1;
    pos = json.find(':', pos + marker.size());
    if (pos == std::string::npos) return -1;
    return std::atoi(json.c_str() + pos + 1);
}

std::string rebase(const std::string& url, const std::string& base) {
    const size_t rayact = url.find("/rayact/");
    if (rayact != std::string::npos) return base + url.substr(rayact);
    if (!url.empty() && url.front() == '/') return base + url;
    return url;
}

void storeResource(const std::string& url, const std::string& base, int revision,
                   std::string bytes, size_t& total, bool enforceFileLimit) {
    if (bytes.empty()) return;
    if ((enforceFileLimit && bytes.size() > kMaxFileBytes) || total + bytes.size() > kMaxTotalBytes)
        return;
    total += bytes.size();
    auto& cache = state();
    std::lock_guard<std::mutex> lock(cache.mutex);
    cache.resources[url] = CachedResource{base, revision, std::move(bytes)};
}

void warm(const std::string& base) {
    std::string manifest;
    const std::string manifestUrl = base + "/rayact/manifest.json?platform=desktop";
    if (!fetch(manifestUrl, manifest)) {
        fprintf(stderr, "[rayact-desktop] prefetch manifest unavailable: %s\n", base.c_str());
        return;
    }

    const int revision = jsonInt(manifest, "revision");
    size_t total = 0;
    size_t count = 0;
    std::string bootstrapUrl = jsonString(manifest, "bootstrapUrl");
    if (bootstrapUrl.empty()) bootstrapUrl = base + "/rayact/bootstrap.js?platform=desktop";
    bootstrapUrl = rebase(bootstrapUrl, base);
    std::string bootstrap;
    if (fetch(bootstrapUrl, bootstrap)) {
        storeResource(bootstrapUrl, base, revision, std::move(bootstrap), total, false);
        ++count;
    }

    const std::string entry = rebase(jsonString(manifest, "entryModuleUrl"), base);
    if (!entry.empty()) {
        std::string bytes;
        if (fetch(entry, bytes)) {
            storeResource(entry, base, revision, std::move(bytes), total, true);
            ++count;
        }
    }

    const size_t assetsKey = manifest.find("\"assets\"");
    const size_t assetsEnd = assetsKey == std::string::npos
        ? std::string::npos : manifest.find(']', assetsKey);
    size_t cursor = assetsKey;
    size_t assetCount = 0;
    while (cursor != std::string::npos && cursor < assetsEnd && assetCount < kMaxAssets) {
        const size_t urlKey = manifest.find("\"url\"", cursor);
        if (urlKey == std::string::npos || urlKey >= assetsEnd) break;
        const int declaredSize = jsonInt(manifest, "size", cursor);
        const std::string url = rebase(jsonString(manifest, "url", cursor), base);
        cursor = urlKey + 5;
        ++assetCount;
        if (url.empty() || declaredSize > static_cast<int>(kMaxFileBytes) ||
            (declaredSize > 0 && total + static_cast<size_t>(declaredSize) > kMaxTotalBytes))
            continue;
        std::string bytes;
        if (fetch(url, bytes)) {
            storeResource(url, base, revision, std::move(bytes), total, true);
            ++count;
        }
    }
    fprintf(stderr, "[rayact-desktop] prefetched %zu startup files from %s\n", count, base.c_str());
}

} // namespace

void desktopPrefetchDevServer(const std::string& baseUrl) {
    const std::string base = normalizeBase(baseUrl);
    if (base.empty()) return;
    auto& cache = state();
    {
        std::lock_guard<std::mutex> lock(cache.mutex);
        if (!cache.warming.insert(base).second) return;
    }
    std::thread([base] {
        warm(base);
        auto& cache = state();
        std::lock_guard<std::mutex> lock(cache.mutex);
        cache.warming.erase(base);
    }).detach();
}

void desktopPrefetchValidate(const std::string& baseUrl, int revision) {
    auto& cache = state();
    std::lock_guard<std::mutex> lock(cache.mutex);
    cache.activeRevisions[normalizeBase(baseUrl)] = revision;
}

bool desktopTakePrefetchedResource(const std::string& url, std::string& body) {
    auto& cache = state();
    std::lock_guard<std::mutex> lock(cache.mutex);
    const auto found = cache.resources.find(url);
    if (found == cache.resources.end()) return false;
    const auto active = cache.activeRevisions.find(found->second.baseUrl);
    if (active == cache.activeRevisions.end() || active->second != found->second.revision) {
        cache.resources.erase(found);
        return false;
    }
    body = std::move(found->second.bytes);
    cache.resources.erase(found);
    return true;
}

} // namespace rayact
