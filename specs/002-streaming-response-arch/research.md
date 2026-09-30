# Research: Streaming Response Architecture

**Feature**: 002-streaming-response-arch | **Date**: 2026-09-29

## R1: NDJSON Parser Design

**Decision**: Implement a stateless, callback-driven NDJSON parser as a single function that accepts decoded text chunks, buffers across calls, and invokes a callback for each complete JSON record.

**Rationale**: The parser is the lowest layer — it must be side-effect-free and independently testable. A callback design avoids coupling to React state. The buffer is a simple string accumulator; splitting on `\n`, stripping `\r`, ignoring blank lines, and calling `JSON.parse` on each complete line. This is the same approach used by every NDJSON client library (e.g., `ndjson-parse`, `can-ndjson-stream`) but with zero dependencies.

**Alternatives considered**:
- **TransformStream-based approach**: Wrapping a `TransformStream` around the response body to produce parsed objects. More "web-standard" but creates a stream-of-streams abstraction that complicates abort handling and buffer flushing. The parser and the consumer would be in separate microtask chains, making stall detection harder.
- **Async generator**: `async function*` that yields parsed events. Clean API but generators cannot be cancelled mid-yield without `return()`, and abort signal integration is awkward. Also harder to unit test without consuming the entire generator.
- **Third-party library** (`ndjson-parse`): Rejected per constitution I (prefer standard library). The parsing logic is ~30 lines.

## R2: Event Dispatcher Architecture

**Decision**: A synchronous dispatcher function that takes a parsed JSON object, validates the `type` field and per-type required fields, and calls the matching handler from a handler map. Unknown types are logged and skipped.

**Rationale**: Dispatch by `type` field is mandatory per FR-003. Runtime validation of required fields (FR-026) catches malformed backend events before they corrupt state. A handler map (`Record<string, (event) => void>`) is the simplest dispatch mechanism — no switch statement, no class hierarchy, no event bus. Each handler receives a typed event and updates the stream controller's state directly.

**Alternatives considered**:
- **EventTarget / custom events**: Browser-native but adds overhead of event object creation per token. Also forces async dispatch which complicates ordering guarantees.
- **Switch statement**: Works but less extensible. A map is one line per event type and trivially forward-compatible (unknown types fall through to the default handler).
- **Schema validation library** (Zod, io-ts): Rejected per constitution I. Four field checks (`typeof x === 'string'`) do not justify a dependency.

## R3: Stream Controller — Per-Request Context

**Decision**: A `StreamController` factory function that creates a per-request context object holding the NDJSON parser buffer, TextDecoder, CueReader instance, tool-call records map, stall timer, abort controller reference, metrics accumulator, and a `terminated` flag. The controller exposes `processChunk(bytes)`, `end()`, and `cancel()` methods.

**Rationale**: FR-016 requires per-request scoping. A factory function (not a class) returns a plain object with closures over the context. This avoids `this` binding issues in React callbacks, and the closure ensures the context is unreachable after the request ends — no stale reference can update it.

**Alternatives considered**:
- **Class-based controller**: Same behavior but adds `this` binding complexity in React hooks. The factory pattern is idiomatic for this codebase (see `createCueReader`).
- **React `useRef` for all state**: The current approach in `useConversation.ts`. Works but couples parsing logic to React. The controller must be testable without React, so refs are used only for the bridge between the controller and React state.
- **Separate modules with shared state**: Spreading the context across parser + dispatcher + hook via module-level state. Rejected because it would violate FR-016 (per-request scoping).

## R4: CueReader Integration Point

**Decision**: The CueReader receives each `token.content` string from the `token` event handler, not raw byte chunks. The controller calls `cueReader.push(tokenContent)` and uses the return value as the visible streaming text. On `done`, the controller calls `cueReader.end()` to extract the final text and emotion.

**Rationale**: Clarification Q1 confirmed per-token feeding. The CueReader's tail-buffer already handles the case where the `[emotion:...]` marker is split across tokens. By feeding `token.content` instead of raw decoded bytes, the CueReader operates at the correct abstraction level — it never sees NDJSON framing, `type` fields, or tool-call events.

