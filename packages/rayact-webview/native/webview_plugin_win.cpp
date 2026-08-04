// Windows implementation of the "webview" platform-view kind, using CEF's
// windowless-rendering (OSR) path. CEF paints premultiplied BGRA frames into
// memory; the Windows host uploads them to the same Vulkan scene texture path
// as every other Rayact node. This gives Windows the same true paint ordering,
// clipping and transforms as macOS/iOS/Android instead of a top-level HWND or
// DirectComposition rectangle floating above the scene.

#include "rayact_module_abi.h"
#include "cef_app_win.h"

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>

#include "include/cef_app.h"
#include "include/cef_browser.h"
#include "include/cef_client.h"
#include "include/cef_frame.h"
#include "include/cef_life_span_handler.h"
#include "include/cef_load_handler.h"
#include "include/cef_render_handler.h"
#include "include/cef_request.h"
#include "include/cef_request_handler.h"
#include "include/cef_task.h"
#include "include/wrapper/cef_helpers.h"

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <mutex>
#include <string>
#include <utility>
#include <vector>

namespace {

const RayactHost* g_host = nullptr;
std::mutex g_cefMutex;
bool g_cefInitialized = false;

std::string jsonEscape(const std::string& in) {
  std::string out;
  out.reserve(in.size() + 8);
  for (const unsigned char c : in) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (c < 0x20) {
          char escaped[8];
          snprintf(escaped, sizeof(escaped), "\\u%04x", c);
          out += escaped;
        } else {
          out += static_cast<char>(c);
        }
    }
  }
  return out;
}

