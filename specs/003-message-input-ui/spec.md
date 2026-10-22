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
- Q: Should there be a timeout limit for the loading state before showing an error message? → A: 30 seconds. *(Superseded by Session 2026-10-20: 120 s readiness deadline + 10 s thread-creation timeout.)*
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

### Session 2026-10-20

- Q: How long should startup keep retrying before showing the error message and "Retry" button (spec said 30 s; readiness doc says 120 s)? → A: Option B - `GET /health/ready` polling has its own 120-second overall deadline; once ready, `POST /threads` has its own separate 10-second timeout. (Supersedes the 30-second answer from Session 2026-10-01.)
- Q: Which startup requests should wait until `/health/ready` returns `200` before they're sent? → A: Option A - All backend-dependent startup requests (`POST /threads`, `GET /conversations`, `POST /models`) are gated on readiness.
- Q: If `/health/ready` returns a client error such as `400`, `401`, `403`, or `404`, should the loading page stop retrying or keep polling? → A: Option A - Stop immediately on non-retriable `4xx` (anything other than `408`, `425`, `429`) and show the error + "Retry" with a generic message; no status code is shown to the user.
- Q: When the user clicks "Retry" on the loading page, should startup restart from `/health/ready` or resume at the failed step? → A: Option A - "Retry" always restarts from `/health/ready` with a fresh 120-second deadline, then runs the gated requests; any in-progress attempt is cancelled first so polling loops never overlap.
- Q: Should the `/health/ready` check run only during app startup, or also before later requests such as "New Chat" or after mid-session failures? → A: Option A - Startup and the loading-page "Retry" only; mid-session requests keep their existing inline error and "Retry" behavior.

### Session 2026-10-21

- Q: What is the backend HTTP endpoint, request format, and response structure for uploading a RAG document to the active conversation? → A: Option A - `POST /rag/upload` with `multipart/form-data` (`file`, `thread_id`); returns `200 OK` JSON with `status: "ready" | "duplicate"` (or boolean `duplicate: true`) and `{ detail }` on error.
- Q: Which document file formats and maximum file size should the client-side validator allow before uploading? → A: `.pdf`, `.txt`, `.md`, `.docx` up to `3 MB`.
- Q: How should clicking the Attachment (`+`) button in `MessageInput.tsx` present the file selection and upload workflow? → A: Option A - Toggle an inline upload panel above `MessageInput` with pre-selection guidance, file picker + drag-and-drop zone, file review summary, and an explicit **Upload** button. *(Superseded by Session 2026-10-22: replaced with a two-option dropdown and top pill.)*
- Q: How should the frontend transition from `Uploading` to `Processing` during `POST /rag/upload`, and should sending chat messages be blocked while an upload is in progress? → A: Option A - Transition `Uploading` → `Processing` when request bytes finish uploading (`upload.onload` while awaiting response), and disable chat `Send` while upload/processing is in flight.
- Q: What should happen if the user switches to a different conversation (`threadId` changes) while a document upload is in progress or after it completes? → A: Option A - Scope upload state per `threadId` in memory so in-flight uploads finish for their originating `threadId` and status only displays in that conversation.

### Session 2026-10-22

- Q: When a user selects "Browse files" or "resume.pdf" from the dropdown menu, should the document upload begin automatically immediately? → A: Option A - Immediate upload: selecting a file or "resume.pdf" (loaded from public/resume.pdf) immediately triggers POST /rag/upload, displaying loading progress in the pill and the cancel button once ready.
- Q: How should the Attachment (+) button behave while a document is already uploaded or currently in progress? → A: Option A - Disable the Attachment (+) button with reduced opacity and a tooltip stating the active file must be cancelled first.
- Q: How should the document pill visually attach to the top of the message input? → A: Option A - Stacked directly above the top border of the message input container (left-aligned, attached to the composer wrapper).
- Q: When the user clicks the cancel button on the document pill, what actions should occur? → A: Option A - Immediate cancel: aborts any in-flight upload, removes the pill, clears the attached file state, and re-enables the Attachment (+) button without a confirmation dialog.
- Q: How should the UI display an upload failure if validation or network errors occur? → A: Option A - Error state in pill: the pill displays an error indicator with the error message/tooltip and a cancel/dismiss button.




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

