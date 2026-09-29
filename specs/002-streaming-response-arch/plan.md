# Implementation Plan: Streaming Response Architecture

**Branch**: `002-streaming-response-arch` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-streaming-response-arch/spec.md`

## Summary

Replace the current opaque text-stream consumption in `useConversation` with a structured NDJSON event pipeline. The backend already emits `start`, `token`, `tool_call_delta`, `tool_result`, `done`, and `error` events per the [Recommended NDJSON Protocol](../../docs/Recommended_NDJSON_Protocol.md). The frontend currently treats the response body as a raw character stream, feeding bytes into a `CueReader` that strips emotion markers. This feature introduces three new layers between the transport and the conversation state:

1. **NDJSON parser** — buffers, frames, and JSON-parses newline-delimited records from the byte stream.
2. **Event dispatcher** — validates the `type` field and required per-type fields, then routes each event to the correct handler.
3. **Stream controller** — orchestrates a per-request context holding the parser, dispatcher, tool-call records, CueReader, metrics, stall timer, and abort controller.

The existing `CueReader` is preserved: it receives each `token.content` incrementally (clarification Q1). The existing `backend.ts` transport and `useConversation` hook are refactored, not replaced. All new modules live in `lib/conversation/` alongside existing code.

## Technical Context

**Language/Version**: TypeScript 5.x in `strict` mode on Node 20+ (Next.js App Router)

**Primary Dependencies**: Next.js 16 (App Router), React 19, Vitest + jsdom (unit tests), Playwright (e2e). No new dependencies required — NDJSON parsing and event dispatch use only `TextDecoder`, `JSON.parse`, and the Fetch API.

**Storage**: N/A. All state is in-memory for the visit only. No persistence changes.

**Testing**: Vitest (unit tests for parser, dispatcher, stream controller). Existing `cue.test.ts` validates CueReader integration. New test files for each new module.

**Target Platform**: Modern browsers with Fetch API, ReadableStream, AbortController, TextDecoder.

**Project Type**: Web application — frontend-only Next.js project (no API routes).

**Performance Goals**: <200ms time-to-first-visible-token (SC-001); <60 DOM re-renders/sec during streaming (SC-003); zero data loss on split chunks (SC-002).

**Constraints**: No new npm dependencies (constitution I — prefer standard library). CueReader must continue to drive emotion (FR-024). All content untrusted but sanitization is out of scope (spec Out of Scope). Conversation persistence out of scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | ✅ Pass | Each new module has single responsibility (parser, dispatcher, controller). No speculative abstraction — interfaces match exactly one implementation per module. No new dependencies. |
| II. Testing Standards | ✅ Pass | Parser, dispatcher, and controller all contain non-trivial logic (loops, state machines, branching). Tests planned for each. CueReader already tested. |
| III. User Experience Consistency | ✅ Pass | Error messages use existing `copy` module. Streaming states reuse existing `ConversationStatus` values. No new visual tokens introduced without shared definition. |
| IV. Performance Requirements | ✅ Pass | SC-001 (200ms TTFT), SC-003 (<60 re-renders/sec) are measurable. `requestAnimationFrame` batching prevents per-token re-renders. |
| Additional Constraints — Language | ✅ Pass | TypeScript strict mode, no new runtime. |
| Additional Constraints — Logging | ✅ Pass | Protocol warnings logged at debug level. No conversation content in logs (FR-025 metrics emit counts, not content). |

No violations. Gate passes.

## Project Structure

### Documentation (this feature)

```text
specs/002-streaming-response-arch/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: design decisions
├── data-model.md        # Phase 1: types and state transitions
├── quickstart.md        # Phase 1: validation guide
├── contracts/
│   └── ndjson-event-dispatch.md  # Event dispatch contract
└── checklists/
    └── requirements.md  # Quality checklist
```

### Source Code (repository root)

```text
lib/conversation/
├── backend.ts           # Existing — HTTP transport (sendMessage, createThread)
├── cue.ts               # Existing — emotion cue marker parsing (unchanged)
├── limits.ts            # Existing — message types, input limits
├── useConversation.ts   # Existing — refactored to use StreamController
├── ndjson-parser.ts     # NEW — NDJSON buffering, framing, JSON parsing
├── event-dispatcher.ts  # NEW — type-based dispatch + field validation
├── stream-controller.ts # NEW — per-request orchestrator (context, metrics, stall timer)
└── stream-types.ts      # NEW — shared type definitions for events, tool records, metrics

tests/unit/
├── cue.test.ts          # Existing — CueReader tests (unchanged, regression guard)
├── ndjson-parser.test.ts    # NEW — chunk splitting, multi-record, blank lines, CR/LF
├── event-dispatcher.test.ts # NEW — type dispatch, validation, unknown events
└── stream-controller.test.ts # NEW — end-to-end stream lifecycle, stall, cancel, metrics
```

**Structure Decision**: All new code lands in `lib/conversation/` — the existing home for streaming logic. Four new files (3 modules + 1 types file) keep responsibilities isolated. No new directories needed. The three test files mirror the three modules exactly.

## Complexity Tracking

No constitution violations to justify. No complexity tracking entries needed.
