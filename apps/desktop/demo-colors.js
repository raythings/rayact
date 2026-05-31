// Rayact Color Palette Demo
// Shows off the color system and shape variety

// Initialize window
initRaylib(800, 600, "Rayact - Color Palette Demo");

// Define a beautiful color palette
const colors = [
    { name: "Red", hex: 0xFF0000FF, x: 50, y: 50 },
    { name: "Green", hex: 0x00FF00FF, x: 150, y: 50 },
    { name: "Blue", hex: 0x0000FFFF, x: 250, y: 50 },
    { name: "Yellow", hex: 0xFFFF00FF, x: 350, y: 50 },
    { name: "Magenta", hex: 0xFFFF00FF, x: 450, y: 50 },
    { name: "Cyan", hex: 0xFF00FFFF, x: 550, y: 50 },
    { name: "White", hex: 0xFFFFFFFF, x: 650, y: 50 },
    { name: "Gray", hex: 0x808080FF, x: 50, y: 150 },
    { name: "Dark Red", hex: 0x800000FF, x: 150, y: 150 },
    { name: "Dark Green", hex: 0x008000FF, x: 250, y: 150 },
    { name: "Dark Blue", hex: 0x000080FF, x: 350, y: 150 },
    { name: "Orange", hex: 0xFFA500FF, x: 450, y: 150 },
];

// Display title
console.log("Drawing color palette...");

// Draw rectangles for each color
for (let i = 0; i < colors.length; i++) {
    const color = colors[i];
    const width = 80;
    const height = 80;

    // Draw the main color rectangle
    renderRect(color.x, color.y, width, height, color.hex);

    // Draw a border with the color inverted
    renderRect(color.x - 2, color.y - 2, width + 4, height + 4, 0xFFFFFFFF);

    // Display the color name
    // Note: Text rendering will be implemented in next version
}

// Draw labels
console.log(`Drew ${colors.length} colored rectangles`);
console.log("Color palette demo complete!");
console.log("\nIn next version:");
console.log("- Add text rendering support");
console.log("- Add hover effects");
console.log("- Add click interactions");

// Update frame for next iteration
updateFrame();