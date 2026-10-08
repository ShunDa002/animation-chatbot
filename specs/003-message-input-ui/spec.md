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

### Session 2026-10-01

- Q: What should happen if the backend connection or threadId generation fails? → A: Display an error message with a "Retry" button on the white page.
- Q: How should the transition from the loading page to the chatbot UI occur? → A: A smooth fade-out of the loading page and fade-in of the chatbot UI.
- Q: Should there be a timeout limit for the loading state before showing an error message? → A: 30 seconds.
- Q: When an `interrupt` event is received, how should the main message input component behave while waiting for the user's approval? → A: Option A - The main input is disabled, and the approval (Yes/No) UI appears inline within the chat stream.
- Q: After the user submits their approval decision during an `interrupt`, when should the main text input be re-enabled? → A: Option B - Only after the backend acknowledges the resume and streams the next `token` or `done` event.
- Q: If the streaming response fails (e.g., receives an `error` event or unexpected HTTP closure), what should the message input component do? → A: Option A - Re-enable the input area and restore the user's last sent prompt so they can easily retry.
- Q: Who is responsible for making the actual HTTP requests for submitting a message to the backend? → A: Option A - The message input component emits an `onSubmit` event, leaving the actual HTTP requests to a parent container or state manager.
- Q: What is the expected HTTP endpoint and method for submitting a new message when NOT resuming from an interrupt? → A: Option A - `POST /chat`.
- Q: After the user clicks "Yes" or "No" in the confirmation UI, how should the UI reflect the submitted decision? → A: Replace the buttons with a text summary (e.g., 'Approved' or 'Rejected')
- Q: If the user clicks "Yes" or "No" but the submission fails (e.g., a network error during `POST /chat/resume`), what should happen? → A: Show an inline error message near the buttons and keep them enabled for retry
- Q: How should the confirmation UI be positioned and styled visually to fit within the chat stream? → A: As an interactive card attached to the bottom of the AI's interrupted message bubble

### Session 2026-10-06

- Q: How should the 'Stop' button be visually styled to contrast with the 'Send' button? → A: A solid square (standard stop icon) inside the circular button, changing the background color to a darker shade or red.
- Q: What is the exact HTTP endpoint and method that should be called when the user clicks the Stop button? → A: POST /chat/stop with { thread_id, run_id } in the payload.
- Q: When generation is stopped by the user, how should the partially generated assistant message be visually indicated in the chat transcript? → A: Append a subtle "(Stopped)" text or icon at the end of the partial message.
- Q: Should there be a keyboard shortcut to stop the generation while the AI is streaming? → A: Yes, pressing the Escape key should immediately trigger the stop action.
- Q: If the server stop request fails due to a network error, what should the frontend do? → A: Abort the local streaming request anyway, mark the message as stopped, and ignore the server failure.

### Session 2026-10-08

- Q: How should the conversation list appear while the data is being fetched from the `/conversations` endpoint? → A: Display a skeleton loader matching the list items.
- Q: What should happen if the request to fetch conversations fails (e.g., network error)? → A: Display an inline error message with a 'Retry' button in the sidebar.
- Q: Does the `/conversations` endpoint require the UI to support pagination or infinite scrolling? → A: No pagination.
- Q: What should the UI display when the `/conversations` endpoint returns an empty list? → A: Display a simple 'No conversations' text with no extra buttons.
- Q: How should the UI indicate that the conversation history is currently being fetched? → A: Show a skeleton loader or spinner inside the main chat area.
- Q: What should happen if the request to fetch the conversation history fails (e.g., due to a network error)? → A: Display an error message with a "Retry" button centered in the main chat area.
- Q: When the history is successfully loaded and rendered, what should the initial scroll position of the conversation log be? → A: Scrolled to the very bottom (latest message).
- Q: What is the exact HTTP endpoint and method that should be called when the user clicks the "New Chat" button to retrieve a new thread ID? → A: POST /threads
- Q: When the user clicks the "New Chat" button, how should the UI handle the current chat view while waiting for the new thread ID? → A: Immediately clear the current chat view and show a skeleton loader or spinner until the new thread is ready.
- Q: Should the new, empty conversation appear in the sidebar immediately, or only after the user sends the first message? → A: Only after the user sends the first message (prevents cluttering the sidebar with empty chats).
- Q: What happens if the request to fetch the new thread ID fails (e.g., due to a network error)? → A: Show an inline error message with a "Retry" button centered in the main chat area (consistent with history fetch failure).

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

### User Story 4 - Loading State and Initialization (Priority: P1)

