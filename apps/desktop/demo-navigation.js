// Rayact Multi-Window Example with Navigation UI
// Shows multiple windows with a navigation system

// Display welcome message
console.log("╔═════════════════════════════════════════════════════════╗");
console.log("║           Rayact Multi-Window Demo                     ║");
console.log("║           Navigation System Demo                       ║");
console.log("╚═════════════════════════════════════════════════════════╝");
console.log("");

// Register main screen
registerScreen("main", `
    initRaylib(800, 600, "Rayact - Main Menu");

    console.log("Main menu initialized");

    // Draw title
    renderRect(200, 50, 400, 80, 0x000000FF);

    // Draw menu buttons
    const startX = 200;
    const startY = 150;
    const buttonWidth = 400;
    const buttonHeight = 60;
    const buttonGap = 20;

    // Button 1
    renderRect(startX, startY, buttonWidth, buttonHeight, 0xFF0000FF);
    renderRect(startX - 2, startY - 2, buttonWidth + 4, buttonHeight + 4, 0xFFFFFFFF);

    // Button 2
    renderRect(startX, startY + buttonHeight + buttonGap, buttonWidth, buttonHeight, 0x00FF00FF);

    // Button 3
    renderRect(startX, startY + (buttonHeight + buttonGap) * 2, buttonWidth, buttonHeight, 0xFFFF00FF);

    // Button 4 - Create new window
    renderRect(startX, startY + (buttonHeight + buttonGap) * 3, buttonWidth, buttonHeight, 0x00FFFFFF);

    // Button 5 - Close last window
    renderRect(startX, startY + (buttonHeight + buttonGap) * 4, buttonWidth, buttonHeight, 0x808080FF);

    // Navigation hint
    console.log("\\nMain Menu Options:");
    console.log("1. Go to Screen 1 (Rectangle Demo)");
    console.log("2. Go to Screen 2 (Circle Demo)");
    console.log("3. Go to Screen 3 (Line Demo)");
    console.log("4. Create New Window");
    console.log("5. Close Window");

    updateFrame();
`);

// Register screen 1
registerScreen("screen1", `
    initRaylib(800, 600, "Rayact - Rectangle Demo");

    console.log("Rectangle Demo initialized");

    // Grid of rectangles
    const rectGridSize = 80;
    const startX = 100;
    const startY = 150;

    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 6; col++) {
            const x = startX + col * rectGridSize;
            const y = startY + row * rectGridSize;
            const width = 60;
            const height = 40;

            const color = (row + col) % 2 === 0 ? 0xFF0000FF : 0xFFFF00FF;

            renderRect(x, y, width, height, color);
        }
    }

    console.log("\\nRectangle Demo - Grid layout complete");

    updateFrame();
`);

// Register screen 2
registerScreen("screen2", `
    initRaylib(800, 600, "Rayact - Circle Demo");

    console.log("Circle Demo initialized");

    // Grid of circles
    const gridSize = 50;
    const startX = 100;
    const startY = 150;

    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 5; col++) {
            const x = startX + col * gridSize;
            const y = startY + row * gridSize;
            const radius = 15;

            const color = (row + col) % 2 === 0 ? 0x00FF00FF : 0x0000FFFF;

            renderCircle(x, y, radius, color);
        }
    }

    console.log("\\nCircle Demo - Grid layout complete");

    updateFrame();
`);

// Register screen 3
registerScreen("screen3", `
    initRaylib(800, 600, "Rayact - Line Demo");

    console.log("Line Demo initialized");

    // Draw crossing lines
    const centerX = 400;
    const centerY = 300;
    const lineLength = 200;
    const lineWidth = 5;

    // Horizontal line
    renderLine(centerX - lineLength/2, centerY, centerX + lineLength/2, centerY, lineWidth, 0xFF00FFFF);

    // Vertical line
    renderLine(centerX, centerY - lineLength/2, centerX, centerY + lineLength/2, lineWidth, 0xFFFF00FF);

    // Diagonal lines
    renderLine(centerX - 100, centerY - 100, centerX + 100, centerY + 100, 3, 0xFFFF0000);
    renderLine(centerX + 100, centerY - 100, centerX - 100, centerY + 100, 3, 0xFFFF0000);

    console.log("\\nLine Demo - Geometric patterns complete");

    updateFrame();
`);

// Register screen info
registerScreen("info", `
    initRaylib(800, 600, "Rayact - System Info");

    console.log("System Info initialized");

    // Draw system information
    renderRect(50, 50, 700, 500, 0x000000FF);

    renderText(70, 70, 20, 0xFFFFFFFF, "Rayact Multi-Window System");
    renderText(70, 120, 16, 0x00FF00FF, "=== Window Management ===");

    const winCount = getWindowCount();
    renderText(70, 160, 14, 0xFFFFFFFF, "Window Count: " + winCount);

    const currentWin = getCurrentWindow();
    if (currentWin) {
        renderText(70, 190, 14, 0x00FFFFFF, "Current Window: " + currentWin.id);

        const screen = getCurrentScreen();
        if (screen) {
            renderText(70, 220, 14, 0xFFFF00FF, "Current Screen: " + screen.name);
        }
    }

    const navStack = getNavigationStackSize();
    renderText(70, 260, 14, 0x00FF00FF, "Navigation Stack Size: " + navStack);

    console.log("\\nSystem Info displayed");

    updateFrame();
`);

// Register back to main
registerScreen("back", `
    initRaylib(800, 600, "Rayact - Back to Main");

    console.log("Navigated back to Main Menu");

    navigateToScreen("main");

    updateFrame();
`);

// Create initial windows
console.log("Creating windows...");

const mainWindow = createWindow(800, 600, "Rayact - Main Menu");
console.log("Created main window:", mainWindow);

// Navigate to main screen
setCurrentWindow(mainWindow);
navigateToScreen("main");

// Show current state
printNavigationStatus();

console.log("\\n╔═════════════════════════════════════════════════════════╗");
console.log("║           Demo Started!                                  ║");
console.log("╚═════════════════════════════════════════════════════════╝");
console.log("");
console.log("Available Functions:");
console.log("• navigateToScreen('screen1') - Rectangle demo");
console.log("• navigateToScreen('screen2') - Circle demo");
console.log("• navigateToScreen('screen3') - Line demo");
console.log("• navigateToScreen('info') - System info");
console.log("• navigateToScreen('back') - Back to main menu");
console.log("• createWindow(500, 400, 'Window') - Create new window");
console.log("• closeWindow(windowId) - Close window");
console.log("• getCurrentWindow() - Get current window");
console.log("• getWindowCount() - Get window count");
console.log("• printNavigationStatus() - Show navigation stack");
console.log("");
console.log("Try clicking menu buttons or using these commands!");
console.log("");

updateFrame();