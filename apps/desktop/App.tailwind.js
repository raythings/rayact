// raym3 v2 — multi-page Tailwind CSS demo

initRaylib(900, 650, "Rayact - Tailwind CSS");
importCSS('./apps/desktop/tailwind.css');

// ─── navigation ───────────────────────────────────────────────────────────────

const pageRoots = {};

function navigate(page) {
    setRootNode(pageRoots[page]);
}

// ─── shared shell ─────────────────────────────────────────────────────────────

function buildHeader() {
    const header = createView({ className: 'flex flex-row items-center bg-slate-800 px-6 py-4 border-b border-slate-700' });
    appendChild(header, createText("rayact", { className: 'text-xl font-bold text-indigo-400' }));
    appendChild(header, createView({ className: 'flex-1' }));
    appendChild(header, createText("Docs", { className: 'text-sm text-slate-400 px-3' }));
    appendChild(header, createText("GitHub", { className: 'text-sm text-slate-400 px-3' }));
    return header;
}

function buildSidebar(activePage) {
    const sidebar = createView({ className: 'flex flex-col bg-slate-800 w-48 py-4 gap-1' });
    const items = [
        { id: 'dashboard',  label: 'Dashboard' },
        { id: 'components', label: 'Components' },
        { id: 'settings',   label: 'Settings' },
        { id: 'profile',    label: 'Profile' },
    ];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const isActive = item.id === activePage;
        const row = createView({
            className: isActive
                ? 'flex flex-row items-center px-4 py-2 mx-2 rounded-lg bg-indigo-600'
                : 'flex flex-row items-center px-4 py-2 mx-2 rounded-lg',
        });
        appendChild(row, createText(item.label, {
            className: isActive ? 'text-white text-sm font-medium' : 'text-slate-400 text-sm',
        }));
        appendChild(sidebar, row);
        const pageId = item.id;
        setOnPress(row, function() { navigate(pageId); });
    }
    return sidebar;
}

function buildShell(activePage, buildContent) {
    const root = createView({ className: 'flex flex-col bg-slate-900', width: 900, height: 650 });
    appendChild(root, buildHeader());
    const body = createView({ className: 'flex flex-row flex-1' });
    appendChild(body, buildSidebar(activePage));
    const main = createView({ className: 'flex flex-col flex-1 p-8 gap-6 overflow-hidden' });
    buildContent(main);
    appendChild(body, main);
    appendChild(root, body);
    return root;
}

// ─── dashboard ────────────────────────────────────────────────────────────────

pageRoots['dashboard'] = buildShell('dashboard', function(main) {
    const hero = createView({ className: 'flex flex-col bg-slate-800 rounded-2xl p-8 gap-4 border border-slate-700' });
    appendChild(hero, createText("Tailwind CSS in rayact", { className: 'text-3xl font-bold text-white' }));
    appendChild(hero, createText("Pre-compiled utility classes via importCSS(). Navigate with the sidebar.", { className: 'text-base text-slate-400' }));
    const startBtn = createButton("Explore Components", { className: 'bg-indigo-600 text-white text-sm font-semibold rounded-lg px-6 py-3' });
    setOnPress(startBtn, function() { navigate('components'); });
    appendChild(hero, startBtn);
    appendChild(main, hero);

    const stats = createView({ className: 'flex flex-row gap-4' });
    const statData = [
        { label: 'Pages',      value: '4' },
        { label: 'CSS Rules',  value: '130+' },
        { label: 'Render',     value: '60fps' },
    ];
    for (let i = 0; i < statData.length; i++) {
        const s = statData[i];
        const card = createView({ className: 'flex flex-col flex-1 bg-slate-800 rounded-xl p-6 gap-1 border border-slate-700' });
        appendChild(card, createText(s.value, { className: 'text-2xl font-bold text-indigo-400' }));
        appendChild(card, createText(s.label,  { className: 'text-sm text-slate-500' }));
        appendChild(stats, card);
    }
    appendChild(main, stats);

    const alert = createView({ className: 'flex flex-row items-center bg-emerald-900 border border-emerald-700 rounded-xl px-5 py-4 gap-3' });
    appendChild(alert, createText("CSS classes resolved from compiled Tailwind output.", { className: 'text-sm text-emerald-300' }));
    appendChild(main, alert);
});

// ─── components ───────────────────────────────────────────────────────────────

pageRoots['components'] = buildShell('components', function(main) {
    appendChild(main, createText("Components", { className: 'text-3xl font-bold text-white' }));

    // Buttons
    const btnCard = createView({ className: 'flex flex-col bg-slate-800 rounded-xl p-6 gap-4 border border-slate-700' });
    appendChild(btnCard, createText("Buttons", { className: 'text-base font-semibold text-slate-400' }));
    const btnRow = createView({ className: 'flex flex-row gap-3 items-center' });

    const primary = createButton("Primary", { className: 'bg-indigo-600 text-white text-sm rounded-lg px-4 py-2' });
    setOnPress(primary, function() { console.log("Primary clicked"); });
    const secondary = createButton("Secondary", { className: 'bg-slate-700 text-slate-200 text-sm rounded-lg px-4 py-2' });
    setOnPress(secondary, function() { console.log("Secondary clicked"); });
    const danger = createButton("Danger", { className: 'bg-red-600 text-white text-sm rounded-lg px-4 py-2' });
    setOnPress(danger, function() { console.log("Danger clicked"); });

    appendChild(btnRow, primary);
    appendChild(btnRow, secondary);
    appendChild(btnRow, danger);
    appendChild(btnCard, btnRow);
    appendChild(main, btnCard);

    // Cards
    const cardSection = createView({ className: 'flex flex-col bg-slate-800 rounded-xl p-6 gap-4 border border-slate-700' });
    appendChild(cardSection, createText("Cards", { className: 'text-base font-semibold text-slate-400' }));
    const cardRow = createView({ className: 'flex flex-row gap-4' });
    const cards = [
        { title: 'Design',  sub: 'Layout & spacing',   color: 'text-indigo-400' },
        { title: 'Build',   sub: 'Components & logic',  color: 'text-emerald-400' },
        { title: 'Ship',    sub: 'Deploy & monitor',    color: 'text-yellow-400' },
    ];
    for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        const card = createView({ className: 'flex flex-col flex-1 bg-slate-900 rounded-lg p-4 gap-2 border border-slate-700' });
        appendChild(card, createText(c.title, { className: 'text-base font-semibold ' + c.color }));
        appendChild(card, createText(c.sub,   { className: 'text-sm text-slate-400' }));
        appendChild(cardRow, card);
    }
    appendChild(cardSection, cardRow);
    appendChild(main, cardSection);
});

