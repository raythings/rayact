// Rayact Star Pattern Demo
// Shows a beautiful star shape made of multiple lines

// Initialize window
initRaylib(800, 600, "Rayact - Star Pattern Demo");

console.log("Drawing star pattern...");

const centerX = 400;
const centerY = 300;
const outerRadius = 150;
const innerRadius = 70;
const points = 5;

// Draw star using lines
for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const radius = (i % 2 === 0) ? outerRadius : innerRadius;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    // Calculate start and end points for each line
    const startAngle = (angle - Math.PI / 5) - Math.PI / 2;
    const endAngle = (angle + Math.PI / 5) - Math.PI / 2;

    const startX = centerX + Math.cos(startAngle) * radius;
    const startY = centerY + Math.sin(startAngle) * radius;
    const endX = centerX + Math.cos(endAngle) * radius;
    const endY = centerY + Math.sin(endAngle) * radius;

    // Draw line with gradient effect (alternating colors)
    const color = i % 2 === 0 ? 0xFF0000FF : 0xFFD700FF; // Blue or Gold
    const lineWidth = i % 2 === 0 ? 4 : 3;

    renderLine(startX, startY, endX, endY, lineWidth, color);
}

// Draw outer circle border
renderCircle(centerX, centerY, outerRadius, 0xFFFFFFFF);
renderCircle(centerX, centerY, innerRadius, 0xFFD700FF);

// Draw center point
renderCircle(centerX, centerY, 5, 0xFFFF00FF);

// Draw rays extending outward
const numRays = 12;
for (let i = 0; i < numRays; i++) {
    const angle = (i * 2 * Math.PI) / numRays;
    const rayLength = outerRadius + 30;
    const startX = centerX + Math.cos(angle) * outerRadius;
    const startY = centerY + Math.sin(angle) * outerRadius;
    const endX = centerX + Math.cos(angle) * rayLength;
    const endY = centerY + Math.sin(angle) * rayLength;

    const color = i % 2 === 0 ? 0x00FF00FF : 0x0000FFFF; // Green or Cyan
    renderLine(startX, startY, endX, endY, 2, color);
}

// Display demo info
console.log("Star pattern demo complete!");
console.log("\nStar components:");
console.log("- 10-point star (5 outer points, 5 inner points)");
console.log("- 12 radial rays");
console.log("- Outer and inner circle borders");
console.log("- Center point");

// Update frame for next iteration
updateFrame();