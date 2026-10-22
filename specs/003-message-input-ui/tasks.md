# Tasks: message-input-ui

**Input**: Design documents from `/specs/003-message-input-ui/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create `LoadingSkeleton` component for shared loading states in `components/LoadingSkeleton.tsx`
- [x] T002 [P] Create `ChatInput` component shell in `components/ChatInput.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

- [x] T003 Update global UI types for `MessageInputState` and `Conversation` in `lib/conversation/types.ts` (create file if it doesn't exist)
- [x] T004 Implement mock/stub API handlers for `POST /threads` and `GET /conversations` to allow frontend development in `tests/fixtures/mock-backend.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Single-line Input Entry (Priority: P1) 🎯 MVP

**Goal**: A user begins typing a short message in the compact, pill-shaped input bar. All interactive controls remain inline horizontally.

**Independent Test**: The component renders as a pill-shaped dark-theme container. Typing a single line of text preserves the inline horizontal distribution of all controls.

### Tests for User Story 1 (OPTIONAL - only if tests requested) ⚠️

- [x] T005 [P] [US1] Component test for single-line rendering in `tests/components/ChatInput.test.tsx`

### Implementation for User Story 1

- [x] T006 [US1] Implement default pill-shaped CSS styles and layout in `components/ChatInput.tsx`
- [x] T007 [P] [US1] Implement inline controls (Attachment, Textarea, Model Selector, Voice, Send) in `components/ChatInput.tsx`
- [x] T008 [P] [US1] Integrate dynamic Model Selector dropdown with `POST /models` in `components/ChatInput.tsx`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Multi-line Morph and Dual-Zone Layout (Priority: P1)

**Goal**: A user types a longer message that exceeds 36 characters or wraps to a second line, causing the pill-shaped input to smoothly morph into a multi-line composition card.

**Independent Test**: Typing enough text to exceed 36 characters or wrap to a second line triggers the morph into a rounded rectangle, and controls rearrange into a bottom footer.

### Tests for User Story 2

- [x] T009 [P] [US2] Component test for morphing behavior on long text in `tests/components/ChatInput.test.tsx`

### Implementation for User Story 2

- [x] T010 [US2] Implement dynamic line calculation and `isMultiLine` state detection in `components/ChatInput.tsx`
- [x] T011 [US2] Add CSS transitions (border-radius, padding, layout) for morphing between single-line and multi-line states in `components/ChatInput.tsx`
- [x] T012 [US2] Restructure layout rendering to two-tier footer when `isMultiLine` is true in `components/ChatInput.tsx`
- [x] T013 [US2] Add inner scrollbar logic when text exceeds exactly 5 lines in `components/ChatInput.tsx`

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Focus and Interaction Retention (Priority: P2)

**Goal**: While the user is typing and the component transitions between single-line and multi-line modes, the text cursor and selection state remain uninterrupted.

**Independent Test**: Rapidly adding and removing lines while typing does not cause the text area to lose focus or reset the caret position.

### Implementation for User Story 3

- [x] T014 [US3] Refactor textarea to use a hidden span or height adjustment to prevent unmounts in `components/ChatInput.tsx`
- [x] T015 [US3] Implement `Enter` and `Shift+Enter` key handlers without losing focus in `components/ChatInput.tsx`

---

## Phase 6: User Story 4 - Loading State and Initialization (Priority: P1)

**Goal**: A user opens the application and sees a full white page with a centrally displayed loader (`public/assets/loader.gif`) while the app polls `GET /health/ready` (up to 120s with exponential backoff and full jitter) and then generates a `threadId` via `POST /threads` (10s timeout), holding back all backend-dependent startup requests (`POST /threads`, `GET /conversations`, `POST /models`) until readiness succeeds.

**Independent Test**: Simulating an unreachable or `503` backend shows the loader while `GET /health/ready` retries with backoff and no gated startup requests are sent. Passing 120s on readiness, receiving a permanent `4xx` on readiness, or exceeding 10s on `POST /threads` displays a generic error message and "Retry" button that restarts the full sequence from `GET /health/ready`.

### Tests for User Story 4

- [x] T015a [P] [US4] E2E test for full-page loading and timeout retry in `tests/e2e/message-input.spec.ts`
- [x] T038 [P] [US4] Add unit tests for `waitForBackendReady` (`200 OK` immediate stop, `503`/network retry, exponential backoff cap, full jitter, per-request timeout, 120s overall timeout, non-retriable `4xx` fail-fast, `AbortSignal` cancellation, `no-store` `GET` request) in `tests/unit/backend-readiness.test.ts`
- [x] T039 [P] [US4] Add unit tests for two-phase startup orchestration (120s readiness deadline followed by 10s `createThread` timeout, gating of `createThread` before readiness, generic error notice without status codes on `4xx`/timeout, and single-loop `retryStartup` cancellation) in `tests/unit/useConversation.test.ts`
- [x] T040 [P] [US4] Add component tests for startup request gating (`isBackendReady=false` holds back `GET /conversations` and `POST /models` until ready) and `LoadingOverlay` retry behavior in `tests/components/Sidebar.test.tsx`, `tests/components/MessageInput.test.tsx`, and `tests/components/LoadingOverlay.test.tsx`

### Implementation for User Story 4

- [x] T016 [US4] Implement full-page loading state in main page `app/page.tsx`
- [x] T017 [US4] Implement initialization timeout and retry error boundary in `app/page.tsx`
- [x] T018 [US4] Add CSS fade-out/fade-in transitions between loading and main app view in `app/page.tsx`
- [x] T041 [P] [US4] Implement `waitForBackendReady`, `BackendReadinessError`, `ReadinessOptions`, and `ReadinessResult` with capped exponential backoff (`500ms` base, `10000ms` max), full jitter, `3000ms` per-request timeout, and `120000ms` default overall timeout in `lib/conversation/backend-readiness.ts`
- [x] T042 [US4] Re-export readiness utilities, remove stray `console.log` in `createThread`, and add `signal` and `timeoutMs` (`10000ms` startup timeout) support to `createThread` in `lib/conversation/backend.ts`
- [x] T043 [US4] Clean up stash conflict markers and implement two-phase startup (`waitForBackendReady` 120s -> `createThread` 10s when no cached `threadId`, or direct transition to `idle` after readiness when `threadId` is restored from `sessionStorage`), `isBackendReady` state, and single-loop `retryStartup()` in `lib/conversation/useConversation.ts`
- [x] T044 [P] [US4] Gate initial `GET /conversations` fetch on `isBackendReady` prop (defaulting to `true`) in `components/Sidebar.tsx`
- [x] T045 [P] [US4] Gate initial `POST /models` fetch on `isBackendReady` prop (defaulting to `true`) in `components/MessageInput.tsx` and forward `isBackendReady` in `components/ChatPanel.tsx`
- [x] T046 [P] [US4] Update `LoadingOverlay` timeout handling so it does not prematurely fire at 30s during the 120s readiness window and displays generic error copy with Retry button in `components/LoadingOverlay.tsx`
- [x] T047 [US4] Wire `conversation.isBackendReady` and `conversation.retryStartup` (replacing `window.location.reload()`) to `LoadingOverlay`, `Sidebar`, and `ChatPanel` in `app/page.tsx`

---

## Phase 7: User Story 5 - HITL Confirmation UI (Priority: P1)

**Goal**: Handle HITL interrupt by disabling main input and showing inline confirmation.

**Independent Test**: Simulating an interrupted message displays the card. Clicking Yes/No triggers `POST /chat/resume`.

### Tests for User Story 5

- [x] T018a [P] [US5] Component test for `InterruptCard` and API submission in `tests/components/InterruptCard.test.tsx`

### Implementation for User Story 5

- [x] T019 [US5] Implement `HitlConfirmation` inline UI component in `components/HitlConfirmation.tsx` and `components/MessageLog.tsx`
- [x] T020 [US5] Implement `POST /chat/resume` submission logic on Yes/No click in `components/HitlConfirmation.tsx` and `lib/conversation/useConversation.ts`
- [x] T021 [US5] Implement UI state update to disable main input when interrupt is pending in `components/ChatInput.tsx`

---

## Phase 8: User Story 6 - Stop Generation (Priority: P1)

**Goal**: User can immediately cancel the ongoing AI generation stream.

**Independent Test**: Submitting a prompt displays the Stop button. Pressing Escape or clicking Stop aborts the stream.

### Tests for User Story 6

- [x] T021a [P] [US6] E2E test for stopping generation and restoring prompt on failure in `tests/e2e/message-input.spec.ts`

### Implementation for User Story 6

- [x] T022 [US6] Modify Send button to render as Stop button when `isStreaming` is true in `components/ChatInput.tsx`
- [x] T023 [US6] Add `Escape` key listener for stop action in `components/ChatInput.tsx`
- [x] T024 [US6] Implement `POST /chat/stop` API call and append "(Stopped)" indicator in `components/MessageLog.tsx` and `lib/conversation/useConversation.ts`
- [x] T024a [US6] Implement logic to re-enable input and restore user prompt if stream fails in `components/ChatInput.tsx`

---

## Phase 9: User Story 7 - Sidebar Conversations Fetching (Priority: P1)

**Goal**: Sidebar fetches and displays past conversations, sorted by date.

**Independent Test**: Mocking `/conversations` endpoint reveals skeleton loader, then list, or error UI.

### Tests for User Story 7

- [x] T025 [P] [US7] E2E test for Sidebar conversations fetch in `tests/e2e/message-input.spec.ts`

### Implementation for User Story 7

- [x] T026 [US7] Implement `GET /conversations` fetch logic inside `components/Sidebar.tsx`
- [x] T027 [US7] Implement skeleton loader while fetching in `components/Sidebar.tsx`
- [x] T028 [US7] Implement error boundary with Retry button in `components/Sidebar.tsx`
- [x] T029 [US7] Sort items by date descending and handle empty state ("No conversations") in `components/Sidebar.tsx`

---

## Phase 10: User Story 8 - Loading Conversation History (Priority: P1)

**Goal**: Clicking a conversation loads its history in the main chat area.

**Independent Test**: Clicking a conversation reveals a skeleton loader, then messages scrolled to bottom.

### Tests for User Story 8

- [x] T029a [P] [US8] E2E test for loading history and updating sidebar on new chat in `tests/e2e/message-input.spec.ts`

### Implementation for User Story 8

- [x] T030 [US8] Integrate `New Chat` button `POST /threads` click handler in `components/Sidebar.tsx`
- [x] T030a [US8] Integrate submit handler to append newly created thread to sidebar only after first message is sent in `components/Sidebar.tsx`
- [x] T031 [US8] Implement `GET /history/{thread_id}` fetch logic on item click in `app/page.tsx` and `lib/conversation/useConversation.ts`
- [x] T032 [US8] Display skeleton loader or spinner in main chat area during history load in `components/ChatPanel.tsx`
- [x] T033 [US8] Implement auto-scroll to bottom upon successful history render in `components/MessageLog.tsx`

---

## Phase 11: User Story 9 - RAG Document Upload via Attachment Button (Priority: P1)

**Goal**: A user clicks the Attachment (`+`) button inside `MessageInput` to open an inline upload panel, selects or drops a `.pdf`, `.txt`, `.md`, or `.docx` file up to `3 MB`, reviews its summary, uploads it to `POST /rag/upload` with distinct `Uploading` and `Processing` feedback, and receives `Ready`, informational `Already Added` (duplicate content), or `Failed` (with **Retry**) status scoped to the active `threadId`.

**Independent Test**: Clicking the Attachment (`+`) button toggles the inline upload panel. Invalid files (`0` bytes, unsupported extension, `> 3 MB`) are rejected client-side with zero network calls. Valid files transition `Selected` → `Uploading` (`Uploading document...`) → `Processing` (`Preparing document for use...`) → `Ready` or `Already Added` (or `Failed` with **Retry**), while disabling chat `Send` during `Uploading`/`Processing` and isolating state per `threadId`.

### Tests for User Story 9

- [x] T050 [P] [US9] Add unit tests for RAG file validation (`validateRagFile`, `formatFileSize`, `.pdf`/`.txt`/`.md`/`.docx` allowlist, `0`-byte and `> 3 MB` rejection, missing `threadId`) in `tests/unit/limits.test.ts`
- [x] T051 [P] [US9] Add unit tests for `uploadRagDocument` (`POST /rag/upload` `FormData` fields, `Uploading` progress and `upload.onload` `Processing` callback, `ready` vs. `already_added` duplicate mapping, and safe error translation) in `tests/unit/backend.test.ts`
- [x] T052 [P] [US9] Add component tests for the Attachment (`+`) inline RAG upload panel (panel toggle, file picker & drag-and-drop selection, client-side validation errors, `Uploading` → `Processing` → `Ready` / `Already Added` / `Failed` states, chat `Send` disabled while uploading/processing, retry/replace/remove actions, and per-`threadId` state isolation) in `tests/components/MessageInput.test.tsx`

### Implementation for User Story 9

- [x] T053 [P] [US9] Add centralized RAG document upload copy tokens (panel guidance, status strings, action labels, and validation/error messages) in `lib/ui/copy.ts`
- [x] T054 [US9] Implement `MAX_RAG_FILE_BYTES` (`3 MB`), `ALLOWED_RAG_EXTENSIONS` (`.pdf`, `.txt`, `.md`, `.docx`), `formatFileSize`, and `validateRagFile` in `lib/conversation/limits.ts`
- [x] T055 [P] [US9] Implement `uploadRagDocument`, `RagUploadError`, `UploadRagDocumentOptions`, and `RagUploadResult` for `POST /rag/upload` using `XMLHttpRequest` (`upload.onprogress` and `upload.onload` transitions) in `lib/conversation/backend.ts`
- [x] T056 [US9] Implement the Attachment (`+`) button toggle, inline RAG upload panel (file picker, drag-and-drop dropzone, file summary card, **Upload**/**Replace**/**Remove**/**Retry**/**Dismiss** actions, `role="status"` announcements), chat `Send` gating during `Uploading`/`Processing`, and per-`threadId` state dictionary in `components/MessageInput.tsx`
- [x] T057 [US9] Pass active `threadId` prop from `ChatPanel` into `MessageInput` in `components/ChatPanel.tsx`

**Checkpoint**: At this point, User Story 9 (RAG Document Upload) should be fully functional and independently testable

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T034 [P] Verify WCAG AA focus accessibility across new input components
- [x] T035 Review CSS transitions to ensure strictly 60fps compositor thread properties
- [x] T036 Run quickstart.md validation manually
- [x] T037 [P] Clean up any mock/stub data used during Phase 2
- [x] T048 [P] Update E2E and mock backend fixtures to handle `GET /health/ready` and verify startup readiness gating in `tests/fixtures/mock-backend.ts` and `tests/e2e/message-input.spec.ts`
- [x] T049 Run full Vitest unit and component test suite to validate readiness polling, startup gating, and retry flows in `tests/`
- [x] T058 [P] Add mock `/rag/upload` endpoint support in `tests/fixtures/mock-backend.ts` and E2E test coverage for RAG document upload in `tests/e2e/message-input.spec.ts`
- [x] T059 Run full Vitest unit and component test suite to validate RAG document upload and ensure zero regressions across `tests/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3–11)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 12)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2)
- **User Story 2 (P1)**: Depends on User Story 1 (requires base ChatInput layout)
- **User Story 3 (P2)**: Depends on User Story 2 (requires morphing state to test retention)
- **User Story 4 (P1)**: Independent. Within US4 readiness tasks: `T041` (`lib/conversation/backend-readiness.ts`) → `T042` (`lib/conversation/backend.ts`) → `T043` (`lib/conversation/useConversation.ts`) → `T047` (`app/page.tsx`). Component prop tasks `T044`, `T045`, and `T046` can run in parallel with `T041`–`T043`.
- **User Story 5 (P1)**: Independent. Can start after Foundational.
- **User Story 6 (P1)**: Depends on User Story 1 (requires Send button)
- **User Story 7 (P1)**: Independent. Modifies `Sidebar.tsx`.
- **User Story 8 (P1)**: Depends on User Story 7.
- **User Story 9 (P1)**: Depends on User Story 1 (Attachment button inside `components/MessageInput.tsx`). Within US9: `T053` (`lib/ui/copy.ts`) → `T054` (`lib/conversation/limits.ts`) and `T055` (`lib/conversation/backend.ts`) → `T056` (`components/MessageInput.tsx`) → `T057` (`components/ChatPanel.tsx`).

