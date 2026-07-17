export class SlidingMinuteLimiter {
    limit;
    buckets = new Map();
    constructor(limit) {
        this.limit = limit;
    }
    allow(key) {
        const now = Date.now();
        const current = this.buckets.get(key);
        if (!current || current.resetAt <= now) {
            this.buckets.set(key, { count: 1, resetAt: now + 60_000 });
            return true;
        }
        if (current.count >= this.limit)
            return false;
        current.count += 1;
        return true;
    }
}
//# sourceMappingURL=rate-limit.js.map