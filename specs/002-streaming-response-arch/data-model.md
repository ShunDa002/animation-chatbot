# Data Model: Streaming Response Architecture

**Feature**: 002-streaming-response-arch | **Date**: 2026-09-29

## 1. Wire Event Types (NDJSON Protocol)

These are the JSON shapes received from the backend. Defined in `stream-types.ts`.

### BaseEvent

All events share a `type` discriminator.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | `string` | Yes | Discriminator. One of: `start`, `token`, `tool_call_delta`, `tool_result`, `done`, `error`, `heartbeat`. |

### StartEvent

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | `"start"` | Yes | Literal. |
| `thread_id` | `string` | Yes | Thread ID from the original request. |

### TokenEvent

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | `"token"` | Yes | Literal. |
| `content` | `string` | Yes | Incremental text fragment. Append to accumulator. |
| `node` | `string \| null` | No | LangGraph node metadata. Informational only. |

### ToolCallDeltaEvent

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | `"tool_call_delta"` | Yes | Literal. |
| `tool_name` | `string \| null` | No | Present in first delta, null in subsequent. Sticky — retain last known value. |
| `tool_call_id` | `string \| null` | No | Present in first delta, null in subsequent. Sticky. |
| `tool_call_index` | `number \| null` | No | Position in model output. Used for correlation when ID is null. |
| `args_delta` | `string` | Yes | Argument fragment. Always a string (backend normalizes). Append to accumulator. |
| `node` | `string \| null` | No | LangGraph node metadata. |

### ToolResultEvent

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | `"tool_result"` | Yes | Literal. |
| `tool_name` | `string \| null` | No | May differ from delta's tool_name. |
| `tool_call_id` | `string \| null` | No | Primary correlation key. |
| `content` | `unknown` | Yes | Result payload. May be string, array, or object. |
| `status` | `string \| null` | No | `"success"`, `"error"`, or null. |
| `node` | `string \| null` | No | LangGraph node metadata. |

### DoneEvent

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | `"done"` | Yes | Literal. No other fields. |

### ErrorEvent

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | `"error"` | Yes | Literal. |
| `message` | `string` | Yes | User-safe error description. |

### HeartbeatEvent

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | `"heartbeat"` | Yes | Literal. No other fields required. |

## 2. Client-Side State Types

### ToolCallRecord

Accumulated in the stream controller. One per logical tool call.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | `tool_call_id` when known, else `index-${tool_call_index}`, else auto-generated temp ID. |
| `toolCallId` | `string \| null` | Real ID from protocol. Initially null for some deltas. |
| `toolCallIndex` | `number \| null` | Position from model output. |
| `toolName` | `string \| null` | Sticky — first non-null value retained. |
| `argsAccumulator` | `string` | Concatenated `args_delta` values. |
| `parsedArgs` | `unknown \| null` | Result of `JSON.parse(argsAccumulator)` when valid. Null during accumulation. |
| `status` | `ToolCallStatus` | Current sub-state. |
| `startTime` | `number` | `performance.now()` at first delta. |
| `endTime` | `number \| null` | `performance.now()` at result or failure. |
| `result` | `unknown \| null` | Content from `tool_result` event. |
| `error` | `string \| null` | Error info if tool failed. |

### ToolCallStatus (enum)

```
preparing       → First tool_call_delta received, no name yet
generating_args → tool_name known, args_delta accumulating
completed       → Matching tool_result received with success status
failed          → Matching tool_result received with error status, or stream ended without result
```

### State Transitions

```
preparing ──[tool_name arrives]──→ generating_args
generating_args ──[tool_result success]──→ completed
generating_args ──[tool_result error]──→ failed
generating_args ──[stream ends without result]──→ failed
preparing ──[tool_result arrives]──→ completed/failed (rare: ID arrived with result)
```

### MessageStatus (top-level, updated from existing)

Current `MessageStatus` in `lib/conversation/limits.ts`:
```typescript
export type MessageStatus = 'complete' | 'streaming' | 'failed';
```

Updated to:
```typescript
export type MessageStatus =
  | 'pending'
  | 'streaming'
  | 'completed'
  | 'cancelled'
  | 'interrupted'
  | 'error';
```

**Migration**: `'complete'` → `'completed'`, `'failed'` → `'error'`. The `'pending'` state is new (before `start` event). `'cancelled'` and `'interrupted'` are new terminal states.

### State Transitions (Message)

```
pending ──[start event]──→ streaming
pending ──[token without start]──→ streaming (+ protocol warning)
streaming ──[done event]──→ completed
streaming ──[error event]──→ error
streaming ──[user cancel]──→ cancelled
streaming ──[connection close, no terminal event]──→ interrupted
streaming ──[stall timeout]──→ interrupted
pending ──[HTTP error before streaming]──→ error
```

### StreamMetrics

Emitted on stream end via callback.

| Field | Type | Notes |
|-------|------|-------|
| `sendTime` | `number` | `performance.now()` at request send. |
| `firstTokenTime` | `number \| null` | `performance.now()` at first `token` event. Null if no tokens received. |
| `endTime` | `number` | `performance.now()` at stream end. |
| `timeToFirstToken` | `number \| null` | `firstTokenTime - sendTime`. Null if no tokens. |
| `totalDuration` | `number` | `endTime - sendTime`. |
| `eventCounts` | `Record<string, number>` | Count of events by `type`. |
| `toolCallCount` | `number` | Number of distinct tool calls observed. |
| `outcome` | `StreamOutcome` | Terminal state. |

### StreamOutcome (enum)

```
completed    → done event received
error        → error event received
cancelled    → user-initiated abort
interrupted  → connection closed without terminal event
stalled      → inactivity timeout fired
```

### RequestContext (internal to StreamController)

Not exported. Lives as closure state inside the controller factory.

| Field | Type | Notes |
|-------|------|-------|
| `requestId` | `string` | Client-generated unique ID. |
| `buffer` | `string` | NDJSON text accumulator. |
| `decoder` | `TextDecoder` | Streaming UTF-8 decoder instance. |
| `cueReader` | `CueReader` | Emotion marker parser. |
| `toolCalls` | `Map<string, ToolCallRecord>` | Active tool-call records. |
| `terminated` | `boolean` | True after any terminal event or cancel. Blocks further processing. |
| `metrics` | `StreamMetrics` (partial) | Accumulated during stream. Finalized on end. |
| `stallTimer` | `ReturnType<typeof setTimeout> \| null` | Reset on every chunk. |

## 3. Existing Types (unchanged)

### Message (lib/conversation/limits.ts)

The `Message` interface expands to include the `toolCalls` array so the UI can render the ToolActivity accordion, which persists multiple sequential tool calls and remains visible after message completion.
- `toolCalls?: ToolCallRecord[]` — Array of tool calls associated with this message.
- `status` — Expanded to include new states (see MessageStatus above).
- `text` — Continues to hold CueReader-stripped display text.

### Emotion (lib/emotion.ts)

Unchanged. The CueReader continues to extract the emotion from the trailing `[emotion:<name>]` marker.

### ConversationStatus (lib/conversation/useConversation.ts)

Current: `'connecting' | 'idle' | 'waiting' | 'streaming' | 'error' | 'limited'`

No change needed. The hook maps stream controller outcomes to these existing values:
- `start` event → `'streaming'`
- `done` event → `'idle'`
- `error`/interrupted/stalled → `'error'`
- User cancel → `'idle'` (turn ends, can send again)
- Rate limit (HTTP 429) → `'limited'`
