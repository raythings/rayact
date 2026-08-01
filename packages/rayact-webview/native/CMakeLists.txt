cmake_minimum_required(VERSION 3.20)
project(rayact_webview LANGUAGES CXX OBJCXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(rayact_webview SHARED webview_plugin.mm)
set_target_properties(rayact_webview PROPERTIES OUTPUT_NAME rayact_webview PREFIX "lib")
# Plugin only needs the stable ABI header.
target_include_directories(rayact_webview PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../../../native/core)
# WebKit lives here, not in the engine: this is the whole point of the package
# owning the implementation.
target_link_libraries(rayact_webview PRIVATE
    "-framework WebKit" "-framework AppKit" "-framework Foundation")
# Matches the other plugins (and the engine's platform-view host): no ARC.
target_compile_options(rayact_webview PRIVATE -fno-objc-arc)