std::string base64Encode(const std::string& input) {
  static constexpr char alphabet[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string output;
  output.reserve(((input.size() + 2) / 3) * 4);
  for (size_t i = 0; i < input.size(); i += 3) {
    const uint32_t a = static_cast<unsigned char>(input[i]);
    const uint32_t b = i + 1 < input.size()
        ? static_cast<unsigned char>(input[i + 1]) : 0;
    const uint32_t c = i + 2 < input.size()
        ? static_cast<unsigned char>(input[i + 2]) : 0;
    const uint32_t value = (a << 16) | (b << 8) | c;
    output += alphabet[(value >> 18) & 63];
    output += alphabet[(value >> 12) & 63];
    output += i + 1 < input.size() ? alphabet[(value >> 6) & 63] : '=';
    output += i + 2 < input.size() ? alphabet[value & 63] : '=';
  }
  return output;
}

std::string percentDecode(const std::string& input) {
  std::string output;
  output.reserve(input.size());
  auto hex = [](char c) -> int {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
  };
  for (size_t i = 0; i < input.size(); ++i) {
    if (input[i] == '%' && i + 2 < input.size()) {
      const int high = hex(input[i + 1]);
      const int low = hex(input[i + 2]);
      if (high >= 0 && low >= 0) {
        output += static_cast<char>((high << 4) | low);
        i += 2;
        continue;
      }
    }
    output += input[i];
  }
  return output;
}

// The props object is intentionally flat and string-valued. Missing means
// unchanged and JSON null means reset, matching the other platform plugins.
bool extractString(const std::string& json, const char* key, std::string* out,
                   bool* present) {
  const std::string needle = std::string("\"") + key + "\"";
  const size_t keyPosition = json.find(needle);
  if (keyPosition == std::string::npos) {
    *present = false;
    return false;
  }
  const size_t colon = json.find(':', keyPosition + needle.size());
  if (colon == std::string::npos) {
    *present = false;
    return false;
  }
  size_t cursor = json.find_first_not_of(" \t\r\n", colon + 1);
  if (cursor == std::string::npos) {
    *present = false;
    return false;
  }
  *present = true;
  if (json.compare(cursor, 4, "null") == 0) {
    out->clear();
    return true;
  }
  if (json[cursor] != '"') {
    out->clear();
    return false;
  }
  std::string value;
  for (++cursor; cursor < json.size(); ++cursor) {
    const char c = json[cursor];
    if (c == '"') break;
    if (c != '\\' || cursor + 1 >= json.size()) {
      value += c;
      continue;
    }
    const char escaped = json[++cursor];
    switch (escaped) {
      case 'n': value += '\n'; break;
      case 'r': value += '\r'; break;
      case 't': value += '\t'; break;
      case 'b': value += '\b'; break;
      case 'f': value += '\f'; break;
      case 'u': {
        if (cursor + 4 >= json.size()) break;
        const unsigned code = static_cast<unsigned>(
            strtoul(json.substr(cursor + 1, 4).c_str(), nullptr, 16));
        cursor += 4;
        if (code < 0x80) value += static_cast<char>(code);
        else if (code < 0x800) {
          value += static_cast<char>(0xc0 | (code >> 6));
          value += static_cast<char>(0x80 | (code & 0x3f));
        } else {
          value += static_cast<char>(0xe0 | (code >> 12));
          value += static_cast<char>(0x80 | ((code >> 6) & 0x3f));
          value += static_cast<char>(0x80 | (code & 0x3f));
        }
        break;
      }
      default: value += escaped; break;
    }
  }
  *out = std::move(value);
  return true;
}

std::wstring moduleDirectory() {
  HMODULE module = nullptr;
  GetModuleHandleExW(
      GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
          GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
      reinterpret_cast<LPCWSTR>(&moduleDirectory), &module);
  wchar_t path[MAX_PATH] = {};
  const DWORD length = GetModuleFileNameW(module, path, MAX_PATH);
  if (!length) return {};
  std::wstring directory(path, length);
  const size_t slash = directory.find_last_of(L"\\/");
  return slash == std::wstring::npos ? std::wstring() : directory.substr(0, slash);
}

std::wstring joinPath(const std::wstring& left, const wchar_t* right) {
  if (left.empty()) return right;
  return left + L"\\" + right;
}

class LambdaTask final : public CefTask {
 public:
  explicit LambdaTask(std::function<void()> work) : work_(std::move(work)) {}
  void Execute() override { work_(); }

 private:
  std::function<void()> work_;
  IMPLEMENT_REFCOUNTING(LambdaTask);
  DISALLOW_COPY_AND_ASSIGN(LambdaTask);
};

void postToCef(std::function<void()> work) {
  if (CefCurrentlyOn(TID_UI)) {
    work();
  } else {
    CefPostTask(TID_UI, new LambdaTask(std::move(work)));
  }
}

class Instance final : public CefClient,
                       public CefRenderHandler,
                       public CefLoadHandler,
                       public CefRequestHandler,
                       public CefLifeSpanHandler {
 public:
  Instance(int32_t nodeId, HWND parent)
      : nodeId_(nodeId), parent_(parent) {
    scale_ = parent_ ? static_cast<float>(GetDpiForWindow(parent_)) / 96.0f : 1.0f;
    if (scale_ <= 0.0f) scale_ = 1.0f;
  }

  CefRefPtr<CefRenderHandler> GetRenderHandler() override { return this; }
  CefRefPtr<CefLoadHandler> GetLoadHandler() override { return this; }
  CefRefPtr<CefRequestHandler> GetRequestHandler() override { return this; }
  CefRefPtr<CefLifeSpanHandler> GetLifeSpanHandler() override { return this; }

  bool OnProcessMessageReceived(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame>,
                                CefProcessId, CefRefPtr<CefProcessMessage> message) override {
    if (!message || message->GetName() != kRayactWebMessage) return false;
    queueEvent("message", message->GetArgumentList()->GetString(0).ToString());
    return true;
  }

  void GetViewRect(CefRefPtr<CefBrowser>, CefRect& rect) override {
    std::lock_guard<std::mutex> lock(mutex_);
    rect = CefRect(0, 0,
                   std::max(1, static_cast<int>(std::ceil(pixelWidth_ / scale_))),
                   std::max(1, static_cast<int>(std::ceil(pixelHeight_ / scale_))));
  }

  bool GetScreenInfo(CefRefPtr<CefBrowser>, CefScreenInfo& info) override {
    std::lock_guard<std::mutex> lock(mutex_);
    const int width = std::max(1, static_cast<int>(std::ceil(pixelWidth_ / scale_)));
    const int height = std::max(1, static_cast<int>(std::ceil(pixelHeight_ / scale_)));
    info.device_scale_factor = scale_;
    info.rect = CefRect(0, 0, width, height);
    info.available_rect = info.rect;
    return true;
  }

  void OnPopupShow(CefRefPtr<CefBrowser>, bool show) override {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      popupVisible_ = show;
      if (!show) popupPixels_.clear();
      ++generation_;
    }
    requestFrame();
  }

  void OnPopupSize(CefRefPtr<CefBrowser>, const CefRect& rect) override {
    std::lock_guard<std::mutex> lock(mutex_);
    popupRect_ = rect;
  }

  void OnPaint(CefRefPtr<CefBrowser>, PaintElementType type,
               const RectList&, const void* buffer, int width, int height) override {
    if (!buffer || width <= 0 || height <= 0) return;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (disposed_) return;
      const size_t bytes = static_cast<size_t>(width) * height * 4u;
      if (type == PET_VIEW) {
        viewWidth_ = width;
        viewHeight_ = height;
        viewPixels_.resize(bytes);
        memcpy(viewPixels_.data(), buffer, bytes);
      } else {
        popupWidth_ = width;
        popupHeight_ = height;
        popupPixels_.resize(bytes);
        memcpy(popupPixels_.data(), buffer, bytes);
      }
      ++generation_;
    }
    requestFrame();
  }

  void OnAfterCreated(CefRefPtr<CefBrowser> browser) override {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (disposed_) {
        browser->GetHost()->CloseBrowser(true);
        return;
      }
      browser_ = browser;
    }
    // The first Rayact layout can arrive while CreateBrowser is still
    // asynchronous. In that case layout() stores the correct dimensions but
    // has no CefBrowserHost to notify yet. Replay the resize here so a cold
    // launch never remains on CEF's initial 1x1 backing surface.
    browser->GetHost()->NotifyScreenInfoChanged();
    browser->GetHost()->WasResized();
    loadSourceOnCef();
  }

  bool OnBeforePopup(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame>, int,
                     const CefString& targetUrl, const CefString&,
                     CefLifeSpanHandler::WindowOpenDisposition, bool,
                     const CefPopupFeatures&,
                     CefWindowInfo&, CefRefPtr<CefClient>&, CefBrowserSettings&,
                     CefRefPtr<CefDictionaryValue>&, bool*) override {
    if (!targetUrl.empty()) browser->GetMainFrame()->LoadURL(targetUrl);
    return true;
  }

  void OnBeforeClose(CefRefPtr<CefBrowser>) override {
    std::lock_guard<std::mutex> lock(mutex_);
    browser_ = nullptr;
  }

  void OnLoadStart(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame> frame,
                   TransitionType) override {
    if (!frame->IsMain()) return;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      documentReady_ = false;
    }
    queueEvent("loadStart", displayUrl(frame->GetURL().ToString()));
  }

  void OnLoadEnd(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame> frame, int) override {
    if (!frame->IsMain()) return;
    std::string injected;
    std::vector<std::string> pending;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      documentReady_ = true;
      injected = injectedScript_;
      pending.swap(pendingCommands_);
    }
    if (!injected.empty()) frame->ExecuteJavaScript(injected, frame->GetURL(), 0);
    for (const std::string& command : pending) runCommandOnCef(command);
    queueEvent("loadEnd", displayUrl(frame->GetURL().ToString()));
  }

  void OnLoadError(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame> frame,
                   ErrorCode code, const CefString& text,
                   const CefString& failedUrl) override {
    if (!frame->IsMain() || code == ERR_ABORTED ||
        failedUrl.ToString().rfind("rayact-message://", 0) == 0) return;
    queueEvent("error", text.ToString() + " (" + std::to_string(code) + ")");
  }

  bool OnBeforeBrowse(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame>,
                      CefRefPtr<CefRequest> request, bool, bool) override {
    static constexpr char prefix[] = "rayact-message://post/";
    const std::string url = request->GetURL().ToString();
    if (url.rfind(prefix, 0) != 0) return false;
    queueEvent("message", percentDecode(url.substr(sizeof(prefix) - 1)));
    return true;
  }

  void createBrowser() {
    CefWindowInfo windowInfo;
    windowInfo.SetAsWindowless(parent_);
    CefBrowserSettings settings;
    settings.windowless_frame_rate = 60;
    settings.background_color = CefColorSetARGB(0, 0, 0, 0);
    CefRefPtr<CefDictionaryValue> extraInfo = CefDictionaryValue::Create();
    {
      std::lock_guard<std::mutex> lock(mutex_);
      extraInfo->SetString(kRayactBeforeScriptKey, beforeScript_);
    }
    if (!CefBrowserHost::CreateBrowser(windowInfo, this, "about:blank", settings,
                                       extraInfo, nullptr)) {
      queueEvent("error", "failed to create CEF windowless browser");
    }
  }

  void applyProps(const char* json, size_t length) {
    if (!json || !length) return;
    const std::string props(json, length);
    bool present = false;
    bool sourceChanged = false;
    std::string command;
    std::string value;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (extractString(props, "sourceHtml", &value, &present) && present &&
          value != sourceHtml_) {
        sourceHtml_ = value;
        sourceChanged = true;
        sourcePending_ = true;
      }
      if (extractString(props, "sourceUri", &value, &present) && present &&
          value != sourceUri_) {
        sourceUri_ = value;
        sourceChanged = true;
        sourcePending_ = true;
      }
      if (extractString(props, "baseUrl", &value, &present) && present)
        baseUrl_ = value;
      if (extractString(props, "injectedJavaScriptBeforeContentLoaded", &value,
                        &present) && present)
        beforeScript_ = value;
      if (extractString(props, "injectedJavaScript", &value, &present) && present)
        injectedScript_ = value;
      if (extractString(props, "command", &value, &present) && present &&
          !value.empty() && value != lastCommand_) {
        lastCommand_ = value;
        command = value;
      }
    }
    if (sourceChanged) {
      CefRefPtr<Instance> keep(this);
      postToCef([keep]() { keep->loadSourceOnCef(); });
    }
    if (!command.empty()) {
      CefRefPtr<Instance> keep(this);
      postToCef([keep, command]() { keep->runCommandOnCef(command); });
    }
  }

  void layout(float pixelWidth, float pixelHeight) {
    bool changed = false;
    uint64_t resizeSerial = 0;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      const int nextWidth = std::max(1, static_cast<int>(std::lround(pixelWidth)));
      const int nextHeight = std::max(1, static_cast<int>(std::lround(pixelHeight)));
      changed = nextWidth != pixelWidth_ || nextHeight != pixelHeight_;
      pixelWidth_ = nextWidth;
      pixelHeight_ = nextHeight;
      if (changed) resizeSerial = ++resizeSerial_;
    }
    if (!changed) return;
    CefRefPtr<Instance> keep(this);
    postToCef([keep, resizeSerial]() {
      CefRefPtr<CefBrowser> browser = keep->browser();
      if (!browser) return;
      browser->GetHost()->NotifyScreenInfoChanged();
      browser->GetHost()->WasResized();
      // WasResized updates Chromium's viewport, but an OSR software frame is
      // not guaranteed immediately. Explicit invalidation prevents Vulkan from
      // stretching the previous-size texture until the next pointer event.
      browser->GetHost()->Invalidate(PET_VIEW);
      // If browser creation and the first layout crossed, the initial source
      // is still pending. loadSourceOnCef() is a no-op after navigation, so
      // ordinary resizes preserve page state.
      keep->loadSourceOnCef();
      // Coalesce a final resize/paint after a drag settles. This catches CEF
      // dropping an intermediate paint while many WasResized calls are queued.
      CefPostDelayedTask(
          TID_UI,
          new LambdaTask([keep, resizeSerial]() {
            {
              std::lock_guard<std::mutex> lock(keep->mutex_);
              if (keep->disposed_ || keep->resizeSerial_ != resizeSerial) return;
            }
            CefRefPtr<CefBrowser> settledBrowser = keep->browser();
            if (!settledBrowser) return;
            settledBrowser->GetHost()->WasResized();
            settledBrowser->GetHost()->Invalidate(PET_VIEW);
          }),
          100);
    });
  }

  void pointer(int32_t kind, float physicalX, float physicalY,
               int32_t buttons, float wheel) {
    CefRefPtr<Instance> keep(this);
    postToCef([keep, kind, physicalX, physicalY, buttons, wheel]() {
      CefRefPtr<CefBrowser> browser = keep->browser();
      if (!browser) return;
      CefMouseEvent event;
      event.x = static_cast<int>(std::lround(physicalX / keep->scale_));
      event.y = static_cast<int>(std::lround(physicalY / keep->scale_));
      event.modifiers = EVENTFLAG_NONE;
      // Chromium expects the released button to be absent from the modifier
      // mask on mouse-up. The host keeps it in `buttons` so we can still choose
      // the correct CefBrowserHost::MouseButtonType below.
      if (kind != 2) {
        if (buttons & 1) event.modifiers |= EVENTFLAG_LEFT_MOUSE_BUTTON;
        if (buttons & 2) event.modifiers |= EVENTFLAG_RIGHT_MOUSE_BUTTON;
        if (buttons & 4) event.modifiers |= EVENTFLAG_MIDDLE_MOUSE_BUTTON;
      }
      CefRefPtr<CefBrowserHost> host = browser->GetHost();
      if (wheel != 0.0f) {
        host->SendMouseWheelEvent(event, 0,
            static_cast<int>(std::lround(wheel * WHEEL_DELTA)));
        return;
      }
      if (kind == 0) {
        host->SendMouseMoveEvent(event, false);
        return;
      }
      CefBrowserHost::MouseButtonType button = MBT_LEFT;
      if (buttons & 2) button = MBT_RIGHT;
      else if (buttons & 4) button = MBT_MIDDLE;
      if (kind == 1) host->SetFocus(true);
      host->SendMouseClickEvent(event, button, kind == 2, 1);
      if (kind == 2) {
        host->Invalidate(PET_VIEW);
        CefRefPtr<CefBrowser> repaintBrowser = browser;
        CefPostDelayedTask(
            TID_UI,
            new LambdaTask([repaintBrowser]() {
              repaintBrowser->GetHost()->Invalidate(PET_VIEW);
            }),
            100);
      }
    });
  }

  void key(int32_t kind, int32_t keyCode, int32_t modifiers,
           uint32_t textCodepoint) {
    CefRefPtr<Instance> keep(this);
    postToCef([keep, kind, keyCode, modifiers, textCodepoint]() {
      CefRefPtr<CefBrowser> browser = keep->browser();
      if (!browser) return;
      if (kind == 3) {
        browser->GetHost()->SetFocus(false);
        return;
      }
      CefKeyEvent event;
      event.type = kind == 2 ? KEYEVENT_CHAR
          : (kind == 1 ? KEYEVENT_KEYUP : KEYEVENT_RAWKEYDOWN);
      event.windows_key_code = keyCode;
      event.native_key_code = keyCode;
      event.modifiers = EVENTFLAG_NONE;
      if (modifiers & 1) event.modifiers |= EVENTFLAG_SHIFT_DOWN;
      if (modifiers & 2) event.modifiers |= EVENTFLAG_CONTROL_DOWN;
      if (modifiers & 4) event.modifiers |= EVENTFLAG_ALT_DOWN;
      if (kind == 2 && textCodepoint <= 0xffff) {
        event.character = static_cast<char16_t>(textCodepoint);
        event.unmodified_character = event.character;
      }
      browser->GetHost()->SendKeyEvent(event);
    });
  }

  int copyFrame(uint8_t* destination, size_t capacity, int32_t* width,
                int32_t* height, int32_t* stride, uint64_t* generation) {
    // This callback runs on Rayact's render/main thread, which is the only
    // thread allowed to deliver module view events to JavaScript.
    std::vector<std::string> events;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      events.swap(pendingEvents_);
    }
    if (g_host && g_host->emit_view_event) {
      for (const std::string& event : events)
        g_host->emit_view_event(nodeId_, event.c_str(), event.size());
    }

    std::lock_guard<std::mutex> lock(mutex_);
    if (viewPixels_.empty() || viewWidth_ <= 0 || viewHeight_ <= 0) return 0;
    if (width) *width = viewWidth_;
    if (height) *height = viewHeight_;
    if (stride) *stride = viewWidth_ * 4;
    if (generation && *generation == generation_) return 0;
    const size_t required = static_cast<size_t>(viewWidth_) * viewHeight_ * 4u;
    if (!destination || capacity < required) return static_cast<int>(required);
    memcpy(destination, viewPixels_.data(), required);
    compositePopup(destination, viewWidth_, viewHeight_);
    if (generation) *generation = generation_;
    return static_cast<int>(required);
  }

  void dispose() {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      disposed_ = true;
      pendingEvents_.clear();
    }
    CefRefPtr<Instance> keep(this);
    postToCef([keep]() {
      CefRefPtr<CefBrowser> browser = keep->browser();
      if (browser) browser->GetHost()->CloseBrowser(true);
    });
  }

 private:
  CefRefPtr<CefBrowser> browser() {
    std::lock_guard<std::mutex> lock(mutex_);
    return disposed_ ? nullptr : browser_;
  }

  void requestFrame() {
    if (g_host && g_host->request_frame) g_host->request_frame();
  }

  void queueEvent(const std::string& type, const std::string& data) {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (disposed_) return;
      pendingEvents_.push_back(
          "{\"type\":\"" + jsonEscape(type) + "\",\"data\":\"" +
          jsonEscape(data) + "\"}");
    }
    requestFrame();
  }

  std::string displayUrl(const std::string& actual) {
    if (actual.rfind("data:text/html", 0) != 0) return actual;
    std::lock_guard<std::mutex> lock(mutex_);
    return baseUrl_;
  }

  void loadSourceOnCef(bool force = false) {
    CEF_REQUIRE_UI_THREAD();
    CefRefPtr<CefBrowser> browser = this->browser();
    if (!browser) return;
    std::string html;
    std::string uri;
    std::string base;
    int width = 0;
    int height = 0;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (!sourcePending_ && !force) return;
      html = sourceHtml_;
      uri = sourceUri_;
      base = baseUrl_;
      width = pixelWidth_;
      height = pixelHeight_;
      if (width <= 1 || height <= 1 || (html.empty() && uri.empty())) return;
      sourcePending_ = false;
    }
    CefRefPtr<CefProcessMessage> beforeMessage =
        CefProcessMessage::Create(kRayactSetBeforeScriptMessage);
    {
      std::lock_guard<std::mutex> lock(mutex_);
      beforeMessage->GetArgumentList()->SetString(0, beforeScript_);
    }
    browser->GetMainFrame()->SendProcessMessage(PID_RENDERER, beforeMessage);
    if (!html.empty()) {
      if (!base.empty()) {
        const std::string baseTag = "<base href=\"" + jsonEscape(base) + "\">";
        const size_t head = html.find("<head>");
        if (head != std::string::npos) html.insert(head + 6, baseTag);
        else html.insert(0, baseTag);
      }
      browser->GetMainFrame()->LoadURL(
          "data:text/html;charset=utf-8;base64," + base64Encode(html));
    } else if (!uri.empty()) {
      browser->GetMainFrame()->LoadURL(uri);
    }
  }

  void runCommandOnCef(const std::string& raw) {
    CEF_REQUIRE_UI_THREAD();
    CefRefPtr<CefBrowser> browser = this->browser();
    if (!browser) return;
    std::string value = raw;
    const size_t hash = value.rfind('#');
    if (hash != std::string::npos &&
        value.find_first_not_of("0123456789", hash + 1) == std::string::npos)
      value.resize(hash);

    bool ready = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      ready = documentReady_;
      if (!ready && value != "reload") {
        pendingCommands_.push_back(raw);
        return;
      }
    }
    CefRefPtr<CefBrowserHost> host = browser->GetHost();
    CefRefPtr<CefFrame> frame = browser->GetMainFrame();
    if (value == "reload") loadSourceOnCef(true);
    else if (value == "goBack") browser->GoBack();
    else if (value == "goForward") browser->GoForward();
    else if (value == "stopLoading") browser->StopLoad();
    else if (value.rfind("inject:", 0) == 0)
      frame->ExecuteJavaScript(value.substr(7), frame->GetURL(), 0);
    else if (value.rfind("post:", 0) == 0) {
      const std::string script =
          "window.dispatchEvent(new MessageEvent('message',{data:\"" +
          jsonEscape(value.substr(5)) + "\"}));";
      frame->ExecuteJavaScript(script, frame->GetURL(), 0);
    }
  }

  void compositePopup(uint8_t* destination, int width, int height) {
    if (!popupVisible_ || popupPixels_.empty() || popupWidth_ <= 0 ||
        popupHeight_ <= 0) return;
    // Popup coordinates are in view DIPs while the popup buffer is device
    // pixels. Convert its origin to the frame's physical-pixel coordinates.
    const int originX = static_cast<int>(std::lround(popupRect_.x * scale_));
    const int originY = static_cast<int>(std::lround(popupRect_.y * scale_));
    for (int y = 0; y < popupHeight_; ++y) {
      const int destinationY = originY + y;
      if (destinationY < 0 || destinationY >= height) continue;
      const int sourceX = std::max(0, -originX);
      const int destinationX = std::max(0, originX);
      const int count = std::min(popupWidth_ - sourceX, width - destinationX);
      if (count <= 0) continue;
      memcpy(destination + (static_cast<size_t>(destinationY) * width + destinationX) * 4u,
             popupPixels_.data() + (static_cast<size_t>(y) * popupWidth_ + sourceX) * 4u,
             static_cast<size_t>(count) * 4u);
    }
  }

  int32_t nodeId_ = 0;
  HWND parent_ = nullptr;
  float scale_ = 1.0f;
  std::mutex mutex_;
  CefRefPtr<CefBrowser> browser_;
  std::string sourceHtml_;
  std::string sourceUri_;
  std::string baseUrl_;
  std::string beforeScript_;
  std::string injectedScript_;
  std::string lastCommand_;
  std::vector<std::string> pendingCommands_;
  std::vector<std::string> pendingEvents_;
  std::vector<uint8_t> viewPixels_;
  std::vector<uint8_t> popupPixels_;
  CefRect popupRect_;
  int pixelWidth_ = 1;
  int pixelHeight_ = 1;
  int viewWidth_ = 0;
  int viewHeight_ = 0;
  int popupWidth_ = 0;
  int popupHeight_ = 0;
  uint64_t generation_ = 0;
  uint64_t resizeSerial_ = 0;
  bool documentReady_ = false;
  bool sourcePending_ = true;
  bool popupVisible_ = false;
  bool disposed_ = false;

  IMPLEMENT_REFCOUNTING(Instance);
  DISALLOW_COPY_AND_ASSIGN(Instance);
};

