cmake_minimum_required(VERSION 3.20)

add_library(rayact_devtools STATIC
  ${CMAKE_CURRENT_LIST_DIR}/../../../native/desktop/devtools.cpp
  ${CMAKE_CURRENT_LIST_DIR}/../../../native/desktop/cdp_handler.cpp
)
target_include_directories(rayact_devtools PUBLIC
  ${CMAKE_CURRENT_LIST_DIR}/include
  ${CMAKE_CURRENT_LIST_DIR}/../../../native/desktop
)
if(DEFINED QUICKJS_DIR)
  target_include_directories(rayact_devtools PRIVATE ${QUICKJS_DIR})
endif()
if(TARGET raym3)
  target_link_libraries(rayact_devtools PUBLIC raym3)
elseif(DEFINED RAYM3_DIR)
  target_include_directories(rayact_devtools PRIVATE ${RAYM3_DIR}/include)
endif()
target_compile_features(rayact_devtools PUBLIC cxx_std_17)
target_compile_definitions(rayact_devtools PUBLIC RAYACT_ENABLE_DEVTOOLS=1)
