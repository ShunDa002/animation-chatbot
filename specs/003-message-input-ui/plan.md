# Implementation Plan: message-input-ui

**Branch**: `003-message-input-ui` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-message-input-ui/spec.md`, `docs/frontend_backend_readiness.md`, and `docs/rag_frontend_implementation_plan.md`

## Summary

Redesign the message input component to use an adaptive, auto-expanding layout that transitions from a single-line bar to a multi-line composition card. Replace the RAG Document Upload panel with a clean two-option dropdown menu (`Browse files` and `resume.pdf`, separated by a divider line) opened from the Attachment (`+`) button. On selection, immediately upload the document (`POST /rag/upload` with `multipart/form-data` and active `thread_id`) and render a sticky document pill stacked directly above the top border of the message input container showing the file name, in-flight loading progress, and a cancel button (`X`). Enforce a single active document at a time: while a document is active or uploading, the Attachment (`+`) button is disabled with an explanatory tooltip. Clicking the cancel button immediately aborts any in-flight upload via `AbortController`, removes the pill, clears the active document state, and re-enables the Attachment (`+`) button. Coordinate frontend startup with a `GET /health/ready` readiness check (bounded exponential backoff with full jitter and a 120-second overall deadline) that gates all backend-dependent startup requests (`POST /threads` with an independent 10-second timeout, `GET /conversations`, and `POST /models`). Implement the sidebar "New Chat" functionality, conversation history loading, stream cancellation, and HITL interrupt confirmation UI.

## Technical Context

**Language/Version**: TypeScript (Strict Mode) on Node (Next.js App Router)

**Primary Dependencies**: React (Next.js), existing styling solution (CSS/Tailwind), standard Browser APIs (`fetch`, `XMLHttpRequest`, `FormData`, `File`, `AbortController` — zero new third-party dependencies)

**Storage**: `sessionStorage` for active thread/messages/draft caching; in-memory React state for readiness, UI lifecycle, and per-`threadId` RAG upload state

**Testing**: Vitest (Unit & Component with fake timers and injected `fetchFn`/`randomFn`/`xhrFactory`), Playwright (E2E)

**Target Platform**: Web Browsers (Desktop, Tablet, & Mobile)

**Project Type**: Web Application (Next.js)

**Performance Goals**: 60fps for UI morphing animations; First visible UI feedback < 100ms; zero duplicate readiness polling loops on startup or retry; zero duplicate concurrent RAG uploads; immediate upload upon dropdown selection

**Constraints**: Accessible (WCAG AA) focus states and live status announcements; no blocking UI thread during layout recalculation; no raw HTTP status codes, file paths, or content hashes in user-visible states; client-side RAG file cap of `3 MB` for `.pdf`, `.txt`, `.md`, `.docx`; single active document restriction; two independent startup timeouts (120s for `GET /health/ready`, then 10s for `POST /threads`).

**Scale/Scope**: Frontend startup readiness module, RAG upload client & validator, conversation hook orchestration, and UI components (`LoadingOverlay`, `Sidebar`, `ChatPanel`, `MessageInput`, `ChatInput`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Code Quality (PASS)**:
  - `lib/conversation/limits.ts` handles boundary validation for input length and RAG file constraints (`.pdf`, `.txt`, `.md`, `.docx`, `0 < size <= 3 MB`).
  - `lib/conversation/backend.ts` encapsulates `uploadRagDocument` (`POST /rag/upload`) using standard browser `FormData` and `XMLHttpRequest` with zero new third-party dependencies.
  - Native `fetch('/resume.pdf')` loads the bundled static asset as a blob/File without additional libraries.
  - Strict TypeScript types applied across all options, results, and error paths.
- **II. Testing Standards (PASS)**:
  - `uploadRagDocument` and `MessageInput` RAG flows are deterministically testable in Vitest without real network access or wall-clock timers.
  - Full unit and component test coverage for valid uploads, client-side validation rejections, `Browse files` and `resume.pdf` options, sticky pill rendering and cancel abort, single-file disabled attachment button enforcement, and per-`threadId` state isolation.
- **III. User Experience Consistency (PASS)**:
  - All user-visible dropdown options, tooltip copy, progress messages, and error states are defined in `lib/ui/copy.ts` and referenced by `MessageInput` and `limits.ts`.
  - Clicking the Attachment (`+`) button provides immediate (<100ms) visual feedback by toggling the dropdown menu; selecting an option immediately shows the sticky pill atop the composer; errors never expose raw HTTP codes or stack traces.
- **IV. Performance Requirements (PASS)**:
  - Client-side validation rejects oversized (`> 3 MB`) or invalid files immediately in <1ms without allocating network buffers or blocking the main thread.
  - The sticky pill sits outside the container boundary, preventing layout thrashing or interfering with textarea auto-expansion measurements.

## Project Structure

### Documentation (this feature)

```text
specs/003-message-input-ui/
├── plan.md              # This file
├── research.md          # Phase 0 output (R1–R10)
├── data-model.md        # Phase 1 output (MessageInputState, RAG Upload types, Readiness types)
├── contracts/
│   ├── API.md           # Phase 1 output (GET /health/ready, POST /threads, GET /conversations, POST /models, POST /rag/upload)
│   └── MessageInput.md  # Phase 1 output (MessageInput, Sidebar, LoadingOverlay, and Dropdown/Pill prop/UI contracts)
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
