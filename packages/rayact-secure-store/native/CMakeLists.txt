cmake_minimum_required(VERSION 3.20)
project(rayact_secure_store LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(SS_SOURCES secure_store_plugin.cpp)
if(APPLE)
  enable_language(OBJCXX)
  list(APPEND SS_SOURCES secure_store_mac.mm)
endif()

add_library(rayact_secure_store SHARED ${SS_SOURCES})
set_target_properties(rayact_secure_store PROPERTIES OUTPUT_NAME rayact_secure_store PREFIX "lib")
target_include_directories(rayact_secure_store PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../../../native/core)

if(APPLE)
  target_link_libraries(rayact_secure_store PRIVATE
    "-framework CoreFoundation" "-framework Security")
endif()
