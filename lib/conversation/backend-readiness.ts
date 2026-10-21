/**
 * Frontend backend readiness coordination utility.
 *
 * Implements bounded exponential backoff with full jitter to probe `GET /health/ready`
 * during frontend startup before issuing backend-dependent requests.
 * Conforms to `docs/frontend_backend_readiness.md` and `specs/003-message-input-ui/spec.md` (FR-017, FR-040, FR-041, API-009).
 */

export type ReadinessOptions = {
  endpoint: string;
  baseDelayMs?: number;
  maxDelayMs?: number;
  requestTimeoutMs?: number;
  overallTimeoutMs?: number;
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
  randomFn?: () => number;
};

export type ReadinessResult = {
  status: 'ready';
  attempts: number;
};

export class BackendReadinessError extends Error {
  constructor(
    message: string,
    public readonly causeType:
      | 'timeout'
      | 'aborted'
      | 'permanent-response',
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'BackendReadinessError';
  }
}

const sleep = (delayMs: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Operation aborted', 'AbortError'));
      return;
    }

    const timer = setTimeout(resolve, delayMs);

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Operation aborted', 'AbortError'));
      },
      { once: true },
    );
  });

export const isRetriableStatus = (status: number): boolean =>
  status === 408 || status === 425 || status === 429 || status >= 500;

export const calculateDelay = (
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
  const timer = setTimeout(abortRequest, requestTimeoutMs);

  outerSignal.addEventListener('abort', abortRequest, { once: true });

  try {
    return await fetchFn(endpoint, {
      method: 'GET',
      cache: 'no-store',
      signal: requestController.signal,
      headers: {
        Accept: 'application/json',
      },
    });
  } finally {
    clearTimeout(timer);
    outerSignal.removeEventListener('abort', abortRequest);
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
  signal?.addEventListener('abort', abortOverall, { once: true });

  const overallTimer = setTimeout(() => {
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
            ? 'Backend readiness check timed out.'
            : 'Backend readiness check was aborted.',
          overallTimedOut ? 'timeout' : 'aborted',
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
          return { status: 'ready', attempts };
        }

        if (!isRetriableStatus(response.status)) {
          throw new BackendReadinessError(
            `Readiness endpoint returned HTTP ${response.status}.`,
            'permanent-response',
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
              ? 'Backend readiness check timed out.'
              : 'Backend readiness check was aborted.',
            overallTimedOut ? 'timeout' : 'aborted',
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
        ? 'Backend readiness check timed out.'
        : 'Backend readiness check was aborted.',
      overallTimedOut ? 'timeout' : 'aborted',
    );
  } finally {
    clearTimeout(overallTimer);
    signal?.removeEventListener('abort', abortOverall);
  }
}
