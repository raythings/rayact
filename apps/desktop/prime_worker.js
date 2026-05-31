// Prime worker — trial division over [start, end)
// Receives: initialData = { id, start, end }

var id    = initialData.id;
var start = initialData.start < 2 ? 2 : initialData.start;
var end   = initialData.end;

var CHUNK = 25000;   // report progress every N numbers

function isPrime(n) {
    if (n < 2) return false;
    if (n === 2) return true;
    if ((n & 1) === 0) return false;
    var limit = Math.floor(Math.sqrt(n));
    for (var i = 3; i <= limit; i += 2) {
        if (n % i === 0) return false;
    }
    return true;
}

var count = 0;

for (var n = start; n < end; n++) {
    if (isPrime(n)) count++;

    if (n % CHUNK === 0) {
        postMessage({
            type:    "progress",
            id:      id,
            current: n,
            start:   start,
            end:     end,
            count:   count
        });
    }
}

postMessage({
    type:  "done",
    id:    id,
    start: start,
    end:   end,
    count: count
});
