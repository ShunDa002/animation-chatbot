# Feature Specification: Streaming Response Architecture

**Feature Branch**: `002-streaming-response-arch`

**Created**: 2026-09-29

**Status**: Draft

**Input**: User description: "Optimize the streaming response architecture by referring `docs/Frontend_Technical_Requirements.md` and the expected response protocol from the backend `docs/Recommended_NDJSON_Protocol.md`"

## Clarifications

### Session 2026-09-29

- Q: Where in the streaming pipeline should CueReader operate — per-token or post-done? → A: Feed CueReader incrementally with each `token.content` (Option B). No marker flash, minimal refactoring.
- Q: Should this feature include frontend observability requirements or defer to a separate feature? → A: Include minimal observability — emit timing signals (time-to-first-token, response duration, error rate) sufficient to verify success criteria. No dashboard or reporting infrastructure (Option A).
- Q: Should the dispatcher perform runtime field-level validation on each event or dispatch by type alone? → A: Validate required fields per event type (e.g., token.content is string, tool_call_delta.args_delta is string). Skip event with warning on validation failure (Option B).
- Q: Should the spec explicitly declare what is out of scope? → A: Yes, add explicit out-of-scope section listing conversation persistence, multi-conversation switching, content security/sanitization, stream reconnection, and full observability dashboards (Option A).
- Q: Should the message status transition to waiting_for_tool during tool calls, or stay streaming with tool-local sub-states? → A: Message stays `streaming` throughout. Tool progress tracked per-tool-call record only (preparing → generating_args → completed/failed). No top-level waiting_for_tool state (Option B).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Incremental Text Streaming via NDJSON (Priority: P1)

A visitor sends a message and sees the assistant reply appear word-by-word. Under the hood the frontend consumes structured NDJSON events (`start`, `token`, `done`, `error`) instead of treating the response body as an opaque text stream. Each `token` event's `content` field is appended to a single assistant message bubble. The `start` event transitions the placeholder from waiting to streaming. The `done` event finalizes the message and re-enables input.

**Why this priority**: This is the core streaming path. Every conversation depends on it. Without correct NDJSON framing, tokens could be lost, duplicated, or rendered out of order.

**Independent Test**: Send a message to a backend that returns `start → token × N → done`. Confirm a single assistant bubble grows progressively and reaches a completed state exactly when `done` arrives.

**Acceptance Scenarios**:

1. **Given** the visitor has sent a message, **When** the `start` event arrives, **Then** the assistant placeholder transitions to a streaming state and shows a streaming indicator.
2. **Given** the stream is active, **When** multiple `token` events arrive across chunk boundaries, **Then** each token's `content` is appended to one assistant message in order, preserving whitespace, punctuation, and Unicode.
3. **Given** the stream is active, **When** the `done` event arrives, **Then** the message status becomes completed, the streaming indicator stops, and the input composer is re-enabled.
4. **Given** a `token` event's content contains a leading space, **When** it is appended, **Then** the space is preserved exactly (no trim).

---

### User Story 2 - NDJSON Buffering and Fault-Tolerant Parsing (Priority: P1)

The transport layer correctly handles NDJSON records that arrive split across network chunks, multiple records in a single chunk, or a final record without a trailing newline. Blank lines are ignored. Carriage-return characters before newlines are stripped before JSON parsing. Invalid JSON on a newline-terminated line is logged and skipped without crashing the conversation.

**Why this priority**: Without correct buffering, partial JSON parses crash the stream. This is a prerequisite for every event type.

**Independent Test**: Feed a mock `ReadableStream` that delivers one NDJSON record split across three byte chunks, two records in one chunk, and a final record with no trailing newline. Confirm all records parse correctly.

**Acceptance Scenarios**:

1. **Given** a `token` event's JSON is split across two network chunks, **When** the second chunk arrives, **Then** the complete record is parsed and dispatched.
2. **Given** a single chunk contains three complete NDJSON lines, **When** the chunk is decoded, **Then** all three events are dispatched in order.
3. **Given** a newline-terminated line contains invalid JSON, **When** parsing fails, **Then** the line is logged and skipped, and subsequent valid events continue to process.
4. **Given** the stream closes without a trailing newline, **When** the buffer contains a final non-empty record, **Then** that record is parsed and dispatched.

---

### User Story 3 - Error Event Handling and Partial Preservation (Priority: P1)

When the backend sends an `error` event mid-stream, the frontend preserves any assistant text already received, marks the response as incomplete, stops streaming indicators, displays the safe error message, and offers retry.

**Why this priority**: The `error` event is a terminal event. Mishandling it leaves the UI in a permanent loading state or silently drops partial content.

**Independent Test**: Stream `start → token("partial text") → error("The chatbot response stream failed.")`. Confirm the partial text is preserved, marked incomplete, and a retry control appears.

