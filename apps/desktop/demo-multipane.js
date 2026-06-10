// Multi-window demo — draggable floating windows via absolute positioning

initRaylib(1200, 800, "Rayact - Multi Window");
importCSS('./apps/desktop/tailwind.css');

// ── desktop root ─────────────────────────────────────────────────────────────

const desktop = createView({
    className: 'bg-slate-900',
    width: 1200, height: 800,
    position: 'relative',
    overflow: 'hidden',
});

// ── window registry ───────────────────────────────────────────────────────────

const windows = [];   // { id, titleBar, node, x, y, w, h, zIndex }
let nextZ = 1;
let dragging = null;  // { win, startX, startY }

function bringToFront(win) {
    win.zIndex = ++nextZ;
    setStyle(win.node, {
        position: 'absolute',
        left: win.x, top: win.y,
        width: win.w, height: win.h,
        zIndex: win.zIndex,
    });
}

// ── build a floating window ───────────────────────────────────────────────────

function createWindow(opts) {
    const { title, x, y, w, h, buildContent } = opts;

    const win = { x, y, w, h, zIndex: ++nextZ, node: null, titleBar: null };

    // Outer frame
    const frame = createView({
        className: 'flex flex-col rounded-xl border border-slate-600',
        backgroundColor: 0x1E293BFF,  // slate-800
        position: 'absolute',
        left: x, top: y, width: w, height: h,
        zIndex: win.zIndex,
        overflow: 'hidden',
    });
    win.node = frame;

    // Title bar
    const titleBar = createView({
        className: 'flex flex-row items-center gap-3',
        backgroundColor: 0x0F172AFF,  // slate-900
        width: w, height: 36,
        paddingLeft: 12, paddingRight: 12,
    });
    win.titleBar = titleBar;

    // Traffic-light buttons
    const colors = [0xFF5F57FF, 0xFFBD2EFF, 0x28C840FF];
    for (let i = 0; i < 3; i++) {
        const dot = createView({
            className: 'rounded-full',
            backgroundColor: colors[i],
            width: 12, height: 12,
        });
        appendChild(titleBar, dot);
    }

    const titleText = createText(title, {
        className: 'text-sm text-slate-300 font-medium',
    });
    appendChild(titleBar, titleText);
    appendChild(frame, titleBar);

    // Content area
    const content = createView({
        className: 'flex flex-col flex-1 p-4 gap-3',
        width: w, height: h - 36,
    });
    buildContent(content, w, h - 36);
    appendChild(frame, content);

    appendChild(desktop, frame);
    windows.push(win);

    // Title bar press → bring to front (click handler; drag is handled in frame loop)
    setOnPress(titleBar, function() { bringToFront(win); });

    return win;
}

// ── Window 1: Notes ───────────────────────────────────────────────────────────

createWindow({
    title: 'Notes',
    x: 60, y: 80, w: 340, h: 280,
    buildContent: function(c) {
        appendChild(c, createText('Meeting notes', { className: 'text-base font-semibold text-white' }));
        const lines = [
            '• Finalize API surface for rayact v0.2',
            '• Add text input component',
            '• Multi-window demo ✓',
            '• Write docs',
        ];
        for (let i = 0; i < lines.length; i++) {
            appendChild(c, createText(lines[i], { className: 'text-sm text-slate-400' }));
        }
    },
});

// ── Window 2: Stats dashboard ─────────────────────────────────────────────────

createWindow({
    title: 'Dashboard',
    x: 440, y: 60, w: 380, h: 300,
    buildContent: function(c, cw) {
        appendChild(c, createText('System Stats', { className: 'text-base font-semibold text-white' }));
        const stats = [
            { label: 'CPU', value: '12%',  color: 0x22C55EFF },
            { label: 'RAM', value: '4.2 GB', color: 0x3B82F6FF },
            { label: 'GPU', value: '8%',   color: 0xA855F7FF },
            { label: 'Net', value: '2 MB/s', color: 0xF59E0BFF },
        ];
        const grid = createView({
            className: 'flex flex-row gap-3',
        });
        for (let i = 0; i < stats.length; i++) {
            const s = stats[i];
            const card = createView({
                className: 'flex flex-col gap-1 rounded-lg',
                backgroundColor: 0x0F172AFF,
                padding: 12, width: 148,
            });
            appendChild(card, createText(s.value, {
                className: 'text-xl font-bold',
                text: { color: s.color, fontSize: 20 },
            }));
            appendChild(card, createText(s.label, { className: 'text-sm text-slate-500' }));
            appendChild(grid, card);
        }
        appendChild(c, grid);
    },
});