A user opens the application and sees a full white page with a centrally displayed loader (`public/assets/loader.gif`) while the app waits for the backend to report ready (`GET /health/ready`) and then generates a threadId. Once initialization completes, the loading page smoothly fades out and the chatbot UI fades in. If the backend does not report ready within 120 seconds, if thread creation does not complete within 10 seconds, or if either step fails, an error message and a "Retry" button are displayed on the white page.

**Why this priority**: Ensures users understand the application is working during initial startup and handles backend unavailability gracefully.

**Independent Test**: Simulating an unreachable backend shows the loader while readiness polling retries. Passing 120 seconds without a `200` from `/health/ready` shows the retry button. A `POST /threads` that does not respond within 10 seconds after readiness shows the retry button. A ready backend plus a successful thread creation fades into the UI.

**Acceptance Scenarios**:

1. **Given** the application is loading, **When** the backend readiness check or thread creation is pending, **Then** a white page with a centered loader is displayed.
2. **Given** `GET /health/ready` returns `200`, **When** the threadId is generated, **Then** the loading page fades out and the chatbot UI fades in.
3. **Given** `GET /health/ready` has not yet returned `200`, **When** the app is starting, **Then** no `POST /threads`, `GET /conversations`, or `POST /models` request has been sent.
4. **Given** `GET /health/ready` has not returned `200` within 120 seconds, **When** the readiness deadline expires, **Then** an error message and "Retry" button appear on the loading page.
5. **Given** the backend has reported ready, **When** `POST /threads` fails or does not respond within 10 seconds, **Then** an error message and "Retry" button appear on the loading page.
6. **Given** the loading page shows the error and "Retry" button, **When** the user clicks "Retry", **Then** the loader reappears and startup restarts from `GET /health/ready` with a fresh 120-second deadline, with no overlapping polling loops.

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

### User Story 9 - RAG Document Upload via Attachment Dropdown and Sticky Pill (Priority: P1)

A user clicks the Attachment (`+`) button inside `MessageInput` to open a simple dropdown menu offering exactly two options: `Browse files` and `resume.pdf`, separated by a horizontal divider line.
When the user clicks `Browse files`, the browser's native file picker opens, allowing the user to select a single supported document (`.pdf`, `.txt`, `.md`, `.docx` up to `3 MB`). When the user clicks `resume.pdf`, the application automatically loads the pre-bundled `/resume.pdf` asset.
Upon selection of either option, the system immediately starts document upload via `POST /rag/upload` and renders a document pill stacked directly above the top border of the message input container (left-aligned, attached to the composer wrapper so it moves smoothly with upward expansion).
While uploading, the pill shows an in-flight loading indicator and progress. Once upload succeeds, the pill displays the file name and an explicit cancel button (`X`). If the backend detects duplicate content, the pill shows the file name with an informational success status. If validation rejects the file or the upload fails, the pill transitions to an alert/error styling displaying the error message/tooltip and a cancel/dismiss button.
Only one document can be uploaded at a time. While a document is active or uploading, the Attachment (`+`) button is disabled (dimmed with an explanatory tooltip stating that the active file must be cancelled first). Clicking the cancel button on the pill immediately aborts any in-flight upload, removes the pill, clears the attached document state, and re-enables the Attachment (`+`) button so the user can upload a new file.

**Why this priority**: Enables rapid, streamlined document-grounded AI responses through a minimal, non-intrusive dropdown and sticky pill interface without cluttering the screen with multi-step staging panels.

**Independent Test**: Clicking Attachment opens the dropdown menu with `Browse files` and `resume.pdf` separated by a line. Selecting either option immediately begins upload and renders the sticky pill atop the message input. While attached, the Attachment button is disabled. Clicking the pill's cancel button clears the attachment, aborts any in-flight request, and re-enables the Attachment button.

**Acceptance Scenarios**:

