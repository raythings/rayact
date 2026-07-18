/*
 * macOS/Apple secure-store backend — Security.framework Keychain.
 * Items are stored as generic passwords under a fixed service so they are
 * isolated to this app's keychain access group.
 */
#include "secure_store.hpp"

#import <CoreFoundation/CoreFoundation.h>
#import <Security/Security.h>

namespace rayact_secure_store {

namespace {
const char* kService = "com.rayact.secure-store";

CFDictionaryRef queryFor(const std::string& key) {
  CFStringRef service = CFStringCreateWithCString(nullptr, kService, kCFStringEncodingUTF8);
  CFStringRef account =
      CFStringCreateWithCString(nullptr, key.c_str(), kCFStringEncodingUTF8);
  const void* keys[] = {kSecClass, kSecAttrService, kSecAttrAccount};
  const void* vals[] = {kSecClassGenericPassword, service, account};
  CFDictionaryRef q = CFDictionaryCreate(nullptr, keys, vals, 3,
                                         &kCFTypeDictionaryKeyCallBacks,
                                         &kCFTypeDictionaryValueCallBacks);
  CFRelease(service);
  CFRelease(account);
  return q;
}
} // namespace

void backendInit(const RayactHost*) {}

bool backendSet(const std::string& key, const std::string& value) {
  CFDictionaryRef q = queryFor(key);
  SecItemDelete(q); // replace semantics
  CFMutableDictionaryRef add = CFDictionaryCreateMutableCopy(nullptr, 0, q);
  CFRelease(q);
  CFDataRef data = CFDataCreate(nullptr, (const UInt8*)value.data(), (CFIndex)value.size());
  CFDictionarySetValue(add, kSecValueData, data);
  CFDictionarySetValue(add, kSecAttrAccessible, kSecAttrAccessibleAfterFirstUnlock);
  OSStatus st = SecItemAdd(add, nullptr);
  CFRelease(data);
  CFRelease(add);
  return st == errSecSuccess;
}

int backendGet(const std::string& key, std::string& out) {
  CFMutableDictionaryRef q = CFDictionaryCreateMutableCopy(nullptr, 0, queryFor(key));
  CFDictionarySetValue(q, kSecReturnData, kCFBooleanTrue);
  CFDictionarySetValue(q, kSecMatchLimit, kSecMatchLimitOne);
  CFTypeRef result = nullptr;
  OSStatus st = SecItemCopyMatching(q, &result);
  CFRelease(q);
  if (st != errSecSuccess || !result) return -1;
  CFDataRef data = (CFDataRef)result;
  out.assign((const char*)CFDataGetBytePtr(data), (size_t)CFDataGetLength(data));
  CFRelease(result);
  return 0;
}

bool backendDelete(const std::string& key) {
  CFDictionaryRef q = queryFor(key);
  OSStatus st = SecItemDelete(q);
  CFRelease(q);
  return st == errSecSuccess || st == errSecItemNotFound;
}

} // namespace rayact_secure_store
