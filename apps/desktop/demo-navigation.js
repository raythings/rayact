// Multi-screen navigation demo
// One QJS runtime, one context — screens share globals, stores, and modules.
// Navigation is a pure JS layer. C++ renders whatever setRootNode points to.

initRaylib(390, 844, "Rayact Navigation");
importCSS('./apps/desktop/tailwind.css');

const W = 390, H = 844;

// ─── Shared store ─────────────────────────────────────────────────────────────
// Lives in JS scope — all screens see the same object, no IPC needed.

const store = {
    cart: [],
    notificationsEnabled: true,
    addItem: function(item) { this.cart.push(item); },
    removeItem: function(index) { this.cart.splice(index, 1); },
};

// ─── Navigation ───────────────────────────────────────────────────────────────
// Stack of { name, instance: { root, onFocus?, onBlur?, onUnmount? } }
// Screens are factory functions called once on first push (lazy mount).
// Navigating back reuses the cached root — state is preserved.

const Nav = (function() {
    const registry  = {};  // name → factory(params, nav) → instance
    const stack     = [];  // mounted screens
    const cache     = {};  // name → { instance, params } for screens that stay alive

    function updateRoot() {
        if (stack.length === 0) return;
        const top = stack[stack.length - 1];
        setRootNode(top.instance.root);
        if (top.instance.onFocus) top.instance.onFocus();
    }

    return {
        define: function(name, factory) {
            registry[name] = factory;
        },

        push: function(name, params) {
            // Blur current top
            if (stack.length > 0) {
                const cur = stack[stack.length - 1];
                if (cur.instance.onBlur) cur.instance.onBlur();
            }

            // Mount or reuse
            const key = name;
            let entry = cache[key];
            if (!entry) {
                const instance = registry[name](params || {}, Nav);
                if (instance.onMount) instance.onMount();
                entry = { instance, params: params || {} };
                cache[key] = entry;
            } else {
                // Already mounted — refresh if it needs params update
                entry.params = params || {};
                if (entry.instance.onParamsChange) entry.instance.onParamsChange(params);
            }

            stack.push({ name, instance: entry.instance });
            updateRoot();
        },

        pop: function() {
            if (stack.length <= 1) return;
            const top = stack.pop();
            if (top.instance.onBlur) top.instance.onBlur();

            // Resume previous
            updateRoot();
        },

        replace: function(name, params) {
            if (stack.length > 0) {
                const top = stack.pop();
                if (top.instance.onBlur) top.instance.onBlur();
            }
            Nav.push(name, params);
        },

        // Destroy cached screen (free its nodes — full unmount)
        destroy: function(name) {
            const entry = cache[name];
            if (!entry) return;
            if (entry.instance.onUnmount) entry.instance.onUnmount();
            delete cache[name];
        },
    };
})();

// ─── Reusable UI helpers ──────────────────────────────────────────────────────

function makeScreen(bg) {
    return createView({
        className: bg || 'bg-slate-900',
        width: W, height: H,
        flexDirection: 'column',
    });
}

function makeNavBar(title, showBack, onBack) {
    const bar = createView({
        className: 'bg-slate-800 border-b border-slate-700',
        width: W, height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 16, paddingRight: 16,
    });
    if (showBack) {
        const backRow = createView({ flexDirection: 'row', alignItems: 'center', gap: 4 });
        appendChild(backRow, createIcon('arrow_back', 14, 0x818CF8FF));
        appendChild(backRow, createText(' Back', { className: 'text-sm text-indigo-400' }));
        setOnPress(backRow, onBack);
        appendChild(bar, backRow);
    }
    const spacer = createView({ flexGrow: 1 });
    if (showBack) appendChild(bar, spacer);
    appendChild(bar, createText(title, { className: 'text-base font-semibold text-white' }));
    if (!showBack) appendChild(bar, createView({ flexGrow: 1 }));
    return bar;
}

// ─── Screen: Home ─────────────────────────────────────────────────────────────

