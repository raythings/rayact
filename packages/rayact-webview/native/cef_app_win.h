#pragma once

#include "include/cef_app.h"
#include "include/cef_render_process_handler.h"

#include <map>
#include <string>

// Shared by the browser process and rayact_cef_subprocess.exe. The renderer
// installs the page bridge and document-start script synchronously from
// OnContextCreated, before author scripts or DOMContentLoaded can run.
class RayactCefApp final : public CefApp, public CefRenderProcessHandler {
 public:
  RayactCefApp() = default;
  CefRefPtr<CefRenderProcessHandler> GetRenderProcessHandler() override {
    return this;
  }

  void OnBrowserCreated(CefRefPtr<CefBrowser> browser,
                        CefRefPtr<CefDictionaryValue> extraInfo) override;
  void OnBrowserDestroyed(CefRefPtr<CefBrowser> browser) override;
  void OnContextCreated(CefRefPtr<CefBrowser> browser,
                        CefRefPtr<CefFrame> frame,
                        CefRefPtr<CefV8Context> context) override;
  bool OnProcessMessageReceived(CefRefPtr<CefBrowser> browser,
                                CefRefPtr<CefFrame> frame,
                                CefProcessId sourceProcess,
                                CefRefPtr<CefProcessMessage> message) override;

 private:
  std::map<int, std::string> beforeScripts_;
  IMPLEMENT_REFCOUNTING(RayactCefApp);
  DISALLOW_COPY_AND_ASSIGN(RayactCefApp);
};

inline constexpr char kRayactBeforeScriptKey[] = "rayact.beforeScript";
inline constexpr char kRayactSetBeforeScriptMessage[] = "Rayact.SetBeforeScript";
inline constexpr char kRayactWebMessage[] = "Rayact.WebMessage";
