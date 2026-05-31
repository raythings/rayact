// Multi-threaded prime benchmark
// Spawns 4 JS workers computing primes in parallel.
// Each worker runs on its own OS thread with an isolated QuickJS runtime.
// The render loop stays at 60fps throughout — workers never block the main thread.
//
// Run from rayact/build/:
//   ./bin/rayact_desktop worker_test.js

initRaylib(860, 660, "Rayact — Multi-threaded Prime Benchmark");

// ── Palette ──────────────────────────────────────────────────────────────────
var BG       = 0x0f0f1aff;
var PANEL    = 0x181828ff;
var TRACK    = 0x252540ff;
var BAR_BLUE = 0x3a7bd5ff;
var BAR_DONE = 0x2ecc71ff;
var C_WHITE  = 0xeeeeeeff;
var C_DIM    = 0x7777aaff;
var C_YELLOW = 0xf1c40fff;

// ── Layout constants ──────────────────────────────────────────────────────────
var N_WORKERS = 4;
var RANGE     = 500000;    // numbers per worker — heavy enough for visible parallelism
var BAR_MAX   = 420;       // max progress bar px width

// ── Build raym3 UI ────────────────────────────────────────────────────────────
var root = createView({
    flexDirection: "column",
    gap: 14,
    padding: 28,
    backgroundColor: BG
});

var title = createText("Prime Number Benchmark — " + N_WORKERS + " Parallel Workers", {
    text: { fontSize: 20, color: C_WHITE }
});
appendChild(root, title);

var subtitle = createText(
    "Each worker: trial division over " + (RANGE / 1000) + "K consecutive integers",
    { text: { fontSize: 13, color: C_DIM } }
);
appendChild(root, subtitle);

// One row per worker
var bars        = [];   // bar node IDs
var barStyles   = [];   // mutable style objects (setStyle needs full object each call)
var workerIds   = [];   // rawWorker IDs returned by spawnWorker
var workerMeta  = [];   // { start, end, done }

for (var i = 0; i < N_WORKERS; i++) {
    var wStart = i * RANGE + 2;
    var wEnd   = wStart + RANGE;

    var row = createView({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: PANEL,
        padding: 10,
        borderRadius: 6
    });

    var label = createText(
        "Worker " + (i + 1) + "   " +
        (wStart / 1000).toFixed(0) + "K – " + (wEnd / 1000).toFixed(0) + "K",
        { width: 160, text: { fontSize: 13, color: C_DIM } }
    );

    var track = createView({
        width: BAR_MAX,
        height: 18,
        backgroundColor: TRACK,
        borderRadius: 9
    });

    var style = { width: 0, height: 18, backgroundColor: BAR_BLUE, borderRadius: 9 };
    var bar   = createView(style);
    barStyles.push(style);
    bars.push(bar);

    appendChild(track, bar);
    appendChild(row, label);
    appendChild(row, track);
    appendChild(root, row);

    workerMeta.push({ start: wStart, end: wEnd, done: false });
}

var statusNode = createText("Spawning workers...", {
    text: { fontSize: 14, color: C_YELLOW }
});
appendChild(root, statusNode);

// ── GIF player section ────────────────────────────────────────────────────────
var gifRow = createView({
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: PANEL,
    padding: 10,
    borderRadius: 6
});

var gifLabel = createText("GIF Player\n(worker canvas)", {
    width: 160,
    text: { fontSize: 13, color: C_DIM }
});
appendChild(gifRow, gifLabel);
appendChild(root, gifRow);

setRootNode(root);

// ── Spawn workers ─────────────────────────────────────────────────────────────
var t0          = Date.now();
var doneCount   = 0;
var totalPrimes = 0;

for (var i = 0; i < N_WORKERS; i++) {
    var wid = spawnWorker(
        "../apps/desktop/prime_worker.js",
        { id: i, start: workerMeta[i].start, end: workerMeta[i].end }
    );
    workerIds.push(wid);
}

// Spawn GIF worker — sends "ready" with dimensions, then loops presenting frames
var gifWorkerId   = spawnWorker("../apps/desktop/gif_worker.js", {
    path:  "../apps/desktop/frog.gif",
    delay: 80
});
var gifViewReady = false;

console.log("Spawned " + N_WORKERS + " prime workers + 1 GIF worker. Render loop stays live at 60fps.");

// ── Message handler ───────────────────────────────────────────────────────────
onWorkerMessage = function(wid, data) {
    // GIF worker: "ready" fires once; subsequent CanvasReady frames are GPU-only
    if (wid === gifWorkerId) {
        if (data.type === "ready" && !gifViewReady) {
            gifViewReady = true;
            var viewId = createWorkerView(gifWorkerId, data.width, data.height);
            appendChild(gifRow, viewId);
        }
        return;
    }

    // Map raw worker ID back to prime-worker slot index
    var slot = workerIds.indexOf(wid);
    if (slot < 0) return;

    var meta  = workerMeta[slot];
    var style = barStyles[slot];
    var bar   = bars[slot];

    if (data.type === "progress") {
        var pct  = (data.current - meta.start) / (meta.end - meta.start);
        var newW = Math.floor(pct * BAR_MAX);
        if (newW < 0) newW = 0;
        if (newW > BAR_MAX) newW = BAR_MAX;

        style.width = newW;
        setStyle(bar, style);
    }

    if (data.type === "done") {
        style.width           = BAR_MAX;
        style.backgroundColor = BAR_DONE;
        setStyle(bar, style);
        meta.done = true;

        doneCount++;
        totalPrimes += data.count;

        var elapsed = ((Date.now() - t0) / 1000).toFixed(2);
        console.log(
            "Worker " + (slot + 1) + " done — " + data.count +
            " primes in [" + (meta.start / 1000).toFixed(0) + "K, " +
            (meta.end / 1000).toFixed(0) + "K)   (" + elapsed + "s elapsed)"
        );

        if (doneCount === N_WORKERS) {
            var total = totalPrimes;
            var time  = ((Date.now() - t0) / 1000).toFixed(2);
            console.log("=== ALL DONE === " + total + " total primes in " + time + "s");
            console.log("(Single-threaded would take ~" + (parseFloat(time) * N_WORKERS).toFixed(1) + "s)");
        }
    }
};
