# Research & Decisions: message-input-ui

## R1: Auto-Expanding Textarea Implementation
**Decision**: Use a hidden span or standard React `onChange` height calculation to dynamically adjust the `<textarea>` height up to 5 lines.
**Rationale**: This guarantees no jumping or scrolling within the first 5 lines while remaining highly performant.
**Alternatives considered**: 
- `react-textarea-autosize` library (Rejected: Avoid unnecessary third-party dependencies as per Constitution Principle I).
- ContentEditable `div` (Rejected: Poor accessibility and form control compared to standard textarea).

## R2: Morphing Animation (Single to Multi-line)
**Decision**: Use CSS transitions on `border-radius`, `height`, and `padding`.
**Rationale**: Ensures 60fps performance by keeping animations on the compositor thread. Satisfies Constitution Principle IV.
**Alternatives considered**: Framer Motion or JS-based animation (Rejected: Overkill for simple box-model morphing).

## R3: "New Chat" Flow State Management
**Decision**: Clear the main chat area state immediately and show a skeleton loader while `POST /threads` is in flight.
**Rationale**: Satisfies the 100ms feedback rule from the Constitution. Ensures the user knows their action was registered.
**Alternatives considered**: Block the UI until the response returns (Rejected: Violates performance UX rules).