**Alternatives considered**:
- **Post-done only**: Simpler but the marker would flash in the streaming bubble during the final tokens (the current CueReader's `safeLength()` function exists specifically to prevent this).
- **Custom marker-aware accumulator**: Replacing CueReader entirely. Rejected because the existing CueReader is tested, correct, and its interface (`push`/`end`) already matches the needed pattern.

## R5: Tool-Call Record Management

**Decision**: Tool-call records are stored in a `Map<string, ToolCallRecord>` keyed by a composite key: `tool_call_id` when known, falling back to `index-${tool_call_index}` when the ID has not yet arrived. When a later delta supplies the real `tool_call_id`, the record is re-keyed.

**Rationale**: The protocol doc (§5) states that `tool_call_id` may be null in early deltas and `tool_call_index` is the reliable ordering key. A Map allows O(1) lookup for correlation. Re-keying on ID arrival (rather than creating a new record) preserves accumulated argument text.

**Alternatives considered**:
- **Array indexed by `tool_call_index`**: Simpler but assumes indexes are always integers starting at 0. The protocol allows null indexes, which would require a fallback anyway.
- **Dual lookup (Map by ID + Map by index)**: Faster lookup at the cost of consistency management. The single-map approach with re-keying is simpler and the number of concurrent tool calls is small (typically 1-3).

## R6: Stall Detection Strategy

**Decision**: Keep the existing stall timer pattern from `useConversation.ts` (10-second `STALL_TIMEOUT_MS`), but move it into the stream controller. Every call to `processChunk()` resets the timer. The `heartbeat` event type also resets it (it passes through `processChunk` like any other event). On timeout, the controller calls `cancel()` with a `stalled` reason.

**Rationale**: The existing pattern is proven correct and tested by current behavior. Moving it into the controller centralizes all per-request lifecycle management. Heartbeat support (FR-020) comes for free since heartbeat events arrive as regular NDJSON records and trigger `processChunk`.

**Alternatives considered**:
- **Separate heartbeat timer**: A second timer specifically for heartbeat intervals. Unnecessary complexity — the stall timer already covers all event types.
- **Server-side timeout only**: The backend has its own timeout, but if the network drops after headers are sent, no server-side timeout can notify the client. Client-side stall detection is essential.

## R7: Metrics Collection

**Decision**: The stream controller records timestamps at key lifecycle points (`sendTime`, `firstTokenTime`, `endTime`) and increments per-type event counters. On stream end (done/error/cancel/interrupt), a `StreamMetrics` object is passed to an optional callback. No internal logging of conversation content.

**Rationale**: FR-025 requires minimal metrics. A callback interface keeps the metrics collection decoupled from any specific telemetry backend. The controller already knows all the lifecycle boundaries, so metric recording is zero-cost additions to existing state transitions.

**Alternatives considered**:
- **Console.log timing**: Simplest but not machine-readable. The callback allows structured consumption.
- **Performance.mark / Performance.measure**: Browser-native but only accessible via DevTools. A callback is more flexible.
- **Full telemetry SDK**: Out of scope per spec.

## R8: useConversation Refactoring Strategy

**Decision**: Refactor `useConversation.ts` to delegate stream consumption to the new `StreamController`. The hook creates a controller on each `send()`, passes the response body's reader to the controller, and receives state updates via callbacks that call React state setters. The hook retains ownership of React state, message array management, and the `finish()` helper.

**Rationale**: The hook currently mixes transport reading, text accumulation, cue parsing, stall detection, and state management in a single 300-line function. Extracting the stream processing into the controller reduces the hook to orchestration: create controller → feed reader → handle callbacks. This preserves the hook's API surface (`Conversation` interface) so no component changes are needed.

**Alternatives considered**:
- **Full rewrite**: Replace `useConversation` entirely. High risk of regression and unnecessary since the hook's external interface is correct.
- **Keep inline, just add NDJSON**: Minimally invasive but the hook would grow to 400+ lines with tool-call handling, violating constitution I (single responsibility).

## R9: Tool-Call Rendering UI

**Decision**: Implement a new `ToolActivity` React component that receives the list of tool calls for a message and renders them inside a single collapsible accordion. The accordion title indicates the overall status (`Using "tool_name"...` or `Tool finished` / `Tool failed`). The JSON strings are parsed and pretty-printed using `JSON.stringify(..., null, 2)` inside syntax-highlighted code blocks.

**Rationale**: The user requirements (Clarification Session 2) mandate separating the tool activity from the primary response text and styling it as a secondary, muted component. Grouping multiple tool calls inside a single parent accordion prevents UI clutter. Parsing and pretty-printing the JSON provides readability.

**Alternatives considered**:
- **Render directly in `MessageLog.tsx`**: Too much presentation logic added to an already complex file. Extracting `ToolActivity` is better for single responsibility.
- **Third-party JSON viewer**: We can use a simple `<pre><code>` block with `JSON.stringify` instead of adding a dependency, adhering to Constitution I.