1. **Given** an active conversation, **When** the user clicks the Attachment (`+`) button in `MessageInput`, **Then** a simple dropdown menu opens above the button displaying exactly two options: `Browse files` and `resume.pdf`, separated by a horizontal divider line.
2. **Given** the dropdown menu is open, **When** the user selects `Browse files` and picks a valid document (or selects `resume.pdf`), **Then** the dropdown closes, document upload to `POST /rag/upload` begins automatically, and a document pill appears stacked directly above the top border of the message input container displaying the file name, in-flight progress/loading indicator, and a cancel button.
3. **Given** an active or in-flight document in the pill, **When** the user views the message input, **Then** the Attachment (`+`) button is disabled with reduced opacity and an explanatory tooltip indicating the existing file must be cancelled before uploading another file.
4. **Given** an active document pill (or an in-flight upload), **When** the user clicks the cancel button inside the pill, **Then** any in-flight request is immediately aborted, the pill is removed, the document context is cleared, and the Attachment (`+`) button is re-enabled.
5. **Given** client-side validation rejects a file (unsupported format, `0` bytes, or exceeding `3 MB`) or the backend returns an upload error, **When** the failure occurs, **Then** the pill displays an alert/error state with an actionable message/tooltip and a cancel button allowing the user to dismiss it and choose another file.

---

### Edge Cases

