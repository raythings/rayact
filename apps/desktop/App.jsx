/* @jsx h */

// Minimal JSX factory — no React needed
function h(type, props, ...children) {
  return { type, props: { ...(props || {}), children: children.flat(Infinity) } };
}

// Walk element tree and call native raylib functions
function renderElement(el) {
  if (el == null || typeof el !== 'object') return;
  const { type, props = {} } = el;
  const { children = [], ...attrs } = props;

  if (typeof type === 'function') {
    renderElement(type(attrs));
    return;
  }

  switch (type) {
    case 'rect':
      renderRect(
        attrs.x | 0, attrs.y | 0,
        (attrs.width || attrs.w) | 0,
        (attrs.height || attrs.h) | 0,
        attrs.color >>> 0
      );
      break;
    case 'circle':
      renderCircle(
        attrs.x | 0, attrs.y | 0,
        (attrs.radius || attrs.r) | 0,
        attrs.color >>> 0
      );
      break;
    case 'line':
      renderLine(
        attrs.x1 | 0, attrs.y1 | 0,
        attrs.x2 | 0, attrs.y2 | 0,
        attrs.color >>> 0
      );
      break;
    // 'view' and unknown: just render children
  }

  [].concat(children).forEach(renderElement);
}

// ---------- Components ----------

function Panel({ x, y, width, height, color = 0x333355FF, children = [] }) {
  return (
    <view>
      <rect x={x} y={y} width={width} height={height} color={color} />
      {[].concat(children)}
    </view>
  );
}

function Button({ x, y, width = 140, height = 40, color = 0x4466CCFF }) {
  return (
    <view>
      <rect x={x}   y={y}   width={width}   height={height}   color={0x224488FF} />
      <rect x={x+2} y={y+2} width={width-4} height={height-4} color={color}      />
    </view>
  );
}

function App() {
  return (
    <view>
      {/* Dark background */}
      <rect x={0} y={0} width={800} height={600} color={0x1A1A2EFF} />

      {/* Title bar */}
      <rect x={0} y={0} width={800} height={44} color={0x16213EFF} />

      {/* Content panel */}
      <Panel x={40} y={60} width={340} height={260} color={0x0F3460FF}>
        <rect x={60}  y={80}  width={300} height={4}   color={0x533483FF} />
        <rect x={60}  y={100} width={200} height={100} color={0xFF445577} />
        <circle x={220} y={200} radius={50} color={0x44CCFF88} />
      </Panel>

      {/* Separator line */}
      <line x1={40} y1={340} x2={760} y2={340} color={0x533483FF} />

      {/* Buttons row */}
      <Button x={40}  y={360} color={0x4466CCFF} />
      <Button x={200} y={360} color={0xCC4466FF} />
      <Button x={360} y={360} color={0x44CC66FF} />

      {/* Right panel — big circle */}
      <circle x={620} y={200} radius={120} color={0x533483AA} />
      <circle x={620} y={200} radius={80}  color={0xE94560FF} />
      <circle x={620} y={200} radius={40}  color={0xFFFFFFFF} />
    </view>
  );
}

// ---------- Entry point ----------
initRaylib(800, 600, "Rayact — React Test");
renderElement(<App />);
