# Tasks: Streaming Response Architecture

**Input**: Design documents from `/specs/002-streaming-response-arch/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/ndjson-event-dispatch.md, quickstart.md

**Tests**: Included. Constitution II mandates tests for parsers, state machines, and external API paths. All three new modules qualify.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create shared type definitions and update existing types to support the new streaming architecture.

- [X] T001 Define wire event types (StartEvent, TokenEvent, ToolCallDeltaEvent, ToolResultEvent, DoneEvent, ErrorEvent, HeartbeatEvent), ToolCallRecord, ToolCallStatus, StreamMetrics, StreamOutcome, and StreamEventHandlers interfaces in lib/conversation/stream-types.ts per data-model.md
- [X] T002 Update MessageStatus type from `'complete' | 'streaming' | 'failed'` to `'pending' | 'streaming' | 'completed' | 'cancelled' | 'interrupted' | 'error'` in lib/conversation/limits.ts, and update all references across the codebase (components/MessageLog.tsx, components/ChatPanel.tsx, lib/conversation/useConversation.ts)
- [X] T003 Add user-facing copy strings for new message states (interrupted, cancelled) and backend error display to lib/ui/copy.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the NDJSON parser and event dispatcher — the two lowest layers that all user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 [P] Implement NDJSON parser in lib/conversation/ndjson-parser.ts: export a `createNdjsonParser(onRecord: (parsed: unknown) => void)` factory that returns `{ processText(text: string): void; flush(): void }`. Buffer incoming text, split on `\n`, strip trailing `\r`, ignore blank lines, JSON.parse each complete line, call onRecord. On parse failure of a newline-terminated line, log warning and skip. flush() parses any remaining non-empty buffer content. Per research.md R1
- [X] T005 [P] Implement event dispatcher in lib/conversation/event-dispatcher.ts: export a `createEventDispatcher(handlers: StreamEventHandlers)` factory that returns `{ dispatch(event: unknown): void }`. Validate event is a plain object with string `type` field. For each recognized type, validate required fields per contracts/ndjson-event-dispatch.md (token.content is string, tool_call_delta.args_delta is string, error.message is string, start.thread_id is string). Route to matching handler. Unknown types call onUnknown. Set terminated flag on done/error, ignore subsequent calls. Catch and log handler exceptions. Per research.md R2
- [X] T006 [P] Write unit tests for NDJSON parser in tests/unit/ndjson-parser.test.ts: test single record in one chunk, record split across 3 chunks, 3 records in one chunk, blank lines ignored, `\r\n` line endings handled, final record without trailing newline parsed on flush, invalid JSON on newline-terminated line logged and skipped, empty string input produces no callbacks
- [X] T007 [P] Write unit tests for event dispatcher in tests/unit/event-dispatcher.test.ts: test dispatch of all 7 event types to correct handlers, unknown type calls onUnknown, missing type field skipped with warning, non-object input skipped, token with non-string content skipped with warning, tool_call_delta with non-string args_delta skipped, events after done are ignored, events after error are ignored, handler exception caught and logged

**Checkpoint**: Parser and dispatcher are independently tested. All subsequent phases can build on them.

---

## Phase 3: User Story 1 - Incremental Text Streaming via NDJSON (Priority: P1) 🎯 MVP

**Goal**: Replace raw text-stream consumption with structured NDJSON event processing for the core start → token → done path.

**Independent Test**: Send a message to a backend returning `start → token × N → done`. Confirm single assistant bubble grows progressively, reaches completed state on done, and CueReader strips emotion markers from token content.

### Tests for User Story 1

- [X] T008 [P] [US1] Write unit tests for stream controller core path in tests/unit/stream-controller.test.ts: test that processChunk with bytes encoding `start + token + token + done` events produces correct onStatus, onText, and onComplete callbacks; verify CueReader receives each token.content via push(); verify cueReader.end() is called on done and emotion is returned; verify metrics record firstTokenTime and outcome=completed. Edge-case coverage: test that token events arriving without a preceding start event still create a streaming placeholder and log a protocol warning; test that done arriving with no preceding tokens finalizes an empty message

### Implementation for User Story 1

- [X] T009 [US1] Implement stream controller factory in lib/conversation/stream-controller.ts: export `createStreamController(options: StreamControllerOptions)` returning `{ processChunk(bytes: Uint8Array): void; end(): void; cancel(reason?: string): void }`. Internally create TextDecoder (streaming mode), NdjsonParser, EventDispatcher, CueReader, and RequestContext. Wire onToken handler to call cueReader.push(content) and invoke options.onText(visibleText) callback. Wire onStart to invoke options.onStatus('streaming'). Wire onDone to call cueReader.end(), invoke options.onComplete(text, emotion, metrics). Per research.md R3, R4
- [X] T010 [US1] Refactor useConversation.ts send() to use StreamController: replace the inline reader loop, TextDecoder, cue.push/end, and started flag with createStreamController. Create controller in send(), pass response.body.getReader() bytes to controller.processChunk() in the read loop, call controller.end() when reader reports done. Map controller callbacks to React state setters (onText → setMessages, onStatus → setStatus, onComplete → completeReply). Before entering the read loop, validate that `response.ok` is true and `response.body` is non-null (FR-022); handle HTTP 429 by mapping to `'limited'` status, and other non-2xx by mapping to `'error'` status with a user-safe message. Preserve existing abort handling for now (refactored in later tasks)
- [X] T011 [US1] Verify CueReader regression: run `npm test -- tests/unit/cue.test.ts` and confirm all existing tests pass without modification

**Checkpoint**: Core streaming path works end-to-end. Visitor sends message, sees progressive text, message completes on done. Emotion extracted. This is the MVP.

---

## Phase 4: User Story 2 - NDJSON Buffering and Fault-Tolerant Parsing (Priority: P1)

**Goal**: Ensure the parser handles all chunk-boundary edge cases correctly.

**Independent Test**: Feed mock ReadableStream with adversarial chunking (split records, multi-record chunks, no trailing newline). All records parse correctly.

### Implementation for User Story 2

- [X] T012 [US2] Ensure TextDecoder in stream controller uses streaming mode (`new TextDecoder('utf-8')` with `decode(bytes, { stream: true })`) and flushes on end (`decoder.decode()` without args) in lib/conversation/stream-controller.ts. Verify in existing T008 tests or add specific test cases for multibyte UTF-8 split across chunks in tests/unit/stream-controller.test.ts

**Checkpoint**: Parser correctly handles all NDJSON framing edge cases. Already covered by T006 parser tests — this task ensures the controller's decoder integration is correct.

---

## Phase 5: User Story 3 - Error Event Handling and Partial Preservation (Priority: P1)

**Goal**: Handle backend error events gracefully, preserving partial content.

**Independent Test**: Stream `start → token("partial") → error("failed")`. Partial text preserved, marked incomplete, safe error message displayed.

### Tests for User Story 3

- [X] T013 [P] [US3] Add stream controller error-path tests in tests/unit/stream-controller.test.ts: test processChunk with start + token + error events produces onText for partial content, then onError callback with message string and partial text preserved; verify metrics outcome=error; verify no further events processed after error. Edge-case coverage: test that error arriving with no preceding tokens invokes onError with empty partial text

### Implementation for User Story 3

- [X] T014 [US3] Wire onError handler in stream controller: on error event, call cueReader.end() on accumulated text, invoke options.onError(message, partialText, emotion, metrics) callback. Set terminated flag. In lib/conversation/stream-controller.ts
- [X] T015 [US3] Update useConversation.ts error path: map controller onError callback to preserve partial message (mark as 'error' status, keep text), display error.message via setNotice, call finish('error', errorMessage). Remove old catch-block error handling that duplicates this behavior

**Checkpoint**: Backend errors handled gracefully. Partial content preserved. Retry available.

---

## Phase 6: User Story 4 - Stream Interruption Detection (Priority: P2)

**Goal**: Distinguish connection closure without terminal event from normal completion.

**Independent Test**: Stream `start → token("partial")` then close. Message marked interrupted, not completed.

### Tests for User Story 4

- [X] T016 [P] [US4] Add stream controller interruption tests in tests/unit/stream-controller.test.ts: test that calling end() without a prior done or error event invokes onInterrupted callback with partial text; test that calling end() with no tokens received invokes onInterrupted with empty text; verify metrics outcome=interrupted

### Implementation for User Story 4

- [X] T017 [US4] Implement interruption detection in stream controller end() method: if terminated flag is false when end() is called, the stream closed without a terminal event. Call cueReader.end(), invoke options.onInterrupted(partialText, emotion, metrics). In lib/conversation/stream-controller.ts
- [X] T018 [US4] Update useConversation.ts to handle onInterrupted callback: if partial text exists, mark message as 'interrupted' status and preserve text. If no text, remove placeholder and show failedEmpty notice. Map to finish('error', copy.failedStalled)

**Checkpoint**: Interrupted streams correctly detected and presented.

---

## Phase 7: User Story 5 - Tool-Call Lifecycle (Priority: P2)

**Goal**: Accumulate tool-call deltas, correlate results, and expose tool-call records to the UI.

**Independent Test**: Stream tool_call_delta × N → tool_result. Confirm one tool record accumulates all deltas, result correlated by ID.

### Tests for User Story 5

- [X] T019 [P] [US5] Add tool-call accumulation tests in tests/unit/stream-controller.test.ts: test that multiple tool_call_delta events with same index accumulate into one ToolCallRecord; test sticky tool_name and tool_call_id retention when later deltas send null; test args_delta concatenation produces valid JSON; test tool_result correlation by tool_call_id; test parallel tool calls (different indexes) tracked independently; test re-keying from temp index-based key to real tool_call_id; test unmatched tool_result creates warning

### Implementation for User Story 5

- [X] T020 [US5] Implement tool-call record management in stream controller: add Map<string, ToolCallRecord> to RequestContext. In onToolCallDelta handler: find or create record by tool_call_id or index key, update sticky fields, append args_delta. In onToolResult handler: find record by tool_call_id, attach result, update status to completed/failed, record endTime. If no match, create unmatched record and log warning. In lib/conversation/stream-controller.ts
- [X] T021 [US5] Expose tool-call records from stream controller to useConversation: add options.onToolUpdate(toolCalls: ToolCallRecord[]) callback invoked after each tool_call_delta and tool_result. In useConversation.ts, store tool-call records in state associated with the current assistant message. Update Message type or create a separate tool-call state structure
- [X] T022 [US5] Add ToolCallRecord[] field to Message interface in lib/conversation/limits.ts. Ensure tool-call data is available to presentation layer

**Checkpoint**: Tool calls tracked end-to-end. Data available for UI rendering (US9).

---

## Phase 8: User Story 6 - Event-Type Dispatch and Forward Compatibility (Priority: P2)

**Goal**: Unknown event types are logged and skipped without crashing.

**Independent Test**: Insert `{"type":"future_feature"}` mid-stream. Logged, skipped, surrounding events render correctly.

### Implementation for User Story 6

- [X] T023 [US6] Verify onUnknown handler in event dispatcher logs event type at debug level and continues processing. Already implemented in T005 — this task is a verification pass confirming the behavior works end-to-end through the stream controller. Add one integration-style test in tests/unit/stream-controller.test.ts: stream with start + unknown + token + done, verify token is received and unknown is logged

**Checkpoint**: Forward compatibility verified.

---

## Phase 9: User Story 7 - Stale-Event and Concurrency Protection (Priority: P3)

**Goal**: Per-request scoping prevents stale events from updating wrong conversation.

**Independent Test**: Cancel request A, send request B. Late token from A does not appear in B.

### Tests for User Story 7

- [X] T024 [P] [US7] Add cancellation scoping tests in tests/unit/stream-controller.test.ts: test that calling cancel() sets terminated flag and subsequent processChunk calls are no-ops; test that cancel() invokes onCancelled callback with partial text; verify metrics outcome=cancelled

### Implementation for User Story 7

- [X] T025 [US7] Implement cancel() method in stream controller: set terminated flag, clear stall timer, call cueReader.end(), invoke options.onCancelled(partialText, emotion, metrics). In lib/conversation/stream-controller.ts
- [X] T026 [US7] Refactor useConversation.ts cancellation: replace the direct controller.abort() + stall-flag pattern with controller.cancel(). Ensure new controller is created on each send(), so old controller's terminated flag prevents stale updates. Move stalledRef logic into stream controller's stall timer handling
- [X] T027 [US7] Add client-generated requestId to stream controller options. Store in RequestContext. Pass to all callbacks so useConversation can verify events belong to the current request before applying state updates

**Checkpoint**: Stale-event protection verified. Each request fully scoped.

---

## Phase 10: User Story 8 - Heartbeat and Inactivity Timeout (Priority: P3)

**Goal**: Heartbeat events refresh the stall timer. Inactivity timeout fires when no events arrive.

**Independent Test**: Stream with heartbeat mid-silence resets timer. Stream with prolonged silence triggers stall.

### Tests for User Story 8

- [X] T028 [P] [US8] Add heartbeat and stall timer tests in tests/unit/stream-controller.test.ts: test that heartbeat event resets stall timer (use fake timers); test that stall timeout fires after configured interval with no events; test that stall timeout invokes cancel('stalled'); verify metrics outcome=stalled

### Implementation for User Story 8

- [X] T029 [US8] Implement stall timer in stream controller: start timer on first processChunk, reset on every subsequent processChunk (heartbeat events count since they pass through processChunk). On timeout, call cancel('stalled'). Use configurable STALL_TIMEOUT_MS (default 10_000). Clear timer in end() and cancel(). In lib/conversation/stream-controller.ts
- [X] T030 [US8] Wire heartbeat handler in event dispatcher: onHeartbeat is a no-op (stall timer reset already happens in processChunk before dispatch). Verify in tests

**Checkpoint**: Heartbeat and stall detection working.

---

## Phase 11: User Story 9 - Tool-Call & Response Rendering (Priority: P2)

**Goal**: Render tool calls in a secondary collapsible accordion and normal response text as primary focal text.

**Independent Test**: Stream a `tool_call_delta` followed by `tool_result`. Verify a "Tool activity" accordion appears at the top, starts closed, displays `Using "tool_name"...`, and formats JSON correctly when opened.

### Implementation for User Story 9

- [X] T031 [US9] Create `ToolActivity` React component in `components/ToolActivity.tsx` that accepts a `toolCalls: ToolCallRecord[]` prop. Render a parent `<details>` accordion that starts closed. The `<summary>` title should be `Using "{toolName}"...` if any tool is generating, `Tool failed` (with red border) if any failed, and `Tool finished` if all succeeded. Inside the accordion, loop through each tool call and render `argsAccumulator` and `result` inside syntax-highlighted (or well-styled) `<pre><code>` blocks, using `JSON.stringify(parsedArgs || rawString, null, 2)` to pretty-print.
- [X] T032 [US9] Update `components/MessageLog.tsx` to pass the `toolCalls` array from the `Message` object to the new `ToolActivity` component. Render `ToolActivity` at the top of the message bubble (if `toolCalls` has length > 0), and render the normal conversational text below it using the existing Markdown renderer.

**Checkpoint**: Tool activity separated from conversation text, visually structured per requirements.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Metrics, cleanup, and validation.

- [X] T033 Complete and verify StreamMetrics recording in stream controller (scaffolding partially exists from T009): ensure sendTime is recorded at construction, firstTokenTime at first token event, endTime and outcome at terminal state. Verify event counts by type are incremented. Verify computed fields timeToFirstToken and totalDuration. Ensure metrics are passed to all terminal callbacks (onComplete, onError, onInterrupted, onCancelled). In lib/conversation/stream-controller.ts
- [X] T034 [P] Add metrics tests in tests/unit/stream-controller.test.ts: verify all StreamMetrics fields populated correctly for completed, error, interrupted, cancelled, and stalled outcomes
- [X] T035 Remove dead code from useConversation.ts: remove the inline TextDecoder, cue.push loop, started flag, and stall timer that are now handled by stream controller. Ensure no duplicate state management remains
- [X] T036 Run full test suite (`npm test`) and verify zero failures, zero skips
- [X] T037 Run quickstart.md validation scenarios V1–V3 (automated) and V4–V9 (manual smoke tests)
- [X] T038 Implement requestAnimationFrame-based render batching for streaming token updates in lib/conversation/useConversation.ts (FR-021, SC-003): accumulate token text updates in a ref during the read loop and flush to React state via a single setState inside a requestAnimationFrame callback. Verify with a test or profiler measurement that 500 rapid token events produce fewer than 60 React re-renders per second on the conversation container

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (types must exist). BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2. MVP target
- **US2 (Phase 4)**: Depends on Phase 3 (builds on controller)
- **US3 (Phase 5)**: Depends on Phase 3 (extends controller with error path)
- **US4 (Phase 6)**: Depends on Phase 3 (extends controller with interruption)
- **US5 (Phase 7)**: Depends on Phase 3 (extends controller with tool-call management)
- **US6 (Phase 8)**: Depends on Phase 2 (dispatcher only — can run after foundational)
- **US7 (Phase 9)**: Depends on Phase 3 (extends controller with cancel + requestId)
- **US8 (Phase 10)**: Depends on Phase 3 (extends controller with stall timer)
- **US9 (Phase 11)**: Depends on Phase 7 (requires tool-call records in Message state)
- **Polish (Phase 12)**: Depends on all user story phases

### User Story Dependencies

- **US1 (P1)**: Foundational only — no story dependencies. **MVP**
- **US2 (P1)**: US1 (parser tested in foundational, controller integration in US1)
- **US3 (P1)**: US1 (extends controller error path)
- **US4 (P2)**: US1 (extends controller end() method)
- **US5 (P2)**: US1 (extends controller with tool-call map)
- **US6 (P2)**: Foundational only (dispatcher already handles unknown types)
- **US7 (P3)**: US1 (extends controller with cancel/requestId)
- **US8 (P3)**: US1 (extends controller with stall timer)
- **US9 (P2)**: US5 (needs tool-call records in Message array)

### Within Each User Story

- Tests written before or alongside implementation
- Controller extensions before hook integration
- Hook integration (useConversation) after controller logic

### Parallel Opportunities

- T004 + T005 + T006 + T007 in Phase 2 (4 files, no dependencies between them)
- US3 (Phase 5) + US4 (Phase 6) + US5 (Phase 7) can run in parallel after US1 (Phase 3) — they extend different parts of the controller
- US6 (Phase 8) can start after Phase 2 (does not depend on US1)
- US9 (Phase 11) can run in parallel with US6, US7, US8 after US5 completes
- T033 + T034 + T038 in Phase 12 can run in parallel with T035

---

## Parallel Example: Foundational Phase

```bash
# All four foundational tasks touch different files — run in parallel:
Task T004: "NDJSON parser in lib/conversation/ndjson-parser.ts"
Task T005: "Event dispatcher in lib/conversation/event-dispatcher.ts"
Task T006: "Parser tests in tests/unit/ndjson-parser.test.ts"
Task T007: "Dispatcher tests in tests/unit/event-dispatcher.test.ts"
```

## Parallel Example: Post-MVP Extensions

```bash
# After US1 (Phase 3) completes, these can run in parallel:
Phase 5 (US3 - Error handling): extends stream-controller.ts error path
Phase 6 (US4 - Interruption): extends stream-controller.ts end() method
Phase 7 (US5 - Tool calls): extends stream-controller.ts with tool-call map
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004–T007)
3. Complete Phase 3: User Story 1 (T008–T011)
4. **STOP and VALIDATE**: Run `npm test` + manual smoke test
5. Core streaming works end-to-end with NDJSON

### Incremental Delivery

1. Setup + Foundational → Parser and dispatcher tested ✓
2. US1 → Core streaming MVP ✓ → Validate
3. US2 + US3 → Robust parsing + error handling ✓ → Validate
4. US4 + US5 → Interruption detection + tool calls ✓ → Validate
5. US6 + US7 + US8 + US9 → Forward compat + concurrency + heartbeat + Tool UI ✓ → Validate
6. Polish → Metrics, cleanup, full validation ✓

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Constitution II requires tests for parser (loops), dispatcher (branching), controller (state machine)
- No new npm dependencies — uses TextDecoder, JSON.parse, Fetch API, Map
- CueReader (lib/conversation/cue.ts) is unchanged — only its input source changes (token.content instead of raw bytes)
- Component files (MessageLog, ChatPanel, etc.) may need minor status-string updates in T002
- `ToolActivity` handles JSON formatting for `US9`
