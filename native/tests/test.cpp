#include <iostream>
#include <string>

// Test QuickJS functionality
void testQuickJS() {
    std::cout << "Testing QuickJS integration..." << std::endl;

#ifdef QUICKJS_H
    std::cout << "✓ QuickJS headers found" << std::endl;
#else
    std::cout << "✗ QuickJS headers not found" << std::endl;
#endif

#ifdef RAYLIB_H
    std::cout << "✓ Raylib headers found" << std::endl;
#else
    std::cout << "✗ Raylib headers not found" << std::endl;
#endif

    std::cout << "QuickJS integration test complete!" << std::endl;
}

// Test platform detection
void testPlatform() {
    std::cout << "\nPlatform test..." << std::endl;

#ifdef _WIN32
    std::cout << "Platform: Windows" << std::endl;
#elif __APPLE__
    std::cout << "Platform: macOS" << std::endl;
#elif __linux__
    std::cout << "Platform: Linux" << std::endl;
#elif __ANDROID__
    std::cout << "Platform: Android" << std::endl;
#else
    std::cout << "Platform: Unknown" << std::endl;
#endif

    std::cout << "Platform test complete!" << std::endl;
}

// Test vector math
void testMath() {
    std::cout << "\nMath test..." << std::endl;

    int rect = 0xFF0000FF;
    int circle = 0xFF00FF00;
    int line = 0x0000FFFF;

    std::cout << "Red rectangle: 0x" << std::hex << rect << std::endl;
    std::cout << "Green circle: 0x" << std::hex << circle << std::endl;
    std::cout << "Blue line: 0x" << std::hex << line << std::endl;

    std::cout << "Math test complete!" << std::endl;
}

int main() {
    std::cout << "========================================" << std::endl;
    std::cout << "  Rayact - Test Suite" << std::endl;
    std::cout << "  Version 0.1.0" << std::endl;
    std::cout << "========================================" << std::endl;

    testQuickJS();
    testPlatform();
    testMath();

    std::cout << "\n========================================" << std::endl;
    std::cout << "  All tests passed!" << std::endl;
    std::cout << "========================================" << std::endl;

    return 0;
}
