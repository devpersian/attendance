/**
 * Minimal in-memory fixed-window rate limiter (no external dependency).
 *
 * Usage:
 *   router.post('/login', rateLimit({ windowMs: 15*60_000, max: 10 }), handler)
 *
 * Keys are bucketed by client IP (optionally + a suffix such as the submitted
 * username) so a brute-force attempt against one account can't exhaust the
 * budget of the whole endpoint for everyone else.
 */

const buckets = new Map();

// Periodic cleanup so the map doesn't grow forever with one-off IPs.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}, 60_000);
sweeper.unref?.();

/**
 * @param {object} opts
 * @param {number} opts.windowMs  window size in milliseconds (default 15 min)
 * @param {number} opts.max       max requests per window (default 20)
 * @param {(req) => string} [opts.keyFn]  extra key builder (e.g. include username)
 * @param {string} [opts.message] Persian response body on 429
 */
export function rateLimit({ windowMs = 15 * 60_000, max = 20, keyFn, message = 'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد تلاش کنید.' } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const suffix = keyFn ? `:${keyFn(req)}` : '';
    const key = `${ip}${suffix}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    // Always expose standard headers so clients/backoff logic can use them.
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }

    next();
  };
}

/** Reset all buckets — exported for tests. */
export function _resetRateLimiter() {
  buckets.clear();
}
