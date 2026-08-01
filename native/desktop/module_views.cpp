#include "module_views.hpp"

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
    if (!kind || !*kind || !factory || !factory->create) return false;
    std::lock_guard<std::mutex> lk(g_factoryMtx);
    auto it = g_factories.find(kind);
    if (it != g_factories.end()) {
        // Re-registering the identical vtable is harmless (a dev host may load the
        // same plugin twice); a different one is a collision worth refusing.
        return std::memcmp(&it->second, factory, sizeof(RayactViewFactory)) == 0;
    }
    g_factories[kind] = *factory;
    return true;
}

const RayactViewFactory* moduleViewsFindFactory(const char* kind) {
    if (!kind || !*kind) return nullptr;
    std::lock_guard<std::mutex> lk(g_factoryMtx);
    auto it = g_factories.find(kind);
    return it == g_factories.end() ? nullptr : &it->second;
}

} // namespace rayact
