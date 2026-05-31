// Rayact Multi-Window Demo
// Demonstrates multiple windows managed by a single QuickJS instance

console.log("=== Rayact Multi-Window Demo ===\n");

// Initialize first window
const window1 = createWindow(800, 600, "Rayact - Window 1");
console.log("Created window 1:", window1);
console.log("Window count:", getWindowCount());

// Navigate to screen 1
registerScreen("screen1", `
    initRaylib(800, 600, "Rayact - Screen 1");

    console.log("Screen 1 initialized");

    // Draw some content
    renderRect(100, 100, 200, 150, 0xFF0000FF);
    renderCircle(400, 300, 50, 0x00FF00FF);
    renderLine(100, 400, 700, 400, 0x0000FFFF);

    // Draw navigation hint
    console.log("\\nClick 'Next' button below to navigate to screen 2");

    updateFrame();
`);

// Register screen 2
registerScreen("screen2", `
    initRaylib(800, 600, "Rayact - Screen 2");

    console.log("Screen 2 initialized");

    // Different content
    for (let i = 0; i < 5; i++) {
        renderRect(100 + i * 150, 200 + (i % 2) * 100, 100, 80, 0xFFFF0000 + i * 0x008000);
    }

    // Draw navigation hint
    console.log("\\nClick 'Next' button below to navigate to screen 3");
    console.log("Or click 'Back' to return to screen 1");

    updateFrame();
`);

// Register screen 3
registerScreen("screen3", `
    initRaylib(800, 600, "Rayact - Screen 3");

    console.log("Screen 3 initialized");

    // Star pattern
    const centerX = 400;
    const centerY = 300;
    const outerRadius = 150;
    const innerRadius = 70;
    const points = 5;

    for (let i = 0; i < points * 2; i++) {
        const angle = (i * Math.PI) / points - Math.PI / 2;
        const radius = (i % 2 === 0) ? outerRadius : innerRadius;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        const startAngle = (angle - Math.PI / 5) - Math.PI / 2;
        const endAngle = (angle + Math.PI / 5) - Math.PI / 2;

        const startX = centerX + Math.cos(startAngle) * radius;
        const startY = centerY + Math.sin(startAngle) * radius;
        const endX = centerX + Math.cos(endAngle) * radius;
        const endY = centerY + Math.sin(endAngle) * radius;

        const color = i % 2 === 0 ? 0xFF0000FF : 0xFFD700FF;
        renderLine(startX, startY, endX, endY, i % 2 === 0 ? 4 : 3, color);
    }

    console.log("\\nMulti-window demo complete!");
    console.log("Try creating more windows:");
    console.log("- navigateToScreen('screen4') to see next screen");

    updateFrame();
`);

// Create additional windows
const window2 = createWindow(600, 400, "Rayact - Window 2");
console.log("Created window 2:", window2);

setCurrentWindow(window2);
console.log("Set window 2 as current");

// Draw on window 2
initRaylib(600, 400, "Rayact - Window 2");
renderRect(100, 100, 400, 200, 0x00FF00FF);
console.log("Window 2 content drawn");

updateFrame();

// Navigate through screens
setCurrentWindow(window1);
console.log("\\nNavigating to screens...");
navigateToScreen("screen1");
navigateToScreen("screen2");
navigateToScreen("screen3");

// Print navigation status
printNavigationStatus();

// Create more windows to demonstrate multi-window management
const window3 = createWindow(400, 300, "Rayact - Window 3");
console.log("Created window 3:", window3);

console.log("\\n=== Demo Complete ===");
console.log("Summary:");
console.log("• 3 windows created");
console.log("• 4 screens registered");
console.log("• Navigation stack with 3 screens");
console.log("• Each window managed independently");
console.log("");
console.log("Try these JavaScript commands:");
console.log("• getCurrentWindow() - Get current window");
console.log("• getWindowCount() - Get window count");
console.log("• createWindow(500, 400, 'My Window') - Create new window");
console.log("• closeWindow(windowId) - Close window");
console.log("• setCurrentWindow(windowId) - Switch windows");
console.log("• navigateToScreen('screen3') - Navigate between screens");
console.log("• printNavigationStatus() - Show navigation stack");
console.log("• registerScreen(name, script) - Add new screen");
console.log("");
console.log("Next steps:");
console.log("• Build raylib in background for multiple windows");
console.log("• Implement view transitions");
console.log("• Add window focus management");
console.log("• Implement window-specific input handling");
console.log("• Create complex multi-window applications");

updateFrame();