A user opens the application and sees a full white page with a centrally displayed loader (`public/assets/loader.gif`) while the app connects to the backend and generates a threadId. Once initialization completes, the loading page smoothly fades out and the chatbot UI fades in. If initialization takes longer than 30 seconds or fails, an error message and a "Retry" button are displayed on the white page.

**Why this priority**: Ensures users understand the application is working during initial startup and handles backend unavailability gracefully.

**Independent Test**: Simulating a network delay shows the loader. Passing 30 seconds shows the retry button. Successful connection fades into the UI.

**Acceptance Scenarios**:

1. **Given** the application is loading, **When** the backend connection is pending, **Then** a white page with a centered loader is displayed.
2. **Given** the backend connects successfully, **When** the threadId is generated, **Then** the loading page fades out and the chatbot UI fades in.
3. **Given** the connection times out after 30 seconds or fails, **When** the error occurs, **Then** an error message and "Retry" button appear on the loading page.

---

### User Story 5 - HITL Confirmation UI (Priority: P1)

A user encounters a Human-in-the-Loop (HITL) interrupt while chatting with the AI. The system disables the standard message input and presents an inline interactive confirmation card (Yes/No) attached to the AI's interrupted message bubble. Upon clicking an option, the decision is submitted. If successful, the buttons are replaced with a text summary (e.g., "Approved"). If the submission fails, an inline error is displayed and the buttons remain active for retry.

**Why this priority**: Required for HITL interactions which are a core part of the system's safety and authorization model.

**Independent Test**: Simulating an interrupted message displays the card. Clicking Yes/No triggers `POST /chat/resume` and replaces buttons with text or shows an inline error.

**Acceptance Scenarios**:

1. **Given** a HITL interrupt is active, **When** the message stream pauses, **Then** an interactive "Yes/No" confirmation card is displayed inline and the main input is disabled.
2. **Given** the user clicks "Yes" or "No", **When** the submission is successful, **Then** the buttons are replaced with a text summary indicating the choice.
3. **Given** the user clicks "Yes" or "No", **When** a network error occurs during submission, **Then** an inline error message appears and the buttons remain enabled for retry.

---

### User Story 6 - Stop Generation (Priority: P1)

A user who has submitted a prompt can immediately cancel the ongoing AI generation stream. During generation, the send button turns into a stop button, and the user can either click the stop button or press the `Escape` key. Upon stopping, the generation ceases, a "(Stopped)" indicator is appended to the message, and the UI returns to an idle state.

**Why this priority**: Fast and reliable cancellation is essential for conversational AI to prevent unwanted resource usage and save user time.

**Independent Test**: Submitting a prompt displays the Stop button. Pressing `Escape` or clicking Stop aborts the stream and appends "(Stopped)" to the assistant message.

**Acceptance Scenarios**:

1. **Given** the user submits a message, **When** the AI is streaming a response, **Then** the Send button morphs into a Stop button (a solid square inside a circular button with a darker/red background).
2. **Given** the Stop button is visible, **When** the user clicks it or presses `Escape`, **Then** the `POST /chat/stop` endpoint is triggered, the stream stops, and a subtle "(Stopped)" text/icon is appended to the message.
3. **Given** a stop request is sent, **When** the backend fails to respond due to a network error, **Then** the frontend still aborts the local stream and marks the message as stopped without disrupting the user.

---

### User Story 7 - Sidebar Conversations Fetching (Priority: P1)

A user opens the application and views their sidebar to see a list of past conversations. While the conversations are being fetched, a skeleton loader is displayed. If the fetch succeeds, the conversations are listed sorted by date with the latest at the top. If the fetch fails, an inline error with a Retry button is shown. If the user has no past conversations, a simple "No conversations" text is displayed.

**Why this priority**: Displaying historical conversations is a core expectation for a modern chat interface, establishing continuity.

**Independent Test**: Mocking the `/conversations` endpoint reveals the skeleton loader during delay, the list on success, and the error UI on failure.

**Acceptance Scenarios**:

1. **Given** the application is loading the sidebar, **When** the `/conversations` request is pending, **Then** a skeleton loader matching the list item structure is displayed.
2. **Given** the `/conversations` request succeeds, **When** the payload contains items, **Then** the sidebar displays the items sorted by date descending.
3. **Given** the `/conversations` request fails, **When** the network errors, **Then** an inline error message and a "Retry" button appear.
4. **Given** the `/conversations` request succeeds, **When** the payload is empty, **Then** the sidebar displays a simple "No conversations" text.

---

