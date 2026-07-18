#include "desktop_mdns.hpp"
#include "desktop_dev_loader.hpp"

#include <atomic>
#include <cstdint>
#include <map>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>

#if RAYACT_HAS_DNSSD
#include <dns_sd.h>
#if defined(_WIN32)
#include <winsock2.h>
#else
#include <arpa/inet.h>
#include <sys/select.h>
#include <unistd.h>
#endif
#endif

namespace rayact {
namespace {

struct Server {
    std::string name;
    std::string url;
    std::string appKey;
};

struct DiscoveryState {
    std::mutex mutex;
    std::map<std::string, Server> servers;
    std::atomic<bool> stop{false};
    std::thread* worker = nullptr;
};

DiscoveryState& state() {
    static auto* value = new DiscoveryState();
    return *value;
}

std::string escapeJson(const std::string& value) {
    std::string out;
    for (char c : value) {
        if (c == '\\' || c == '"') out += '\\';
        if (c == '\n') out += "\\n";
        else if (c != '\r') out += c;
    }
    return out;
}

#if RAYACT_HAS_DNSSD
std::string txtValue(uint16_t length, const unsigned char* record, const char* key) {
    uint8_t valueLength = 0;
    const void* value = TXTRecordGetValuePtr(length, record, key, &valueLength);
    return value ? std::string(static_cast<const char*>(value), valueLength) : std::string();
}

std::string preferredHost(const std::string& advertisedIps, const char* fallback) {
    if (!advertisedIps.empty()) {
        const size_t comma = advertisedIps.find(',');
        const std::string first = advertisedIps.substr(0, comma);
        if (!first.empty()) return first;
    }
    std::string host = fallback ? fallback : "";
    while (!host.empty() && host.back() == '.') host.pop_back();
    return host;
}

struct ResolveContext { std::string name; };

void DNSSD_API resolved(DNSServiceRef, DNSServiceFlags, uint32_t,
                        DNSServiceErrorType error, const char*, const char* host,
                        uint16_t networkPort, uint16_t txtLength,
                        const unsigned char* txtRecord, void* context) {
    if (error != kDNSServiceErr_NoError || !context) return;
    const auto* resolvedContext = static_cast<ResolveContext*>(context);
    const std::string appKey = txtValue(txtLength, txtRecord, "appKey");
    const std::string address = preferredHost(txtValue(txtLength, txtRecord, "ips"), host);
    if (address.empty() || address.find(':') != std::string::npos) return;
    const std::string url = "http://" + address + ":" + std::to_string(ntohs(networkPort));
    {
        auto& discovery = state();
        std::lock_guard<std::mutex> lock(discovery.mutex);
        discovery.servers[resolvedContext->name] = Server{resolvedContext->name, url, appKey};
    }
    desktopPrefetchDevServer(url);
}

bool processOnce(DNSServiceRef ref, int timeoutMs) {
    const int fd = DNSServiceRefSockFD(ref);
    if (fd < 0) return false;
    fd_set readSet;
    FD_ZERO(&readSet);
    FD_SET(fd, &readSet);
    timeval timeout{timeoutMs / 1000, (timeoutMs % 1000) * 1000};
    const int selected = select(fd + 1, &readSet, nullptr, nullptr, &timeout);
    return selected > 0 && FD_ISSET(fd, &readSet) &&
           DNSServiceProcessResult(ref) == kDNSServiceErr_NoError;
}

void resolveService(const char* name, const char* regtype, const char* domain,
                    uint32_t interfaceIndex) {
    DNSServiceRef ref = nullptr;
    ResolveContext context{name ? name : "Rayact"};
    const DNSServiceErrorType error = DNSServiceResolve(
        &ref, 0, interfaceIndex, name, regtype, domain, resolved, &context);
    if (error == kDNSServiceErr_NoError && ref) processOnce(ref, 2500);
    if (ref) DNSServiceRefDeallocate(ref);
}

void DNSSD_API browsed(DNSServiceRef, DNSServiceFlags flags, uint32_t interfaceIndex,
                       DNSServiceErrorType error, const char* name,
                       const char* regtype, const char* domain, void*) {
    if (error != kDNSServiceErr_NoError || !name) return;
    if ((flags & kDNSServiceFlagsAdd) != 0) {
        resolveService(name, regtype, domain, interfaceIndex);
    } else {
        auto& discovery = state();
        std::lock_guard<std::mutex> lock(discovery.mutex);
        discovery.servers.erase(name);
    }
}

void browseLoop() {
    DNSServiceRef browse = nullptr;
    const DNSServiceErrorType error = DNSServiceBrowse(
        &browse, 0, 0, "_rayact._tcp", nullptr, browsed, nullptr);
    if (error != kDNSServiceErr_NoError || !browse) return;
    while (!state().stop.load()) processOnce(browse, 500);
    DNSServiceRefDeallocate(browse);
}
#endif

} // namespace

void desktopMdnsStart() {
    desktopMdnsStop();
    auto& discovery = state();
    {
        std::lock_guard<std::mutex> lock(discovery.mutex);
        discovery.servers.clear();
    }
    discovery.stop.store(false);
#if RAYACT_HAS_DNSSD
    discovery.worker = new std::thread(browseLoop);
#endif
}

void desktopMdnsStop() {
    auto& discovery = state();
    discovery.stop.store(true);
    if (discovery.worker) {
        if (discovery.worker->joinable()) discovery.worker->join();
        delete discovery.worker;
        discovery.worker = nullptr;
    }
}

std::string desktopMdnsServersJson() {
    auto& discovery = state();
    std::lock_guard<std::mutex> lock(discovery.mutex);
    std::ostringstream json;
    json << '[';
    bool first = true;
    for (const auto& item : discovery.servers) {
        if (!first) json << ',';
        first = false;
        const Server& server = item.second;
        json << "{\"url\":\"" << escapeJson(server.url)
             << "\",\"name\":\"" << escapeJson(server.name)
             << "\",\"appKey\":\"" << escapeJson(server.appKey)
             << "\",\"compatible\":true}";
    }
    json << ']';
    return json.str();
}

} // namespace rayact