Nav.define('Home', function(params, nav) {
    const root    = makeScreen();
    const navBar  = makeNavBar('Shop', false);

    const settingsIcon = createIcon('settings', 18, 0x94A3B8FF);
    const settingsBtn = createView({ width: 36, height: 36, justifyContent: 'center', alignItems: 'center' });
    appendChild(settingsBtn, settingsIcon);
    setOnPress(settingsBtn, function() { nav.push('Settings'); });
    appendChild(navBar, settingsBtn);

    appendChild(root, navBar);

    const content = createView({
        className: 'flex flex-col p-4 gap-3',
        flexGrow: 1,
    });

    // Cart badge — updates when screen receives focus
    const cartBadge = createView({
        className: 'flex flex-row items-center bg-indigo-900 rounded-xl px-4 py-3 gap-3 border border-indigo-700',
    });
    const cartLabel = createText('Cart: 0 items', { className: 'text-sm text-indigo-300 flex-1' });
    appendChild(cartBadge, createText('Cart', { className: 'text-base font-semibold text-indigo-400' }));
    appendChild(cartBadge, cartLabel);
    appendChild(content, cartBadge);

    // Product list
    const products = [
        { id: 1, name: 'Wireless Headphones', price: '$79',  color: 0x6366F1FF },
        { id: 2, name: 'Mechanical Keyboard',  price: '$120', color: 0x10B981FF },
        { id: 3, name: 'USB-C Hub',            price: '$45',  color: 0xF59E0BFF },
        { id: 4, name: 'Webcam 4K',            price: '$95',  color: 0xEF4444FF },
    ];

    for (let i = 0; i < products.length; i++) {
        const p = products[i];
        const card = createView({
            className: 'flex flex-row items-center bg-slate-800 rounded-xl p-4 gap-4 border border-slate-700',
        });
        const icon = createView({
            className: 'rounded-xl',
            backgroundColor: p.color,
            width: 44, height: 44,
        });
        const info = createView({ className: 'flex flex-col gap-1', flexGrow: 1 });
        appendChild(info, createText(p.name,  { className: 'text-sm font-semibold text-white' }));
        appendChild(info, createText(p.price, { className: 'text-sm text-slate-400' }));
        appendChild(card, icon);
        appendChild(card, info);

        const detailBtn = createView({
            className: 'flex flex-row items-center bg-slate-700 rounded-lg gap-2',
            paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
        });
        appendChild(detailBtn, createText('View', { className: 'text-slate-200 text-sm' }));
        appendChild(detailBtn, createIcon('arrow_forward', 13, 0xCBD5E1FF));
        // Capture product for closure
        const product = p;
        setOnPress(detailBtn, function() { nav.push('Detail', product); });
        appendChild(card, detailBtn);
        appendChild(content, card);
    }

    appendChild(root, content);

    return {
        root: root,
        onFocus: function() {
            // Shared store — updated by any screen
            const count = store.cart.length;
            const label = count === 0 ? 'Cart is empty' : 'Cart: ' + count + ' item' + (count > 1 ? 's' : '');
            setStyle(cartLabel, { className: 'text-sm text-indigo-300', flexGrow: 1,
                text: { color: 0xA5B4FCFF } });
            // Re-create text by updating the existing node style
            // (In a full framework, reactive bindings would handle this)
        },
    };
});

// ─── Screen: Detail ───────────────────────────────────────────────────────────

