# Frontend Backend-Readiness Handling

## Purpose

When the frontend starts, it should check `GET /health/ready` before beginning backend-dependent work. If the backend is unavailable or still starting, the frontend retries with bounded exponential backoff and jitter. Polling stops as soon as the backend returns `200 OK`.

The readiness check should remain separate from normal application requests. It is a startup coordination mechanism, not a replacement for ordinary error handling.

## Frontend implementation

The following TypeScript-style implementation is framework-neutral. It can be called from the frontend's startup lifecycle and connected to the application's loading, ready, and unavailable states.

```ts
type ReadinessOptions = {
  endpoint: string;
  baseDelayMs?: number;
  maxDelayMs?: number;
  requestTimeoutMs?: number;
  overallTimeoutMs?: number;
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
  randomFn?: () => number;
};

type ReadinessResult = {
  status: "ready";
  attempts: number;
};

export class BackendReadinessError extends Error {
  constructor(
    message: string,
    public readonly causeType:
      | "timeout"
      | "aborted"
      | "permanent-response",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "BackendReadinessError";
  }
}

const sleep = (delayMs: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Operation aborted", "AbortError"));
      return;
    }

    const timer = window.setTimeout(resolve, delayMs);

    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Operation aborted", "AbortError"));
      },
      { once: true },
    );
  });

const isRetriableStatus = (status: number): boolean =>
  status === 408 || status === 425 || status === 429 || status >= 500;

const calculateDelay = (
  retryIndex: number,
  baseDelayMs: number,
  maxDelayMs: number,
  randomFn: () => number,
): number => {
  const exponentialLimit = Math.min(
    maxDelayMs,
    baseDelayMs * 2 ** retryIndex,
  );

  // Full jitter: select a delay between zero and the bounded limit.
  return Math.floor(randomFn() * exponentialLimit);
};

const checkOnce = async (
  endpoint: string,
  requestTimeoutMs: number,
  outerSignal: AbortSignal,
  fetchFn: typeof fetch,
): Promise<Response> => {
  const requestController = new AbortController();
  const abortRequest = () => requestController.abort();
  const timer = window.setTimeout(abortRequest, requestTimeoutMs);

  outerSignal.addEventListener("abort", abortRequest, { once: true });

  try {
    return await fetchFn(endpoint, {
      method: "GET",
      cache: "no-store",
      signal: requestController.signal,
      headers: {
        Accept: "application/json",
      },
    });
  } finally {
    window.clearTimeout(timer);
    outerSignal.removeEventListener("abort", abortRequest);
  }
};

export async function waitForBackendReady(
  options: ReadinessOptions,
): Promise<ReadinessResult> {
  const {
    endpoint,
    baseDelayMs = 500,
    maxDelayMs = 10_000,
    requestTimeoutMs = 3_000,
    overallTimeoutMs = 120_000,
    signal,
    fetchFn = fetch,
    randomFn = Math.random,
  } = options;

  const overallController = new AbortController();
  let overallTimedOut = false;

  const abortOverall = () => overallController.abort();
  signal?.addEventListener("abort", abortOverall, { once: true });

  const overallTimer = window.setTimeout(() => {
    overallTimedOut = true;
    overallController.abort();
  }, overallTimeoutMs);

  let attempts = 0;
  let retryIndex = 0;

  try {
    while (true) {
      if (overallController.signal.aborted) {
        throw new BackendReadinessError(
          overallTimedOut
            ? "Backend readiness check timed out."
            : "Backend readiness check was aborted.",
          overallTimedOut ? "timeout" : "aborted",
        );
      }

      attempts += 1;

      try {
        const response = await checkOnce(
          endpoint,
          requestTimeoutMs,
          overallController.signal,
          fetchFn,
        );

        if (response.ok) {
          return { status: "ready", attempts };
        }

        if (!isRetriableStatus(response.status)) {
          throw new BackendReadinessError(
            `Readiness endpoint returned HTTP ${response.status}.`,
            "permanent-response",
            response.status,
          );
        }
      } catch (error) {
        if (error instanceof BackendReadinessError) {
          throw error;
        }

        if (overallController.signal.aborted) {
          throw new BackendReadinessError(
            overallTimedOut
              ? "Backend readiness check timed out."
              : "Backend readiness check was aborted.",
            overallTimedOut ? "timeout" : "aborted",
          );
        }

        // Network errors and individual request timeouts are retriable.
      }

      const delayMs = calculateDelay(
        retryIndex,
        baseDelayMs,
        maxDelayMs,
        randomFn,
      );

      retryIndex += 1;
      await sleep(delayMs, overallController.signal);
    }
  } catch (error) {
    if (error instanceof BackendReadinessError) {
      throw error;
    }

    throw new BackendReadinessError(
      overallTimedOut
        ? "Backend readiness check timed out."
        : "Backend readiness check was aborted.",
      overallTimedOut ? "timeout" : "aborted",
    );
  } finally {
    window.clearTimeout(overallTimer);
    signal?.removeEventListener("abort", abortOverall);
  }
}
```

