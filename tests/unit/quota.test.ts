import { describe, expect, it } from 'vitest';
import {
  claimRequest,
  configuredLimit,
  KEY_TTL_SECONDS,
  quotaKey,
  type CounterStore,
} from '@/lib/server/quota';

/**
 * T039 and T039a. The clock is injected and the store is a stub, so nothing here touches the
 * network or the wall clock (constitution II).
 */

interface Stub extends CounterStore {
  counts: Map<string, number>;
  expiries: Map<string, number>;
  incrCalls: number;
}

function stubStore(initial: Record<string, number> = {}): Stub {
  const counts = new Map(Object.entries(initial));
  const expiries = new Map<string, number>();
  return {
    counts,
    expiries,
    incrCalls: 0,
    async incr(key) {
      this.incrCalls += 1;
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
    async decr(key) {
      const next = (counts.get(key) ?? 0) - 1;
      counts.set(key, next);
      return next;
    },
    async expire(key, seconds) {
      expiries.set(key, seconds);
      return 1;
    },
  };
}

function brokenStore(): CounterStore {
  return {
    async incr() {
      throw new Error('ECONNREFUSED - store unreachable');
    },
    async decr() {
      throw new Error('ECONNREFUSED - store unreachable');
    },
    async expire() {
      throw new Error('ECONNREFUSED - store unreachable');
    },
  };
}

const NOON = new Date('2026-08-31T12:00:00.000Z');

describe('the key', () => {
  it('is one integer per UTC day', () => {
    expect(quotaKey(NOON)).toBe('quota:2026-08-31');
  });

  it('rolls over on the UTC day, not the local one', () => {
    expect(quotaKey(new Date('2026-08-31T23:59:59.000Z'))).toBe('quota:2026-08-31');
    expect(quotaKey(new Date('2026-09-01T00:00:00.000Z'))).toBe('quota:2026-09-01');
  });

  it('holds no visitor data of any kind', () => {
    // The key is derived from the date and nothing else. There is no argument that could carry an
    // address, a token, or a fingerprint into it (FR-028, the clarification session's choice).
    expect(quotaKey(NOON)).toMatch(/^quota:\d{4}-\d{2}-\d{2}$/);
  });
});

describe('claiming a request', () => {
  it('admits the first request and reports its count', async () => {
    const store = stubStore();
    const verdict = await claimRequest({ store, limit: 150, now: NOON });
    expect(verdict.allowed).toBe(true);
    expect(verdict.count).toBe(1);
  });

  it('sets a TTL just over 24 hours when the key is created, so it expires itself', async () => {
    const store = stubStore();
    await claimRequest({ store, limit: 150, now: NOON });
    expect(store.expiries.get('quota:2026-08-31')).toBe(KEY_TTL_SECONDS);
    expect(KEY_TTL_SECONDS).toBeGreaterThan(86_400);
  });

  it('does not re-set the TTL on subsequent requests', async () => {
    const store = stubStore({ 'quota:2026-08-31': 5 });
    await claimRequest({ store, limit: 150, now: NOON });
    expect(store.expiries.size).toBe(0);
  });

  it('admits the 150th request and refuses the 151st', async () => {
    const store = stubStore({ 'quota:2026-08-31': 149 });

    const onFiftieth = await claimRequest({ store, limit: 150, now: NOON });
    expect(onFiftieth.allowed).toBe(true);
    expect(onFiftieth.count).toBe(150);

    const over = await claimRequest({ store, limit: 150, now: NOON });
    expect(over.allowed).toBe(false);
    expect(over.reason).toBe('ceiling-reached');
  });

  it('does not let a refused request hold a count', async () => {
    const store = stubStore({ 'quota:2026-08-31': 150 });
    await claimRequest({ store, limit: 150, now: NOON });
    expect(store.counts.get('quota:2026-08-31')).toBe(150);
  });

  it('does not climb without bound under sustained refusal', async () => {
    const store = stubStore({ 'quota:2026-08-31': 150 });
    for (let i = 0; i < 50; i += 1) {
      await claimRequest({ store, limit: 150, now: NOON });
    }
    expect(store.counts.get('quota:2026-08-31')).toBe(150);
  });

  it('fails CLOSED when the store is unreachable (D7)', async () => {
    const verdict = await claimRequest({ store: brokenStore(), limit: 150, now: NOON });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe('store-unreachable');
  });

  it('refuses everything when the limit is zero', async () => {
    const store = stubStore();
    const verdict = await claimRequest({ store, limit: 0, now: NOON });
    expect(verdict.allowed).toBe(false);
  });
});

describe('T039a: atomicity under concurrent load (SC-010)', () => {
  it('admits at most the remaining ceiling when 40 requests arrive at once', async () => {
    // 10 remaining. SC-010 claims usage cannot exceed the ceiling regardless of traffic volume, so
    // a flood must not admit 40. A read-then-compare implementation fails this test, which is
    // exactly why it exists.
    const store = stubStore({ 'quota:2026-08-31': 140 });

    const verdicts = await Promise.all(
      Array.from({ length: 40 }, () => claimRequest({ store, limit: 150, now: NOON })),
    );

    const admitted = verdicts.filter((v) => v.allowed);
    expect(admitted).toHaveLength(10);
    expect(store.incrCalls).toBe(40);
  });

  it('gives every admitted request a distinct count, so none shares a slot', async () => {
    const store = stubStore({ 'quota:2026-08-31': 140 });
    const verdicts = await Promise.all(
      Array.from({ length: 40 }, () => claimRequest({ store, limit: 150, now: NOON })),
    );
    const counts = verdicts.filter((v) => v.allowed).map((v) => v.count);
    expect(new Set(counts).size).toBe(counts.length);
  });

  it('leaves the counter at the ceiling, not above it, after the flood', async () => {
    const store = stubStore({ 'quota:2026-08-31': 140 });
    await Promise.all(
      Array.from({ length: 40 }, () => claimRequest({ store, limit: 150, now: NOON })),
    );
    expect(store.counts.get('quota:2026-08-31')).toBe(150);
  });
});

describe('configuredLimit', () => {
  it.each([
    [{}, 150],
    [{ DAILY_REQUEST_LIMIT: '' }, 150],
    [{ DAILY_REQUEST_LIMIT: '25' }, 25],
    [{ DAILY_REQUEST_LIMIT: '0' }, 0],
    [{ DAILY_REQUEST_LIMIT: 'lots' }, 150],
    [{ DAILY_REQUEST_LIMIT: '-5' }, 150],
    [{ DAILY_REQUEST_LIMIT: '12.7' }, 12],
  ])('reads %o as %i', (env, expected) => {
    expect(configuredLimit(env)).toBe(expected);
  });

  it('never resolves to Infinity, so no env value can switch the ceiling off', () => {
    expect(configuredLimit({ DAILY_REQUEST_LIMIT: 'Infinity' })).toBe(150);
    expect(Number.isFinite(configuredLimit({ DAILY_REQUEST_LIMIT: '1e999' }))).toBe(true);
  });
});
