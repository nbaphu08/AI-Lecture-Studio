/** Small async helpers shared by the browser job runner and the tests. */

export const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/** Exponential backoff with jitter: base·2^attempt, scaled by a random factor in [0.5, 1.5). */
export function backoffDelay(attempt: number, baseMs = 2_000, maxMs = 30_000, random: () => number = Math.random): number {
  return Math.min(maxMs, baseMs * 2 ** attempt) * (0.5 + random());
}

/**
 * Run `fn` for every item with at most `limit()` in flight (the limit is re-read before every start,
 * so it can be lowered while running). Results keep the input order. After the first failure no new
 * item is started; running ones finish, then the first error is thrown.
 */
export async function runPool<T, R>(
  items: T[],
  limit: () => number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let active = 0;
  let failure: { error: unknown } | null = null;

  await new Promise<void>((resolve, reject) => {
    const pump = () => {
      if (failure) {
        if (active === 0) reject(failure.error);
        return;
      }
      if (next >= items.length && active === 0) return resolve();
      while (!failure && active < Math.max(1, limit()) && next < items.length) {
        const i = next++;
        active++;
        fn(items[i], i).then(
          (r) => {
            results[i] = r;
            active--;
            pump();
          },
          (e) => {
            failure ??= { error: e };
            active--;
            pump();
          },
        );
      }
    };
    pump();
  });
  return results;
}
