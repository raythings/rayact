#include "module_views.hpp"

#include <algorithm>
#include <cstddef>
#include <cstring>
#include <map>
#include <mutex>
#include <string>

namespace rayact {
namespace {

std::map<std::string, RayactViewFactory> g_factories;
std::mutex g_factoryMtx;

} // namespace

bool moduleViewsRegisterFactory(const char* kind, const RayactViewFactory* factory) {
    if (!kind || !*kind || !factory ||
        factory->struct_size < offsetof(RayactViewFactory, create) +
                                   sizeof(factory->create))
        return false;
    RayactViewFactory normalized{};
    std::memcpy(&normalized, factory,
                std::min<size_t>(factory->struct_size, sizeof(normalized)));
    if (!normalized.create) return false;
    std::lock_guard<std::mutex> lk(g_factoryMtx);
    auto it = g_factories.find(kind);
    if (it != g_factories.end()) {
        // Re-registering the identical vtable is harmless (a dev host may load the
        // same plugin twice); a different one is a collision worth refusing.
        return std::memcmp(&it->second, &normalized, sizeof(normalized)) == 0;
    }
    g_factories[kind] = normalized;
    return true;
}

const RayactViewFactory* moduleViewsFindFactory(const char* kind) {
    if (!kind || !*kind) return nullptr;
    std::lock_guard<std::mutex> lk(g_factoryMtx);
    auto it = g_factories.find(kind);
    return it == g_factories.end() ? nullptr : &it->second;
}

} // namespace rayact