bool initializeCef() {
  std::lock_guard<std::mutex> lock(g_cefMutex);
  if (g_cefInitialized) return true;

  const std::wstring directory = moduleDirectory();
  fprintf(stderr, "[webview] initializing CEF from %ls\n", directory.c_str());
  fflush(stderr);
  if (directory.empty()) return false;
  CefSettings settings;
  settings.no_sandbox = true;
  settings.multi_threaded_message_loop = true;
  settings.windowless_rendering_enabled = true;
  settings.log_severity = LOGSEVERITY_WARNING;
  settings.background_color = CefColorSetARGB(0, 0, 0, 0);
  CefString(&settings.browser_subprocess_path) =
      joinPath(directory, L"rayact_cef_subprocess.exe");
  CefString(&settings.resources_dir_path) = directory;
  CefString(&settings.locales_dir_path) = joinPath(directory, L"locales");

  std::wstring dataDirectory;
  if (g_host && g_host->data_dir) {
    const char* utf8 = g_host->data_dir();
    if (utf8 && *utf8) {
      const int count = MultiByteToWideChar(CP_UTF8, 0, utf8, -1, nullptr, 0);
      if (count > 1) {
        dataDirectory.resize(static_cast<size_t>(count));
        MultiByteToWideChar(CP_UTF8, 0, utf8, -1, dataDirectory.data(), count);
        dataDirectory.pop_back();
      }
    }
  }
  if (dataDirectory.empty()) dataDirectory = directory;
  const std::wstring cache = joinPath(dataDirectory, L"cef");
  CefString(&settings.root_cache_path) = cache;
  CefString(&settings.cache_path) = cache;

  CefMainArgs mainArgs(GetModuleHandleW(nullptr));
  g_cefInitialized =
      CefInitialize(mainArgs, settings, new RayactCefApp(), nullptr);
  fprintf(stderr, "[webview] CefInitialize returned %d (exit code %d)\n",
          g_cefInitialized ? 1 : 0, CefGetExitCode());
  fflush(stderr);
  if (!g_cefInitialized)
    fprintf(stderr, "[webview] CefInitialize failed\n");
  return g_cefInitialized;
}

