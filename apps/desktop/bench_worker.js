// Quick timing benchmark — no window needed
// Tests how fast QuickJS can do trial division
var N = 100000;
var t0 = Date.now();
var count = 0;

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

for (var n = 2; n < N; n++) {
    if (isPrime(n)) count++;
}

var ms = Date.now() - t0;
print("N=" + N + "  primes=" + count + "  time=" + ms + "ms  rate=" + Math.floor(N/ms*1000) + " nums/s");
