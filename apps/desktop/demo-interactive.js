// Rayact Interactive Demo
// Demonstrates input handling and simple animation

// Initialize window with high refresh rate
initRaylib(800, 600, "Rayact - Interactive Demo");

// State variables
let mouseX = 0;
let mouseY = 0;
let isMouseDownVar = false;
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

// Simple animation loop
function animate() {
    // Clear and draw grid background
    for (let x = 0; x < 800; x += 50) {
        renderLine(x, 0, x, 600, 0x1a1a1aFF);
    }
    for (let y = 0; y < 600; y += 50) {
        renderLine(0, y, 800, y, 0x1a1a1aFF);
    }

    // Draw cursor at current mouse position
    const cursorSize = 20;
    renderRect(mouseX - cursorSize/2, mouseY - cursorSize/2, cursorSize, cursorSize, 0xFFFFFFFF);

    // Draw color indicator
    renderRect(760, 20, 20, 20, selectedColor);
}

// Update frame periodically for animation
function gameLoop() {
    // Query native mouse position
    mouseX = getMouseX();
    mouseY = getMouseY();

    // Query native mouse button down
    if (isMouseDown(0)) {
        isMouseDownState = true;
        // Simple logic: clicking top-right corner changes color
        if (mouseX > 700 && mouseY < 100) {
            selectedColor = 0xFF00FF00; // Green
        }
    } else {
        isMouseDownState = false;
    }

    animate();
    updateFrame();
    requestAnimationFrame(gameLoop);
}

let isMouseDownState = false;

// Start animation
requestAnimationFrame(gameLoop);

console.log("Animation started!");