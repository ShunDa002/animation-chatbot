# Implementation Plan: message-input-ui

**Branch**: `003-message-input-ui` | **Date**: 2026-10-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-message-input-ui/spec.md`

## Summary

Redesign the message input component to use an adaptive, auto-expanding layout that transitions from a single-line bar to a multi-line composition card. Implement the sidebar "New Chat" functionality to retrieve a new thread ID and seamlessly handle loading/error states. Add support for stopping generation and handling HITL interrupts gracefully.

## Technical Context

**Language/Version**: TypeScript (Strict Mode) on Node (Next.js App Router)

**Primary Dependencies**: React (Next.js), existing styling solution (CSS/Tailwind)

**Storage**: N/A (Frontend component state only)

**Testing**: Vitest (Unit/Component), Playwright (E2E)

**Target Platform**: Web Browsers (Desktop & Mobile)

**Project Type**: Web Application (Next.js)

**Performance Goals**: 60fps for UI morphing animations; First visible UI feedback < 100ms

**Constraints**: Accessible (WCAG AA) focus states; No blocking UI thread during layout recalculation.

**Scale/Scope**: Frontend UI component update impacting sidebar and main chat UI.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Code Quality**: Will split the large component into smaller sub-components (e.g., `ChatInput`, `Sidebar`) to respect single responsibility. Type hints strictly applied.
- **Testing Standards**: Will add Vitest component tests for the morphing logic and Playwright E2E tests for the "New Chat" flow and stream cancellation.
- **User Experience Consistency**: Will ensure all network boundaries (New Chat, Fetch History) have skeleton loaders and actionable error boundaries (Retry button). Keyboard accessibility preserved.
- **Performance Requirements**: CSS transitions used for morphing to guarantee 60fps off the main UI thread.

## Project Structure

### Documentation (this feature)

```text
specs/003-message-input-ui/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
app/
├── globals.css
components/
├── Sidebar.tsx
├── ChatInput.tsx (New or Modified)
├── LoadingSkeleton.tsx (New)
tests/
├── components/
│   └── ChatInput.test.tsx
└── e2e/
    └── message-input.spec.ts
```

**Structure Decision**: Web application structure focusing on the `components/` and `app/` directories since this is a Next.js project.
