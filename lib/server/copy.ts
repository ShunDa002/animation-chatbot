/**
 * The four failure sentences the endpoint returns, and nothing else.
 *
 * Deliberately duplicated in spirit from lib/ui/copy.ts rather than imported: lib/server may not
 * import lib/ui (emotion-seam enforcement, and the reason is real - the persona text and the API key
 * must have no import path into the client bundle). The strings are short and the panel treats the
 * status code as authoritative anyway, so the browser never has to display the body verbatim.
 *
 * FR-030: never provider error text, never an upstream status code, never a credential, never a
 * stack trace.
 */

export const serverCopy = {
  /** 400 - malformed request. The provider was never contacted (FR-029). */
  badRequest: 'That message could not be sent.',
  /** 429 - daily ceiling reached, or the counter store is unreachable and we fail closed (D7). */
  limited: 'The demo is temporarily limited. Please try again later.',
  /** 502 - provider unreachable, provider error status, or an empty reply. */
  upstreamFailed: 'Something went wrong reaching the character. Try sending again.',
  /** 504 - the deadline passed with no reply content forwarded (FR-034). */
  timedOut: 'That took too long. Try sending again.',
} as const;

export type ServerFailure = keyof typeof serverCopy;

/** The status each failure maps to, per the table in contracts/chat-api.md. */
export const failureStatus: Record<ServerFailure, number> = {
  badRequest: 400,
  limited: 429,
  upstreamFailed: 502,
  timedOut: 504,
};

export function failureResponse(failure: ServerFailure): Response {
  return new Response(serverCopy[failure], {
    status: failureStatus[failure],
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
