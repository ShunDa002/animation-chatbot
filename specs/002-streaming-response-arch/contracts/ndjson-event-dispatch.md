# Contract: NDJSON Event Dispatch

**Feature**: 002-streaming-response-arch | **Date**: 2026-09-29

## Purpose

Defines the contract between the NDJSON parser (producer) and the event handlers (consumers) in the streaming pipeline. This contract ensures that:

1. Every parsed JSON record is dispatched exactly once based on its `type` field.
2. Required fields are validated before any handler is invoked.
3. Unknown event types are handled gracefully.
4. Terminal events (`done`, `error`) prevent further processing.

## Participants

```
ReadableStream (bytes)
    │
    ▼
NdjsonParser.processText(decodedText)
    │ callback per complete JSON record
    ▼
EventDispatcher.dispatch(parsedObject)
    │ validates type + required fields
    │ routes to handler
    ▼
Handler: onStart | onToken | onToolCallDelta | onToolResult | onDone | onError | onHeartbeat | onUnknown
    │
    ▼
StreamController state updates
```

## Parser → Dispatcher Contract

The parser calls the dispatcher's `dispatch(event: unknown)` function once per complete NDJSON record.

**Preconditions** (guaranteed by parser):
- `event` is a value returned by `JSON.parse()` — always a valid JSON value.
- The parser has already stripped `\r`, ignored blank lines, and handled buffer boundaries.
- One call per complete record, in arrival order.

**Postconditions** (guaranteed by dispatcher):
- If `event` is not a plain object, skip with warning.
- If `event.type` is not a string, skip with warning.
- If `event.type` is recognized, validate required fields per type. Skip with warning on validation failure.
- If `event.type` is unknown, call `onUnknown(event)` (log and continue).
- After `done` or `error`, set `terminated = true`. Subsequent calls to `dispatch()` are no-ops.

## Required Field Validation Rules

| Event Type | Required Fields | Validation |
|------------|----------------|------------|
| `start` | `thread_id` | `typeof thread_id === 'string'` |
| `token` | `content` | `typeof content === 'string'` |
| `tool_call_delta` | `args_delta` | `typeof args_delta === 'string'` |
| `tool_result` | `content` | `content !== undefined` (any JSON value accepted) |
| `error` | `message` | `typeof message === 'string'` |
| `done` | (none) | Type field alone is sufficient. |
| `heartbeat` | (none) | Type field alone is sufficient. |

Optional/nullable fields (`tool_name`, `tool_call_id`, `tool_call_index`, `node`, `status`) are accepted as-is. Null means "not provided in this event" and must not overwrite previously known values in tool-call records.

## Handler Signatures

```typescript
interface StreamEventHandlers {
  onStart(event: StartEvent): void;
  onToken(event: TokenEvent): void;
  onToolCallDelta(event: ToolCallDeltaEvent): void;
  onToolResult(event: ToolResultEvent): void;
  onDone(): void;
  onError(event: ErrorEvent): void;
  onHeartbeat(): void;
  onUnknown(event: unknown): void;
}
```

Each handler is called synchronously from `dispatch()`. Handlers must not throw — errors in handlers are caught and logged without terminating the stream.

## Terminal Event Semantics

- `done` and `error` are mutually exclusive terminal events.
- After either is received, the dispatcher sets an internal `terminated` flag.
- Subsequent calls to `dispatch()` are silently ignored.
- The backend does not emit `done` after `error`.
- If the HTTP stream closes without either, the controller classifies the outcome as `interrupted` — this is not a dispatch concern but a controller concern.

## Ordering Guarantees

- Events are dispatched in the order they arrive on the wire.
- The parser preserves arrival order across chunk boundaries.
- The dispatcher does not reorder events.
- Tool-call delta ordering within a single tool call is preserved by concatenation order.

## Error Handling

| Error Type | Handler |
|------------|---------|
| JSON parse failure on newline-terminated line | Parser logs warning, skips line, continues. |
| Event is not a plain object | Dispatcher logs warning, skips. |
| Missing `type` field | Dispatcher logs warning, skips. |
| Known type, missing required field | Dispatcher logs warning, skips event. |
| Unknown `type` value | Dispatcher calls `onUnknown()`, continues. |
| Exception in handler | Dispatcher catches, logs, continues. |
| Event after terminal event | Dispatcher silently ignores (no log — expected during stream wind-down). |
