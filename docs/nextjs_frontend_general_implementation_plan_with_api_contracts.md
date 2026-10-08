# High-Level Next.js Frontend Implementation Plan

## 1. Purpose

The Next.js frontend will provide a browser-based chat experience for the FastAPI and LangGraph backend. It will support streamed assistant responses, model selection, conversation continuity, tool activity, workflow interruption and resumption, and user-initiated cancellation.

This plan describes the general technology choices, API contracts, user flows, application state, and NDJSON parsing behavior. It intentionally avoids prescribing a project structure, component hierarchy, or detailed implementation.

## 2. Technology Stack

### Next.js and React

Use Next.js with React as the frontend framework. The interactive chat experience should run on the client because it depends on browser capabilities such as streaming `fetch`, `ReadableStream`, `AbortController`, and browser storage.

Next.js will provide the application framework, routing, rendering, environment configuration, and production build process. React will manage conversation state, streamed updates, user actions, and visual feedback.

### TypeScript

Use TypeScript to define clear contracts for:

- Chat requests
- Resume requests
- Stop requests
- NDJSON stream events
- User and assistant messages
- Tool activity
- Interrupt information
- Chat lifecycle states

Stream events should be modeled as a discriminated union using the event's `type` property. This allows the frontend to process each event safely and detect unsupported event types during development.

### Native Fetch and Web Streams

Use the browser's native `fetch` API to call the FastAPI endpoints.

The `/chat` and `/chat/resume` endpoints return `application/x-ndjson`. Their response bodies contain multiple JSON objects separated by newline characters. They must be read through a `ReadableStream` and must not be processed with `response.json()`.

The `/chat/stop` endpoint returns one ordinary JSON response and can be processed with `response.json()`.

### AbortController

Use `AbortController` to cancel the browser-side streaming request when the user:

- Stops response generation
- Starts a new conversation
- Leaves the page
- Replaces the current request

Browser-side cancellation should complement the backend stop endpoint. When the server run ID is known, the frontend should request server-side cancellation and then close the local stream.

### Browser Storage

Use browser storage for lightweight continuity, including:

- The current conversation thread ID
- The selected model
- Optional interface preferences
- Optional local transcript snapshots

The backend checkpoint database remains the authoritative source for LangGraph workflow state. Browser storage should not be treated as the authoritative workflow store.

## 3. FastAPI Endpoint Contracts

The frontend communicates with three FastAPI endpoints.

## 3.1 Start Chat: `POST /chat`

### Purpose

Starts a new agent execution for a user message within an existing or newly created conversation thread.

### Expected request headers

```http
Content-Type: application/json
Accept: application/x-ndjson
```

### Expected request body

```json
{
  "thread_id": "thread-uuid",
  "user_input": "Hello",
  "model": "free-model"
}
```

### Request arguments

- `thread_id`: Identifies the LangGraph conversation and checkpoint history.
- `user_input`: Contains the user's message. It must follow the backend's validation rules, including the maximum length.
- `model`: Contains the frontend model alias accepted by the backend model resolver.

### Expected response

The endpoint returns an NDJSON stream with media type:

```http
Content-Type: application/x-ndjson
```

It may also return the generated run ID in this response header:

```http
X-Chat-Run-Id: run-uuid
```

A typical stream may contain:

```json
{"type":"start","thread_id":"thread-uuid","run_id":"run-uuid","operation":"invoke"}
{"type":"token","content":"Hello","node":"chat"}
{"type":"token","content":"!","node":"chat"}
{"type":"done","thread_id":"thread-uuid","run_id":"run-uuid","operation":"invoke"}
```

Depending on the workflow, the stream may also contain tool-call, tool-result, interrupt, stopped, or error events.

## 3.2 Resume Workflow: `POST /chat/resume`

### Purpose

Resumes a LangGraph workflow that previously paused and emitted an interrupt event.

### Expected request headers

```http
Content-Type: application/json
Accept: application/x-ndjson
```

### Recommended request body

```json
{
  "thread_id": "thread-uuid",
  "resume": {
    "approved": true
  },
  "interrupt_id": "interrupt-uuid",
  "model": "free-model"
}
```