- What happens when the user types a prompt longer than 5 lines? The container stops expanding vertically and introduces an inner scrollbar.
- What happens when the user deletes text to return to a single line? The container should gracefully morph back to the pill-shaped inline layout.
- How does the layout adapt on very narrow screens (e.g., mobile)? Below `640px`, the sidebar collapses into an off-canvas drawer toggled by a top-left hamburger menu button, while the message input compactly scales its padding and control spacing to fit the viewport.
- What happens when the streaming response fails (e.g., error event or unexpected closure)? The input area is re-enabled and the user's last sent prompt is restored.
- What happens if the `POST /chat/resume` request fails during a HITL interrupt? The system shows an inline error near the confirmation buttons and allows the user to retry.
- What happens if the `POST /chat/stop` request fails? The frontend should abort the local streaming request anyway, mark the message as stopped, and ignore the server failure.
- What happens if the backend is not yet reachable when the frontend starts (e.g., still running `init_db()`)? The loader stays visible while `GET /health/ready` is retried with backoff for up to 120 seconds; network errors and gateway errors are treated as "not ready yet".
- What happens if `GET /health/ready` returns a permanent client error (e.g., `404` from a wrong `NEXT_PUBLIC_BACKEND_URL`)? Polling stops immediately and the loading page shows a generic error message with a "Retry" button, without the status code.
- What happens on page reload when `sessionStorage` already contains a cached `threadId`? The frontend still polls `GET /health/ready` first (holding back `GET /conversations` and `POST /models` until `200 OK`), and once readiness succeeds, skips `POST /threads` and transitions directly to the ready state using the restored `threadId`.
- What happens if a user selects an empty (`0`-byte) file, an unsupported file format (not `.pdf`, `.txt`, `.md`, or `.docx`), or a file larger than `3 MB`? Client-side validation immediately rejects the file before starting `POST /rag/upload` and displays an actionable error state inside the pill with a cancel/dismiss button.
- What happens if a user uploads a file whose content has already been added to the active conversation (even under a different file name)? The backend returns a duplicate indicator on `POST /rag/upload`, and the UI treats it as an informational `Already Added` success (**This document is already available in this conversation.**) inside the pill rather than an error.
- What happens if the user switches conversations (`threadId` changes) while a RAG document upload is in progress? The upload remains bound to the originating `threadId` in memory so completion (`Ready`, `Already Added`, or `Failed`) only appears when viewing that originating conversation and is never presented as belonging to the newly opened conversation.
- What happens if the user selects `resume.pdf` from the dropdown? The application fetches the bundled static `public/resume.pdf` file as a blob and uploads it via `POST /rag/upload` associated with the active `thread_id`.
- What happens if the user attempts to upload a second file while one is already active? The Attachment (`+`) button is disabled with a tooltip indicating the active document must be cancelled first.
- What happens when the user clicks the cancel button on the document pill? Any in-flight `POST /rag/upload` request is aborted via `AbortController`, the pill is removed, and the composer is reset to accept a new attachment.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render a dark-theme, pill-shaped input container in its default single-line state (less than or equal to 36 characters, no newlines).
- **FR-002**: System MUST distribute the following controls inline horizontally in the default state: Attachment Action (+), Text Input Area, Model Selector, Voice Input, and Send Action.
- **FR-003**: System MUST provide a dynamic model selector dropdown that fetches available models from the backend via a `POST /models` request.
- **FR-004**: System MUST style the model selector dropdown to have no border, a transparent background, persistent white text color, and a `#232736` background color on hover.
- **FR-005**: System MUST integrate RAG document upload functionality on the Attachment button (`+`) inside `MessageInput` via a simple dropdown menu offering `Browse files` and `resume.pdf` separated by a divider line, displaying an attached document pill stacked at the top of the message input upon selection, while keeping the Voice Input button as a dummy UI control (no backend integration required for Voice Input). *(Updated in Session 2026-10-22)*
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
- **FR-015**: System MUST display a full white loading page with a centered `public/assets/loader.gif` animation on initial load while waiting for backend readiness (`GET /health/ready`) and threadId generation.
- **FR-016**: System MUST transition from the loading page to the chatbot UI using a smooth fade-out/fade-in animation once the backend reports ready and threadId is generated.
- **FR-017**: System MUST display an error message and a "Retry" button on the loading page if (a) `GET /health/ready` has not returned `200` within a 120-second overall readiness deadline, (b) `GET /health/ready` returns a non-retriable client error (any `4xx` other than `408`, `425`, `429`), in which case polling stops immediately, or (c) after readiness succeeds, `POST /threads` fails or does not respond within 10 seconds. The two timeouts are independent; the 10-second thread-creation timeout starts only after readiness succeeds. The error message MUST be generic and actionable and MUST NOT show the HTTP status code.
- **FR-040**: System MUST poll `GET /health/ready` on frontend startup (including reloads with a cached `threadId` in `sessionStorage`), retrying with capped exponential backoff and full jitter, and MUST stop polling as soon as a `200` response is received. No backend-dependent startup request (`POST /threads`, `GET /conversations`, `POST /models`) may be issued until readiness succeeds; if a `threadId` was restored from `sessionStorage`, `POST /threads` is skipped after readiness succeeds.
- **FR-041**: System MUST restart the full startup sequence when the loading-page "Retry" button is clicked: cancel any in-progress readiness or thread-creation attempt, start `GET /health/ready` polling with a fresh 120-second deadline, then issue the gated requests. At most one readiness polling loop may be active at any time, and polling MUST be cancelled when the owning view unmounts.
- **FR-042**: System MUST NOT run the readiness check outside initial startup and the loading-page "Retry". Mid-session requests ("New Chat" `POST /threads`, `POST /chat`, `GET /history/{thread_id}`, sidebar `GET /conversations` retries) keep their own inline error and "Retry" handling (FR-020, FR-030, FR-033, FR-039).
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
- **FR-043**: System MUST indicate supported document formats (`.pdf`, `.txt`, `.md`, `.docx`) and maximum file size (`3 MB`) before selection, and MUST validate selected files on the client before starting an upload: rejecting empty files (`0` bytes), unsupported file formats, files exceeding `3 MB` (`3 * 1024 * 1024` bytes), or attempts when no active conversation (`threadId`) is available, with actionable inline error messages.
- **FR-044**: System MUST toggle a simple dropdown menu displaying exactly two options, `Browse files` and `resume.pdf` separated by a divider line, when the user clicks the Attachment (`+`) button. When `Browse files` is selected, the system MUST open the browser's native file picker; when `resume.pdf` is selected, the system MUST automatically load the static `/resume.pdf` asset. Upon file selection or choosing `resume.pdf`, the system MUST immediately initiate upload to `POST /rag/upload` and render a document pill stacked directly above the top border of the message input container (left-aligned, attached to the composer wrapper). Only one file can be uploaded at a time; while a file is uploaded or in progress, the Attachment (`+`) button MUST be disabled with reduced opacity and a tooltip explaining that the active file must be cancelled first.
- **FR-045**: System MUST reflect the upload lifecycle (`Uploading`, `Processing`, `Ready`, `Already Added`, `Failed`) directly inside the document pill sticking to the top of the message input, showing in-flight loading progress during transfer/processing, the file name and cancel button on success, or an error state with a cancel/dismiss button on failure, without allowing duplicate concurrent submissions.
- **FR-046**: System MUST transition from `Uploading` (`Uploading document...`, with measurable progress when available) to `Processing` (`Preparing document for use...`) when payload bytes finish transferring (`upload.onload`) and the client is awaiting the backend's `POST /rag/upload` ingestion response, MUST disable chat message submission (`Send`) while a document is in `Uploading` or `Processing` state, and MUST immediately abort in-flight requests, clear the attached file state, and remove the document pill when the user clicks the cancel button.
- **FR-047**: System MUST scope RAG document upload state by `threadId` in memory so that if the user switches conversations while an upload is in progress or after it completes, the upload result (`Ready`, `Already Added`, or `Failed`) remains associated with the originating `threadId` and is never displayed as belonging to a different conversation.