void* viewCreate(void*, int32_t nodeId, const char* props, size_t propsLength,
                 void** outNativeView) {
  if (outNativeView) *outNativeView = nullptr;
  if (!initializeCef() || !g_host || !g_host->native_window) return nullptr;
  HWND parent = reinterpret_cast<HWND>(g_host->native_window());
  if (!parent) return nullptr;
  auto* instance = new Instance(nodeId, parent);
  instance->AddRef();  // factory ownership, released by viewDispose
  instance->applyProps(props, propsLength);
  CefRefPtr<Instance> keep(instance);
  postToCef([keep]() { keep->createBrowser(); });
  return instance;
}

int viewSetProperties(void* value, const char* props, size_t length) {
  auto* instance = static_cast<Instance*>(value);
  if (!instance) return -1;
  instance->applyProps(props, length);
  return 0;
}

void viewNotifyLayout(void* value, float width, float height) {
  if (auto* instance = static_cast<Instance*>(value)) instance->layout(width, height);
}

void viewNotifyPointer(void* value, int32_t kind, float x, float y,
                       int32_t buttons, float wheel) {
  if (auto* instance = static_cast<Instance*>(value))
    instance->pointer(kind, x, y, buttons, wheel);
}

void viewNotifyKey(void* value, int32_t kind, int32_t keyCode,
                   int32_t modifiers, uint32_t textCodepoint) {
  if (auto* instance = static_cast<Instance*>(value))
    instance->key(kind, keyCode, modifiers, textCodepoint);
}