### Request arguments

- `thread_id`: Identifies the interrupted conversation and stored checkpoint.
- `resume`: Contains the user's response to the interrupt. Its shape depends on the workflow, such as an approval decision, rejection reason, clarification, or selected option.
- `interrupt_id`: Identifies the interrupt being resolved when available.
- `model`: Identifies the model associated with the original workflow. The backend should either accept this argument or persist the original model against the thread.

### Expected response

The endpoint returns another NDJSON stream using the same event protocol as `/chat`.

A typical resumed stream may contain:

```json
{"type":"start","thread_id":"thread-uuid","run_id":"new-run-uuid","operation":"resume"}
{"type":"token","content":"The action was approved.","node":"chat"}
{"type":"done","thread_id":"thread-uuid","run_id":"new-run-uuid","operation":"resume"}
```

A resumed workflow may produce additional tools, another interrupt, an error, or a stopped event before completion.

## 3.3 Stop Active Run: `POST /chat/stop`

### Purpose

Requests cancellation of an active server-side chat or resume task.

### Expected request headers

```http
Content-Type: application/json
```

### Expected request body

```json
{
  "thread_id": "thread-uuid",
  "run_id": "run-uuid"
}
```

### Request arguments

- `thread_id`: Identifies the conversation that owns the run.
- `run_id`: Identifies the specific active task to cancel.

### Expected response

This endpoint returns one ordinary JSON document rather than an NDJSON stream.

When cancellation starts:

```json
{
  "status": "stopping",
  "thread_id": "thread-uuid",
  "run_id": "run-uuid"
}
```

When the run is already absent or stopped:

```json
{
  "status": "already_stopped",
  "thread_id": "thread-uuid",
  "run_id": "run-uuid"
}
```

If the run exists but does not belong to the supplied thread, the backend may return an HTTP `404` response.

## 4. NDJSON Event Protocol

The frontend should recognize the following general event types.

### `start`

Indicates that the server created a run.

Expected information:

- Thread ID
- Run ID
- Operation type, either `invoke` or `resume`

The frontend should store the run ID immediately because it is required for explicit server-side cancellation.

### `token`

Contains an incremental assistant text fragment.

Expected information:

- Text content
- Optional LangGraph node name

The frontend should append the text to one active assistant message rather than creating a new message for every token.

### `tool_call_delta`

Contains an incremental tool-call fragment.

Expected information may include:

- Tool name
- Tool-call ID
- Tool-call index
- Partial argument text
- Node name

Tool arguments may not be valid JSON until all fragments have arrived. The frontend should accumulate them as text.

### `tool_result`

Contains a completed tool execution result.

Expected information may include:

- Tool name
- Tool-call ID
- Result content
- Tool status
- Node name

The frontend should associate the result with the corresponding tool call and render it separately from ordinary assistant text.

### `interrupt`

Indicates that the workflow has paused for user action.

Expected information:

- Thread ID
- Interrupt ID
- Interrupt value or payload
- Resumable indicator

The frontend should preserve the thread, model, transcript, and interrupt information while waiting for the user.

### `done`

Indicates successful completion of the current run.

Expected information:

- Thread ID
- Run ID
- Operation type

The frontend should finalize the assistant response, clear active-run state, and return to an idle state.

### `stopped`

Indicates that the current run was cancelled.

Expected information:

- Thread ID
- Run ID
- Operation type

The frontend should preserve any partial assistant content, mark it as stopped, and restore the interface to a usable state.

### `error`

Indicates that the stream started successfully but the backend workflow later failed.

Expected information:

- Thread ID
- Run ID
- Operation type
- Safe user-facing message
- Optional development-only error type or detail

The frontend should treat this as a terminal event for the current run.

## 5. General NDJSON Parsing Logic

NDJSON must be parsed one complete line at a time. A network chunk cannot be assumed to contain exactly one event.

A received chunk may contain:

- One complete event
- Multiple complete events
- Part of one event
- The end of one event and the beginning of another
- Part of a multibyte UTF-8 character

