// Rayact Desktop Application
// This is the JavaScript code that runs in QuickJS and renders to raylib

// Initialize raylib window
initRaylib(800, 600, "Rayact - Hello World");

// Example 1: Simple rectangle
renderRect(100, 100, 200, 150, 0xFF0000FF); // Red rectangle

// Example 2: Simple circle
renderCircle(400, 300, 50, 0xFF00FF00); // Green circle

// Example 3: Simple line
renderLine(100, 300, 700, 300, 0x0000FFFF); // Blue line across screen

// Example 4: Multiple rectangles
renderRect(150, 200, 150, 100, 0xFFFF00FF); // Magenta
renderRect(500, 200, 150, 100, 0xFF00FFFF); // Cyan

// Update frame (clear shapes for next frame)
updateFrame();

// Note: In the actual application, you would put this in an event loop
// and update the frame rate to 60 FPS for smooth animation

console.log("Rayact application loaded and running!");
console.log("You should see multiple shapes in the window.");
