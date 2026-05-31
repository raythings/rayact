// raym3 v2 — className-based CSS styling

initRaylib(800, 600, "Rayact - raym3 v2");

// Register stylesheet — no return value, styles applied via className prop
importCSS('./apps/desktop/styles.css');

// className resolves rules from the stylesheet.
// Multiple classes: later one overrides earlier on conflict.
const root = createView({ className: 'root' });

const header = createView({ className: 'header' });
const title = createText("raym3 v2 retained mode", { className: 'header-title' });
appendChild(header, title);
appendChild(root, header);

const content = createView({ className: 'content' });

const sidebar = createView({ className: 'sidebar' });
const navItems = ["Dashboard", "Settings", "Profile", "Help", "About"];
for (let i = 0; i < navItems.length; i++) {
    // First item gets both nav-item and active-nav-item (active overrides bg + border)
    const classes = i === 0 ? 'nav-item active-nav-item' : 'nav-item';
    const item = createView({ className: classes });
    const label = createText(navItems[i], { className: 'nav-label' });
    appendChild(item, label);
    appendChild(sidebar, item);
}
appendChild(content, sidebar);

const main = createView({ className: 'main' });
const heroText = createText("Hello from raym3 v2", { className: 'hero-text' });
appendChild(main, heroText);

const subText = createText("CSS className prop, multi-class merge", { className: 'sub-text' });
appendChild(main, subText);

// Inline style overrides className — borderRadius here overrides the CSS value
const btn = createButton("Press me", { className: 'primary-button', borderRadius: 22 });
setOnPress(btn, function() {
    console.log("Button pressed!");
});
appendChild(main, btn);

appendChild(content, main);
appendChild(root, content);

const footer = createView({ className: 'footer' });
appendChild(root, footer);

setRootNode(root);
