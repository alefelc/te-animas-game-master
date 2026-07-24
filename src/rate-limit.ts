interface Bucket {
  count: number;
  resetAt: number;
}

export class SlidingMinuteLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private operations = 0;

  constructor(
    private readonly limit: number,
    private readonly maxBuckets = 50_000,
  ) {}

  allow(key: string) {
    const now = Date.now();
    this.operations += 1;
    if (
      this.operations % 128 === 0 ||
      (!this.buckets.has(key) && this.buckets.size >= this.maxBuckets)
    ) {
      for (const [bucketKey, bucket] of this.buckets) {
        if (bucket.resetAt <= now) this.buckets.delete(bucketKey);
      }
    }

    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      if (!current && this.buckets.size >= this.maxBuckets) return false;
      this.buckets.set(key, { count: 1, resetAt: now + 60_000 });
      return true;
    }

    if (current.count >= this.limit) return false;
    current.count += 1;
    return true;
  }
}