The parser should maintain a persistent text buffer and UTF-8 decoder.

For each incoming byte chunk, the parser should:

1. Decode the bytes incrementally.
2. Append the decoded text to the existing buffer.
3. Split the buffer on newline characters.
4. Retain the final segment because it may be an incomplete JSON line.
5. Ignore empty lines.
6. Parse each complete nonempty line independently with `JSON.parse()`.
7. Dispatch each parsed object according to its `type` field.
8. When the stream ends, process any remaining nonempty buffered text.

Malformed NDJSON should produce a controlled protocol error. It should not be ignored silently because doing so could leave the visible conversation out of sync with the backend workflow.

The parser and the chat state handler should remain conceptually separate:

- The parser converts streamed bytes into event objects.
- The event handler interprets those objects and updates frontend state.

## 6. Core Frontend State

The frontend should retain at least:

- Current thread ID
- Selected model
- Visible messages
- Current run ID
- Active assistant message
- Active request controller
- Tool activities
- Pending interrupt
- User-visible error
- Current lifecycle status

A useful lifecycle model is:

- `idle`: ready for input
- `connecting`: request sent, waiting for stream events
- `streaming`: tokens or tool events are arriving
- `interrupted`: waiting for user input to resume the workflow
- `stopping`: cancellation is in progress
- `stopped`: the run was cancelled
- `error`: the request, stream, or workflow failed

The initial frontend should permit only one active run per chat interface.

## 7. User Flow: Initial Chat Request

When the interface loads, the frontend should load an existing thread ID from browser storage or generate a new unique thread ID.

The user selects a model and submits a message. Before sending, the frontend should validate the input against the backend's rules.

The general flow is:

1. Add the user's message to the visible transcript immediately.
2. Create one empty assistant message for streamed content.
3. Create an abort controller.
4. Enter the connecting state.
5. Send `thread_id`, `user_input`, and `model` to `/chat`.
6. Read the response as an NDJSON stream.
7. Store the run ID from the response header or `start` event.
8. Process token, tool, interrupt, completion, stopped, and error events.
9. Release request resources after a terminal outcome.

The same thread ID should be reused for later messages in the same conversation so the backend can restore the correct checkpoint history.

## 8. User Flow: Streaming Assistant Output

After the `start` event, the frontend should enter the streaming state.

Each `token` event should append its content to the active assistant message. The user should see the response grow progressively.

Tool events should appear as a separate activity from the assistant's natural-language response. Argument fragments should be accumulated until the call is complete, and the result should be matched to the corresponding tool-call ID.

When `done` arrives, the frontend should:

- Mark the assistant message complete
- Clear the run ID
- Clear the abort controller
- Return to the idle state

If the stream ends without a recognized terminal event, the frontend should treat it as an unexpected stream termination rather than assuming success.

## 9. User Flow: Stop Generation

When the user presses Stop, the frontend should enter the stopping state immediately.

If the run ID is known, it should send the thread ID and run ID to `/chat/stop`. It should then abort the local streaming request.

If the run ID is not yet available, the frontend should still abort the local request. The backend can detect the disconnected client and cancel its producer task.

Because aborting the browser stream may prevent delivery of the final `stopped` event, the frontend must finalize its own cancellation state. It should:

- Preserve partial assistant text
- Mark the response as stopped
- Clear the run ID
- Clear request resources
- Restore the message composer

An intentional `AbortError` should not be presented as an application error.

## 10. User Flow: Tool Activity

When `tool_call_delta` events arrive, the frontend should create or update the related tool activity. It should use the tool-call ID as the primary identifier and the tool-call index as a fallback.

The frontend should display tool activity separately from assistant text because tool arguments and results represent execution details rather than the assistant's final answer.

When a `tool_result` event arrives, the frontend should attach it to the corresponding activity and mark the tool call as complete or failed.

Tool arguments and results must be treated as untrusted content and rendered safely.

## 11. User Flow: Interrupt and Resume

When an `interrupt` event arrives, the workflow is paused and requires user action.

The frontend should:

1. Store the interrupt ID and interrupt value.
2. Preserve the thread ID, selected model, transcript, and partial assistant content.
3. Enter the interrupted state.
4. Present an appropriate approval, rejection, clarification, or selection interface.
5. Prevent conflicting ordinary message submission until the interrupt is resolved when required by the workflow.

After receiving the user's decision, the frontend should send the thread ID, resume value, interrupt ID, and original model to `/chat/resume`.

The resume response should be parsed with the same NDJSON parser and handled with the same event protocol as the initial chat stream.

A resume request creates a new run ID but continues the same conversation thread and checkpoint history.

## 12. User Flow: New Conversation

Starting a new conversation should create a new thread ID.

Before replacing the thread, the frontend should stop or abort any active run. It should then clear:

- Visible messages
- Tool activity
- Pending interrupt
- Current run ID
- Errors
- Partial assistant state

The selected model may remain as a user preference, but the old thread ID must not be reused for the new conversation.

## 13. Error Handling

### HTTP errors

Requests may fail before streaming begins, including FastAPI validation errors. The frontend should read the ordinary error response and present a concise message.

### Network and CORS errors

Connectivity failures, unavailable services, and CORS rejection should produce a clear connection error and restore the interface to a usable state.

### NDJSON protocol errors

Malformed lines, unsupported critical events, or unexpected stream termination should be handled as protocol errors. Partial assistant content may be preserved and marked as failed.

### Backend workflow errors

A streamed `error` event should terminate the current run. The frontend should show the safe `message` field and reserve technical details for development diagnostics.

### Intentional cancellation

Cancellation initiated by the user, page navigation, or conversation reset should not be shown as a failure.

## 14. User Experience Principles

The interface should provide immediate and clear feedback:

- The user's message appears immediately after submission.
- A connecting indicator appears before the first token.
- Assistant text appears incrementally.
- Tool activity is visible but separated from assistant text.
- A Stop action is available during an active run.
- Interrupts clearly explain that user input is required.
- Completed, stopped, interrupted, and failed states are distinguishable.
- The input interface becomes usable after every terminal outcome.

Automatic scrolling should continue only while the user remains near the bottom of the conversation. The frontend should not force the viewport downward if the user has intentionally scrolled upward.

## 15. Performance and Security

High-frequency token events can cause excessive React rendering. The design should allow token fragments to be buffered briefly and applied to visible state at a controlled interval if needed.

Assistant output, tool arguments, and tool results should be treated as untrusted input. Plain-text rendering is the safest initial approach. If Markdown is introduced later, generated HTML should be sanitized and unsafe links or embedded content should be restricted.

Production users should receive safe error messages. Backend stack traces, provider errors, credentials, and internal implementation details should not be exposed in the normal interface.

## 16. Overall Interaction Lifecycle

The complete lifecycle is:

1. Load or create a thread ID.
2. Select a model and submit a message.
3. Send `POST /chat` and begin reading NDJSON.
4. Store the run ID from the header or `start` event.
5. Append token events to one assistant message.
6. Track tool calls and results separately.
7. Complete the run on `done`.
8. Cancel through `/chat/stop` and `AbortController` when requested.
9. Pause when an `interrupt` event arrives.
10. Send the user's decision to `/chat/resume`.
11. Process the resumed NDJSON stream using the same parser.
12. Create a new thread ID when starting a new conversation.
13. Restore the interface after completion, interruption, cancellation, or failure.

## 17. Success Criteria

The frontend integration is successful when:

- `/chat` accepts the thread ID, user input, and selected model.
- `/chat/resume` continues the same checkpointed workflow.
- `/chat/stop` cancels the correct active run.
- NDJSON records are parsed across arbitrary network chunk boundaries.
- Assistant text is displayed incrementally.
- Tool calls and results are correlated correctly.
- The run ID is available for cancellation.
- The thread ID preserves conversation continuity.
- New conversations use new thread IDs.
- Interrupts can be resolved without losing context.
- Intentional cancellation does not appear as an error.
- Every terminal outcome returns the interface to a usable state.
