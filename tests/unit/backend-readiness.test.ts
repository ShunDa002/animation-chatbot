import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BackendReadinessError,
  waitForBackendReady,
} from '@/lib/conversation/backend-readiness';

const createResponse = (status: number, data: unknown = { status }): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('waitForBackendReady (lib/conversation/backend-readiness)', () => {
  it('stops after the first successful response (200 OK)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(createResponse(200));

    const result = await waitForBackendReady({
      endpoint: '/health/ready',
      fetchFn,
    });

    expect(result).toEqual({ status: 'ready', attempts: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(
      '/health/ready',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }),
    );
  });

  it('retries a 503 response and resolves on subsequent 200', async () => {
    vi.useFakeTimers();

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(createResponse(503))
      .mockResolvedValueOnce(createResponse(200));

    const resultPromise = waitForBackendReady({
      endpoint: '/health/ready',
      baseDelayMs: 500,
      maxDelayMs: 10_000,
      fetchFn,
      randomFn: () => 0.5,
    });

    // Retry 0: baseDelay * 2^0 = 500 * 0.5 = 250ms
    await vi.advanceTimersByTimeAsync(250);

    await expect(resultPromise).resolves.toEqual({
      status: 'ready',
      attempts: 2,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('retries retriable HTTP error statuses (408, 425, 429, 500, 502, 504)', async () => {
    vi.useFakeTimers();

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(createResponse(408))
      .mockResolvedValueOnce(createResponse(425))
      .mockResolvedValueOnce(createResponse(429))
      .mockResolvedValueOnce(createResponse(500))
      .mockResolvedValueOnce(createResponse(502))
      .mockResolvedValueOnce(createResponse(504))
      .mockResolvedValueOnce(createResponse(200));

    const resultPromise = waitForBackendReady({
      endpoint: '/health/ready',
      baseDelayMs: 10,
      maxDelayMs: 50,
      fetchFn,
      randomFn: () => 1,
    });

    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(50);
    }

    await expect(resultPromise).resolves.toEqual({
      status: 'ready',
      attempts: 7,
    });
    expect(fetchFn).toHaveBeenCalledTimes(7);
  });

  it('retries network failures (e.g. Failed to fetch)', async () => {
    vi.useFakeTimers();

    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(createResponse(200));

    const resultPromise = waitForBackendReady({
      endpoint: '/health/ready',
      baseDelayMs: 100,
      fetchFn,
      randomFn: () => 1,
    });

    await vi.advanceTimersByTimeAsync(100);

    await expect(resultPromise).resolves.toEqual({
      status: 'ready',
      attempts: 2,
    });
  });

  it('does not retry permanent client error responses (400, 401, 403, 404)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(createResponse(404));

    await expect(
      waitForBackendReady({
        endpoint: '/health/ready',
        fetchFn,
      }),
    ).rejects.toMatchObject({
      name: 'BackendReadinessError',
      causeType: 'permanent-response',
      status: 404,
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('caps the exponential delay at maxDelayMs with full jitter', async () => {
    vi.useFakeTimers();

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(createResponse(503))
      .mockResolvedValueOnce(createResponse(503))
      .mockResolvedValueOnce(createResponse(503))
      .mockResolvedValueOnce(createResponse(200));

    const resultPromise = waitForBackendReady({
      endpoint: '/health/ready',
      baseDelayMs: 1_000,
      maxDelayMs: 1_500,
      fetchFn,
      randomFn: () => 1, // max jitter
    });

    // retry 0: min(1500, 1000 * 1) = 1000ms
    await vi.advanceTimersByTimeAsync(1_000);
    // retry 1: min(1500, 1000 * 2) = 1500ms
    await vi.advanceTimersByTimeAsync(1_500);
    // retry 2: min(1500, 1000 * 4) = 1500ms
    await vi.advanceTimersByTimeAsync(1_500);

    await expect(resultPromise).resolves.toMatchObject({
      status: 'ready',
      attempts: 4,
    });
  });

  it('stops after overallTimeoutMs expires', async () => {
    vi.useFakeTimers();

    const fetchFn = vi.fn().mockResolvedValue(createResponse(503));

    const resultPromise = waitForBackendReady({
      endpoint: '/health/ready',
      baseDelayMs: 500,
      overallTimeoutMs: 1_000,
      fetchFn,
      randomFn: () => 1,
    });

    const assertion = expect(resultPromise).rejects.toMatchObject({
      name: 'BackendReadinessError',
      causeType: 'timeout',
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

  it('stops when the outer signal is aborted', async () => {
    vi.useFakeTimers();

    const controller = new AbortController();
    const fetchFn = vi.fn().mockResolvedValue(createResponse(503));

    const resultPromise = waitForBackendReady({
      endpoint: '/health/ready',
      signal: controller.signal,
      fetchFn,
      randomFn: () => 1,
    });

    const assertion = expect(resultPromise).rejects.toMatchObject({
      name: 'BackendReadinessError',
      causeType: 'aborted',
    });

    await Promise.resolve();
    controller.abort();
    await assertion;
  });

  it('retries when individual request timeout expires', async () => {
    vi.useFakeTimers();

    // First request hangs until aborted by requestTimeoutMs
    const fetchFn = vi
      .fn()
      .mockImplementationOnce((_url, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      })
      .mockResolvedValueOnce(createResponse(200));

    const resultPromise = waitForBackendReady({
      endpoint: '/health/ready',
      requestTimeoutMs: 200,
      baseDelayMs: 100,
      fetchFn,
      randomFn: () => 1,
    });

    // Advance through the requestTimeoutMs (200ms)
    await vi.advanceTimersByTimeAsync(200);
    // Advance through the retry backoff delay (100ms)
    await vi.advanceTimersByTimeAsync(100);

    await expect(resultPromise).resolves.toEqual({
      status: 'ready',
      attempts: 2,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