// ── Window 3: Image viewer ────────────────────────────────────────────────────

createWindow({
    title: 'Image Viewer',
    x: 200, y: 380, w: 400, h: 300,
    buildContent: function(c, cw, ch) {
        const imgContainer = createView({
            className: 'rounded-lg overflow-hidden',
            width: cw - 32, height: ch - 32,
        });
        const img = createImage('./apps/desktop/avatar.png', {
            width: cw - 32, height: ch - 32,
        });
        appendChild(imgContainer, img);
        appendChild(c, imgContainer);
    },
});

// ── Window 4: Settings panel ──────────────────────────────────────────────────

createWindow({
    title: 'Preferences',
    x: 700, y: 400, w: 320, h: 240,
    buildContent: function(c) {
        const rows = [
            { label: 'Dark mode',    active: true  },
            { label: 'Animations',   active: true  },
            { label: 'Telemetry',    active: false },
        ];
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            let active = r.active;
            const TRAVEL = 20;
            const row = createView({
                className: 'flex flex-row items-center',
                paddingTop: 8, paddingBottom: 8,
            });
            appendChild(row, createText(r.label, { className: 'text-sm text-slate-300', flexGrow: 1 }));
            const track = createView({
                className: active ? 'bg-indigo-600 rounded-full' : 'bg-slate-600 rounded-full',
                width: 44, height: 24,
                flexDirection: 'row',
                justifyContent: 'flex-start',
                alignItems: 'center',
                padding: 2,
            });
            const thumb = createView({
                className: 'rounded-full',
                backgroundColor: 0xFFFFFFFF,
                width: 20, height: 20,
                margin: { left: active ? TRAVEL : 0 },
            });
            appendChild(track, thumb);
            appendChild(row, track);
            appendChild(c, row);
            setOnPress(track, function() {
                active = !active;
                const from = active ? 0 : TRAVEL;
                const to   = active ? TRAVEL : 0;
                const t0   = performance.now();
                setStyle(track, {
                    className: active ? 'bg-indigo-600 rounded-full' : 'bg-slate-600 rounded-full',
                    width: 44, height: 24,
                    flexDirection: 'row', justifyContent: 'flex-start',
                    alignItems: 'center', padding: 2,
                });
                const timer = setInterval(function() {
                    const t = Math.min((performance.now() - t0) / 180, 1);
                    const e = 1 - Math.pow(1 - t, 3);
                    setStyle(thumb, {
                        className: 'rounded-full', backgroundColor: 0xFFFFFFFF,
                        width: 20, height: 20, margin: { left: from + (to - from) * e },
                    });
                    if (t >= 1) clearInterval(timer);
                }, 16);
            });
        }
    },
});

// ── set root & register per-frame drag handler ────────────────────────────────

setRootNode(desktop);

// Hit-test which window's title bar the mouse is over
function findTitleBarWin(mx, my) {
    // Check in reverse z-order (top window first)
    const sorted = windows.slice().sort(function(a, b) { return b.zIndex - a.zIndex; });
    for (let i = 0; i < sorted.length; i++) {
        const w = sorted[i];
        if (mx >= w.x && mx <= w.x + w.w &&
            my >= w.y && my <= w.y + 36) {
            return w;
        }
    }
    return null;
}

setOnFrame(function(dt, elapsed) {
    const mx = getMouseX();
    const my = getMouseY();

    if (isMousePressed(0)) {
        const hit = findTitleBarWin(mx, my);
        if (hit) {
            dragging = hit;
            bringToFront(hit);
        }
    }

    if (dragging) {
        if (isMouseDown(0)) {
            const d = getMouseDelta();
            if (d.x !== 0 || d.y !== 0) {
                dragging.x += d.x;
                dragging.y += d.y;
                // Clamp to desktop bounds
                dragging.x = Math.max(0, Math.min(1200 - dragging.w, dragging.x));
                dragging.y = Math.max(0, Math.min(800 - 36, dragging.y));
                setStyle(dragging.node, {
                    position: 'absolute',
                    left: dragging.x, top: dragging.y,
                    width: dragging.w, height: dragging.h,
                    zIndex: dragging.zIndex,
                    overflow: 'hidden',
                });
            }
        } else {
            dragging = null;
        }
    }
});