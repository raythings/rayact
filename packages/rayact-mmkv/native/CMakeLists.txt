cmake_minimum_required(VERSION 3.20)
project(rayact_mmkv LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(rayact_mmkv SHARED mmkv_plugin.cpp)
set_target_properties(rayact_mmkv PROPERTIES OUTPUT_NAME rayact_mmkv PREFIX "lib")
# Plugin only needs the stable ABI header.
target_include_directories(rayact_mmkv PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../../../native/core)