### User Story 8 - Loading Conversation History (Priority: P1)

A user clicks on a past conversation item in the sidebar. The main chat area enters a loading state, replacing any existing content with a skeleton loader. The application fetches the message history for that conversation. Upon success, the chat area displays the historical messages, scrolled to the very bottom, and the message input is enabled to continue the conversation. If the fetch fails, an error message and a "Retry" button are displayed in the main chat area.

**Why this priority**: Core functionality for resuming past conversations.

**Independent Test**: Mocking the `/history/{thread_id}` endpoint reveals the skeleton loader during delay, the list of messages on success (scrolled to bottom), and the error UI on failure.

**Acceptance Scenarios**:

1. **Given** the user is viewing the sidebar, **When** they click a conversation item, **Then** the main chat area displays a skeleton loader.
2. **Given** the `/history/{thread_id}` request succeeds, **When** the payload is returned, **Then** the main chat area renders the messages and scrolls to the very bottom.
3. **Given** the `/history/{thread_id}` request fails, **When** the network errors, **Then** an error message with a "Retry" button is centered in the main chat area.

---

### Edge Cases

- What happens when the user types a prompt longer than 5 lines? The container stops expanding vertically and introduces an inner scrollbar.
- What happens when the user deletes text to return to a single line? The container should gracefully morph back to the pill-shaped inline layout.
- How does the layout adapt on very narrow screens (e.g., mobile)?
- What happens when the streaming response fails (e.g., error event or unexpected closure)? The input area is re-enabled and the user's last sent prompt is restored.
- What happens if the `POST /chat/resume` request fails during a HITL interrupt? The system shows an inline error near the confirmation buttons and allows the user to retry.
- What happens if the `POST /chat/stop` request fails? The frontend should abort the local streaming request anyway, mark the message as stopped, and ignore the server failure.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render a dark-theme, pill-shaped input container in its default single-line state (less than or equal to 36 characters, no newlines).
- **FR-002**: System MUST distribute the following controls inline horizontally in the default state: Attachment Action (+), Text Input Area, Model Selector, Voice Input, and Send Action.
- **FR-003**: System MUST provide a dynamic model selector dropdown that fetches available models from the backend via a `POST /models` request.
- **FR-004**: System MUST style the model selector dropdown to have no border, a transparent background, persistent white text color, and a `#232736` background color on hover.
- **FR-005**: System MUST provide dummy UI buttons for Attachment and Voice Input (no backend integration required).
- **FR-006**: System MUST dynamically morph the container into a rounded rectangular card with a two-tier layout when text exceeds 36 characters or spans multiple lines.
- **FR-007**: System MUST anchor the Attachment button to the bottom-left, and the Model Selector, Voice Input, and Send button to the bottom-right when in the two-tier layout.
- **FR-008**: System MUST adjust the text input height dynamically line-by-line as content grows, expanding upward to avoid pushing navigation elements abruptly.
- **FR-009**: System MUST NOT display standard browser border focus when the textarea is selected, but MUST provide an accessible alternative focus state (e.g., a subtle background shift) to maintain WCAG keyboard reachability compliance.
- **FR-010**: System MUST style the Send Action as a high-contrast, solid circular button in cobalt blue with an upward arrow when active.
- **FR-011**: System MUST maintain focus, selection range, and caret positioning uninterrupted during layout restructuring and height recalculations.
- **FR-012**: System MUST submit the message when the `Enter` key is pressed, and add a newline when `Shift+Enter` is pressed.
- **FR-026**: System MUST allow the user to immediately trigger the stop action by pressing the `Escape` key while the AI stream response is active.
- **FR-013**: System MUST stop expanding the input area and introduce an inner scrollbar when the text exceeds exactly 5 lines.
- **FR-014**: System MUST clear the input text and keep the text area enabled immediately after submission while waiting for the response.
- **FR-024**: System MUST change the Send action button into a Stop button (styled as a solid square inside a circular button with a darker or red background) while the AI stream response is active, allowing the user to cancel generation.
- **FR-025**: System MUST append a subtle "(Stopped)" text or icon to the end of the partially generated assistant message in the chat transcript when generation is successfully cancelled.
- **FR-015**: System MUST display a full white loading page with a centered `public/assets/loader.gif` animation on initial load while waiting for backend connection and threadId generation.
- **FR-016**: System MUST transition from the loading page to the chatbot UI using a smooth fade-out/fade-in animation once the backend connects and threadId is generated.
- **FR-017**: System MUST display an error message and a "Retry" button on the loading page if the backend connection or threadId generation fails or times out after 30 seconds.
- **FR-018**: System MUST disable the main text input area and Send action button when a HITL `interrupt` event is received, while the approval UI is handled inline within the chat stream.
- **FR-019**: System MUST keep the main text input disabled after the user submits an approval response, and only re-enable it when the backend streams the next `token` or `done` event.
- **FR-020**: System MUST re-enable the main text input area and restore the user's last submitted prompt if the streaming response fails (e.g., receives an `error` event or unexpected HTTP closure).
- **FR-021**: System MUST style the confirmation UI as an interactive card attached to the bottom of the AI's interrupted message bubble.
- **FR-022**: System MUST replace the "Yes" and "No" buttons with a text summary (e.g., "Approved" or "Rejected") after the user submits their decision.
- **FR-023**: System MUST show an inline error message near the buttons and keep them enabled for retry if the `POST /chat/resume` submission fails.
- **FR-027**: System MUST replace dummy mock conversations with a dynamic `GET /conversations` request to fetch the user's conversation history.
- **FR-028**: System MUST sort the fetched conversations by date in descending order, displaying the latest conversation at the top of the sidebar.
- **FR-029**: System MUST display a skeleton loader matching the conversation list items while the `/conversations` data is being fetched.
- **FR-030**: System MUST display an inline error message with a 'Retry' button in the sidebar if the `/conversations` request fails.
- **FR-031**: System MUST display a simple "No conversations" text with no extra buttons when the `/conversations` endpoint returns an empty list.
- **FR-032**: System MUST display a skeleton loader or spinner inside the main chat area while the conversation history is being fetched.
- **FR-033**: System MUST display an error message with a "Retry" button centered in the main chat area if the request to fetch the conversation history fails.
- **FR-034**: System MUST trigger a request to fetch conversation history when a user clicks on an item in the sidebar conversation list.
- **FR-035**: System MUST scroll the conversation log to the very bottom (latest message) immediately after the history is successfully loaded and rendered.
- **FR-036**: System MUST call `POST /threads` to retrieve a new thread ID when the user clicks the New Chat button in the sidebar.
- **FR-037**: System MUST immediately clear the current chat view and show a skeleton loader or spinner in the main chat area while waiting for the new thread ID.
- **FR-038**: System MUST only add the new conversation to the sidebar list after the user sends the first message in the new thread.
- **FR-039**: System MUST display an error message with a "Retry" button centered in the main chat area if the request to fetch a new thread ID fails.

