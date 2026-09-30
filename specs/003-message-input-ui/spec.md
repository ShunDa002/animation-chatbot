# Feature Specification: message-input-ui

**Feature Branch**: `003-message-input-ui`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "Redesign a new UI for the message input component. The new UI of this message input component follows modern conversational AI interface conventions, presents adaptive, auto-expanding prompt input pattern that dynamically transitions from a compact single-line bar into a multi-line composition card... The message input expands upwards, not downwards. No border focus when the textarea is selected. Model selector dropdown has a transparent background, white text, no border, and changes background to #232736 on hover."

## Clarifications

### Session 2026-09-30

- Q: What is the expected keyboard behavior for submitting a message when the input is in multi-line mode? → A: Option A - `Enter` submits; `Shift+Enter` adds a newline (Standard chat app convention)
- Q: What is the exact maximum height for the input area before it stops expanding and introduces an inner scrollbar? → A: max height fixed at exactly 5 lines of text
- Q: How should the Message Input UI behave immediately after the user submits a prompt while waiting for the AI response? → A: Option A - Clear input, keep text area enabled, and disable the Send button.
## User Scenarios & Testing *(mandatory)*

### User Story 1 - Single-line Input Entry (Priority: P1)

A user begins typing a short message in the compact, pill-shaped input bar. All interactive controls remain inline horizontally, allowing quick access to attachments, model selection, voice input, and the send button without cluttering the interface.

**Why this priority**: Single-line entry is the most common conversational interaction. The component must look cohesive and functional in its default state.

**Independent Test**: The component renders as a pill-shaped dark-theme container. Typing a single line of text preserves the inline horizontal distribution of all controls.

**Acceptance Scenarios**:

1. **Given** the message input is empty, **When** it renders, **Then** it displays as a dark-theme, pill-shaped single-line container with all actions inline.
2. **Given** the user is typing, **When** the text remains on a single line, **Then** the layout remains inline horizontally without expanding.

---

### User Story 2 - Multi-line Morph and Dual-Zone Layout (Priority: P1)

A user types a longer message that exceeds 36 characters or wraps to a second line, causing the pill-shaped input to smoothly morph into a multi-line composition card. The layout restructures into an upper text composition area and a lower utility toolbar to keep controls predictable and prevent overlap. The input expands upward instead of downward to prevent overflowing outside the screen.

**Why this priority**: The core adaptive mechanism of this UI redesign is the seamless transition to accommodate complex, multi-line prompts dynamically.

**Independent Test**: Typing enough text to exceed 36 characters or wrap to a second line (or pressing Shift+Enter) triggers the morph into a rounded rectangle, and controls rearrange into a bottom footer.

**Acceptance Scenarios**:

1. **Given** the user is typing in single-line mode, **When** the text exceeds 36 characters or a newline is entered, **Then** the container smoothly morphs into a rounded rectangular card with a fixed corner radius.
2. **Given** the container has morphed into a card, **When** the layout updates, **Then** the attachment button pins to the bottom-left, while the model selector, voice input, and send button pin to the bottom-right.
3. **Given** the container expands upward, **When** new lines are added, **Then** it grows line-by-line dynamically while suppressing premature inner scrollbars.

---

### User Story 3 - Focus and Interaction Retention (Priority: P2)

While the user is typing and the component transitions between single-line and multi-line modes, the text cursor and selection state remain uninterrupted.

**Why this priority**: Layout shifts can often disrupt focus or lose caret position, which causes a frustrating typing experience.

**Independent Test**: Rapidly adding and removing lines while typing does not cause the text area to lose focus or reset the caret position.

**Acceptance Scenarios**:

1. **Given** the user is typing, **When** the layout shifts from inline to two-tier, **Then** the text input retains focus and the caret position remains exactly where the user left it.

---

### Edge Cases

- What happens when the user types a prompt longer than 5 lines? The container stops expanding vertically and introduces an inner scrollbar.
- What happens when the user deletes text to return to a single line? The container should gracefully morph back to the pill-shaped inline layout.
- How does the layout adapt on very narrow screens (e.g., mobile)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render a dark-theme, pill-shaped input container in its default single-line state (less than or equal to 36 characters, no newlines).
- **FR-002**: System MUST distribute the following controls inline horizontally in the default state: Attachment Action (+), Text Input Area, Model Selector, Voice Input, and Send Action.
- **FR-003**: System MUST provide a dummy model selector dropdown with options: `openai/gpt-oss-20b`, `nvidia/nemotron-3.5-lightning:free`, `qwen/qwen3.8-27b:free` (no backend integration required).
- **FR-004**: System MUST style the model selector dropdown to have no border, a transparent background, persistent white text color, and a `#232736` background color on hover.
- **FR-005**: System MUST provide dummy UI buttons for Attachment and Voice Input (no backend integration required).
- **FR-006**: System MUST dynamically morph the container into a rounded rectangular card with a two-tier layout when text exceeds 36 characters or spans multiple lines.
- **FR-007**: System MUST anchor the Attachment button to the bottom-left, and the Model Selector, Voice Input, and Send button to the bottom-right when in the two-tier layout.
- **FR-008**: System MUST adjust the text input height dynamically line-by-line as content grows, expanding upward to avoid pushing navigation elements abruptly.
- **FR-009**: System MUST NOT display any border focus when the textarea is selected.
- **FR-010**: System MUST style the Send Action as a high-contrast, solid circular button in cobalt blue with an upward arrow when active.
- **FR-011**: System MUST maintain focus, selection range, and caret positioning uninterrupted during layout restructuring and height recalculations.
- **FR-012**: System MUST submit the message when the `Enter` key is pressed, and add a newline when `Shift+Enter` is pressed.
- **FR-013**: System MUST stop expanding the input area and introduce an inner scrollbar when the text exceeds exactly 5 lines.
- **FR-014**: System MUST clear the input text, keep the text area enabled, and disable the Send action button immediately after submission while waiting for the response.
### Key Entities

- **MessageInput State**: Manages the current text value, line count, and active layout mode (single-line vs multi-line).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The component transitions from single-line to multi-line layout without dropping any keystrokes or losing focus.
- **SC-002**: All dummy controls (attachment, model selector, voice, send) are visually present and correctly positioned in both single-line and two-tier layouts.
- **SC-003**: The send button is rendered prominently in cobalt blue when text is present.

## Assumptions

- The styling will be implemented using the project's existing CSS/styling solution.
- Animations and morphing effects are CSS-based transitions for smoothness and performance.