**Acceptance Scenarios**:

1. **Given** tokens have been received, **When** an `error` event arrives, **Then** the partial text remains visible, marked as incomplete.
2. **Given** an `error` event arrives, **When** the visitor sees the message, **Then** the safe error message from `error.message` is displayed and retry is offered.
3. **Given** an `error` event has been received, **When** additional events arrive after it, **Then** they are ignored (error is terminal).

---

### User Story 4 - Stream Interruption Detection (Priority: P2)

When the HTTP connection closes without a `done` or `error` event, the frontend classifies the response as interrupted rather than completed. Partial content is preserved. The message is marked with an interrupted status.

**Why this priority**: Distinguishing interruption from completion prevents silently presenting truncated replies as finished answers.

**Independent Test**: Stream `start → token("partial")` then close the ReadableStream without `done` or `error`. Confirm the message is marked interrupted, not completed.

**Acceptance Scenarios**:

1. **Given** the connection closes without `done` or `error`, **When** partial content exists, **Then** the message is marked as interrupted and partial text is preserved.
2. **Given** the connection closes without `done` or `error`, **When** no content was received, **Then** the placeholder is removed and an error notice is shown.

---

### User Story 5 - Tool-Call Lifecycle (Priority: P2)

When the backend sends `tool_call_delta` events, the frontend accumulates tool name, ID, and argument fragments into a single tool-call record per logical operation. When the matching `tool_result` arrives, the tool is marked complete. Tool activity is displayed as collapsible status items within the assistant message.

**Why this priority**: Tool calls are central to agent-based conversations. Without correct delta accumulation, tool arguments appear garbled and tool results are orphaned.

**Independent Test**: Stream `tool_call_delta(name="search", id="call-1", args="") → tool_call_delta(null, null, '{"query":"Lang') → tool_call_delta(null, null, 'Chain"}') → tool_result(id="call-1", content="Found 5 results")`. Confirm one tool record accumulates all deltas and the result is correlated by ID.

**Acceptance Scenarios**:

1. **Given** the first `tool_call_delta` supplies `tool_name`, **When** subsequent deltas have `tool_name: null`, **Then** the frontend retains the original tool name.
2. **Given** argument fragments arrive across multiple deltas, **When** all deltas are received, **Then** the accumulated `args_delta` string forms valid JSON parseable as tool arguments.
3. **Given** a `tool_result` arrives with a `tool_call_id`, **When** a matching tool-call record exists, **Then** the result is attached to that record and the tool status transitions to completed or failed.
4. **Given** multiple tool calls are active simultaneously, **When** deltas and results arrive interleaved, **Then** each is tracked independently by `tool_call_id` or `tool_call_index`.

---

### User Story 6 - Event-Type Dispatch and Forward Compatibility (Priority: P2)

Every NDJSON event is dispatched by its explicit `type` field. Unknown event types are logged and skipped without crashing. The frontend never infers event type from the presence of fields like `content` or `tool_name`.

**Why this priority**: Type-based dispatch prevents ambiguity between assistant text, tool arguments, and tool results. Forward compatibility allows the backend protocol to evolve without breaking deployed frontends.

**Independent Test**: Insert an event `{"type":"future_feature","data":"test"}` into a stream. Confirm it is logged and skipped, and surrounding `token` events render correctly.

**Acceptance Scenarios**:

1. **Given** an event arrives with `type: "future_feature"`, **When** the dispatcher processes it, **Then** it logs a diagnostic and continues without error.
2. **Given** a `token` event and a `tool_call_delta` event both contain a `content` field, **When** dispatched, **Then** each is handled by its respective handler based on `type`, not field presence.

---

### User Story 7 - Stale-Event and Concurrency Protection (Priority: P3)

Each request is scoped by a client-generated request ID. Events from a cancelled, retried, or superseded request cannot update the current conversation. Parsing buffers, tool records, and rendering accumulators are scoped per request.

**Why this priority**: Without scoping, late-arriving events from a cancelled request corrupt the next response.

**Independent Test**: Send message A, cancel it, send message B. Confirm that a late `token` from request A does not append to message B's bubble.

**Acceptance Scenarios**:

1. **Given** request A is cancelled and request B is active, **When** a `token` from request A arrives, **Then** it is discarded.
2. **Given** the visitor switches conversations, **When** an event from the previous conversation arrives, **Then** it does not update the visible conversation.

---

### User Story 8 - Heartbeat and Inactivity Timeout (Priority: P3)

The frontend supports an optional `heartbeat` event type that refreshes an inactivity timer without altering conversation content. If no event of any kind arrives within the inactivity timeout, the stream is classified as stalled.

**Why this priority**: Long tool executions can produce silence on the stream. Heartbeats prevent premature timeout during legitimate processing.