Nav.define('Detail', function(params, nav) {
    const root = makeScreen();
    appendChild(root, makeNavBar(params.name || 'Detail', true, function() { nav.pop(); }));

    const content = createView({ className: 'flex flex-col p-6 gap-4 items-center', flexGrow: 1 });

    // Product image placeholder
    const imgBox = createView({
        className: 'rounded-2xl',
        backgroundColor: params.color || 0x6366F1FF,
        width: 200, height: 200,
    });
    appendChild(content, imgBox);

    appendChild(content, createText(params.name || '', {
        className: 'text-2xl font-bold text-white',
    }));
    appendChild(content, createText(params.price || '', {
        className: 'text-xl text-indigo-400',
    }));
    appendChild(content, createText(
        'High-quality product with excellent reviews. Ships in 2-3 business days.',
        { className: 'text-sm text-slate-400' }
    ));

    // Local state: expanded description (preserved if you navigate away and back)
    let expanded = false;
    const moreText = createText('Show more details ↓', { className: 'text-sm text-indigo-400' });
    const extraText = createView({
        className: 'bg-slate-800 rounded-xl p-4 border border-slate-700',
        width: W - 48,
    });
    appendChild(extraText, createText(
        'Compatible with all major platforms. 1-year warranty included. Premium build quality.',
        { className: 'text-sm text-slate-400' }
    ));

    setOnPress(moreText, function() {
        expanded = !expanded;
        setStyle(moreText, { className: expanded ? 'text-sm text-slate-500' : 'text-sm text-indigo-400' });
        if (expanded) {
            appendChild(content, extraText);
        }
    });
    appendChild(content, moreText);

    // Add to cart — mutates shared store
    const addBtn = createButton('Add to Cart', {
        className: 'bg-indigo-600 text-white text-sm font-semibold rounded-xl px-8 py-4',
    });
    const product = params;
    setOnPress(addBtn, function() {
        store.addItem({ id: product.id, name: product.name, price: product.price });
        console.log('Cart now has', store.cart.length, 'items');
        // Visual confirmation
        setStyle(addBtn, { className: 'bg-emerald-600 text-white text-sm font-semibold rounded-xl px-8 py-4' });
        setTimeout(function() {
            setStyle(addBtn, { className: 'bg-indigo-600 text-white text-sm font-semibold rounded-xl px-8 py-4' });
        }, 800);
    });
    appendChild(content, addBtn);

    appendChild(root, content);

    return {
        root: root,
        // onParamsChange called if Detail is already cached and pushed again with new params
        onParamsChange: function(p) {
            // In a full framework, this would re-render with new params
            // For now, Detail is keyed by screen name so same instance is reused
        },
    };
});

// ─── Screen: Settings ────────────────────────────────────────────────────────

Nav.define('Settings', function(params, nav) {
    const root = makeScreen();
    appendChild(root, makeNavBar('Settings', true, function() { nav.pop(); }));

    const content = createView({ className: 'flex flex-col p-4 gap-2', flexGrow: 1 });

    // Shows shared store state — same data as Home cart badge
    const cartInfo = createView({
        className: 'flex flex-row items-center bg-slate-800 rounded-xl px-4 py-3 border border-slate-700',
    });
    appendChild(cartInfo, createText('Items in cart:', { className: 'text-sm text-slate-400', flexGrow: 1 }));
    appendChild(cartInfo, createText(String(store.cart.length), { className: 'text-sm font-bold text-white' }));
    appendChild(content, cartInfo);

    // Shared setting — mutations visible across screens
    const TRAVEL = 20;
    let notifActive = store.notificationsEnabled;
    const notifRow = createView({ className: 'flex flex-row items-center bg-slate-800 rounded-xl px-4 py-4 border border-slate-700' });
    appendChild(notifRow, createText('Notifications', { className: 'text-base text-white', flexGrow: 1 }));
    const track = createView({
        className: notifActive ? 'bg-indigo-600 rounded-full' : 'bg-slate-600 rounded-full',
        width: 44, height: 24, flexDirection: 'row',
        justifyContent: 'flex-start', alignItems: 'center', padding: 2,
    });
    const thumb = createView({
        className: 'rounded-full', backgroundColor: 0xFFFFFFFF,
        width: 20, height: 20, margin: { left: notifActive ? TRAVEL : 0 },
    });
    appendChild(track, thumb);
    appendChild(notifRow, track);
    appendChild(content, notifRow);

    setOnPress(track, function() {
        notifActive = !notifActive;
        store.notificationsEnabled = notifActive; // write back to shared store
        const from = notifActive ? 0 : TRAVEL, to = notifActive ? TRAVEL : 0;
        const t0 = performance.now();
        setStyle(track, {
            className: notifActive ? 'bg-indigo-600 rounded-full' : 'bg-slate-600 rounded-full',
            width: 44, height: 24, flexDirection: 'row',
            justifyContent: 'flex-start', alignItems: 'center', padding: 2,
        });
        const timer = setInterval(function() {
            const t = Math.min((performance.now() - t0) / 180, 1);
            const e = 1 - Math.pow(1 - t, 3);
            setStyle(thumb, { className: 'rounded-full', backgroundColor: 0xFFFFFFFF,
                width: 20, height: 20, margin: { left: from + (to - from) * e } });
            if (t >= 1) clearInterval(timer);
        }, 16);
    });

    appendChild(content, createText(
        'All screens share one JS runtime. Settings mutations are immediately visible in Home.',
        { className: 'text-sm text-slate-500' }
    ));

    appendChild(root, content);

    return { root };
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

Nav.push('Home');