## Startup usage

At frontend startup, show a connecting state and wait for readiness before starting features that depend on the backend. Cancel the operation when the frontend lifecycle that owns it ends.

```ts
const startupController = new AbortController();

async function startFrontend(): Promise<void> {
  showBackendConnectingState();

  try {
    await waitForBackendReady({
      endpoint: `${BACKEND_BASE_URL}/health/ready`,
      signal: startupController.signal,
    });

    showApplicationReadyState();
    await loadInitialBackendData();
  } catch (error) {
    if (
      error instanceof BackendReadinessError &&
      error.causeType === "aborted"
    ) {
      return;
    }

    showBackendUnavailableState({
      retry: startFrontend,
    });
  }
}

void startFrontend();

// Run this when the owning view or application lifecycle ends.
function stopFrontendStartup(): void {
  startupController.abort();
}
```

The named UI functions represent general state transitions. Their rendering details depend on the frontend framework.

## Retry behavior

The frontend should apply these general rules:

- A `200` response means the backend is ready. Stop polling immediately.
- Network failures, connection refusal, and individual request timeouts are temporary. Retry them.
- A `503` response means the backend is unavailable or not ready. Retry it.
- Other server-side failures such as `502` and `504` are generally temporary and may be retried.
- Throttling responses such as `429` may be retried. If a valid `Retry-After` header is supported later, its delay can be incorporated.
- Permanent client responses such as `400`, `401`, `403`, and `404` should stop automatic retries because they usually indicate configuration, authorization, or version mismatch problems.
- The delay should grow exponentially and be capped by `maxDelayMs`.
- Full jitter should randomize each delay between zero and the current capped exponential limit.
- Each request should have its own timeout so one request cannot remain pending indefinitely.
- The complete retry operation should have an overall deadline.
- Retry waiting and active requests should support cancellation.
- The application should offer a manual retry action after the overall deadline is reached.

Example delay limits with a 500 ms base and a 10-second cap are:

```text
Retry 0: random delay from 0 to 500 ms
Retry 1: random delay from 0 to 1,000 ms
Retry 2: random delay from 0 to 2,000 ms
Retry 3: random delay from 0 to 4,000 ms
Retry 4: random delay from 0 to 8,000 ms
Retry 5+: random delay from 0 to 10,000 ms
```

The exact delay is intentionally unpredictable. This reduces simultaneous retries when many frontend clients start after the same backend deployment.

## Frontend tests

The examples below use a Vitest-style API. They focus on observable behavior instead of frontend framework details. The retry helper accepts `fetchFn` and `randomFn` so tests can avoid real network traffic and random timing.

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BackendReadinessError,
  waitForBackendReady,
} from "./backend-readiness";

