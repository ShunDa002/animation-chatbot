/**
 * The global daily request ceiling (FR-028, research D7).
 *
 * One integer per UTC day, shared by every visitor. No per-visitor limit exists, and no visitor
 * identifier - address, token, or fingerprint - is derived, transmitted, or stored. That is a
 * deliberate choice from the spec's clarification session: a global ceiling was taken over
 * hashed-address limiting to keep the privacy claim absolute. The accepted cost is that one heavy or
 * automated caller can consume the day's ceiling for everyone.
 *
 * ## Two properties this file exists to guarantee
 *
 * 1. **Atomicity.** The decision is made from the value `INCR` returns, never from a separate read
 *    followed by a write. SC-010 claims usage cannot exceed the ceiling "regardless of traffic
 *    volume", and a read-then-write counter races straight past 150 under exactly the flood SC-010
 *    describes. Vercel functions are horizontally scaled, so this is not a theoretical concern.
 *
 * 2. **Fail closed.** If the store is unreachable the request is refused, never admitted. A missing
 *    counter must never mean unlimited provider spend.
 */

export interface CounterStore {
  /** Atomically increment and return the new value. */
  incr(key: string): Promise<number>;
  /** Undo an increment that turned out to belong to a refused request. */
  decr(key: string): Promise<number>;
  /** Set a TTL in seconds. Best-effort: a missing TTL is not a reason to refuse traffic. */
  expire(key: string, seconds: number): Promise<unknown>;
}

export interface QuotaOptions {
  store: CounterStore;
  limit: number;
  /** Injected so tests are deterministic (constitution II). */
  now?: Date;
}

export interface QuotaVerdict {
  allowed: boolean;
  /** The count this request occupies, when allowed. Useful for logging - it is not visitor data. */
  count?: number;
  reason?: 'ceiling-reached' | 'store-unreachable';
}

/** Slightly over 24 hours, so a day's key expires itself without a sweeper. */
export const KEY_TTL_SECONDS = 90_000;

export function quotaKey(now: Date): string {
  return `quota:${now.toISOString().slice(0, 10)}`;
}

/**
 * Claim one request from today's ceiling.
 *
 * Called before the provider is contacted, and its verdict is what decides whether the provider is
 * contacted at all.
 */
export async function claimRequest({
  store,
  limit,
  now = new Date(),
}: QuotaOptions): Promise<QuotaVerdict> {
  const key = quotaKey(now);

  let count: number;
  try {
    count = await store.incr(key);
  } catch {
    // Fail closed. The visitor sees the temporary-limit message, which is the honest description of
    // what has happened: the demo cannot currently account for its own usage, so it does not spend.
    return { allowed: false, reason: 'store-unreachable' };
  }

  // Set the TTL on the key that was just created. Doing this after the increment rather than before
  // means a failure here cannot refuse a legitimate request; the worst case is a key that lingers,
  // which the next day's increment does not care about.
  if (count === 1) {
    try {
      await store.expire(key, KEY_TTL_SECONDS);
    } catch {
      // A key without a TTL is untidy, not incorrect. Never refuse traffic over it.
    }
  }

  if (count > limit) {
    // This request is refused, so it must not hold a count (contracts/chat-api.md: "A rejected
    // request consumes no count"). Under a sustained flood the counter therefore hovers at the
    // ceiling rather than climbing without bound.
    try {
      await store.decr(key);
    } catch {
      // Losing the decrement leaves the counter one high for the rest of the day - it refuses
      // slightly early, which is the safe direction to be wrong in.
    }
    return { allowed: false, reason: 'ceiling-reached' };
  }

  return { allowed: true, count };
}

/**
 * The real store: one integer in Upstash Redis, provisioned by the Vercel integration.
 *
 * Returns null when the store is not configured. The caller must treat that as fail-closed, exactly
 * as it treats an unreachable store - a demo that cannot count its own usage does not spend (D7).
 */
export async function upstashStore(
  env: Record<string, string | undefined>,
): Promise<CounterStore | null> {
  const url = env.KV_REST_API_URL?.trim();
  const token = env.KV_REST_API_TOKEN?.trim();
  if (!url || !token) return null;

  // Imported lazily so the unit tests, which inject their own store, never load the client.
  const { Redis } = await import('@upstash/redis');
  const redis = new Redis({ url, token });

  return {
    incr: (key) => redis.incr(key),
    decr: (key) => redis.decr(key),
    expire: (key, seconds) => redis.expire(key, seconds),
  };
}

/** Read `DAILY_REQUEST_LIMIT`, defaulting to the 150 the spec settled on (FR-028). */
export function configuredLimit(env: Record<string, string | undefined>): number {
  const raw = env.DAILY_REQUEST_LIMIT;
  if (raw === undefined || raw.trim() === '') return 150;
  const parsed = Number(raw);
  // A malformed limit must not silently become Infinity or NaN. Fall back to the spec's number.
  if (!Number.isFinite(parsed) || parsed < 0) return 150;
  return Math.floor(parsed);
}
