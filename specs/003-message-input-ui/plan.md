# Implementation Plan: message-input-ui

**Branch**: `003-message-input-ui` | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-message-input-ui/spec.md` and `docs/frontend_backend_readiness.md`

## Summary

Redesign the message input component to use an adaptive, auto-expanding layout that transitions from a single-line bar to a multi-line composition card. Coordinate frontend startup with a `GET /health/ready` readiness check (bounded exponential backoff with full jitter and a 120-second overall deadline) that gates all backend-dependent startup requests (`POST /threads` with an independent 10-second timeout, `GET /conversations`, and `POST /models`) and supports clean in-place retry without overlapping polling loops. Implement the sidebar "New Chat" functionality, conversation history loading, stream cancellation, and HITL interrupt confirmation UI.

## Technical Context

**Language/Version**: TypeScript (Strict Mode) on Node (Next.js App Router)

**Primary Dependencies**: React (Next.js), existing styling solution (CSS/Tailwind), standard Fetch & AbortController APIs (no new third-party dependencies)

**Storage**: `sessionStorage` for active thread/messages/draft caching; in-memory React state for readiness and UI lifecycle

**Testing**: Vitest (Unit & Component with fake timers and injected `fetchFn`/`randomFn`), Playwright (E2E)

**Target Platform**: Web Browsers (Desktop & Mobile)

**Project Type**: Web Application (Next.js)

**Performance Goals**: 60fps for UI morphing animations; First visible UI feedback < 100ms; zero duplicate readiness polling loops on startup or retry

**Constraints**: Accessible (WCAG AA) focus states; no blocking UI thread during layout recalculation; no raw HTTP status codes or stack traces in user-visible error states; two independent startup timeouts (120s for `GET /health/ready`, then 10s for `POST /threads`).

**Scale/Scope**: Frontend startup readiness module, conversation hook orchestration, and UI components (`LoadingOverlay`, `Sidebar`, `ChatPanel`, `MessageInput`, `ChatInput`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Code Quality (PASS)**: `lib/conversation/backend-readiness.ts` has a single stated responsibility (polling `GET /health/ready` with bounded exponential backoff, jitter, per-request timeout, and cancellation). Uses standard platform APIs (`fetch`, `AbortController`, `setTimeout`) with zero new dependencies. Strict TypeScript types applied across all options, results, and error classes.
- **II. Testing Standards (PASS)**: `waitForBackendReady` accepts injectable `fetchFn` and `randomFn` so unit tests in `tests/unit/backend-readiness.test.ts` and `tests/unit/useConversation.test.ts` are 100% deterministic with fake timers and zero network or wall-clock reliance.
- **III. User Experience Consistency (PASS)**: Startup shows immediate visual feedback via `LoadingOverlay` (`public/assets/loader.gif`), holds back `POST /threads`, `GET /conversations`, and `POST /models` until readiness succeeds so background components do not flash premature errors, and surfaces a generic, actionable error message (`copy.backendUnavailable`) with a "Retry" button on timeout or permanent `4xx` without leaking raw status codes.
- **IV. Performance Requirements (PASS)**: CSS transitions used for morphing to guarantee 60fps off the main UI thread; full jitter (`0` to capped exponential limit) prevents synchronized client retry spikes; `AbortController` cleans up in-flight requests on unmount or retry.

## Project Structure

### Documentation (this feature)

```text
specs/003-message-input-ui/
├── plan.md              # This file
├── research.md          # Phase 0 output (R1–R6)
├── data-model.md        # Phase 1 output (MessageInputState, Readiness types, Startup state machine)
├── contracts/
│   ├── API.md           # Phase 1 output (GET /health/ready, POST /threads, GET /conversations, POST /models)
│   └── MessageInput.md  # Phase 1 output (MessageInput, Sidebar, LoadingOverlay prop contracts)
├── quickstart.md        # Phase 1 output (Validation scenarios 1–4)
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
app/
├── globals.css
└── page.tsx                             # Wires conversation.isBackendReady and conversation.retryStartup
components/
├── ChatPanel.tsx                        # Passes isBackendReady to MessageInput
├── ChatInput.tsx                        # Adaptive message input wrapper
├── MessageInput.tsx                     # Gates initial POST /models on isBackendReady
├── Sidebar.tsx                          # Gates initial GET /conversations on isBackendReady
├── LoadingOverlay.tsx                   # Renders startup loader and generic error + Retry button
└── LoadingSkeleton.tsx                  # Skeleton loader for sidebar and chat history
lib/
└── conversation/
    ├── backend-readiness.ts             # New: waitForBackendReady, BackendReadinessError, ReadinessOptions
    ├── backend.ts                       # Exports checkBackendReady / createThread (with timeout/signal support)
    └── useConversation.ts               # Orchestrates Phase 1 (120s readiness) -> Phase 2 (10s POST /threads) & retryStartup
tests/
├── unit/
│   ├── backend-readiness.test.ts        # New: Unit tests for readiness polling, backoff, jitter, 4xx/5xx, timeouts
│   ├── backend.test.ts                  # Unit tests for backend client wrapper
│   └── useConversation.test.ts          # Unit tests for startup gating, 120s/10s timeouts, and retryStartup
├── components/
│   ├── ChatInput.test.tsx
│   ├── LoadingOverlay.test.tsx
│   ├── MessageInput.test.tsx
│   └── Sidebar.test.tsx
└── e2e/
    └── message-input.spec.ts
```

**Structure Decision**: Next.js App Router structure keeping network/readiness coordination inside `lib/conversation/` (`backend-readiness.ts`, `backend.ts`, `useConversation.ts`) and UI presentation in `components/` and `app/page.tsx`.
