interface Bucket {
  count: number;
  resetAt: number;
}

export class SlidingMinuteLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly limit: number) {}

  allow(key: string) {
    const now = Date.now();
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + 60_000 });
      return true;
    }

    if (current.count >= this.limit) return false;
    current.count += 1;
    return true;
  }
}