### Integration & External Dependencies

- **API-001**: The system MUST use `POST /chat` as the primary endpoint for submitting new messages to the backend.
- **API-002**: The system MUST use `POST /chat/resume` with the `thread_id`, `interrupt_id`, and `resume` payload to submit responses for a pending HITL interrupt. The endpoint may respond with an NDJSON stream (if there are further messages) or a JSON success object (if execution completes without further output).
- **API-003**: The system MUST use `POST /chat/stop` with `{ thread_id, run_id }` in the payload as the endpoint for cancelling an active generation stream.
- **API-004**: The `message-input-ui` component MUST emit an `onSubmit` event (passing the input payload, including the selected model) or an `onStop` event, delegating the actual chat HTTP requests to the parent container.
- **API-005**: The system MUST use `POST /models` to fetch the available models for the selector dropdown.
- **API-006**: The system MUST use `GET /conversations` to fetch the list of conversations. The endpoint returns a JSON array of objects formatted as: `[{ "id": string, "threadId": string, "title": string, "createdAt": DateTime, "updatedAt": DateTime }]`.
- **API-007**: The system MUST use `GET /history/{thread_id}` to fetch the messages for a specific conversation. The endpoint returns a JSON array of objects formatted as: `[{ "id": string, "author": string, "text": string, "status": string, "toolCalls": string, "interruptId": string, "interruptDecision": string, "createdAt": DateTime }]`.
- **API-008**: The system MUST use `POST /threads` to create a new thread and retrieve its ID.
- **API-009**: The system MUST use `GET /health/ready` (no request body, browser caching disabled) as the startup readiness check. `200` means ready; `408`, `425`, `429`, `5xx` (including `503`), network errors, and per-request timeouts mean not yet ready and are retried; any other `4xx` is permanent and stops polling (see `docs/frontend_backend_readiness.md`).
- **API-010**: The system MUST use `POST /rag/upload` with `multipart/form-data` containing `file` (the selected binary file) and `thread_id` (the active conversation's thread identifier) to upload a document for RAG ingestion. A `200 OK` JSON response indicates either newly indexed (`status: "ready"` or `duplicate: false`) or already available in the conversation (`status: "duplicate"` or `duplicate: true`), optionally returning `filename`, `original_filename`, and `message`; error responses (`4xx`/`5xx`) return JSON `{ "detail": string }` (which MUST be mapped to safe, actionable user-facing copy without exposing internal details).

### Key Entities

- **MessageInput State**: Manages the current text value, line count, and active layout mode (single-line vs multi-line).
- **RAG Document Upload State (Per-Thread)**: Tracks the upload lifecycle scoped by `threadId` (`idle`, `selected`, `uploading`, `processing`, `ready`, `already_added`, `failed`), the selected `File` metadata (plain-text file name, extension/MIME type, byte size), upload progress percentage, and user-facing status/error copy.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The component transitions from single-line to multi-line layout without dropping any keystrokes or losing focus.
- **SC-002**: All controls (attachment, dynamic model selector, voice, send) are visually present and correctly positioned in both single-line and two-tier layouts.
- **SC-003**: The send button is rendered prominently in cobalt blue when text is present.
- **SC-004**: On startup, zero backend-dependent requests (`POST /threads`, `GET /conversations`, `POST /models`) are sent before `GET /health/ready` returns `200 OK`, and startup surfaces a generic retryable error (with no raw HTTP status codes) if readiness exceeds 120 seconds, returns a non-retriable `4xx`, or `POST /threads` exceeds 10 seconds.
- **SC-005**: Users can open the two-option dropdown menu (`Browse files` and `resume.pdf`) via the Attachment (`+`) button, observe the attached document pill stacked directly above the top border of the message input with immediate upload upon selection, observe the Attachment button disabled while a file is active, cancel or remove the file at any time via the pill's cancel button, and see errors displayed clearly in the pill on failure.

## Assumptions

- The styling will be implemented using the project's existing CSS/styling solution.
- Animations and morphing effects are CSS-based transitions for smoothness and performance.