// ─── settings ─────────────────────────────────────────────────────────────────

pageRoots['settings'] = buildShell('settings', function(main) {
    appendChild(main, createText("Settings", { className: 'text-3xl font-bold text-white' }));

    const panel = createView({ className: 'flex flex-col bg-slate-800 rounded-xl border border-slate-700 overflow-hidden' });
    const rows = [
        { label: 'Notifications', sub: 'Receive desktop alerts',  active: true  },
        { label: 'Dark mode',     sub: 'Use dark color scheme',    active: true  },
        { label: 'Auto-save',     sub: 'Save changes automatically', active: false },
        { label: 'Analytics',     sub: 'Share usage data',         active: false },
    ];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const row = createView({ className: 'flex flex-row items-center px-6 py-4 border-b border-slate-700' });

        const labelGroup = createView({ className: 'flex flex-col flex-1 gap-1' });
        appendChild(labelGroup, createText(r.label, { className: 'text-base text-white' }));
        appendChild(labelGroup, createText(r.sub,   { className: 'text-sm text-slate-400' }));
        appendChild(row, labelGroup);

        let active = r.active;
        const THUMB_TRAVEL = 20; // 44 - 20 - 2*padding(2)
        const ANIM_MS = 180;

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
            margin: { left: active ? THUMB_TRAVEL : 0 },
        });
        appendChild(track, thumb);
        appendChild(row, track);
        appendChild(panel, row);

        let animTimer = null;
        setOnPress(track, function() {
            active = !active;
            const fromMargin = active ? 0 : THUMB_TRAVEL;
            const toMargin   = active ? THUMB_TRAVEL : 0;
            const startMs = performance.now();
            setStyle(track, {
                className: active ? 'bg-indigo-600 rounded-full' : 'bg-slate-600 rounded-full',
                width: 44, height: 24,
                flexDirection: 'row',
                justifyContent: 'flex-start',
                alignItems: 'center',
                padding: 2,
            });
            if (animTimer !== null) clearInterval(animTimer);
            animTimer = setInterval(function() {
                const t = Math.min((performance.now() - startMs) / ANIM_MS, 1);
                const eased = 1 - Math.pow(1 - t, 3);
                const m = fromMargin + (toMargin - fromMargin) * eased;
                setStyle(thumb, {
                    className: 'rounded-full',
                    backgroundColor: 0xFFFFFFFF,
                    width: 20, height: 20,
                    margin: { left: m },
                });
                if (t >= 1) { clearInterval(animTimer); animTimer = null; }
            }, 16);
        });
    }
    appendChild(main, panel);

    const saveBtn = createButton("Save Changes", { className: 'bg-indigo-600 text-white text-sm font-semibold rounded-lg px-6 py-3' });
    setOnPress(saveBtn, function() { console.log("Settings saved"); });
    appendChild(main, saveBtn);
});

// ─── profile ─────────────────────────────────────────────────────────────────

pageRoots['profile'] = buildShell('profile', function(main) {
    const card = createView({ className: 'flex flex-col bg-slate-800 rounded-2xl p-8 gap-4 border border-slate-700 items-center' });
    // Clip image to circle: container is rounded-full with overflow hidden,
    // image fills the container via cover scaling
    const avatarContainer = createView({
        className: 'rounded-full',
        width: 80, height: 80,
        overflow: 'hidden',
    });
    const avatar = createImage('./apps/desktop/avatar.png', {
        width: 80, height: 80,
    });
    appendChild(avatarContainer, avatar);
    appendChild(card, avatarContainer);
    appendChild(card, createText("Alex Johnson",    { className: 'text-xl font-bold text-white' }));
    appendChild(card, createText("alex@rayact.dev", { className: 'text-sm text-slate-400' }));
    const editBtn = createButton("Edit Profile", { className: 'bg-slate-700 text-slate-200 text-sm rounded-lg px-6 py-3' });
    setOnPress(editBtn, function() { console.log("Edit profile"); });
    appendChild(card, editBtn);
    appendChild(main, card);

    const statsRow = createView({ className: 'flex flex-row gap-4' });
    const profileStats = [
        { label: 'Projects', value: '12' },
        { label: 'Commits',  value: '847' },
        { label: 'Reviews',  value: '234' },
    ];
    for (let i = 0; i < profileStats.length; i++) {
        const s = profileStats[i];
        const stat = createView({ className: 'flex flex-col flex-1 bg-slate-800 rounded-xl p-6 gap-1 border border-slate-700 items-center' });
        appendChild(stat, createText(s.value, { className: 'text-2xl font-bold text-white' }));
        appendChild(stat, createText(s.label, { className: 'text-sm text-slate-500' }));
        appendChild(statsRow, stat);
    }
    appendChild(main, statsRow);
});

// ─── start ────────────────────────────────────────────────────────────────────

navigate('dashboard');
