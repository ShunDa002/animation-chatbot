# Research: message-input-ui

## Input Element Strategy

**Decision**: Use `<textarea>` controlled by React, with an attached `ref` to dynamically calculate and apply `scrollHeight` to its `style.height` on every value change.

**Rationale**:
- A `<textarea>` is the native, accessible standard for multi-line input, providing built-in placeholder support, value handling, and mobile keyboard layout behaviors.
- Dynamically updating its height using `scrollHeight` avoids adding any new third-party dependencies (like `react-textarea-autosize`), adhering strictly to the Constitution's mandate against unnecessary dependencies.
- A `<div contenteditable>` was rejected because managing React state (cursor jumping, HTML formatting injection, placeholder CSS hacks) introduces immense complexity compared to manipulating a textarea's height.
- We will set a `max-height` matching 5 lines of text in CSS to automatically trigger the inner scrollbar, fulfilling FR-011 without complex line-counting logic.

**Alternatives considered**:
- `<div contenteditable>` (Native HTML5): Rejected due to state management complexity and lack of native placeholder support.
- `react-textarea-autosize` (Third-party package): Rejected because adding a dependency for ~10 lines of `useEffect` logic violates the Constitution.
- CSS `field-sizing: content`: Rejected because it is too new and lacks sufficient cross-browser support for production use.

## Styling & Animations

**Decision**: Use Tailwind CSS (v4) with standard CSS transitions for the morphing effect between the single-line pill and the multi-line card. We will toggle classes (e.g., `rounded-full` vs `rounded-2xl`) and rely on CSS `transition-all`.

**Rationale**: The project already uses Tailwind CSS. Introducing an animation library like Framer Motion is unnecessary for simple border-radius and layout morphs, which can be smoothly handled by CSS `transition` properties.

**Alternatives considered**:
- Framer Motion: Rejected to minimize bundle size and external dependencies, adhering to Principle I of the Constitution.

## Loading State Implementation

**Decision**: Render a full-screen or component-level overlay with `z-index` that mounts when the app is "connecting" or "generating threadId". Use an `aria-live="polite"` region for accessibility. Fade in/out will be handled via CSS transitions using a conditional class (e.g., `opacity-0` vs `opacity-100`).

**Rationale**: The user requested a full white page loading state with a centered loader, fading into the chatbot UI. CSS transitions are sufficient for the fade effect.
