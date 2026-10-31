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

**Goal**: A user types a longer message that exceeds 48 characters or wraps to a second line, causing the pill-shaped input to smoothly morph into a multi-line composition card.

**Independent Test**: Typing enough text to exceed 48 characters or wrap to a second line triggers the morph into a rounded rectangle, and controls rearrange into a bottom footer.

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

## Phase 11: User Story 9 - RAG Document Upload via Attachment Dropdown and Sticky Pill (Priority: P1)

**Goal**: Replace the current RAG Document Upload panel with a clean two-option dropdown menu (`Browse files` and `resume.pdf` separated by a divider line), immediately upload upon selection, display the active document in a sticky pill stacked directly above the top of the message input container with a cancel button, enforce a single active document restriction (disabling the Attachment button while a file is active/uploading), and allow instant cancellation/removal.

**Independent Test**: Clicking Attachment opens the dropdown menu with `Browse files` and `resume.pdf` separated by a divider. Selecting either option immediately begins upload and renders the sticky pill atop the message input. While attached, the Attachment button is disabled with an explanatory tooltip. Clicking the pill's cancel button clears the attachment, aborts any in-flight request, and re-enables the Attachment button.

### Tests for User Story 9

- [x] T060 [P] [US9] Add unit tests for `loadSampleResumeFile` and upload abort handling in `tests/unit/backend.test.ts`
- [x] T061 [US9] Update component tests for dropdown menu display, `Browse files` and `resume.pdf` selection, immediate upload, sticky document pill rendering, single-file disabled attachment button, cancel button abort and reset, and failure alert state in `tests/components/MessageInput.test.tsx`

### Implementation for User Story 9

- [x] T062 [P] [US9] Update centralized copy tokens for dropdown options (`Browse files`, `resume.pdf`), pill cancel label, single-file disabled tooltip, and alert status in `lib/ui/copy.ts`
- [x] T063 [P] [US9] Implement `loadSampleResumeFile` helper to fetch `/resume.pdf` as a `File` object in `lib/conversation/backend.ts`
- [x] T064 [US9] Replace the inline upload panel with a floating dropdown menu anchored above the Attachment (`+`) button displaying `Browse files` and `resume.pdf` separated by a divider line in `components/MessageInput.tsx`
- [x] T065 [US9] Implement the sticky document pill stacked directly above the outer top border of the composer container displaying file name, in-flight progress/spinner, cancel button (`X`), and alert/error styling in `components/MessageInput.tsx`
- [x] T066 [US9] Wire immediate upload upon selection of `Browse files` or `resume.pdf` and wire the cancel button to abort in-flight uploads via `AbortController` and clear active state in `components/MessageInput.tsx`
- [x] T067 [US9] Enforce single active document restriction by disabling the Attachment (`+`) button with tooltip and reduced opacity while a document is active or uploading in `components/MessageInput.tsx`

**Checkpoint**: At this point, User Story 9 (RAG Dropdown and Sticky Pill) should be fully functional and independently testable.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T034 [P] Verify WCAG AA focus accessibility across new input components
- [x] T035 Review CSS transitions to ensure strictly 60fps compositor thread properties
- [x] T036 Run quickstart.md validation manually
- [x] T037 [P] Clean up any mock/stub data used during Phase 2
- [x] T048 [P] Update E2E and mock backend fixtures to handle `GET /health/ready` and verify startup readiness gating in `tests/fixtures/mock-backend.ts` and `tests/e2e/message-input.spec.ts`
- [x] T049 Run full Vitest unit and component test suite to validate readiness polling, startup gating, and retry flows in `tests/`
- [x] T068 [P] Update E2E test scenarios for RAG dropdown and sticky pill in `tests/e2e/message-input.spec.ts`
- [x] T069 Run full Vitest unit and component test suite to ensure zero regressions across `tests/`

---

## Phase 13: Fixed Single-Line Sizing & Overflow-y Suppression (Priority: P1)

**Goal**: Enforce a fixed single-line height matching exactly one line of text with vertical scrolling strictly suppressed (`overflow-y: hidden`) in single-line mode and during upward expansion up to 5 lines, activating vertical scrolling (`overflow-y: auto`) only when text exceeds 5 lines (FR-001, FR-008, FR-013, SC-006).

**Independent Test**: In single-line mode, textarea has a fixed 1-line height and `overflow-y: hidden`. Typing 1–5 lines expands container height upward without vertical scrollbars (`overflow-y: hidden`). Typing more than 5 lines caps height at 120px and enables `overflow-y: auto`.

### Tests for Single-Line Fixed Height & Overflow-y Suppression

- [x] T070 [P] [US1] Add component tests for fixed single-line height and `overflow-y: hidden` suppression in non-expanded mode in `tests/components/MessageInput.test.tsx`
- [x] T071 [P] [US2] Add component tests verifying `overflow-y: hidden` during 2–5 line expansion and `overflow-y: auto` activation past 5 lines in `tests/components/MessageInput.test.tsx`

### Implementation for Single-Line Fixed Height & Overflow-y Suppression

- [x] T072 [US1] Enforce fixed 1-line height and conditional `overflow-y: hidden` in single-line mode in `components/MessageInput.tsx`
- [x] T073 [US2] Update layout effect to maintain `overflow-y: hidden` for lines 1–5 and activate `overflow-y: auto` strictly when content exceeds 5 lines (120px) in `components/MessageInput.tsx`
- [x] T074 Run full Vitest component test suite to ensure zero regressions across `tests/components/MessageInput.test.tsx`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - completed [x]
- **Foundational (Phase 2)**: Depends on Setup completion - completed [x]
- **User Stories (Phase 3–11)**: Completed [x]
- **Polish (Phase 12)**: Completed [x]
- **Fixed Single-Line Sizing (Phase 13)**: Active phase - depends on `components/MessageInput.tsx`

### Phase 13 Dependencies

- `T070` and `T071` define test expectations for fixed single-line height and overflow behavior in `tests/components/MessageInput.test.tsx`.
- `T072` implements fixed 1-line height and `overflow-y: hidden` in single-line mode in `components/MessageInput.tsx`.
- `T073` updates dynamic multi-line height calculation and overflow switching (>5 lines) in `components/MessageInput.tsx`.
- `T074` executes the Vitest suite to verify all 34+ tests pass without regression.

### Parallel Opportunities

- `T070` and `T071` can be authored together in `tests/components/MessageInput.test.tsx`.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (Done)
2. Complete Phase 2: Foundational (Done)
3. Complete Phase 3: User Story 1 (Done)
4. Validated and functional.

### Incremental Delivery (Fixed Single-Line Sizing Focus)

1. Add unit/component tests for fixed single-line height and `overflow-y: hidden` (`T070`, `T071`).
2. Implement single-line fixed height and `overflow-y: hidden` in `components/MessageInput.tsx` (`T072`).
3. Update multi-line upward expansion logic to clamp at 5 lines and dynamically switch `overflowY` to `'auto'` only when exceeding 5 lines (`T073`).
4. Run full component and regression tests (`T074`).


