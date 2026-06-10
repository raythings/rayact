// Rayact Shapes Geometry Demo
// Shows various shape types and geometric patterns

// Initialize window
initRaylib(800, 600, "Rayact - Shapes Geometry Demo");

console.log("Drawing geometric shapes...");

// Grid of circles
const gridSize = 50;
const startX = 100;
const startY = 150;

for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
        const x = startX + col * gridSize;
        const y = startY + row * gridSize;
        const radius = 15;

        // Alternate between blue and green
        const color = (row + col) % 2 === 0 ? 0x0000FFFF : 0xFF00FF00;

        renderCircle(x, y, radius, color);
    }
}

// Grid of rectangles
const rectGridSize = 80;
const rectStartX = 100;
const rectStartY = 300;

for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 6; col++) {
        const x = rectStartX + col * rectGridSize;
        const y = rectStartY + row * rectGridSize;
        const width = 60;
        const height = 40;

        // Alternate between red and magenta
        const color = (row + col) % 2 === 0 ? 0xFF0000FF : 0xFFFF00FF;

        renderRect(x, y, width, height, color);
    }
}

// Concentric circles
const centerX = 600;
const centerY = 300;
for (let i = 1; i <= 5; i++) {
    const radius = i * 20;
    const color = (i % 2 === 0) ? 0xFF00FF00 : 0xFF0000FF;
    renderCircle(centerX, centerY, radius, color);
}

// Lines forming a cross
const lineLength = 200;

// Horizontal line
renderLine(centerX - lineLength/2, centerY, centerX + lineLength/2, centerY, 0xFF00FFFF);

// Vertical line
renderLine(centerX, centerY - lineLength/2, centerX, centerY + lineLength/2, 0xFFFF00FF);

// Diagonal lines (forming an X)
renderLine(centerX - 100, centerY - 100, centerX + 100, centerY + 100, 0xFFFF0000);
renderLine(centerX + 100, centerY - 100, centerX - 100, centerY + 100, 0xFFFF0000);

// Triangle
const triX1 = 700;
const triY1 = 200;
const triX2 = 750;
const triY2 = 300;
const triX3 = 650;
const triY3 = 300;

renderLine(triX1, triY1, triX2, triY2, 0xFF00FF00);
renderLine(triX2, triY2, triX3, triY3, 0xFF00FF00);
renderLine(triX3, triY3, triX1, triY1, 0xFF00FF00);

// Display demo info
console.log("Geometric shapes demo complete!");
console.log("\nShapes drawn:");
console.log("- 15 colored circles (3x5 grid)");
console.log("- 12 colored rectangles (2x6 grid)");
console.log("- 5 concentric circles");
console.log("- Cross lines");
console.log("- Diagonal X");
console.log("- Triangle");

// Update frame for next iteration
updateFrame();