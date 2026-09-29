# Quickstart Validation Guide: Streaming Response Architecture

**Feature**: 002-streaming-response-arch | **Date**: 2026-09-29

## Prerequisites

- Node 20+ installed
- Repository cloned with `npm install` completed
- Backend running at `http://127.0.0.1:8000` (or `NEXT_PUBLIC_BACKEND_URL` configured)
- Backend implements the NDJSON protocol per [Recommended_NDJSON_Protocol.md](../../docs/Recommended_NDJSON_Protocol.md)

## Validation Scenarios

### V1: Unit Tests Pass (all new modules)

Proves: NDJSON parser, event dispatcher, and stream controller logic are correct in isolation.

```bash
npm test -- --reporter=verbose tests/unit/ndjson-parser.test.ts tests/unit/event-dispatcher.test.ts tests/unit/stream-controller.test.ts
```

**Expected**: All tests pass. Coverage includes:
- Chunk splitting (single record split across 3+ chunks)
- Multi-record chunks (3 records in one chunk)
- Blank line and `\r\n` handling
- Final record without trailing newline
- Type-based dispatch for all 7 event types
- Unknown event type logged and skipped
- Required field validation failures logged and skipped
- Terminal event prevents subsequent processing
- Stall timeout fires after configured interval
- Cancel preserves partial content
- Metrics recorded correctly

### V2: CueReader Regression (existing tests still pass)

Proves: CueReader integration is not broken by the new pipeline.

```bash
npm test -- --reporter=verbose tests/unit/cue.test.ts
```

**Expected**: All existing cue tests pass without modification. The CueReader's `push`/`end` interface is unchanged.

### V3: Full Test Suite Green

Proves: No regressions across the entire project.

```bash
npm test
```

**Expected**: All unit and component tests pass. Zero failures, zero skips.

### V4: Manual Smoke Test — Happy Path

Proves: End-to-end streaming works through the real backend.

1. Start the backend: (per backend project instructions)
2. Start the frontend: `npm run dev`
3. Open `http://localhost:3000` in browser
4. Send a message: "Hello, how are you?"

**Expected**:
- Assistant text appears word-by-word (not all at once)
- Streaming indicator shows during generation
- Message status transitions: waiting → streaming → completed
- Character emotion updates on completion
- Input composer re-enables after completion

### V5: Manual Smoke Test — Error Recovery

Proves: Backend errors are handled gracefully.

1. Stop the backend mid-response (kill the process while a response is streaming)

**Expected**:
- Partial text remains visible
- Message is marked as interrupted (not completed)
- Error notice appears
- Input composer re-enables (visitor can send again)

### V6: Manual Smoke Test — Cancellation

Proves: User-initiated stop works correctly.

1. Send a message that will produce a long response
2. Click the stop button while text is streaming

**Expected**:
- Stream stops immediately
- Partial text is preserved
- Message is marked as cancelled
- No error message shown (cancellation is intentional)
- Input composer re-enables

### V7: DevTools Verification — NDJSON Parsing

Proves: The frontend correctly interprets NDJSON framing.

1. Open browser DevTools → Network tab
2. Send a message
3. Inspect the `/chat` request response

**Expected**:
- Response content-type is `application/x-ndjson`
- Response body shows newline-separated JSON objects
- Each object has a `type` field
- First object is `{"type":"start","thread_id":"..."}`
- Last object is `{"type":"done"}`
- Console shows no JSON parse errors

### V8: Performance Verification

Proves: Streaming meets performance targets.

1. Open browser DevTools → Performance tab
2. Start recording
3. Send a message and wait for completion
4. Stop recording

**Expected**:
- Time from send to first visible text: <300ms (SC-001 is 200ms from first token event, plus render time)
- No dropped frames during streaming (target 60fps)
- No full-conversation re-renders per token (check React DevTools Profiler if available)

## Key Files to Inspect

| File | What to verify |
|------|---------------|
| [stream-types.ts](../../lib/conversation/stream-types.ts) | Event type definitions match [data-model.md](./data-model.md) |
| [ndjson-parser.ts](../../lib/conversation/ndjson-parser.ts) | Buffer, split, parse logic per [contract](./contracts/ndjson-event-dispatch.md) |
| [event-dispatcher.ts](../../lib/conversation/event-dispatcher.ts) | Type dispatch + field validation per [contract](./contracts/ndjson-event-dispatch.md) |
| [stream-controller.ts](../../lib/conversation/stream-controller.ts) | Per-request context, CueReader integration, stall timer, metrics |
| [useConversation.ts](../../lib/conversation/useConversation.ts) | Refactored to delegate to StreamController |

## Definition of Done

All validation scenarios (V1–V8) pass. No new npm dependencies added. No changes to component files outside `lib/conversation/`. All existing tests remain green.