const response = (status: number): Response =>
  new Response(JSON.stringify({ status }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("waitForBackendReady", () => {
  it("stops after the first successful response", async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(200));

    const result = await waitForBackendReady({
      endpoint: "/health/ready",
      fetchFn,
    });

    expect(result).toEqual({ status: "ready", attempts: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("retries a 503 response and stops after a later 200", async () => {
    vi.useFakeTimers();

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));

    const resultPromise = waitForBackendReady({
      endpoint: "/health/ready",
      baseDelayMs: 500,
      maxDelayMs: 10_000,
      fetchFn,
      randomFn: () => 0.5,
    });

    await vi.advanceTimersByTimeAsync(250);

    await expect(resultPromise).resolves.toEqual({
      status: "ready",
      attempts: 2,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("retries a network failure", async () => {
    vi.useFakeTimers();

    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(response(200));

    const resultPromise = waitForBackendReady({
      endpoint: "/health/ready",
      baseDelayMs: 100,
      fetchFn,
      randomFn: () => 1,
    });

    await vi.advanceTimersByTimeAsync(100);

    await expect(resultPromise).resolves.toMatchObject({
      status: "ready",
      attempts: 2,
    });
  });

  it("does not retry a permanent client response", async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(404));

    await expect(
      waitForBackendReady({
        endpoint: "/health/ready",
        fetchFn,
      }),
    ).rejects.toMatchObject({
      name: "BackendReadinessError",
      causeType: "permanent-response",
      status: 404,
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("caps the exponential delay", async () => {
    vi.useFakeTimers();

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));

    const resultPromise = waitForBackendReady({
      endpoint: "/health/ready",
      baseDelayMs: 1_000,
      maxDelayMs: 1_500,
      fetchFn,
      randomFn: () => 1,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_500);
    await vi.advanceTimersByTimeAsync(1_500);

    await expect(resultPromise).resolves.toMatchObject({
      status: "ready",
      attempts: 4,
    });
  });

  it("stops when the outer signal is aborted", async () => {
    vi.useFakeTimers();

    const controller = new AbortController();
    const fetchFn = vi.fn().mockResolvedValue(response(503));

    const resultPromise = waitForBackendReady({
      endpoint: "/health/ready",
      signal: controller.signal,
      fetchFn,
      randomFn: () => 1,
    });

    await Promise.resolve();
    controller.abort();

    await expect(resultPromise).rejects.toMatchObject({
      name: "BackendReadinessError",
      causeType: "aborted",
    });
  });

  it("stops after the overall timeout", async () => {
    vi.useFakeTimers();

    const fetchFn = vi.fn().mockResolvedValue(response(503));

    const resultPromise = waitForBackendReady({
      endpoint: "/health/ready",
      baseDelayMs: 500,
      overallTimeoutMs: 1_000,
      fetchFn,
      randomFn: () => 1,
    });

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(resultPromise).rejects.toMatchObject({
      name: "BackendReadinessError",
      causeType: "timeout",
    });
  });
});
```

## Additional test coverage

Beyond the core unit tests, the frontend should verify these general scenarios:

- The connecting state is shown while polling is active.
- Backend-dependent startup work does not begin before readiness succeeds.
- The ready state appears after the first successful response.
- The unavailable state appears after the overall deadline.
- The manual retry action starts a fresh bounded retry cycle.
- Cancellation prevents state updates after the owning frontend lifecycle ends.
- Multiple startup triggers do not create duplicate polling loops.
- A slow individual request is aborted when its request timeout expires.
- The readiness request uses `GET` and disables browser caching.

An integration test can start the frontend before the backend is reachable, simulate temporary failures, then make `/health/ready` return `200`. The expected result is that polling stops and backend-dependent initialization begins exactly once.

## Operational note

With the current backend lifespan, `init_db()` completes before FastAPI begins serving application requests. During that period, the frontend may receive a network error or an upstream gateway error rather than the readiness endpoint's own `503` response. The retry logic handles both cases. Once the backend begins serving and `app.state.ready` is true, `/health/ready` returns `200`, and frontend polling stops.
