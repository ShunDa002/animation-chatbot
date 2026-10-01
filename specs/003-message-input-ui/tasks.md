# Tasks: message-input-ui

**Input**: Design documents from `specs/003-message-input-ui/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: The constitution mandates testing. Test tasks are included and must run before implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 [P] Ensure Tailwind CSS configuration covers required colors (e.g. #232736) in `app/globals.css` or equivalent config.
- [X] T002 [P] Set up basic test files in `tests/components/MessageInput.test.tsx` and `tests/components/LoadingOverlay.test.tsx`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Create interface contracts (Props) for `MessageInput` and `LoadingOverlay` in their respective files.

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 4 - Loading State and Initialization (Priority: P1) 🎯 MVP

**Goal**: Display a white loading page with a loader, handle a 30-second timeout, and fade into the chatbot UI.

**Independent Test**: Simulating a network delay shows the loader. Passing 30 seconds shows the retry button. Successful connection fades into the UI.

### Tests for User Story 4 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T004 [P] [US4] Integration test for loading overlay rendering and timeout in `tests/components/LoadingOverlay.test.tsx`

### Implementation for User Story 4

- [X] T005 [US4] Create `LoadingOverlay` component layout with centered loader in `components/LoadingOverlay.tsx`
- [X] T006 [US4] Implement CSS transitions for fade-in/fade-out in `components/LoadingOverlay.tsx`
- [X] T007 [US4] Implement 30-second timeout and retry button logic in `components/LoadingOverlay.tsx`

**Checkpoint**: At this point, the LoadingOverlay should be fully functional and testable independently.

---

## Phase 4: User Story 1 - Single-line Input Entry (Priority: P1)

**Goal**: Render the default pill-shaped input with inline controls (Attachment, Text, Model Selector, Voice, Send).

**Independent Test**: Renders as a dark-theme pill. Text fits on a single line, and controls remain horizontally inline.

### Tests for User Story 1 ⚠️

- [X] T008 [P] [US1] Integration test for single-line rendering and control distribution in `tests/components/MessageInput.test.tsx`

### Implementation for User Story 1

- [X] T009 [US1] Refactor `MessageInput` to a pill-shape layout with inline controls and remove textarea border focus in `components/MessageInput.tsx`
- [X] T010 [US1] Implement dummy model selector dropdown (headless or styled select) meeting #232736 hover requirement in `components/MessageInput.tsx`
- [X] T011 [US1] Implement dummy attachment, voice, and send buttons (cobalt blue, upward arrow icon) in `components/MessageInput.tsx`

**Checkpoint**: Single-line layout works independently.

---

## Phase 5: User Story 2 - Multi-line Morph and Dual-Zone Layout (Priority: P1)

**Goal**: Smoothly morph the pill into a two-tier card when text exceeds 36 chars or wraps, maintaining controls at the bottom.

**Independent Test**: Typing a long sentence morphs the layout into a card, moving controls to the bottom-left and bottom-right.

### Tests for User Story 2 ⚠️

- [X] T012 [P] [US2] Integration test for multi-line transition and max-height capping in `tests/components/MessageInput.test.tsx`

### Implementation for User Story 2

- [X] T013 [US2] Implement auto-resizing textarea logic using `scrollHeight` capped at 5 lines in `components/MessageInput.tsx`
- [X] T014 [US2] Implement two-tier layout shift (bottom-left/bottom-right) triggered by line count/length in `components/MessageInput.tsx`
- [X] T015 [US2] Implement CSS `transition-all` for smooth morphing and upward expansion in `components/MessageInput.tsx`

**Checkpoint**: Morphing behavior and dynamic height recalculation function correctly.

---

## Phase 6: User Story 3 - Focus and Interaction Retention (Priority: P2)

**Goal**: Retain textarea focus/caret during morphing, and handle `Enter` (submit) vs `Shift+Enter` (newline).

**Independent Test**: Rapid typing and structural shifts do not lose caret focus. `Enter` submits and clears text.

### Tests for User Story 3 ⚠️

- [X] T016 [P] [US3] Integration test for keyboard submission and post-submission state in `tests/components/MessageInput.test.tsx`

### Implementation for User Story 3

- [X] T017 [US3] Implement keyboard event listener for `Enter` (submit) and `Shift+Enter` (newline) in `components/MessageInput.tsx`
- [X] T018 [US3] Ensure React layout effect does not disrupt caret position during `scrollHeight` update in `components/MessageInput.tsx`
- [X] T019 [US3] Implement post-submission state (cleared text, disabled send button) in `components/MessageInput.tsx`

**Checkpoint**: All user stories are implemented and testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T020 Code cleanup and refactoring in `components/MessageInput.tsx` and `components/LoadingOverlay.tsx`
- [X] T021 Run quickstart.md validation manually
- [X] T022 Ensure WCAG AA compliance (keyboard navigability, aria-live regions) across components.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories**: All depend on Foundational phase completion
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 4 (US4)**: Independent.
- **User Story 1 (US1)**: Independent.
- **User Story 2 (US2)**: Depends on US1 layout.
- **User Story 3 (US3)**: Depends on US2 text area implementations.

### Parallel Opportunities

- Tests for US4 and US1 can be written in parallel.
- `LoadingOverlay` (US4) and `MessageInput` (US1) can be developed in parallel since they reside in different files.

---

## Parallel Example: User Story 1 & 4

```bash
# Launch test files concurrently
Task: "Integration test for loading overlay rendering and timeout in tests/components/LoadingOverlay.test.tsx"
Task: "Integration test for single-line rendering and control distribution in tests/components/MessageInput.test.tsx"

# Implement components concurrently
Task: "Create LoadingOverlay component layout with centered loader in components/LoadingOverlay.tsx"
Task: "Refactor MessageInput to a pill-shape layout with inline controls in components/MessageInput.tsx"
```

## Implementation Strategy

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 4 (Loading) → Test independently → MVP 1
3. Add User Story 1 (Single-line Input) → Test independently → MVP 2
4. Add User Story 2 (Multi-line Morph) → Test independently
5. Add User Story 3 (Keyboard/Focus) → Test independently
