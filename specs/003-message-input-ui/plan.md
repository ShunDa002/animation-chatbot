# Implementation Plan: message-input-ui

**Branch**: `003-message-input-ui` | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-message-input-ui/spec.md`, `docs/frontend_backend_readiness.md`, and `docs/rag_frontend_implementation_plan.md`

## Summary

Redesign the message input component to use an adaptive, auto-expanding layout that transitions from a single-line bar to a multi-line composition card. Integrate RAG document upload on the Attachment (`+`) button inside `MessageInput` with an inline upload panel, client-side validation (`.pdf`, `.txt`, `.md`, `.docx` up to `3 MB`), distinct `Uploading` → `Processing` transitions over `POST /rag/upload` (`multipart/form-data` with `file` and `thread_id`), informational duplicate detection (`Already Added`), error recovery (**Retry**, **Replace**, **Remove**), and per-`threadId` state scoping. Coordinate frontend startup with a `GET /health/ready` readiness check (bounded exponential backoff with full jitter and a 120-second overall deadline) that gates all backend-dependent startup requests (`POST /threads` with an independent 10-second timeout, `GET /conversations`, and `POST /models`). Implement the sidebar "New Chat" functionality, conversation history loading, stream cancellation, and HITL interrupt confirmation UI.

## Technical Context

**Language/Version**: TypeScript (Strict Mode) on Node (Next.js App Router)

**Primary Dependencies**: React (Next.js), existing styling solution (CSS/Tailwind), standard Browser APIs (`fetch`, `XMLHttpRequest`, `FormData`, `File`, `AbortController` — zero new third-party dependencies)

**Storage**: `sessionStorage` for active thread/messages/draft caching; in-memory React state for readiness, UI lifecycle, and per-`threadId` RAG upload state

**Testing**: Vitest (Unit & Component with fake timers and injected `fetchFn`/`randomFn`/`xhrFactory`), Playwright (E2E)

**Target Platform**: Web Browsers (Desktop, Tablet, & Mobile)

**Project Type**: Web Application (Next.js)

**Performance Goals**: 60fps for UI morphing animations; First visible UI feedback < 100ms; zero duplicate readiness polling loops on startup or retry; zero duplicate concurrent RAG uploads

**Constraints**: Accessible (WCAG AA) focus states and live status announcements; no blocking UI thread during layout recalculation; no raw HTTP status codes, file paths, or content hashes in user-visible states; client-side RAG file cap of `3 MB` for `.pdf`, `.txt`, `.md`, `.docx`; two independent startup timeouts (120s for `GET /health/ready`, then 10s for `POST /threads`).

**Scale/Scope**: Frontend startup readiness module, RAG upload client & validator, conversation hook orchestration, and UI components (`LoadingOverlay`, `Sidebar`, `ChatPanel`, `MessageInput`, `ChatInput`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Code Quality (PASS)**:
  - `lib/conversation/limits.ts` handles boundary validation for input length and RAG file constraints (`.pdf`, `.txt`, `.md`, `.docx`, `0 < size <= 3 MB`).
  - `lib/conversation/backend.ts` encapsulates `uploadRagDocument` (`POST /rag/upload`) using standard browser `FormData` and `XMLHttpRequest` with zero new third-party dependencies.
  - Strict TypeScript types applied across all options, results, and error paths.
- **II. Testing Standards (PASS)**:
  - `uploadRagDocument` and `MessageInput` RAG flows are deterministically testable in Vitest without real network access or wall-clock timers.
  - Full unit and component test coverage added for valid uploads, client-side validation rejections (`0` bytes, unsupported extension, `> 3 MB`, missing `threadId`), `Uploading` → `Processing` transitions, `Ready` vs. `Already Added` duplicate responses, failure **Retry**, and per-`threadId` state isolation.
- **III. User Experience Consistency (PASS)**:
  - All user-visible RAG upload copy (labels, pre-selection guidance, progress/processing messages, ready/duplicate banners, and actionable error messages) is defined once in `lib/ui/copy.ts` and referenced by `MessageInput` and `limits.ts`.
  - Clicking the Attachment (`+`) button provides immediate (<100ms) visual feedback by toggling the inline upload panel; status changes are announced via an accessible `role="status"` / `aria-live="polite"` region; errors never expose raw HTTP codes, stack traces, or content hashes.
- **IV. Performance Requirements (PASS)**:
  - Client-side validation rejects oversized (`> 3 MB`) or invalid files immediately in <1ms without allocating network buffers or blocking the main thread.

## Project Structure

### Documentation (this feature)

```text
specs/003-message-input-ui/
├── plan.md              # This file
├── research.md          # Phase 0 output (R1–R9)
├── data-model.md        # Phase 1 output (MessageInputState, RAG Upload types, Readiness types)
├── contracts/
│   ├── API.md           # Phase 1 output (GET /health/ready, POST /threads, GET /conversations, POST /models, POST /rag/upload)
│   └── MessageInput.md  # Phase 1 output (MessageInput, Sidebar, LoadingOverlay prop contracts)
├── quickstart.md        # Phase 1 output (Validation scenarios 1–5)
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
app/
├── globals.css
└── page.tsx                             # Wires conversation.isBackendReady and conversation.retryStartup
components/
├── ChatPanel.tsx                        # Passes isBackendReady and threadId to MessageInput
├── ChatInput.tsx                        # Adaptive message input wrapper
├── MessageInput.tsx                     # Inline RAG upload panel on Attachment (+) button & POST /models gating
├── Sidebar.tsx                          # Gates initial GET /conversations on isBackendReady
├── LoadingOverlay.tsx                   # Renders startup loader and generic error + Retry button
└── LoadingSkeleton.tsx                  # Skeleton loader for sidebar and chat history
lib/
├── ui/
│   └── copy.ts                          # Centralized user-facing copy including RAG upload states & errors
└── conversation/
    ├── backend-readiness.ts             # waitForBackendReady, BackendReadinessError, ReadinessOptions
    ├── backend.ts                       # uploadRagDocument (POST /rag/upload), createThread, etc.
    ├── limits.ts                        # Input character limits + RAG file validation (.pdf/.txt/.md/.docx, 3 MB)
    └── useConversation.ts               # Orchestrates Phase 1 (120s readiness) -> Phase 2 (10s POST /threads) & retryStartup
tests/
├── unit/
│   ├── backend-readiness.test.ts        # Unit tests for readiness polling, backoff, jitter, 4xx/5xx, timeouts
│   ├── backend.test.ts                  # Unit tests for backend client wrapper including uploadRagDocument
│   ├── limits.test.ts                   # Unit tests for character limits and RAG file validation
│   └── useConversation.test.ts          # Unit tests for startup gating, 120s/10s timeouts, and retryStartup
├── components/
│   ├── ChatInput.test.tsx
│   ├── LoadingOverlay.test.tsx
│   ├── MessageInput.test.tsx            # Component tests for MessageInput & RAG document upload flows
│   └── Sidebar.test.tsx
└── e2e/
    └── message-input.spec.ts
```

**Structure Decision**: Next.js App Router structure keeping network/readiness/upload transport inside `lib/conversation/`, centralized copy in `lib/ui/copy.ts`, and UI presentation inside `components/MessageInput.tsx` and `components/ChatPanel.tsx`.
