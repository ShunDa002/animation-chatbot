# Implementation Plan: message-input-ui

**Branch**: `003-message-input-ui` | **Date**: 2026-10-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-message-input-ui/spec.md`

## Summary

Redesign the message input component to use a modern, adaptive, auto-expanding layout. The component begins as a single-line pill and morphs into a two-tier composition card when the entered text exceeds 36 characters or multiple lines are entered, ensuring smooth CSS transitions and uninterrupted caret focus. The expansion should occur upward to prevent the input from overflowing the screen. Additionally, implement a full white loading page with a centered loader that fades out once the backend is connected and the threadId is generated.

## Technical Context

**Language/Version**: TypeScript 5.7, Node 20+, React 19, Next.js 16 App Router

**Primary Dependencies**: Tailwind CSS v4, React

**Storage**: N/A

**Testing**: Vitest, React Testing Library, Playwright

**Target Platform**: Web browsers (Desktop & Mobile)

**Project Type**: React component for web application

**Performance Goals**: 60fps animations, no layout thrashing during typing

**Constraints**: Must maintain caret position and focus during structural layout shifts. Timeout for initial loading state is 30 seconds.

**Scale/Scope**: 1 complex interactive React component and an initialization overlay wrapper.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Code Quality**: Will rely on Tailwind CSS for single source of truth for styling. Will avoid speculative abstractions.
- **Testing Standards**: Will include deterministic integration tests for the morphing behavior, focus retention, keyboard shortcuts (Enter vs Shift+Enter), and loading page timeout.
- **User Experience Consistency**: 60fps animations, accessibility (keyboard reachability) will be verified. Error/loading state correctly defined as per spec.
- **Performance Requirements**: CSS transitions used for all morphing and fading to offload work from UI thread. No React re-render thrashing on every keystroke if it drops frames.

## Project Structure

### Documentation (this feature)

```text
specs/003-message-input-ui/
├── plan.md              
├── research.md          
├── data-model.md        
├── quickstart.md        
├── contracts/           
└── tasks.md             
```

### Source Code (repository root)

```text
components/
├── MessageInput.tsx     # The primary component to be redesigned
└── LoadingOverlay.tsx   # Overlay for the initial connection phase

tests/
└── components/
    ├── MessageInput.test.tsx # Component tests
    └── LoadingOverlay.test.tsx # Loading overlay tests
```

**Structure Decision**: Will update the existing `components/MessageInput.tsx` directly as this is a UI redesign of a single component. The loading state logic will be implemented as a new `LoadingOverlay.tsx` wrapper or managed directly in the main page component.
