cmake_minimum_required(VERSION 3.20)
# Languages are enabled after project(), not in it: before the first project()
# call the toolchain file has not been read, so APPLE/WIN32 still describe the
# *host* — a Windows cross build would enable Objective-C++ and fail its compiler
# probe. project(LANGUAGES NONE) processes the toolchain first.
project(rayact_webview LANGUAGES NONE)
enable_language(CXX)
if(APPLE)
  enable_language(OBJCXX)
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(APPLE)
  set(WEBVIEW_SOURCES webview_plugin.mm)          # WKWebView
elseif(WIN32)
  set(WEBVIEW_SOURCES webview_plugin_win.cpp cef_app_win.cpp) # CEF OSR
else()
  message(FATAL_ERROR "rayact-webview has no implementation for this platform yet")
endif()

add_library(rayact_webview SHARED ${WEBVIEW_SOURCES})
set_target_properties(rayact_webview PROPERTIES OUTPUT_NAME rayact_webview PREFIX "lib")
# Plugin only needs the stable ABI header.
target_include_directories(rayact_webview PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../../../native/core)

if(APPLE)
  # WebKit lives here, not in the engine: this is the whole point of the package
  # owning the implementation.
  target_link_libraries(rayact_webview PRIVATE
      "-framework WebKit" "-framework AppKit" "-framework Foundation")
  # Matches the other plugins (and the engine's platform-view host): no ARC.
  target_compile_options(rayact_webview PRIVATE -fno-objc-arc)
elseif(WIN32)
  if(NOT RAYACT_CEF_ROOT)
    if(CMAKE_SYSTEM_PROCESSOR MATCHES "ARM64|aarch64")
      set(RAYACT_CEF_DIR windowsarm64)
    else()
      set(RAYACT_CEF_DIR windows64)
    endif()
    set(RAYACT_CEF_ROOT
        "${CMAKE_CURRENT_SOURCE_DIR}/../../../.cef-cache/${RAYACT_CEF_DIR}")
  endif()
  if(NOT EXISTS "${RAYACT_CEF_ROOT}/Release/libcef.lib")
    message(FATAL_ERROR
      "CEF binary distribution not found at ${RAYACT_CEF_ROOT}.\n"
      "Run: scripts/fetch-cef-windows.sh")
  endif()

  set(CEF_ROOT "${RAYACT_CEF_ROOT}")
  list(APPEND CMAKE_MODULE_PATH "${CEF_ROOT}/cmake")
  set(USE_SANDBOX OFF CACHE BOOL "" FORCE)
  set(USE_ATL OFF CACHE BOOL "" FORCE)
  set(CEF_RUNTIME_LIBRARY_FLAG "/MD" CACHE STRING "" FORCE)
  find_package(CEF REQUIRED)
  # CEF's MSVC defaults include /MP. clang-cl reports that flag as unused when
  # Ninja already owns parallelism, and CEF also enables /WX, turning the benign
  # diagnostic into a cross-build failure.
  if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    list(REMOVE_ITEM CEF_COMPILER_FLAGS /MP)
    list(REMOVE_ITEM CEF_COMPILER_FLAGS /WX)
    # cef_variables.cmake clears the global compiler flags under Ninja. Restore
    # the xwin sysroot switches installed by our cross toolchain or clang-cl can
    # no longer find either the Windows SDK or the MSVC C++ standard library.
    if(DEFINED _rlb_cl_flags)
      set(CMAKE_C_FLAGS "${_rlb_cl_flags}")
      set(CMAKE_CXX_FLAGS "${_rlb_cl_flags}")
    endif()
  endif()
  add_subdirectory("${CEF_LIBCEF_DLL_WRAPPER_PATH}"
                   "${CMAKE_CURRENT_BINARY_DIR}/libcef_dll_wrapper")

  SET_LIBRARY_TARGET_PROPERTIES(rayact_webview)
  target_link_libraries(rayact_webview PRIVATE
      libcef_dll_wrapper "${CEF_LIB_RELEASE}" ${CEF_STANDARD_LIBS})

  add_executable(rayact_cef_subprocess WIN32
      cef_subprocess_win.cpp cef_app_win.cpp)
  SET_EXECUTABLE_TARGET_PROPERTIES(rayact_cef_subprocess)
  target_link_libraries(rayact_cef_subprocess PRIVATE
      libcef_dll_wrapper "${CEF_LIB_RELEASE}" ${CEF_STANDARD_LIBS})
  add_dependencies(rayact_webview rayact_cef_subprocess)

  # Build output is a self-contained runtime directory. The CLI stages this
  # directory as one artifact so libcef.dll, resources and the subprocess stay
  # adjacent to the plugin DLL.
  add_custom_command(TARGET rayact_webview POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "$<TARGET_FILE:rayact_cef_subprocess>"
            "$<TARGET_FILE_DIR:rayact_webview>/rayact_cef_subprocess.exe"
    VERBATIM)
  foreach(cef_binary IN LISTS CEF_BINARY_FILES)
    add_custom_command(TARGET rayact_webview POST_BUILD
      COMMAND ${CMAKE_COMMAND} -E copy_if_different
              "${CEF_BINARY_DIR_RELEASE}/${cef_binary}"
              "$<TARGET_FILE_DIR:rayact_webview>/${cef_binary}"
      VERBATIM)
  endforeach()
  foreach(cef_resource IN LISTS CEF_RESOURCE_FILES)
    if(IS_DIRECTORY "${CEF_RESOURCE_DIR}/${cef_resource}")
      add_custom_command(TARGET rayact_webview POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_directory
                "${CEF_RESOURCE_DIR}/${cef_resource}"
                "$<TARGET_FILE_DIR:rayact_webview>/${cef_resource}"
        VERBATIM)
    else()
      add_custom_command(TARGET rayact_webview POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
                "${CEF_RESOURCE_DIR}/${cef_resource}"
                "$<TARGET_FILE_DIR:rayact_webview>/${cef_resource}"
        VERBATIM)
    endif()
  endforeach()
endif()