### Integration & External Dependencies

- **API-001**: The system MUST use `POST /chat` as the primary endpoint for submitting new messages to the backend.
- **API-002**: The system MUST use `POST /chat/resume` with the `thread_id`, `interrupt_id`, and `resume` payload to submit responses for a pending HITL interrupt. The endpoint may respond with an NDJSON stream (if there are further messages) or a JSON success object (if execution completes without further output).
- **API-003**: The system MUST use `POST /chat/stop` with `{ thread_id, run_id }` in the payload as the endpoint for cancelling an active generation stream.
- **API-004**: The `message-input-ui` component MUST emit an `onSubmit` event (passing the input payload, including the selected model) or an `onStop` event, delegating the actual chat HTTP requests to the parent container.
- **API-005**: The system MUST use `POST /models` to fetch the available models for the selector dropdown.
- **API-006**: The system MUST use `GET /conversations` to fetch the list of conversations. The endpoint returns a JSON array of objects formatted as: `[{ "id": string, "threadId": string, "title": string, "createdAt": DateTime, "updatedAt": DateTime }]`.
- **API-007**: The system MUST use `GET /history/{thread_id}` to fetch the messages for a specific conversation. The endpoint returns a JSON array of objects formatted as: `[{ "id": string, "author": string, "text": string, "status": string, "toolCalls": string, "interruptId": string, "interruptDecision": string, "createdAt": DateTime }]`.
- **API-008**: The system MUST use `POST /threads` to create a new thread and retrieve its ID.

### Key Entities

- **MessageInput State**: Manages the current text value, line count, and active layout mode (single-line vs multi-line).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The component transitions from single-line to multi-line layout without dropping any keystrokes or losing focus.
- **SC-002**: All controls (attachment, dynamic model selector, voice, send) are visually present and correctly positioned in both single-line and two-tier layouts.
- **SC-003**: The send button is rendered prominently in cobalt blue when text is present.

## Assumptions

- The styling will be implemented using the project's existing CSS/styling solution.
- Animations and morphing effects are CSS-based transitions for smoothness and performance.
