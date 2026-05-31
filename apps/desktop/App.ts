// TypeScript test — types stripped at load time by TypeStripper

interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

function hexColor(r: number, g: number, b: number, a: number = 255): number {
  return ((r & 0xFF) << 24) | ((g & 0xFF) << 16) | ((b & 0xFF) << 8) | (a & 0xFF);
}

function drawPanel(x: number, y: number, w: number, h: number, color: number): void {
  renderRect(x, y, w, h, color);
  renderRect(x + 2, y + 2, w - 4, h - 4, (color | 0) + 0x101010);
}

const W: number = 800;
const H: number = 600;

initRaylib(W, H, "Rayact — TypeScript Test");

// Background
renderRect(0, 0, W, H, hexColor(20, 20, 40));

// Header bar
renderRect(0, 0, W, 48, hexColor(30, 30, 60));
renderLine(0, 48, W, 48, hexColor(80, 80, 160));

// Left panel
drawPanel(20, 64, 240, 480, hexColor(35, 35, 70));

// Main content area
drawPanel(275, 64, 505, 480, hexColor(25, 25, 50));

// Accent circles
renderCircle(530, 240, 100, hexColor(200, 60, 100, 180));
renderCircle(530, 240, 65,  hexColor(240, 100, 60, 200));
renderCircle(530, 240, 30,  hexColor(255, 220, 80, 255));

// Nav items in left panel
for (let i: number = 0; i < 6; i++) {
  const y: number = 110 + i * 70;
  renderRect(32, y, 216, 54, hexColor(45, 45, 85));
  renderRect(34, y + 2, 212, 50, hexColor(55, 55, 100));
}

// Bottom accent bar
renderRect(0, H - 4, W, 4, hexColor(100, 60, 200));
