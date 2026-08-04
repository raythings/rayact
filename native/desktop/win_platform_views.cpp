// Windows platform-view host. ABI-5 off-screen views are uploaded as textures
// and painted at their exact raym3 scene position; native editors and older
// visual-hosted modules retain the HWND/DirectComposition paths below.
//
// The Windows peer of mac_platform_views.mm. macOS can hand a module's NSView
// straight to AppKit; Windows has no such hierarchy for a Vulkan window, so the
// host owns a DirectComposition device and visual tree instead:
//
//   host HWND ── IDCompositionTarget ── root visual
//                                        └── one child visual per view node
//
// A module allocates its visual from *this* device (RayactHost::compositor, ABI
// 4) and renders into it; the host only positions and clips it. That is what
// makes transforms, opacity and non-rectangular clipping possible — a child HWND
// would always paint as an opaque rectangle above the Vulkan surface.
//
// Because such a visual owns no window, the OS routes it no input; the engine's
// hit-testing forwards what lands inside a view's bounds through the factory's
// notify_pointer hook.
//
// NOTE: DirectComposition views live on transparent owned windows over the
// engine HWND. The CEF WebView does not use this overlay path: it supplies an
// off-screen frame that is painted inside Vulkan instead.

#if defined(_WIN32)

#include "engine.hpp"
#include "module_bus.hpp"
#include "module_views.hpp"
#include <raym3/v2/ExternalView.h>

// The target defines NOGDI/NOUSER so raylib's Rectangle/CloseWindow/ShowCursor
// survive elsewhere, but DirectComposition pulls in the OLE headers, which need
// MSG and the GDI types. Undefine them for this file only — and reach the
// external-view hooks by declaration rather than including raym3_bridge.hpp, so
// raylib's colliding names never enter this translation unit.
#undef NOUSER
#undef NOGDI
// This TU needs both raylib's public API (through ExternalView.h) and the full
// Win32 user/GDI declarations required by dcomp.h. Rename the three colliding
// Win32 functions while the SDK headers are parsed; none is used here.
#define Rectangle Win32Rectangle
#define CloseWindow Win32CloseWindow
#define ShowCursor Win32ShowCursor
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <windowsx.h>
#include <commctrl.h>
#include <dcomp.h>
#undef ShowCursor
#undef CloseWindow
#undef Rectangle

void rayactSetExternalViewHostCallbacks(
    void (*createCb)(int surfaceId, int nodeId, const char* kind, const char* propsJson),
    void (*rectCb)(int surfaceId, int nodeId, const char* kind, float x, float y, float w, float h),
    void (*inputCb)(int surfaceId, int nodeId, int action, float localX, float localY),
    void (*propsCb)(int surfaceId, int nodeId, const char* propsJson),
    void (*disposeCb)(int surfaceId, int nodeId));
void rayactReplayExternalViewCreates();
void rayactExternalViewEmitText(int nodeId, const char* text);
void rayactSetExternalViewTexture(int nodeId, Texture2D texture);

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <cstdio>
#include <cmath>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#define GLFW_EXPOSE_NATIVE_WIN32
#include <GLFW/glfw3.h>
#include <GLFW/glfw3native.h>

