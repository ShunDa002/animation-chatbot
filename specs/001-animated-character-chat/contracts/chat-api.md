# Contract: External Backend API

**Backend**: Separate FastAPI project at `NEXT_PUBLIC_BACKEND_URL` (default `http://127.0.0.1:8000`)

**Satisfies**: FR-017, FR-025 to FR-032, FR-034, FR-043 to FR-047, SC-013

**Note**: This contract describes the external backend's API surface as consumed by this frontend
project. The backend implementation is a separate project (D15, FR-044). This contract exists so
the frontend and backend agree on the interface; the backend's internal behaviour is not specified
here.

---

## Endpoint 1: POST /threads

Creates a new conversation thread. Called once on page load (FR-043).

```http
POST /threads
```

### Response: success

```http
200 OK
Content-Type: text/plain
```

Body: a UUID string (e.g. `"550e8400-e29b-41d4-a716-446655440000"`).

### Response: failure

Any non-200 status. The frontend disables sending and shows a connection notice (FR-045).

---

## Endpoint 2: POST /chat

Sends a visitor message and receives a streaming reply. Called on each send (FR-017, FR-046).

```http
POST /chat
Content-Type: application/json
```

```ts
interface ChatRequest {
  user_input: string;    // 1..300 characters after trim (FR-022)
  thread_id: string;     // UUID from POST /threads (FR-043)
}
```

**Not accepted, by design**: any system or persona message, any model or provider name, any
temperature or sampling parameter, any visitor identifier, token, or fingerprint, any conversation
history. The backend manages context via the thread (FR-017, D15).

The persona — including the instruction to emit the emotional cue — is attached server-side by the
backend. It is not in the request type, not overridable, and never returned (FR-026).

### Response: success

```http
200 OK
Content-Type: text/plain; charset=utf-8
Transfer-Encoding: chunked
Cache-Control: no-store
```

The body is a stream of raw reply text, forwarded as it arrives from the provider (FR-027, FR-046).
No SSE framing, no JSON envelope, no provider payload shape — there is exactly one kind of event,
so there is nothing to frame.

The trailing `[emotion:<name>]` marker **is** present in this stream; stripping it is the browser's
job (D6), because the tail-buffering that keeps it invisible has to happen where the text is
rendered.

### Response: failures

Every failure body is a short plain-language sentence — never provider error text, never a status
code from upstream, never a credential, never a stack trace (FR-030, FR-004).

| Status | Condition | Body means |
|--------|-----------|------------|
| 400 | Malformed request: bad JSON, missing fields, content over 300 chars | "That message could not be sent." Provider never contacted (FR-029) |
| 429 | Daily ceiling of 150 reached, **or** the counter store is unreachable (fails closed) | "The demo is temporarily limited. Please try again later." Provider never contacted (FR-028) |
| 502 | Provider unreachable, provider error status, or empty reply | "Something went wrong reaching the character. Try sending again." |
| 504 | 20 seconds elapsed with no reply content forwarded | "That took too long. Try sending again." No automatic retry (FR-034) |

A stream that has already begun forwarding text and then fails ends the response cleanly. The partial
text stays visible in the browser and nothing already shown is retracted (spec Edge Cases).

## Configuration

All backend configuration is the backend project's responsibility. The frontend's only
configuration is:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_BACKEND_URL` | Base URL for the backend. Defaults to `http://127.0.0.1:8000` (FR-032) |

## Frontend integration

The frontend calls both endpoints from `lib/conversation/backend.ts`:

- `createThread()`: `POST ${BACKEND_URL}/threads` → returns UUID string
- `sendMessage(threadId, userInput, signal)`: `POST ${BACKEND_URL}/chat` with
  `{ user_input, thread_id }` → returns `Response` with streaming body

## Test obligations (frontend side)

- Thread creation failure (network error, non-200) disables sending and shows a connection notice.
- A 400 response from `/chat` maps to the "could not be sent" message.
- A 429 response from `/chat` maps to the "temporarily limited" message.
- A 502 response from `/chat` maps to the generic failure message.
- A 504 response from `/chat` maps to the timeout message.
- A streaming response that starts and then fails keeps the partial text visible.
- No response body in any of the above contains provider names, credentials, or upstream status
  codes (the backend is responsible for this, but the frontend verifies it sees none).