**Independent Test**: Stream `start → token → heartbeat → (pause beyond stall threshold) → token`. Confirm the heartbeat resets the timer and the second token arrives normally. Then stream `start → token → (silence beyond threshold)` and confirm a stall is detected.

**Acceptance Scenarios**:

1. **Given** a heartbeat event arrives, **When** the inactivity timer is running, **Then** the timer resets and no content is modified.
2. **Given** no events arrive within the inactivity timeout, **When** the timer fires, **Then** the stream is classified as stalled and partial content is preserved.

---

### Edge Cases

- What happens when the `start` event never arrives but `token` events do? Frontend should still create a streaming placeholder and log a protocol warning.
- What happens when `done` arrives but no `token` events preceded it? The assistant message should be finalized as empty, and a neutral state shown.
- What happens when a multibyte UTF-8 character is split across two byte chunks? The `TextDecoder` in streaming mode reassembles it without corruption.
- What happens when a `tool_result` arrives with no matching `tool_call_id`? An unmatched tool-result record is created and a protocol warning is logged.
- What happens when the accumulated assistant text exceeds a size limit? Deferred to a future feature. No size limit is enforced in this feature; the accumulator grows without bound. A concrete threshold, truncation behavior, and "response too large" notice will be specified separately.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST parse the streaming response as NDJSON (newline-delimited JSON), not as a monolithic text stream or SSE.
- **FR-002**: System MUST maintain a persistent text buffer for the duration of each response, correctly handling records split across chunks, multiple records per chunk, and a final record without a trailing newline.
- **FR-003**: System MUST dispatch every event by its explicit `type` field, never by field-presence heuristics.
- **FR-004**: System MUST handle `start`, `token`, `tool_call_delta`, `tool_result`, `done`, and `error` event types.
- **FR-005**: System MUST append each `token.content` to a single assistant message accumulator, preserving whitespace, Unicode, and Markdown delimiters.
- **FR-006**: System MUST transition the assistant message through top-level states: pending → streaming (on `start`) → completed (on `done`), cancelled (on user cancel), interrupted (on connection close without terminal event), or error (on `error` event). The message remains in `streaming` during tool-call activity; tool progress is tracked per-tool-call record, not at message level.
- **FR-007**: System MUST treat `error` and `done` as terminal events — no further content events modify the message after either is received.
- **FR-008**: System MUST classify a stream that closes without `done` or `error` as interrupted, not completed.
- **FR-009**: System MUST accumulate `tool_call_delta` events into per-tool-call records, retaining previously received `tool_name` and `tool_call_id` when subsequent deltas send `null` for those fields.
- **FR-010**: System MUST correlate `tool_result` events to their originating tool call by `tool_call_id`.
- **FR-011**: System MUST support multiple concurrent tool calls, each with independent identity, arguments, status, and result.
- **FR-012**: System MUST use a streaming-mode `TextDecoder` to prevent corruption of multibyte UTF-8 characters split across byte chunks.
- **FR-013**: System MUST strip trailing carriage-return characters before JSON parsing to tolerate `\r\n` line endings.
- **FR-014**: System MUST ignore blank lines in the NDJSON stream.
- **FR-015**: System MUST log and skip unknown event types without terminating the stream.
- **FR-016**: System MUST scope all parsing buffers, tool records, and rendering accumulators to a per-request context, preventing stale events from updating cancelled or superseded requests.
- **FR-017**: System MUST support user-initiated cancellation that aborts the fetch, stops the reader, preserves received content, and marks the message as cancelled.
- **FR-018**: System MUST preserve partial assistant content when an `error` event or interruption occurs after tokens have been received.
- **FR-019**: System MUST display the `message` field from an `error` event as a user-safe notice.
- **FR-020**: System MUST accept and process an optional `heartbeat` event type, refreshing the inactivity timer without altering conversation content.
- **FR-021**: System MUST batch visual updates during streaming using `requestAnimationFrame` or equivalent to prevent per-token re-renders of the full conversation.
- **FR-022**: System MUST validate that the HTTP response status is acceptable and that a readable body exists before entering the NDJSON read loop.
- **FR-023**: System MUST flush the `TextDecoder` at stream end to recover any buffered partial character data.
- **FR-024**: System MUST feed each `token.content` value incrementally into the existing `CueReader`, which strips `[emotion:<name>]` cue markers using its candidate-aware tail buffer. The CueReader's `push()` output drives the visible streaming text, and its `end()` result provides the final display text and derived emotion. The CueReader is not called post-`done` on the full accumulated text — it processes tokens as they arrive to prevent marker flashes during streaming.
- **FR-025**: System MUST record minimal streaming metrics per request: time from send to first `token` event (time-to-first-token), total response duration (send to `done`/`error`/interruption), count of received events by type, and terminal outcome (completed, error, cancelled, interrupted). These signals are emitted via a callback or event interface; dashboard and reporting infrastructure are out of scope.
- **FR-026**: System MUST perform runtime validation of required fields for each recognized event type before dispatching. Specifically: `token.content` must be a string; `tool_call_delta.args_delta` must be a string; `error.message` must be a string; `start.thread_id` must be a string. An event that fails validation is skipped with a logged warning. Full schema validation with size limits is out of scope.

