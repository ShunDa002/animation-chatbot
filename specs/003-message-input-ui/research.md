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
