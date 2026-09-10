# Contract: POST /api/chat

**Handler**: `app/api/chat/route.ts` - Edge runtime. The only server-side code in the project.

**Satisfies**: FR-025 to FR-032, FR-034, SC-013

---

## Request

```http
POST /api/chat
Content-Type: application/json
```

```ts
interface ChatRequest {
  messages: Array<{
    role: "user" | "assistant";
    content: string;               // 1..300 characters after trim
  }>;                              // 1..6 entries, oldest first, last entry must be role "user"
}
```

**Not accepted, by design**: any system or persona message, any model or provider name, any
temperature or sampling parameter, any visitor identifier, token, or fingerprint. Anything beyond
`messages` is ignored, and a request whose `messages` violate the rules above is rejected with 400
without the provider being contacted (FR-029).

The persona - including the instruction to emit the emotional cue - is attached server-side from
`lib/server/persona.ts`. It is not in the request type, not overridable, and never returned
(FR-026).

## Response: success

```http
200 OK
Content-Type: text/plain; charset=utf-8
Transfer-Encoding: chunked
Cache-Control: no-store
```

The body is a stream of raw reply text, forwarded as it arrives from the provider (FR-027). No SSE
framing, no JSON envelope, no provider payload shape - there is exactly one kind of event, so there
is nothing to frame.

The trailing `[emotion:<name>]` marker **is** present in this stream; stripping it is the browser's
job (D6), because the tail-buffering that keeps it invisible has to happen where the text is
rendered.

## Response: failures

Every failure body is a short plain-language sentence from `lib/server/copy` - never provider error
text, never a status code from upstream, never a credential, never a stack trace (FR-030, FR-004).

| Status | Condition | Body means |
|--------|-----------|------------|
| 400 | Malformed request: bad JSON, missing `messages`, empty array, more than 6 entries, content over 300 chars, last entry not `role: "user"` | "That message could not be sent." Provider never contacted (FR-029) |
| 429 | Daily ceiling of 150 reached, **or** the counter store is unreachable (fails closed) | "The demo is temporarily limited. Please try again later." Provider never contacted (FR-028, D7) |
| 502 | Provider unreachable, provider error status, or empty reply | "Something went wrong reaching the character. Try sending again." |
| 504 | 20 seconds elapsed with no reply content forwarded | "That took too long. Try sending again." No automatic retry (FR-034) |

A stream that has already begun forwarding text and then fails ends the response cleanly. The partial
text stays visible in the browser and nothing already shown is retracted (spec Edge Cases).

## Order of operations

Fixed, because each step exists to protect the next:

1. Validate request shape. Reject 400 before anything else (FR-029).
2. Check and increment the daily counter. Reject 429 if at or over 150, or if the store is
   unreachable (FR-028, D7). A rejected request consumes no count.
3. Build the provider request: persona system message plus the forwarded `messages` (FR-026).
4. Call the provider with `stream: true` under `AbortSignal.timeout(20000)` (FR-034).
5. On first forwarded chunk, clear the timeout - an already-streaming reply may finish (FR-034).
6. Re-emit text chunks to the browser as they arrive (FR-027).

## Configuration

All from the environment; none hard-coded at a call site (FR-032).

| Variable | Purpose |
|----------|---------|
| `GROQ_API_KEY` | Provider credential. Server-only, never in a client bundle (FR-025) |
| `GROQ_BASE_URL` | Defaults to `https://api.groq.com/openai/v1`. Changing it plus the key and model is the whole provider swap (SC-012) |
| `GROQ_MODEL` | Model id, confirmed against the provider's live model list at setup (D5) |
| `DAILY_REQUEST_LIMIT` | Defaults to 150 (FR-028) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Counter store, provisioned by the Vercel integration |

## Logging

No visitor message content and no reply content is logged at any level above debug, and debug
logging of that content is off by default (FR-031, constitution Additional Constraints). Counts,
statuses, and durations are fine to log; text is not.

## Test obligations

- Every 400 case in the table rejects with no outbound provider request made.
- At the 150th count the next request returns 429; the provider is never contacted; the count does
  not increase past the ceiling (SC-013).
- With the counter store made unreachable, the request returns 429, not 200 (fail closed, D7).
- A provider stream that stalls indefinitely produces 504 at ~20s, and exactly one provider request
  was made - no retry (FR-034).
- A provider stream that begins and then stalls keeps the already-sent text and does not 504 after
  the first chunk (FR-034).
- No response body in any of the above contains the API key, the persona text, the provider name, or
  an upstream status code (FR-030, SC-007).