### Key Entities

- **NDJSON Event**: A JSON object with a mandatory `type` discriminator (`start`, `token`, `tool_call_delta`, `tool_result`, `done`, `error`, `heartbeat`). Wire format: one JSON object per line, newline-delimited.
- **Tool-Call Record**: Client-side accumulator holding `tool_call_id`, `tool_call_index`, `tool_name`, accumulated `args_delta`, parsed arguments, status, timestamps, and result.
- **Request Context**: Per-request scope containing the NDJSON text buffer, `TextDecoder`, tool-call records, assistant text accumulator, `AbortController`, stall timer, and request ID.
- **Message Status**: Top-level state enum: `pending`, `streaming`, `completed`, `cancelled`, `interrupted`, `error`. No `waiting_for_tool` at message level.
- **Tool-Call Status**: Per-tool-call sub-state enum: `preparing`, `generating_args`, `completed`, `failed`. Tracked within each Tool-Call Record independently.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Assistant text begins appearing within 200ms of the first `token` event's `onToken` callback invocation (i.e., from dispatcher delivery to visible DOM update), before the backend finishes generating the full reply. The stream controller's internal overhead (decode → parse → dispatch → CueReader) is expected to be <1ms; the React render cycle is the measured variable.
- **SC-002**: NDJSON records split across up to 10 arbitrary byte-chunk boundaries are all parsed correctly with zero data loss in automated tests.
- **SC-003**: A stream of 500 rapid `token` events causes fewer than 60 React component re-renders per second on the conversation container (measured via React Profiler or equivalent, not raw DOM mutations). `requestAnimationFrame`-based batching (FR-021) ensures multiple tokens within one frame trigger a single re-render.
- **SC-004**: A backend `error` event preserves 100% of previously received assistant text and displays the error message within 100ms.
- **SC-005**: An unknown event type injected mid-stream results in zero visible errors to the visitor and correct rendering of all surrounding events.
- **SC-006**: Tool-call argument fragments spread across 20+ `tool_call_delta` events accumulate into a single valid JSON string with zero data loss.
- **SC-007**: Cancelling an in-flight request preserves all received content and prevents any subsequent events from that request from modifying the conversation.
- **SC-008**: The existing `[emotion:<name>]` cue marker continues to be stripped from finalized text and drives character emotion, with no regression from the current behavior.

## Out of Scope

The following areas are explicitly excluded from this feature. They are covered by the Frontend Technical Requirements document but belong to separate features:

- **Conversation persistence and reload**: Saving conversation history to local storage or server, and restoring it after page reload (Frontend Tech Reqs §15).
- **Multi-conversation switching**: Managing multiple concurrent conversations with scoped event routing between them (Frontend Tech Reqs §8.4–8.5).
- **Content security and sanitization**: HTML sanitization of assistant content, link validation, dangerous-scheme rejection, and raw-HTML-in-Markdown blocking (Frontend Tech Reqs §11).
- **Stream reconnection**: Resuming an interrupted stream using resumable event IDs or run-status retrieval (Frontend Tech Reqs §15.3).
- **Full observability infrastructure**: Dashboards, analytics pipelines, correlation-ID propagation to backend traces, and the full 15-metric set from Frontend Tech Reqs §16. Only the minimal metrics in FR-025 are in scope.
- **Protocol versioning negotiation**: Version headers, backward-compatible fallback, and version-mismatch handling (Frontend Tech Reqs §4.3). The current protocol has no version field.

## Assumptions

- The backend implements the NDJSON protocol as documented in `docs/Recommended_NDJSON_Protocol.md`, emitting `start`, `token`, `tool_call_delta`, `tool_result`, `done`, and `error` events.
- The backend emits one `start` event per request, zero or more intermediate events, and exactly one terminal event (`done` or `error`) unless the client disconnects.
- The backend normalizes `args_delta` to a string (never a raw object) as specified in the protocol document.
- The backend does not emit `done` after `error`.
- The backend does not currently emit a `tool_started` event; the frontend infers the "executing tool" state from the gap between the last `tool_call_delta` and the `tool_result`.
- Target browsers support the Fetch API with readable response bodies and `AbortController`.
- The emotional cue marker `[emotion:<name>]` remains appended to the end of assistant replies by the model, and is still processed by the existing `CueReader`.
- Tool-call UI rendering (collapsible panels, argument display) is a presentation concern handled by new components; the conversation data model provides the structured data.
