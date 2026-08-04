#include "cef_app_win.h"

#include <windows.h>

int APIENTRY wWinMain(HINSTANCE instance, HINSTANCE, wchar_t*, int) {
  CefMainArgs args(instance);
  return CefExecuteProcess(args, new RayactCefApp(), nullptr);
}
