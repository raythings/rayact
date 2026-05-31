// Rayact Interactive Demo
// Demonstrates input handling and simple animation

// Initialize window with high refresh rate
initRaylib(800, 600, "Rayact - Interactive Demo");

// State variables
let mouseX = 0;
let mouseY = 0;
let isMouseDown = false;
let selectedColor = 0xFF0000FF; // Default blue

console.log("Interactive demo loaded!");
console.log("\nControls:");
console.log("- Click and drag to draw");
console.log("- Press keys 1-5 to change colors");
console.log("- Press 'r' to reset");
console.log("- Press 'q' to quit");

// Keyboard callback (will be implemented)
function onKeyDown(key) {
    console.log("Key pressed:", key);

    switch(key.toLowerCase()) {
        case '1':
            selectedColor = 0xFF0000FF; // Blue
            break;
        case '2':
            selectedColor = 0xFF00FF00; // Green
            break;
        case '3':
            selectedColor = 0xFFFF0000; // Red
            break;
        case '4':
            selectedColor = 0xFFFF00FF; // Magenta
            break;
        case '5':
            selectedColor = 0xFF00FFFF; // Cyan
            break;
        case 'r':
            console.log("Resetting canvas...");
            // Would need to clear canvas, but clearRect won't work without proper implementation
            break;
        case 'q':
            console.log("Quitting...");
            // Exit application
            window.close();
            break;
    }
}

// Draw a grid background
for (let x = 0; x < 800; x += 50) {
    renderLine(x, 0, x, 600, 0x1a1a1aFF);
}
for (let y = 0; y < 600; y += 50) {
    renderLine(0, y, 800, y, 0x1a1a1aFF);
}

// Draw instructions
console.log("Click to draw shapes at mouse position");
console.log("Keyboard shortcuts: 1=Blue, 2=Green, 3=Red, 4=Magenta, 5=Cyan");

// Simple animation loop
function animate() {
    // Draw cursor
    const cursorSize = 20;
    renderRect(mouseX - cursorSize/2, mouseY - cursorSize/2, cursorSize, cursorSize, 0xFFFFFFFF);

    // Draw color indicator
    renderRect(760, 20, 20, 20, selectedColor);
}

// Initial draw
animate();

// Update frame for animation
updateFrame();

console.log("Interactive demo ready!");
console.log("Mouse position:", mouseX, mouseY);
console.log("Selected color:", selectedColor.toString(16).toUpperCase());

// Save the animation function for later use
saveAnimation(animate);

// Update frame periodically for animation
function gameLoop() {
    animate();
    updateFrame();
    requestAnimationFrame(gameLoop);
}

// Start animation
requestAnimationFrame(gameLoop);

console.log("Animation started!");

// Store global functions for native access
window.updateFrame = updateFrame;
window.saveAnimation = function(fn) {
    // This will be implemented with native bridge
    console.log("Animation function saved");
};

// Note: Full mouse and keyboard input handling will be implemented
// in the next phase. For now, this demonstrates the structure.

// Update frame for next iteration
updateFrame();