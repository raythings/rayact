cmake_minimum_required(VERSION 3.20)
project(rayact_plugins LANGUAGES CXX)

# Builds all bundled native plugins as shared libs (librayact_<name>.{so,dylib}).
# The desktop build scripts point CMAKE_LIBRARY_OUTPUT_DIRECTORY at build/modules
# so the CLI can copy them next to the packaged host binary.
add_subdirectory(mmkv)
add_subdirectory(secure-store)