namespace rayact {
void engineSetExternalViewEmbedder(raym3::v2::ExternalViewEmbedder* embedder);

namespace {

struct HostedView {
  void* instance = nullptr;                 // module-owned instance handle
  const RayactViewFactory* factory = nullptr;
  IDCompositionVisual* visual = nullptr;     // the module's visual
  HWND overlay = nullptr;                    // per-view composition window
  IDCompositionTarget* target = nullptr;
  float width = 0.0f;
  float height = 0.0f;
  Rectangle boundsDp = {0, 0, 0, 0};
  std::vector<raym3::v2::ExternalViewOcclusion> occludingRegions;
  std::vector<raym3::v2::ExternalViewMutator> mutators;
  Texture2D texture = {0};
  std::vector<unsigned char> framePixels;
  std::vector<unsigned char> rgbaPixels;
  uint64_t frameGeneration = 0;
  std::string regionKey;
  bool composited = false;
  bool offscreen = false;
  bool nativeTextInput = false;
  HWND editor = nullptr;
  WNDPROC previousEditorWndProc = nullptr;
  HFONT editorFont = nullptr;
  RECT lastOverlayRect = {0, 0, 0, 0};
  RECT lastEditorRect = {0, 0, 0, 0};
  bool overlayRectValid = false;
  bool editorRectValid = false;
  bool overlayShown = false;
  bool applyingProps = false;
  bool multiline = false;
  bool blurOnSubmit = true;
  bool caretHidden = false;
  float fontSize = 0.0f;
  float contentHorizontal = 16.0f;
  float contentTop = 0.0f;
  float contentBottom = 0.0f;
  COLORREF textColor = RGB(0, 0, 0);
};

IDCompositionDevice* g_device = nullptr;
HWND g_window = nullptr;     // the engine's window; owner of the per-view overlays
const wchar_t* kOverlayClass = L"RayactPlatformViewHost";
std::map<HWND, int> g_overlayToNode;
std::map<HWND, int> g_editorToNode;
std::vector<int> g_offscreenOrder;
int g_offscreenPointerCapture = 0;
int g_offscreenKeyboardFocus = 0;
WNDPROC g_previousOwnerWndProc = nullptr;
HBRUSH g_transparentKeyBrush = nullptr;
constexpr COLORREF kTransparentKey = RGB(1, 2, 3);

// The rect callback delivers logical (dp) coordinates; native windows and
// off-screen frame buffers use physical pixels.
float dpiScale() {
  return g_window ? (float)GetDpiForWindow(g_window) / 96.0f : 1.0f;
}
std::map<int, HostedView> g_views;   // keyed by nodeId
bool g_installed = false;

bool factoryHasFrameCopy(const RayactViewFactory* factory) {
  return factory &&
      factory->struct_size >=
          offsetof(RayactViewFactory, copy_frame_bgra8) +
              sizeof(factory->copy_frame_bgra8) &&
      factory->copy_frame_bgra8;
}

bool routeOffscreenPointer(UINT msg, WPARAM wp, LPARAM lp);
bool routeOffscreenKey(UINT msg, WPARAM wp, LPARAM lp);

void positionOverlay(HostedView& view) {
  if (!view.overlay || !g_window) return;
  const float scale = dpiScale();
  POINT clientOrigin{0, 0};
  ClientToScreen(g_window, &clientOrigin);
  const int x = clientOrigin.x + (int)std::lround(view.boundsDp.x * scale);
  const int y = clientOrigin.y + (int)std::lround(view.boundsDp.y * scale);
  const int width = std::max(1, (int)std::lround(view.boundsDp.width * scale));
  const int height = std::max(1, (int)std::lround(view.boundsDp.height * scale));
  const RECT next{x, y, x + width, y + height};
  const bool rectChanged = !view.overlayRectValid ||
      !EqualRect(&view.lastOverlayRect, &next);
  const bool visibilityChanged = view.overlayShown != view.composited;
  if (rectChanged || visibilityChanged) {
    SetWindowPos(view.overlay, nullptr, x, y, width, height,
                 SWP_NOACTIVATE | SWP_NOZORDER |
                     (view.composited ? SWP_SHOWWINDOW : SWP_HIDEWINDOW));
    view.lastOverlayRect = next;
    view.overlayRectValid = true;
    view.overlayShown = view.composited;
  }

  if (view.nativeTextInput && view.editor) {
    const int inset = std::max(0, (int)std::lround(view.contentHorizontal * scale));
    const int top = std::max(0, (int)std::lround(view.contentTop * scale));
    const int bottom = std::max(0, (int)std::lround(view.contentBottom * scale));
    const int regionWidth = std::max(1, width - inset * 2);
    const int regionHeight = std::max(1, height - top - bottom);
    int editorY = top;
    int editorHeight = regionHeight;
    if (!view.multiline) {
      editorHeight = std::min(regionHeight,
                              std::max(1, (int)std::ceil(view.fontSize * scale * 1.55f)));
      editorY = top + (regionHeight - editorHeight) / 2;
    }
    const RECT editorRect{inset, editorY, inset + regionWidth,
                          editorY + editorHeight};
    if (!view.editorRectValid || !EqualRect(&view.lastEditorRect, &editorRect)) {
      SetWindowPos(view.editor, nullptr, editorRect.left, editorRect.top,
                   regionWidth, editorHeight,
                   SWP_NOACTIVATE | SWP_NOZORDER | SWP_SHOWWINDOW);
      view.lastEditorRect = editorRect;
      view.editorRectValid = true;
    }
  }
}

void repositionOverlays() {
  for (auto& [_, view] : g_views) positionOverlay(view);
}

LRESULT CALLBACK ownerWndProc(HWND wnd, UINT msg, WPARAM wp, LPARAM lp) {
  if (routeOffscreenPointer(msg, wp, lp) || routeOffscreenKey(msg, wp, lp))
    return 0;
  const LRESULT result = CallWindowProcW(g_previousOwnerWndProc, wnd, msg, wp, lp);
  if (msg == WM_MOVE || msg == WM_WINDOWPOSCHANGED || msg == WM_DPICHANGED)
    repositionOverlays();
  return result;
}

void commit() {
  if (g_device) g_device->Commit();
}

void applyCompositionRegion(
    HostedView& view,
    const raym3::v2::ExternalViewComposition& composition) {
  if (!view.overlay) return;
  const float scale = dpiScale();
  const int width = std::max(1, (int)std::lround(composition.bounds.width * scale));
  const int height = std::max(1, (int)std::lround(composition.bounds.height * scale));

  std::ostringstream key;
  key << width << 'x' << height;
  for (const auto& mutator : composition.mutators) {
    if (mutator.kind == raym3::v2::ExternalViewMutatorKind::ClipRect ||
        mutator.kind == raym3::v2::ExternalViewMutatorKind::ClipRoundedRect) {
      key << " c" << (int)std::lround((mutator.rect.x - composition.bounds.x) * scale)
          << ',' << (int)std::lround((mutator.rect.y - composition.bounds.y) * scale)
          << ',' << (int)std::lround(mutator.rect.width * scale)
          << ',' << (int)std::lround(mutator.rect.height * scale)
          << ',' << (int)std::lround(mutator.radius * scale);
    }
  }
  for (const auto& occlusion : composition.occludingRegions) {
    const Rectangle& region = occlusion.rect;
    key << " h" << (int)std::lround((region.x - composition.bounds.x) * scale)
        << ',' << (int)std::lround((region.y - composition.bounds.y) * scale)
        << ',' << (int)std::lround(region.width * scale)
        << ',' << (int)std::lround(region.height * scale)
        << ',' << (int)std::lround(occlusion.radius * scale);
  }
  if (key.str() == view.regionKey) return;
  view.regionKey = key.str();

  HRGN visible = CreateRectRgn(0, 0, width, height);
  for (const auto& mutator : composition.mutators) {
    if (mutator.kind != raym3::v2::ExternalViewMutatorKind::ClipRect &&
        mutator.kind != raym3::v2::ExternalViewMutatorKind::ClipRoundedRect)
      continue;
    const int left = (int)std::floor((mutator.rect.x - composition.bounds.x) * scale);
    const int top = (int)std::floor((mutator.rect.y - composition.bounds.y) * scale);
    const int right = (int)std::ceil(
        (mutator.rect.x + mutator.rect.width - composition.bounds.x) * scale);
    const int bottom = (int)std::ceil(
        (mutator.rect.y + mutator.rect.height - composition.bounds.y) * scale);
    const int diameter = std::max(
        1, (int)std::lround(mutator.radius * scale * 2.0f));
    HRGN clip = mutator.kind == raym3::v2::ExternalViewMutatorKind::ClipRoundedRect
        ? CreateRoundRectRgn(left, top, right, bottom, diameter, diameter)
        : CreateRectRgn(left, top, right, bottom);
    CombineRgn(visible, visible, clip, RGN_AND);
    DeleteObject(clip);
  }
  // Framework content painted after this platform view must be real holes in
  // the popup, not merely hit-test exceptions. This lets Vulkan pixels appear
  // above an opaque web page and naturally routes pointer input to the owner.
  for (const auto& occlusion : composition.occludingRegions) {
    const Rectangle& region = occlusion.rect;
    const int left = (int)std::floor((region.x - composition.bounds.x) * scale);
    const int top = (int)std::floor((region.y - composition.bounds.y) * scale);
    const int right = (int)std::ceil(
        (region.x + region.width - composition.bounds.x) * scale);
    const int bottom = (int)std::ceil(
        (region.y + region.height - composition.bounds.y) * scale);
    const int diameter = std::max(
        1, (int)std::lround(occlusion.radius * scale * 2.0f));
    HRGN hole = occlusion.radius > 0.01f
        ? CreateRoundRectRgn(left, top, right, bottom, diameter, diameter)
        : CreateRectRgn(left, top, right, bottom);
    CombineRgn(visible, visible, hole, RGN_DIFF);
    DeleteObject(hole);
  }
  // SetWindowRgn owns `visible` after success; on failure it remains ours.
  if (!SetWindowRgn(view.overlay, visible, TRUE)) DeleteObject(visible);
}

bool pointInRect(float x, float y, const Rectangle& rect) {
  return x >= rect.x && y >= rect.y &&
         x < rect.x + rect.width && y < rect.y + rect.height;
}

bool pointInRoundedRect(float x, float y, const Rectangle& rect, float radius) {
  if (!pointInRect(x, y, rect)) return false;
  const float r = std::min(std::max(0.0f, radius),
                           std::min(rect.width, rect.height) * 0.5f);
  if (r <= 0.0f ||
      (x >= rect.x + r && x < rect.x + rect.width - r) ||
      (y >= rect.y + r && y < rect.y + rect.height - r))
    return true;
  const float cornerX = x < rect.x + r
      ? rect.x + r : rect.x + rect.width - r;
  const float cornerY = y < rect.y + r
      ? rect.y + r : rect.y + rect.height - r;
  const float dx = x - cornerX, dy = y - cornerY;
  return dx * dx + dy * dy <= r * r;
}

bool frameworkOwnsPoint(const HostedView& view, float localPxX, float localPxY) {
  const float scale = dpiScale();
  const float sceneX = view.boundsDp.x + localPxX / scale;
  const float sceneY = view.boundsDp.y + localPxY / scale;
  for (const auto& occlusion : view.occludingRegions)
    if (pointInRoundedRect(sceneX, sceneY, occlusion.rect, occlusion.radius))
      return true;
  return false;
}

bool pointPassesViewClips(const HostedView& view, float sceneX, float sceneY) {
  for (const auto& mutator : view.mutators) {
    if (mutator.kind == raym3::v2::ExternalViewMutatorKind::ClipRect) {
      if (!pointInRect(sceneX, sceneY, mutator.rect)) return false;
    } else if (mutator.kind ==
               raym3::v2::ExternalViewMutatorKind::ClipRoundedRect) {
      if (!pointInRoundedRect(sceneX, sceneY, mutator.rect, mutator.radius))
        return false;
    }
  }
  return true;
}

int offscreenViewAt(float sceneX, float sceneY) {
  const float scale = dpiScale();
  for (auto order = g_offscreenOrder.rbegin(); order != g_offscreenOrder.rend();
       ++order) {
    auto it = g_views.find(*order);
    if (it == g_views.end()) continue;
    const HostedView& view = it->second;
    if (!view.offscreen || !view.composited ||
        !pointInRect(sceneX, sceneY, view.boundsDp) ||
        !pointPassesViewClips(view, sceneX, sceneY))
      continue;
    const float localPxX = (sceneX - view.boundsDp.x) * scale;
    const float localPxY = (sceneY - view.boundsDp.y) * scale;
    if (!frameworkOwnsPoint(view, localPxX, localPxY)) return *order;
  }
  return 0;
}

void blurOffscreenView(int nodeId) {
  auto it = g_views.find(nodeId);
  if (it != g_views.end() && it->second.factory &&
      it->second.factory->notify_key) {
    it->second.factory->notify_key(it->second.instance, 3, 0, 0, 0);
  }
}

bool routeOffscreenPointer(UINT msg, WPARAM wp, LPARAM lp) {
  switch (msg) {
    case WM_MOUSEMOVE:
    case WM_LBUTTONDOWN: case WM_LBUTTONUP:
    case WM_RBUTTONDOWN: case WM_RBUTTONUP:
    case WM_MBUTTONDOWN: case WM_MBUTTONUP:
    case WM_MOUSEWHEEL:
      break;
    default:
      return false;
  }

  POINT point{};
  if (msg == WM_MOUSEWHEEL) {
    point = {(short)LOWORD(lp), (short)HIWORD(lp)};
    ScreenToClient(g_window, &point);
  } else {
    point = {(short)LOWORD(lp), (short)HIWORD(lp)};
  }
  const float scale = dpiScale();
  const float sceneX = point.x / scale;
  const float sceneY = point.y / scale;
  const bool downMessage = msg == WM_LBUTTONDOWN || msg == WM_RBUTTONDOWN ||
                           msg == WM_MBUTTONDOWN;
  const bool upMessage = msg == WM_LBUTTONUP || msg == WM_RBUTTONUP ||
                         msg == WM_MBUTTONUP;
  int nodeId = g_offscreenPointerCapture;
  if (!nodeId) nodeId = offscreenViewAt(sceneX, sceneY);

  if (!nodeId) {
    if (downMessage && g_offscreenKeyboardFocus) {
      blurOffscreenView(g_offscreenKeyboardFocus);
      g_offscreenKeyboardFocus = 0;
    }
    return false;
  }
  auto it = g_views.find(nodeId);
  if (it == g_views.end() || !it->second.factory ||
      !it->second.factory->notify_pointer)
    return false;
  HostedView& view = it->second;
  const float localX = (sceneX - view.boundsDp.x) * scale;
  const float localY = (sceneY - view.boundsDp.y) * scale;
  int kind = downMessage ? 1 : (upMessage ? 2 : 0);
  int buttons = 0;
  const WPARAM keyState = msg == WM_MOUSEWHEEL ? LOWORD(wp) : wp;
  if (keyState & MK_LBUTTON) buttons |= 1;
  if (keyState & MK_RBUTTON) buttons |= 2;
  if (keyState & MK_MBUTTON) buttons |= 4;
  if (msg == WM_LBUTTONDOWN || msg == WM_LBUTTONUP) buttons |= 1;
  if (msg == WM_RBUTTONDOWN || msg == WM_RBUTTONUP) buttons |= 2;
  if (msg == WM_MBUTTONDOWN || msg == WM_MBUTTONUP) buttons |= 4;
  const float wheel = msg == WM_MOUSEWHEEL
      ? (float)(short)HIWORD(wp) / WHEEL_DELTA : 0.0f;

  if (downMessage) {
    if (g_offscreenKeyboardFocus && g_offscreenKeyboardFocus != nodeId)
      blurOffscreenView(g_offscreenKeyboardFocus);
    g_offscreenKeyboardFocus = nodeId;
    g_offscreenPointerCapture = nodeId;
    SetCapture(g_window);
  }
  view.factory->notify_pointer(view.instance, kind, localX, localY, buttons, wheel);
  if (upMessage) {
    g_offscreenPointerCapture = 0;
    ReleaseCapture();
  }
  return true;
}

bool routeOffscreenKey(UINT msg, WPARAM wp, LPARAM) {
  if (msg != WM_KEYDOWN && msg != WM_SYSKEYDOWN && msg != WM_KEYUP &&
      msg != WM_SYSKEYUP && msg != WM_CHAR && msg != WM_SYSCHAR)
    return false;
  auto it = g_views.find(g_offscreenKeyboardFocus);
  if (it == g_views.end() || !it->second.offscreen || !it->second.factory ||
      !it->second.factory->notify_key)
    return false;
  int kind = (msg == WM_KEYUP || msg == WM_SYSKEYUP) ? 1
      : ((msg == WM_CHAR || msg == WM_SYSCHAR) ? 2 : 0);
  int modifiers = 0;
  if (GetKeyState(VK_SHIFT) & 0x8000) modifiers |= 1;
  if (GetKeyState(VK_CONTROL) & 0x8000) modifiers |= 2;
  if (GetKeyState(VK_MENU) & 0x8000) modifiers |= 4;
  it->second.factory->notify_key(
      it->second.instance, kind, (int32_t)wp, modifiers,
      kind == 2 ? (uint32_t)wp : 0u);
  return true;
}

std::wstring widen(const std::string& utf8) {
  if (utf8.empty()) return {};
  const int count = MultiByteToWideChar(CP_UTF8, 0, utf8.data(),
                                        (int)utf8.size(), nullptr, 0);
  if (count <= 0) return {};
  std::wstring result((size_t)count, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, utf8.data(), (int)utf8.size(),
                      result.data(), count);
  return result;
}

std::string narrow(const wchar_t* wide, int count = -1) {
  if (!wide || (count == 0) || (count < 0 && !*wide)) return {};
  const int bytes = WideCharToMultiByte(CP_UTF8, 0, wide, count, nullptr, 0,
                                        nullptr, nullptr);
  if (bytes <= 0) return {};
  std::string result((size_t)bytes, '\0');
  WideCharToMultiByte(CP_UTF8, 0, wide, count, result.data(), bytes,
                      nullptr, nullptr);
  if (count < 0 && !result.empty() && result.back() == '\0') result.pop_back();
  return result;
}

std::string editorText(HWND editor) {
  const int length = GetWindowTextLengthW(editor);
  std::wstring wide((size_t)length + 1, L'\0');
  GetWindowTextW(editor, wide.data(), length + 1);
  return narrow(wide.c_str());
}

std::string jsonEscape(const std::string& value) {
  std::string result;
  result.reserve(value.size() + 8);
  for (const unsigned char c : value) {
    switch (c) {
      case '"': result += "\\\""; break;
      case '\\': result += "\\\\"; break;
      case '\n': result += "\\n"; break;
      case '\r': result += "\\r"; break;
      case '\t': result += "\\t"; break;
      default:
        if (c < 0x20) {
          char escaped[8];
          snprintf(escaped, sizeof(escaped), "\\u%04x", c);
          result += escaped;
        } else {
          result += (char)c;
        }
    }
  }
  return result;
}

void emitEditorEvent(int nodeId, const std::string& type,
                     const std::string& extra = {}) {
  std::string json = "{\"type\":\"" + type + "\"";
  if (!extra.empty()) json += "," + extra;
  json += "}";
  rayactExternalViewEmitText(nodeId, json.c_str());
}

void emitEditorTextEvent(int nodeId, const char* type, HWND editor) {
  emitEditorEvent(nodeId, type,
                  "\"text\":\"" + jsonEscape(editorText(editor)) + "\"");
}

void emitEditorSelection(int nodeId, HWND editor) {
  DWORD start = 0, end = 0;
  SendMessageW(editor, EM_GETSEL, reinterpret_cast<WPARAM>(&start),
               reinterpret_cast<LPARAM>(&end));
  emitEditorEvent(nodeId, "selection",
                  "\"text\":\"" + jsonEscape(editorText(editor)) +
                      "\",\"selectionStart\":" + std::to_string(start) +
                      ",\"selectionEnd\":" + std::to_string(end));
}

// The bridge's property objects are flat. These scanners deliberately accept
// patches (missing means unchanged) and JSON null (present, reset to default).
const char* jsonValue(const std::string& json, const char* key, bool* present) {
  const std::string needle = std::string("\"") + key + "\"";
  const size_t keyPos = json.find(needle);
  if (keyPos == std::string::npos) { *present = false; return nullptr; }
  const size_t colon = json.find(':', keyPos + needle.size());
  if (colon == std::string::npos) { *present = false; return nullptr; }
  const size_t value = json.find_first_not_of(" \t\r\n", colon + 1);
  if (value == std::string::npos) { *present = false; return nullptr; }
  *present = true;
  return json.c_str() + value;
}

bool jsonString(const std::string& json, const char* key, std::string* out,
                bool* present) {
  const char* value = jsonValue(json, key, present);
  if (!*present || !value) return false;
  if (strncmp(value, "null", 4) == 0) { out->clear(); return true; }
  if (*value != '"') { out->clear(); return false; }
  std::string decoded;
  for (++value; *value; ++value) {
    if (*value == '"') break;
    if (*value != '\\') { decoded += *value; continue; }
    const char escaped = *++value;
    if (!escaped) break;
    switch (escaped) {
      case 'n': decoded += '\n'; break;
      case 'r': decoded += '\r'; break;
      case 't': decoded += '\t'; break;
      case 'b': decoded += '\b'; break;
      case 'f': decoded += '\f'; break;
      case 'u': {
        char digits[5] = {};
        for (int i = 0; i < 4 && value[1]; ++i) digits[i] = *++value;
        const unsigned code = (unsigned)strtoul(digits, nullptr, 16);
        if (code < 0x80) decoded += (char)code;
        else if (code < 0x800) {
          decoded += (char)(0xC0 | (code >> 6));
          decoded += (char)(0x80 | (code & 0x3f));
        } else {
          decoded += (char)(0xE0 | (code >> 12));
          decoded += (char)(0x80 | ((code >> 6) & 0x3f));
          decoded += (char)(0x80 | (code & 0x3f));
        }
        break;
      }
      default: decoded += escaped; break;
    }
  }
  *out = decoded;
  return true;
}

bool jsonBool(const std::string& json, const char* key, bool* out,
              bool* present) {
  const char* value = jsonValue(json, key, present);
  if (!*present || !value) return false;
  if (strncmp(value, "true", 4) == 0) *out = true;
  else if (strncmp(value, "false", 5) == 0 || strncmp(value, "null", 4) == 0)
    *out = false;
  else return false;
  return true;
}

bool jsonNumber(const std::string& json, const char* key, double* out,
                bool* present) {
  const char* value = jsonValue(json, key, present);
  if (!*present || !value) return false;
  if (strncmp(value, "null", 4) == 0) { *out = 0; return true; }
  char* end = nullptr;
  *out = strtod(value, &end);
  return end != value;
}

void applyNativeTextProps(HostedView& view, const std::string& props) {
  if (!view.editor) return;
  bool present = false;
  std::string stringValue;
  bool boolValue = false;
  double numberValue = 0;

  if (jsonString(props, "value", &stringValue, &present) && present) {
    const std::wstring value = widen(stringValue);
    if (editorText(view.editor) != stringValue) {
      view.applyingProps = true;
      SetWindowTextW(view.editor, value.c_str());
      view.applyingProps = false;
    }
  }
  if (jsonString(props, "placeholder", &stringValue, &present) && present) {
    const std::wstring placeholder = widen(stringValue);
    SendMessageW(view.editor, EM_SETCUEBANNER, TRUE,
                 reinterpret_cast<LPARAM>(placeholder.c_str()));
  }
  if (jsonBool(props, "editable", &boolValue, &present) && present)
    SendMessageW(view.editor, EM_SETREADONLY, !boolValue, 0);
  if (jsonBool(props, "multiline", &boolValue, &present) && present) {
    if (view.multiline != boolValue) {
      view.multiline = boolValue;
      view.editorRectValid = false;
    }
  }
  if (jsonBool(props, "blurOnSubmit", &boolValue, &present) && present)
    view.blurOnSubmit = boolValue;
  if (jsonBool(props, "caretHidden", &boolValue, &present) && present) {
    view.caretHidden = boolValue;
    if (GetFocus() == view.editor) {
      if (boolValue) HideCaret(view.editor); else ShowCaret(view.editor);
    }
  }
  if (jsonBool(props, "secure", &boolValue, &present) && present) {
    SendMessageW(view.editor, EM_SETPASSWORDCHAR, boolValue ? 0x2022 : 0, 0);
    InvalidateRect(view.editor, nullptr, TRUE);
  }
  if (jsonNumber(props, "maxLength", &numberValue, &present) && present)
    SendMessageW(view.editor, EM_SETLIMITTEXT,
                 numberValue > 0 ? (WPARAM)numberValue : 0, 0);

  bool relayout = false;
  if (jsonNumber(props, "fontSize", &numberValue, &present) && present &&
      numberValue > 0 && std::fabs(view.fontSize - (float)numberValue) > 0.01f) {
    view.fontSize = (float)numberValue;
    if (view.editorFont) DeleteObject(view.editorFont);
    const int height = -(int)std::lround(view.fontSize * dpiScale());
    view.editorFont = CreateFontW(height, 0, 0, 0, FW_NORMAL, FALSE, FALSE,
                                  FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                                  CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
                                  DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
    SendMessageW(view.editor, WM_SETFONT,
                 reinterpret_cast<WPARAM>(view.editorFont), TRUE);
    relayout = true;
  }
  auto readInset = [&](const char* key, float& target) {
    if (jsonNumber(props, key, &numberValue, &present) && present) {
      const float next = (float)numberValue;
      if (std::fabs(target - next) > 0.01f) { target = next; relayout = true; }
    }
  };
  readInset("contentHorizontal", view.contentHorizontal);
  readInset("contentTop", view.contentTop);
  readInset("contentBottom", view.contentBottom);
  if (relayout) view.editorRectValid = false;

  if (jsonNumber(props, "textColor", &numberValue, &present) && present) {
    const uint32_t rgba = (uint32_t)numberValue;
    view.textColor = RGB((rgba >> 24) & 0xff, (rgba >> 16) & 0xff,
                         (rgba >> 8) & 0xff);
    InvalidateRect(view.editor, nullptr, TRUE);
  }

  bool selectionStartPresent = false, selectionEndPresent = false;
  double selectionStart = 0, selectionEnd = 0;
  jsonNumber(props, "selectionStart", &selectionStart, &selectionStartPresent);
  jsonNumber(props, "selectionEnd", &selectionEnd, &selectionEndPresent);
  if (selectionStartPresent) {
    SendMessageW(view.editor, EM_SETSEL, (WPARAM)selectionStart,
                 (LPARAM)(selectionEndPresent ? selectionEnd : selectionStart));
  }

  if (jsonBool(props, "focused", &boolValue, &present) && present) {
    if (boolValue && GetFocus() != view.editor) SetFocus(view.editor);
    else if (!boolValue && GetFocus() == view.editor) SetFocus(g_window);
  }
  positionOverlay(view);
}

LRESULT CALLBACK editorWndProc(HWND wnd, UINT msg, WPARAM wp, LPARAM lp) {
  auto nodeIt = g_editorToNode.find(wnd);
  if (nodeIt == g_editorToNode.end()) return DefWindowProcW(wnd, msg, wp, lp);
  auto viewIt = g_views.find(nodeIt->second);
  if (viewIt == g_views.end()) return DefWindowProcW(wnd, msg, wp, lp);
  HostedView& view = viewIt->second;

  if (msg == WM_CHAR) {
    if (wp == VK_RETURN && !view.multiline) {
      emitEditorTextEvent(nodeIt->second, "submit", wnd);
      if (view.blurOnSubmit) SetFocus(g_window);
      return 0;
    }
    std::string key;
    if (wp == VK_BACK) key = "Backspace";
    else if (wp == VK_RETURN) key = "Enter";
    else if (wp >= 0x20) {
      wchar_t character[2]{(wchar_t)wp, 0};
      key = narrow(character);
    }
    if (!key.empty())
      emitEditorEvent(nodeIt->second, "key",
                      "\"key\":\"" + jsonEscape(key) + "\"");
  }

  const WNDPROC previous = view.previousEditorWndProc;
  const LRESULT result = CallWindowProcW(previous, wnd, msg, wp, lp);
  if (msg == WM_KEYUP || msg == WM_LBUTTONUP) emitEditorSelection(nodeIt->second, wnd);
  if (msg == WM_SETFOCUS && view.caretHidden) HideCaret(wnd);
  return result;
}

// Mouse input for visual-hosted per-view overlays. A composition visual owns no
// window, so the overlay catches OS messages and forwards them through the
// factory's notify_pointer hook. MA_NOACTIVATE keeps focus on the engine window.
LRESULT CALLBACK overlayWndProc(HWND wnd, UINT msg, WPARAM wp, LPARAM lp) {
  switch (msg) {
    case WM_ERASEBKGND: {
      auto nodeIt = g_overlayToNode.find(wnd);
      if (nodeIt == g_overlayToNode.end()) break;
      auto viewIt = g_views.find(nodeIt->second);
      if (viewIt == g_views.end() || !viewIt->second.nativeTextInput) break;
      RECT bounds{};
      GetClientRect(wnd, &bounds);
      FillRect(reinterpret_cast<HDC>(wp), &bounds, g_transparentKeyBrush);
      return 1;
    }
    case WM_CTLCOLOREDIT: {
      const HWND editor = reinterpret_cast<HWND>(lp);
      auto nodeIt = g_editorToNode.find(editor);
      if (nodeIt == g_editorToNode.end()) break;
      auto viewIt = g_views.find(nodeIt->second);
      if (viewIt == g_views.end()) break;
      HDC dc = reinterpret_cast<HDC>(wp);
      SetTextColor(dc, viewIt->second.textColor);
      SetBkColor(dc, kTransparentKey);
      SetBkMode(dc, OPAQUE);
      return reinterpret_cast<LRESULT>(g_transparentKeyBrush);
    }
    case WM_COMMAND: {
      const HWND editor = reinterpret_cast<HWND>(lp);
      auto nodeIt = g_editorToNode.find(editor);
      if (nodeIt == g_editorToNode.end()) break;
      auto viewIt = g_views.find(nodeIt->second);
      if (viewIt == g_views.end()) break;
      switch (HIWORD(wp)) {
        case EN_CHANGE:
          if (!viewIt->second.applyingProps) {
            emitEditorTextEvent(nodeIt->second, "change", editor);
            emitEditorSelection(nodeIt->second, editor);
          }
          return 0;
        case EN_SETFOCUS:
          emitEditorEvent(nodeIt->second, "focus");
          if (viewIt->second.caretHidden) HideCaret(editor);
          return 0;
        case EN_KILLFOCUS:
          emitEditorEvent(nodeIt->second, "blur");
          return 0;
      }
      break;
    }
    case WM_NCHITTEST: {
      auto nodeIt = g_overlayToNode.find(wnd);
      if (nodeIt == g_overlayToNode.end()) break;
      auto it = g_views.find(nodeIt->second);
      if (it == g_views.end()) break;

      // Keep the owned popup as the OS target. HTTRANSPARENT on an owned popup
      // falls through to unrelated desktop windows on some Windows builds; the
      // mouse branch below explicitly forwards framework-owned regions to the
      // Vulkan owner instead.
      return HTCLIENT;
    }
    case WM_MOUSEACTIVATE: {
      auto nodeIt = g_overlayToNode.find(wnd);
      if (nodeIt != g_overlayToNode.end()) {
        auto viewIt = g_views.find(nodeIt->second);
        if (viewIt != g_views.end() && viewIt->second.nativeTextInput)
          return MA_ACTIVATE;
      }
      return MA_NOACTIVATE;
    }
    case WM_MOUSEMOVE:
    case WM_LBUTTONDOWN: case WM_LBUTTONUP:
    case WM_RBUTTONDOWN: case WM_RBUTTONUP:
    case WM_MOUSEWHEEL: {
      auto nodeIt = g_overlayToNode.find(wnd);
      if (nodeIt == g_overlayToNode.end()) break;
      auto it = g_views.find(nodeIt->second);
      if (it == g_views.end()) break;
      HostedView& view = it->second;
      if (view.nativeTextInput) {
        if (msg == WM_LBUTTONDOWN && view.editor) SetFocus(view.editor);
        return 0;
      }
      if (!view.factory) break;
      if (view.factory->struct_size < sizeof(RayactViewFactory) ||
          !view.factory->notify_pointer)
        break;
      float x = (float)(short)LOWORD(lp);
      float y = (float)(short)HIWORD(lp);
      int kind = 0;
      int buttons = ((wp & MK_LBUTTON) ? 1 : 0) |
                    ((wp & MK_RBUTTON) ? 2 : 0) |
                    ((wp & MK_MBUTTON) ? 4 : 0);
      float wheel = 0.0f;
      switch (msg) {
        case WM_LBUTTONDOWN: kind = 1; buttons |= 1; SetCapture(wnd); break;
        case WM_LBUTTONUP:   kind = 2; buttons = 1; ReleaseCapture(); break;
        case WM_RBUTTONDOWN: kind = 1; buttons |= 2; break;
        case WM_RBUTTONUP:   kind = 2; buttons = 2; break;
        case WM_MOUSEWHEEL: {
          POINT pt{(short)LOWORD(lp), (short)HIWORD(lp)};  // wheel is screen-relative
          ScreenToClient(wnd, &pt);
          x = (float)pt.x;
          y = (float)pt.y;
          wheel = (float)(short)HIWORD(wp) / WHEEL_DELTA;
          break;
        }
      }
      if (frameworkOwnsPoint(view, x, y)) {
        LPARAM targetLp = lp;
        if (msg != WM_MOUSEWHEEL) {
          POINT targetPoint{(LONG)x, (LONG)y};
          ClientToScreen(wnd, &targetPoint);
          ScreenToClient(g_window, &targetPoint);
          targetLp = MAKELPARAM((short)targetPoint.x, (short)targetPoint.y);
        }
        if (msg != WM_MOUSEMOVE)
          printf("[platform-views] framework pointer node=%d msg=%u %.0f,%.0f\n",
                 nodeIt->second, msg, x, y);
        SendMessageW(g_window, msg, wp, targetLp);
        return 0;
      }
      if (msg != WM_MOUSEMOVE)
        printf("[platform-views] pointer node=%d kind=%d %.0f,%.0f buttons=%d\n",
               nodeIt->second, kind, x, y, buttons);
      view.factory->notify_pointer(view.instance, kind, x, y, buttons, wheel);
      return 0;
    }
  }
  return DefWindowProcW(wnd, msg, wp, lp);
}

// A visual-hosted module allocates its visual from our device and returns it via
// out_native_view; the host parents it here and owns its placement from then on.
void onCreate(int /*surfaceId*/, int nodeId, const char* kind, const char* propsJson) {
  if (!kind) return;
  const std::string kindString = kind;
  const RayactViewFactory* factory = moduleViewsFindFactory(kind);
  const std::string props = propsJson ? propsJson : "{}";

  if (!factory && kindString == "rayact.internal.text-input") {
    HostedView view;
    view.nativeTextInput = true;
    view.overlay = CreateWindowExW(
        WS_EX_LAYERED | WS_EX_TOOLWINDOW,
        kOverlayClass, L"", WS_POPUP,
        0, 0, 1, 1, g_window, nullptr, GetModuleHandleW(nullptr), nullptr);
    if (!view.overlay) {
      printf("[platform-views] native text host failed (%lu)\n",
             (unsigned long)GetLastError());
      return;
    }
    SetLayeredWindowAttributes(view.overlay, kTransparentKey, 255,
                               LWA_COLORKEY | LWA_ALPHA);
    view.editor = CreateWindowExW(
        0, L"EDIT", L"",
        WS_CHILD | WS_VISIBLE | WS_TABSTOP | ES_LEFT | ES_MULTILINE |
            ES_AUTOVSCROLL | ES_AUTOHSCROLL | ES_WANTRETURN | ES_NOHIDESEL,
        0, 0, 1, 1, view.overlay, nullptr, GetModuleHandleW(nullptr), nullptr);
    if (!view.editor) {
      printf("[platform-views] native EDIT failed (%lu)\n",
             (unsigned long)GetLastError());
      DestroyWindow(view.overlay);
      return;
    }
    SendMessageW(view.editor, EM_SETMARGINS, EC_LEFTMARGIN | EC_RIGHTMARGIN,
                 MAKELPARAM(0, 0));
    g_views[nodeId] = view;
    HostedView& stored = g_views[nodeId];
    g_overlayToNode[stored.overlay] = nodeId;
    g_editorToNode[stored.editor] = nodeId;
    stored.previousEditorWndProc = reinterpret_cast<WNDPROC>(SetWindowLongPtrW(
        stored.editor, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(editorWndProc)));
    if (!stored.previousEditorWndProc) {
      printf("[platform-views] native EDIT subclass failed (%lu)\n",
             (unsigned long)GetLastError());
    }
    applyNativeTextProps(stored, props);
    printf("[platform-views] create native text editor node=%d\n", nodeId);
    return;
  }

  if (!factory || !factory->create) return;

  void* nativeView = nullptr;
  void* instance = factory->create(factory->self, nodeId, props.c_str(), props.size(),
                                   &nativeView);
  if (!instance) {
    printf("[platform-views] module '%s' failed to create a view for node %d\n", kind, nodeId);
    return;
  }

  HostedView view;
  view.instance = instance;
  view.factory = factory;
  // Visual hosting: this is an IDCompositionVisual allocated from our device.
  view.visual = reinterpret_cast<IDCompositionVisual*>(nativeView);
  view.offscreen = !nativeView && factoryHasFrameCopy(factory);
  printf("[platform-views] create node=%d kind=%s visual=%p offscreen=%d\n",
         nodeId, kind, (void*)view.visual, view.offscreen ? 1 : 0);

  // One owned composition window per view, sized to that view only. It cannot
  // target the engine's own HWND (rlvk presents its Vulkan swapchain there and
  // DWM will not show a competing composition target). This is deliberately an
  // owned popup rather than a child HWND: a child composition target resolves
  // transparent pixels against its own window background. A no-redirection
  // owned window preserves the visual's alpha and still follows its owner.
  if (view.visual && g_window) {
    view.overlay = CreateWindowExW(
        WS_EX_NOREDIRECTIONBITMAP | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
        kOverlayClass, L"", WS_POPUP,
        0, 0, 1, 1, g_window, nullptr, GetModuleHandleW(nullptr), nullptr);
    if (!view.overlay) {
      printf("[platform-views] overlay window failed (%lu)\n", (unsigned long)GetLastError());
    } else if (FAILED(g_device->CreateTargetForHwnd(view.overlay, TRUE, &view.target)) ||
               !view.target) {
      printf("[platform-views] composition target failed for node %d\n", nodeId);
    } else {
      view.target->SetRoot(view.visual);
      commit();
    }
    if (view.overlay) g_overlayToNode[view.overlay] = nodeId;
  }
  g_views[nodeId] = view;
}

void onRect(int /*surfaceId*/, int nodeId, const char* /*kind*/,
            float x, float y, float w, float h) {
  auto it = g_views.find(nodeId);
  if (it == g_views.end()) return;
  HostedView& view = it->second;
  view.boundsDp = {x, y, w, h};

  // The engine reports rects in logical units; native view bounds and off-screen
  // frame dimensions are physical pixels.
  const float scale = dpiScale();
  const float pw = w * scale, ph = h * scale;
  if (view.overlay) positionOverlay(view);
  if (view.visual) {
    // The overlay is already at the node's position, so the visual sits at its
    // origin; the clip keeps content inside the node box.
    view.visual->SetOffsetX(0.0f);
    view.visual->SetOffsetY(0.0f);
    D2D_RECT_F clip{0.0f, 0.0f, pw, ph};
    view.visual->SetClip(clip);
    commit();
    static int logged = 0;
    if (logged < 3) { ++logged;
      printf("[platform-views] rect node=%d dp %.0f,%.0f %.0fx%.0f -> px %.0fx%.0f\n",
             nodeId, x, y, w, h, pw, ph); }
  }
  if (pw != view.width || ph != view.height) {
    view.width = pw;
    view.height = ph;
    if (view.factory && view.factory->notify_layout)
      view.factory->notify_layout(view.instance, pw, ph);
  }
}

bool updateOffscreenFrame(int nodeId, HostedView& view) {
  if (!view.offscreen || !factoryHasFrameCopy(view.factory)) return false;
  const uint64_t previousGeneration = view.frameGeneration;
  uint64_t generation = previousGeneration;
  int32_t width = 0, height = 0, stride = 0;
  size_t capacity = view.framePixels.size();
  if (capacity == 0 && view.width > 0 && view.height > 0) {
    capacity = (size_t)std::max(1, (int)std::lround(view.width)) *
               (size_t)std::max(1, (int)std::lround(view.height)) * 4u;
    view.framePixels.resize(capacity);
  }
  int copied = view.factory->copy_frame_bgra8(
      view.instance, view.framePixels.empty() ? nullptr : view.framePixels.data(),
      view.framePixels.size(), &width, &height, &stride, &generation);
  if (copied <= 0) return false;
  if ((size_t)copied > view.framePixels.size()) {
    view.framePixels.resize((size_t)copied);
    generation = previousGeneration;
    copied = view.factory->copy_frame_bgra8(
        view.instance, view.framePixels.data(), view.framePixels.size(),
        &width, &height, &stride, &generation);
  }
  if (copied <= 0 || width <= 0 || height <= 0 || stride < width * 4 ||
      (size_t)copied < (size_t)stride * (size_t)height)
    return false;

  view.rgbaPixels.resize((size_t)width * (size_t)height * 4u);
  for (int32_t y = 0; y < height; ++y) {
    const unsigned char* src =
        view.framePixels.data() + (size_t)y * (size_t)stride;
    unsigned char* dst =
        view.rgbaPixels.data() + (size_t)y * (size_t)width * 4u;
    for (int32_t x = 0; x < width; ++x) {
      const unsigned a = src[x * 4 + 3];
      unsigned r = src[x * 4 + 2];
      unsigned g = src[x * 4 + 1];
      unsigned b = src[x * 4 + 0];
      // CEF supplies premultiplied BGRA while raylib's standard blend expects
      // straight RGBA. Unpremultiply to keep translucent glyph/rounded edges
      // from acquiring dark fringes.
      if (a > 0 && a < 255) {
        r = std::min(255u, (r * 255u + a / 2u) / a);
        g = std::min(255u, (g * 255u + a / 2u) / a);
        b = std::min(255u, (b * 255u + a / 2u) / a);
      }
      dst[x * 4 + 0] = (unsigned char)r;
      dst[x * 4 + 1] = (unsigned char)g;
      dst[x * 4 + 2] = (unsigned char)b;
      dst[x * 4 + 3] = (unsigned char)a;
    }
  }

  if (view.texture.id == 0 || view.texture.width != width ||
      view.texture.height != height) {
    if (view.texture.id != 0) UnloadTexture(view.texture);
    Image image{};
    image.data = view.rgbaPixels.data();
    image.width = width;
    image.height = height;
    image.mipmaps = 1;
    image.format = PIXELFORMAT_UNCOMPRESSED_R8G8B8A8;
    view.texture = LoadTextureFromImage(image);
    SetTextureFilter(view.texture, TEXTURE_FILTER_BILINEAR);
    rayactSetExternalViewTexture(nodeId, view.texture);
  } else {
    UpdateTexture(view.texture, view.rgbaPixels.data());
  }
  view.frameGeneration = generation;
  return true;
}

// Visual-hosted modules still use an owned DComp window. ABI-5 off-screen views
// instead update the node's normal Vulkan texture here and return false so
// raym3 executes its custom texture painter at the exact scene position.
class WindowsExternalViewEmbedder final : public raym3::v2::ExternalViewEmbedder {
 public:
  void BeginFrame(uint64_t, Rectangle, float) override {
    for (auto& [_, view] : g_views) view.composited = false;
    ordered_.clear();
    g_offscreenOrder.clear();
  }

  bool CompositeExternalView(
      const raym3::v2::ExternalViewComposition& composition) override {
    auto it = g_views.find(composition.externalViewId);
    if (it == g_views.end()) return false;
    it->second.composited = true;
    it->second.occludingRegions = composition.occludingRegions;
    it->second.mutators = composition.mutators;
    const Rectangle& bounds = composition.bounds;
    onRect(0, composition.externalViewId, nullptr,
           bounds.x, bounds.y, bounds.width, bounds.height);
    if (it->second.offscreen) {
      updateOffscreenFrame(composition.externalViewId, it->second);
      g_offscreenOrder.push_back(composition.externalViewId);
      return false;
    }
    applyCompositionRegion(it->second, composition);
    if (it->second.overlay) ordered_.push_back(it->second.overlay);
    return true;
  }

  bool RequiresClipReplay() const override { return false; }
  void EndFrame(uint64_t) override {
    for (auto& [_, view] : g_views) {
      if (!view.composited && view.overlay) {
        ShowWindow(view.overlay, SW_HIDE);
        view.overlayShown = false;
      }
    }
    if (ordered_ != lastOrdered_) {
      // Raising in paint order leaves the last-painted platform view on top.
      for (HWND window : ordered_)
        SetWindowPos(window, HWND_TOP, 0, 0, 0, 0,
                     SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
      lastOrdered_ = ordered_;
    }
  }

 private:
  std::vector<HWND> ordered_;
  std::vector<HWND> lastOrdered_;
};

WindowsExternalViewEmbedder g_embedder;

void onInput(int /*surfaceId*/, int nodeId, int action, float localX, float localY) {
  auto it = g_views.find(nodeId);
  if (it == g_views.end()) return;
  HostedView& view = it->second;
  if (!view.factory) return;
  // Only ABI-4 factories accept forwarded input; older ones own a window and get
  // input from the OS directly.
  if (view.factory->struct_size < sizeof(RayactViewFactory) || !view.factory->notify_pointer)
    return;
  // Bridge actions are 0=down, 1=up, 2=move; ABI kinds are 0=move, 1=down,
  // 2=up. Keep the two protocols explicit instead of relying on their values.
  const int kind = action == 0 ? 1 : (action == 1 ? 2 : 0);
  const int buttons = kind == 1 ? 1 : 0;
  view.factory->notify_pointer(view.instance, kind, localX, localY, buttons, 0.0f);
}

void onProps(int /*surfaceId*/, int nodeId, const char* propsJson) {
  auto it = g_views.find(nodeId);
  if (it == g_views.end()) return;
  const std::string props = propsJson ? propsJson : "{}";
  if (it->second.nativeTextInput) {
    applyNativeTextProps(it->second, props);
  } else if (it->second.factory && it->second.factory->set_properties) {
    it->second.factory->set_properties(it->second.instance, props.c_str(), props.size());
  }
}

void onDispose(int /*surfaceId*/, int nodeId) {
  auto it = g_views.find(nodeId);
  if (it == g_views.end()) return;
  HostedView& view = it->second;
  if (g_offscreenPointerCapture == nodeId) {
    g_offscreenPointerCapture = 0;
    ReleaseCapture();
  }
  if (g_offscreenKeyboardFocus == nodeId) g_offscreenKeyboardFocus = 0;
  if (view.editor) {
    g_editorToNode.erase(view.editor);
    if (view.previousEditorWndProc) {
      SetWindowLongPtrW(view.editor, GWLP_WNDPROC,
                        reinterpret_cast<LONG_PTR>(view.previousEditorWndProc));
    }
    DestroyWindow(view.editor);
  }
  if (view.editorFont) DeleteObject(view.editorFont);
  if (view.texture.id != 0 && IsWindowReady()) UnloadTexture(view.texture);
  if (view.target) { view.target->SetRoot(nullptr); view.target->Release(); }
  if (view.overlay) { g_overlayToNode.erase(view.overlay); DestroyWindow(view.overlay); }
  commit();
  if (view.factory && view.factory->dispose) view.factory->dispose(view.instance);
  g_views.erase(it);
}

} // namespace

void winInstallPlatformViews() {
  if (g_installed) return;

  GLFWwindow* window = glfwGetCurrentContext();
  HWND hwnd = window ? glfwGetWin32Window(window) : GetActiveWindow();
  if (!hwnd) {
    printf("[platform-views] no window yet; platform views stay unavailable\n");
    return;
  }

  // DirectComposition needs no D3D device of its own for a visual-only tree —
  // passing null lets it pick the default device.
  HRESULT hr = DCompositionCreateDevice(nullptr, __uuidof(IDCompositionDevice),
                                        reinterpret_cast<void**>(&g_device));
  if (FAILED(hr) || !g_device) {
    printf("[platform-views] DirectComposition unavailable (0x%08lx); "
           "module platform views will report an error\n", (unsigned long)hr);
    return;
  }
  // The composition tree gets its OWN overlay window rather than targeting the
  // engine's HWND. rlvk presents its Vulkan swapchain directly to that HWND, and
  // a composition target on the same window is not a combination DWM will show —
  // every call succeeds and the visuals stay invisible. WS_EX_NOREDIRECTIONBITMAP
  // keeps the owned popup's pixels in the DComp tree so transparent WebView
  // output reveals the Vulkan owner below.
  WNDCLASSEXW cls{};
  cls.cbSize = sizeof(cls);
  cls.lpfnWndProc = overlayWndProc;
  cls.hInstance = GetModuleHandleW(nullptr);
  cls.lpszClassName = kOverlayClass;
  cls.hCursor = LoadCursorW(nullptr, MAKEINTRESOURCEW(32512));
  g_transparentKeyBrush = CreateSolidBrush(kTransparentKey);
  cls.hbrBackground = g_transparentKeyBrush;
  if (!RegisterClassExW(&cls) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
    printf("[platform-views] RegisterClassEx failed (%lu)\n", (unsigned long)GetLastError());
    return;
  }
  g_window = hwnd;
  g_previousOwnerWndProc = reinterpret_cast<WNDPROC>(SetWindowLongPtrW(
      g_window, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(ownerWndProc)));
  if (!g_previousOwnerWndProc) {
    printf("[platform-views] owner subclass failed (%lu)\n",
           (unsigned long)GetLastError());
    return;
  }

  // Publish the handles ABI-4 modules ask for. Must happen before any create.
  busSetNativeWindow(hwnd);
  busSetCompositor(g_device);

  rayactSetExternalViewHostCallbacks(onCreate, onRect, onInput, onProps, onDispose);
  // Views committed during startup were created before this host existed.
  rayactReplayExternalViewCreates();
  engineSetExternalViewEmbedder(&g_embedder);
  g_installed = true;
  printf("[platform-views] DirectComposition host installed\n");
}

} // namespace rayact

#endif // _WIN32