int viewCopyFrame(void* value, uint8_t* destination, size_t capacity,
                  int32_t* width, int32_t* height, int32_t* stride,
                  uint64_t* generation) {
  auto* instance = static_cast<Instance*>(value);
  return instance ? instance->copyFrame(destination, capacity, width, height,
                                        stride, generation) : -1;
}

void viewDispose(void* value) {
  auto* instance = static_cast<Instance*>(value);
  if (!instance) return;
  instance->dispose();
  instance->Release();
}

}  // namespace

// CEF requires CefExecuteProcess to run from the application entry path, before
// the host initializes other subsystems. The host discovers this optional hook
// dynamically, so builds that do not install @rayact/webview remain uncoupled
// from CEF. Secondary renderer/GPU processes use rayact_cef_subprocess.exe; the
// browser process receives -1 here and continues normal Rayact startup.
extern "C" RAYACT_MODULE_EXPORT int rayact_module_process_bootstrap() {
  CefMainArgs mainArgs(GetModuleHandleW(nullptr));
  return CefExecuteProcess(mainArgs, new RayactCefApp(), nullptr);
}

extern "C" int rayact_webview_register(const RayactHost* host) {
  if (!host || host->abi_version < 5u || !host->register_view_factory ||
      !host->request_frame || !host->native_window) return -1;
  g_host = host;
  if (!initializeCef()) return -1;

  RayactViewFactory factory{};
  factory.struct_size = sizeof(factory);
  factory.create = viewCreate;
  factory.set_properties = viewSetProperties;
  factory.notify_layout = viewNotifyLayout;
  factory.dispose = viewDispose;
  factory.notify_pointer = viewNotifyPointer;
  factory.notify_key = viewNotifyKey;
  factory.copy_frame_bgra8 = viewCopyFrame;
  return host->register_view_factory("webview", &factory);
}

extern "C" RAYACT_MODULE_EXPORT int rayact_module_register(const RayactHost* host) {
  return rayact_webview_register(host);
}
