# Tasks: message-input-ui

**Input**: Design documents from `specs/003-message-input-ui/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: Test tasks are included per the project Constitution (Integration-level coverage required).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `components/`, `tests/` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Verify project test infrastructure can run component tests for `components/MessageInput.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Add dummy icons (Attachment, Model Selector, Voice) to `components/MessageInput.tsx` per UI requirements without changing core layout yet.

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Single-line Input Entry (Priority: P1) 🎯 MVP

**Goal**: Implement the default, compact pill-shaped inline layout for single-line entry.

**Independent Test**: The component renders as a pill-shaped dark-theme container. Typing a single line of text preserves the inline horizontal distribution of all controls.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T003 [P] [US1] Integration test for single-line rendering and dummy controls presence in `tests/components/MessageInput.test.tsx`

### Implementation for User Story 1

- [X] T004 [US1] Update `components/MessageInput.tsx` to render a dark-theme, pill-shaped inline layout when text is on a single line.
- [X] T013 [US1] Style the Send Action as a high-contrast, solid circular button in cobalt blue with an upward arrow in `components/MessageInput.tsx`.

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Multi-line Morph and Dual-Zone Layout (Priority: P1)

**Goal**: Auto-expanding input that morphs into a two-tier layout (actions at bottom) when text exceeds 36 characters or wraps to a second line, stopping at 5 lines.

**Independent Test**: Typing enough text to exceed 36 characters or wrap to a second line triggers the morph into a rounded rectangle, and controls rearrange into a bottom footer. Text area stops growing at exactly 5 lines.

### Tests for User Story 2 ⚠️

- [X] T005 [P] [US2] Integration test for layout shift when entering multiple lines or exceeding 36 characters and max height limit in `tests/components/MessageInput.test.tsx`

### Implementation for User Story 2

- [X] T006 [US2] Modify `components/MessageInput.tsx` to use a React `ref` and dynamically apply `scrollHeight` to `style.height` (per research.md). Ensure the component tree is preserved (avoid remounting the textarea) to maintain focus/caret position natively.
- [X] T007 [US2] Update Tailwind classes in `components/MessageInput.tsx` to restructure into a two-tier layout (Attachment bottom-left, others bottom-right) when multiline.
- [X] T008 [US2] Set `max-height` equivalent to 5 lines of text in `components/MessageInput.tsx` to introduce an inner scrollbar.

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Focus and Interaction Retention (Priority: P2)

**Goal**: Keep caret focus during morphs, define keyboard submit/newline rules, and implement disabled Send button loading state.

**Independent Test**: Rapidly adding/removing lines maintains caret position. `Enter` submits and transitions to loading state; `Shift+Enter` adds newline.

### Tests for User Story 3 ⚠️

- [X] T009 [P] [US3] Integration test verifying keyboard shortcuts and loading state behavior in `tests/components/MessageInput.test.tsx`

### Implementation for User Story 3

- [X] T010 [US3] Implement keyboard event handlers in `components/MessageInput.tsx` (Enter to submit, Shift+Enter for newline).
- [X] T011 [US3] Implement disabled Send button loading state and clear-input behavior on submit in `components/MessageInput.tsx`.

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T012 Run quickstart.md validation manually and capture a browser devtools performance profile or frame trace to prove 60fps compliance for the CSS transition animations.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - Sequential in priority order (P1 → P2) is recommended here because they all modify `MessageInput.tsx`.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2)
- **User Story 2 (P1)**: Integrates directly with US1 layout changes.
- **User Story 3 (P2)**: Modifies event handlers within the structure built in US1 and US2.

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- Tests within the same User Story phase (e.g. `tests/components/MessageInput.test.tsx` tests for US2) can theoretically be drafted in parallel to the component logic, but since this is a single file feature, sequential execution is safest.

---

## Implementation Strategy

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently (MVP pill layout)
3. Add User Story 2 → Test independently (Morphing card layout)
4. Add User Story 3 → Test independently (Keyboard & Loading state)
5. Each story adds value without breaking previous stories
