/**
 * Best-effort abuse protection. The counters live in the memory of ONE server instance, so on Vercel
 * (many short-lived instances) this only slows down casual repeated use. It is not a global limit and
 * it is not a security boundary: see the README for what to add if you need real protection.
 */
export interface RateLimiter {
  check(key: string): { ok: boolean; retryAfterSec: number };
}

export function createRateLimiter(max: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    check(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - t) / 1000)) };
      }
      recent.push(t);
      hits.set(key, recent);
      if (hits.size > 5_000) {
        for (const [k, v] of hits) if (v.every((x) => t - x >= windowMs)) hits.delete(k);
      }
      return { ok: true, retryAfterSec: 0 };
    },
  };
}
