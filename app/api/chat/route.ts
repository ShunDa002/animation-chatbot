import { failureResponse } from '@/lib/server/copy';
import { callProvider, ProviderError, readProviderConfig, readTextDeltas } from '@/lib/server/groq';
import { claimRequest, configuredLimit, upstashStore } from '@/lib/server/quota';
import { readChatRequest } from '@/lib/server/validate';

/**
 * POST /api/chat - the only server-side code in this project.
 *
 * Contract: specs/001-animated-character-chat/contracts/chat-api.md
 *
 * The order of operations below is fixed, because each step exists to protect the next:
 *   1. Validate the request shape. 400 before anything else (FR-029).
 *   2. Claim one request from the daily ceiling. 429 if at the ceiling or the store is
 *      unreachable (FR-028, D7). A refused request consumes no count.
 *   3. Build the provider request: persona system message, then the forwarded messages (FR-026).
 *   4. Call the provider with stream: true under the deadline (FR-034).
 *   5. Wait for the first delta. Until one arrives the response status is still open, which is what
 *      makes 502 and 504 possible at all - once a 200 stream has begun, it cannot be taken back.
 *   6. Re-emit text as it arrives, and let an already-streaming reply finish past the deadline.
 *
 * FR-031: counts, statuses, and durations are logged. Message and reply text never are.
 */

/**
 * Research D8 chose the Edge runtime for its low cold-start cost. Next 16 deprecates Edge in favour
 * of `nodejs`, which streams natively too, so shipping the only server-side code in the project on a
 * runtime the framework has deprecated would be buying a migration for no gain. The reasoning behind
 * D8 - stream natively, do not buffer, keep first-token latency inside SC-005 - is unchanged and is
 * satisfied here; only the runtime name is different.
 */
export const runtime = 'nodejs';

/** Never cache a streamed reply. */
export const dynamic = 'force-dynamic';

/** FR-034, counted from when the request reaches this endpoint - not from the provider call. */
const DEADLINE_MS = 20_000;

export async function POST(request: Request): Promise<Response> {
  // The clock starts here. Validation and the counter round trip both spend from this budget, which
  // is what FR-034 means by "from when the request reaches the endpoint".
  const startedAt = Date.now();
  const env = process.env as Record<string, string | undefined>;

  // --- 1. shape ------------------------------------------------------------
  const parsed = await readChatRequest(request);
  if (!parsed.ok) {
    console.info('[chat] 400', { reason: parsed.reason, ms: Date.now() - startedAt });
    return failureResponse('badRequest');
  }

  // --- 2. ceiling ----------------------------------------------------------
  const store = await upstashStore(env);
  if (!store) {
    // Not configured is treated exactly as unreachable: fail closed, never open (D7).
    console.warn('[chat] 429 counter store not configured - failing closed');
    return failureResponse('limited');
  }

  const verdict = await claimRequest({ store, limit: configuredLimit(env) });
  if (!verdict.allowed) {
    console.info('[chat] 429', { reason: verdict.reason, ms: Date.now() - startedAt });
    return failureResponse('limited');
  }

  // --- 3 & 4. provider call under the deadline -----------------------------
  const controller = new AbortController();
  const remaining = DEADLINE_MS - (Date.now() - startedAt);
  if (remaining <= 0) {
    console.info('[chat] 504 before the provider was reached', { ms: Date.now() - startedAt });
    return failureResponse('timedOut');
  }

  let deadlineHit = false;
  let deadline: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
    deadlineHit = true;
    controller.abort();
  }, remaining);

  const clearDeadline = (): void => {
    if (deadline !== undefined) {
      clearTimeout(deadline);
      deadline = undefined;
    }
  };

  let deltas: AsyncGenerator<string>;
  try {
    const config = readProviderConfig(env);
    const response = await callProvider({
      config,
      messages: parsed.messages,
      signal: controller.signal,
    });
    deltas = readTextDeltas(response.body!);
  } catch (error) {
    clearDeadline();
    const timedOut = deadlineHit || (error instanceof Error && error.name === 'AbortError');
    console.info(`[chat] ${timedOut ? 504 : 502}`, {
      // The upstream status is logged and goes no further (FR-030).
      upstream: error instanceof ProviderError ? error.upstreamStatus : undefined,
      ms: Date.now() - startedAt,
    });
    return failureResponse(timedOut ? 'timedOut' : 'upstreamFailed');
  }

  // --- 5. first delta decides the status -----------------------------------
  let first: IteratorResult<string>;
  try {
    first = await deltas.next();
  } catch (error) {
    clearDeadline();
    const timedOut = deadlineHit || (error instanceof Error && error.name === 'AbortError');
    console.info(`[chat] ${timedOut ? 504 : 502} while awaiting the first chunk`, {
      ms: Date.now() - startedAt,
    });
    return failureResponse(timedOut ? 'timedOut' : 'upstreamFailed');
  }

  if (first.done) {
    // The provider completed without emitting a single character. An empty reply is a 502, so the
    // visitor gets an actionable sentence rather than an empty bubble (contracts/chat-api.md).
    clearDeadline();
    console.info('[chat] 502 empty reply', { ms: Date.now() - startedAt });
    return failureResponse('upstreamFailed');
  }

  // Text has begun. FR-034 says an already-streaming reply may finish, so the deadline is done.
  clearDeadline();

  // --- 6. re-emit ----------------------------------------------------------
  const encoder = new TextEncoder();
  const firstDelta = first.value;

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      let characters = 0;
      try {
        streamController.enqueue(encoder.encode(firstDelta));
        characters += firstDelta.length;

        for await (const delta of deltas) {
          streamController.enqueue(encoder.encode(delta));
          characters += delta.length;
        }
      } catch {
        // A stream that begins and then fails ends cleanly. Whatever the visitor has already seen
        // stays visible and nothing is retracted (spec Edge Cases).
        console.info('[chat] stream ended early', { characters, ms: Date.now() - startedAt });
      } finally {
        streamController.close();
        // Length, not content (FR-031).
        console.info('[chat] 200', {
          count: verdict.count,
          characters,
          ms: Date.now() - startedAt,
        });
      }
    },
    cancel() {
      // The visitor navigated away or reloaded mid-reply. Abandon the upstream read so no further
      // work is done on a reply nobody will see (spec Edge Cases).
      controller.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