### Parallel Opportunities

- Phase 6 (US4), Phase 7 (US5), Phase 9 (US7), and Phase 11 (US9) can run in parallel with other phases.
- Within User Story 9 (RAG Document Upload):
  - Test tasks `T050` (`tests/unit/limits.test.ts`), `T051` (`tests/unit/backend.test.ts`), and `T052` (`tests/components/MessageInput.test.tsx`) touch disjoint files and can be authored in parallel.
  - Implementation tasks `T053` (`lib/ui/copy.ts`) and `T055` (`lib/conversation/backend.ts`) can start in parallel; once `T053` finishes, `T054` (`lib/conversation/limits.ts`) and `T055` can run in parallel before `T056` (`components/MessageInput.tsx`).

---

## Parallel Example: User Story 9 (RAG Document Upload)

```bash
# Launch unit & component test tasks for User Story 9 in parallel:
Task: "T050 [P] [US9] Add unit tests for RAG file validation in tests/unit/limits.test.ts"
Task: "T051 [P] [US9] Add unit tests for uploadRagDocument in tests/unit/backend.test.ts"
Task: "T052 [P] [US9] Add component tests for the Attachment (+) inline RAG upload panel in tests/components/MessageInput.test.tsx"

# Launch independent module implementation tasks in parallel:
Task: "T053 [P] [US9] Add centralized RAG document upload copy tokens in lib/ui/copy.ts"
Task: "T055 [P] [US9] Implement uploadRagDocument for POST /rag/upload in lib/conversation/backend.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 (ChatInput Base) → Test independently
3. Add User Story 2 & 3 (ChatInput Morph) → Test independently
4. Add User Story 7 & 8 (Sidebar & History) → Test independently
5. Add User Story 4, 5, 6 (Loading, HITL, Stop) → Test independently
6. Add User Story 9 (RAG Document Upload on Attachment Button) → Test independently
