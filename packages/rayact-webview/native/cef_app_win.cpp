#include "cef_app_win.h"

#include "include/cef_browser.h"
#include "include/cef_frame.h"
#include "include/cef_process_message.h"
#include "include/cef_v8.h"
#include "include/cef_values.h"


namespace {

class PostMessageHandler final : public CefV8Handler {
 public:
  PostMessageHandler() = default;
  bool Execute(const CefString&, CefRefPtr<CefV8Value>,
               const CefV8ValueList& arguments, CefRefPtr<CefV8Value>& retval,
               CefString&) override {
    std::string value;
    if (!arguments.empty()) {
      if (arguments[0]->IsString()) value = arguments[0]->GetStringValue();
      else if (arguments[0]->IsBool())
        value = arguments[0]->GetBoolValue() ? "true" : "false";
      else if (arguments[0]->IsInt())
        value = std::to_string(arguments[0]->GetIntValue());
      else if (arguments[0]->IsUInt())
        value = std::to_string(arguments[0]->GetUIntValue());
      else if (arguments[0]->IsDouble())
        value = std::to_string(arguments[0]->GetDoubleValue());
    }
    CefRefPtr<CefV8Context> context = CefV8Context::GetCurrentContext();
    if (context && context->GetFrame()) {
      CefRefPtr<CefProcessMessage> message =
          CefProcessMessage::Create(kRayactWebMessage);
      message->GetArgumentList()->SetString(0, value);
      context->GetFrame()->SendProcessMessage(PID_BROWSER, message);
    }
    retval = CefV8Value::CreateUndefined();
    return true;
  }

 private:
  IMPLEMENT_REFCOUNTING(PostMessageHandler);
  DISALLOW_COPY_AND_ASSIGN(PostMessageHandler);
};

}  // namespace

void RayactCefApp::OnBrowserCreated(
    CefRefPtr<CefBrowser> browser,
    CefRefPtr<CefDictionaryValue> extraInfo) {
  if (!browser) return;
  beforeScripts_[browser->GetIdentifier()] =
      extraInfo && extraInfo->HasKey(kRayactBeforeScriptKey)
          ? extraInfo->GetString(kRayactBeforeScriptKey).ToString()
          : std::string();
}

void RayactCefApp::OnBrowserDestroyed(CefRefPtr<CefBrowser> browser) {
  if (browser) beforeScripts_.erase(browser->GetIdentifier());
}

void RayactCefApp::OnContextCreated(
    CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame,
    CefRefPtr<CefV8Context> context) {
  if (!browser || !frame || !frame->IsMain() || !context) return;
  CefRefPtr<CefV8Value> bridge = CefV8Value::CreateObject(nullptr, nullptr);
  bridge->SetValue(
      "postMessage",
      CefV8Value::CreateFunction("postMessage", new PostMessageHandler()),
      V8_PROPERTY_ATTRIBUTE_NONE);
  context->GetGlobal()->SetValue(
      "RayactWebView", bridge, V8_PROPERTY_ATTRIBUTE_NONE);

  const auto script = beforeScripts_.find(browser->GetIdentifier());
  if (script != beforeScripts_.end() && !script->second.empty()) {
    CefRefPtr<CefV8Value> result;
    CefRefPtr<CefV8Exception> exception;
    context->Eval(script->second, frame->GetURL(), 0, result, exception);
  }
}

bool RayactCefApp::OnProcessMessageReceived(
    CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame>, CefProcessId,
    CefRefPtr<CefProcessMessage> message) {
  if (!browser || !message ||
      message->GetName() != kRayactSetBeforeScriptMessage) return false;
  beforeScripts_[browser->GetIdentifier()] =
      message->GetArgumentList()->GetString(0).ToString();
  return true;
}
