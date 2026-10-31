# Data Model: message-input-ui

## Frontend Component State (MessageInputState)

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | The current value of the textarea. |
| `lineCount` | `number` | The calculated number of lines of the current text. |
| `isMultiLine` | `boolean` | Derived state (`text.length > 48 || text.includes('\n')`). Triggers UI morphing. |
| `isSubmitting` | `boolean` | True when waiting for `POST /chat` or `POST /threads` to resolve. |
| `isStreaming` | `boolean` | True when the AI is currently streaming a response. |
| `interruptState` | `object` | Contains the pending HITL interrupt details (`interruptId`, etc.) when applicable. |
| `selectedModel` | `string` | The ID of the currently selected model from the dropdown. |
| `isBackendReady` | `boolean` | True once `GET /health/ready` has returned `200 OK` during initial startup; gates initial `POST /models` fetch when provided. |
| `isAttachmentDropdownOpen` | `boolean` | True when the Attachment (`+`) two-option dropdown menu (`Browse files` and `resume.pdf`) is open. |
| `uploadsByThread` | `Record<string, ThreadRagUploadState>` | Per-conversation RAG upload state keyed by `threadId` (FR-047). |
| `overflowY` | `'hidden' \| 'auto'` | Derived overflow state: `hidden` when `!isMultiLine` and during dynamic expansion up to 5 lines; `auto` strictly when content exceeds 5 lines (FR-001, FR-013, SC-006). |
| `textareaHeight` | `string` | Fixed single-line height (`1.5rem` / 24px) when non-expanded; auto-calculated up to 5 lines (`120px`) when multi-line. |

## RAG Document Upload Types (`lib/conversation/limits.ts` & `lib/conversation/backend.ts`)

### `RagUploadStatus`
`'idle' | 'uploading' | 'processing' | 'ready' | 'already_added' | 'failed'`

### `ThreadRagUploadState`

| Field | Type | Description |
|-------|------|-------------|
| `status` | `RagUploadStatus` | Current lifecycle stage for this conversation's document upload. |
| `file` | `File \| null` | The active or uploaded `File` instance. |
| `fileName` | `string \| null` | Plain-text file name displayed inside the sticky document pill. |
| `fileTypeLabel` | `string \| null` | Normalized uppercase format label (`PDF`, `TXT`, `MD`, `DOCX`). |
| `fileSizeBytes` | `number \| null` | File size in bytes (formatted for human-readable display). |
| `progress` | `number \| null` | Upload transfer percentage (`0`–`100`) when measurable during `uploading`. |
| `statusMessage` | `string \| null` | Accessible user-facing status or error copy from `lib/ui/copy.ts`. |
| `originalFilename` | `string \| null` | Optional original file name returned by the backend when `status === 'already_added'`. |

### RAG Upload State Transitions (`FR-044`, `FR-045`, `FR-046`, `FR-047`, Session 2026-10-22)

1. **`idle`**: No active file is attached to the active `threadId`. The Attachment (`+`) button is enabled.
2. **`uploading`**: User selects a file via `Browse files` or clicks `resume.pdf`. Document pill appears stacked directly above the top border of the message input container showing the file name, in-flight progress/spinner, and a cancel button. Attachment (`+`) button is disabled (reduced opacity, aria-disabled) with a tooltip stating the active file must be cancelled first. Chat message `Send` is disabled.
3. **`processing`**: Triggered when `xhr.upload.onload` fires (all request bytes transferred) while awaiting the HTTP response from `POST /rag/upload`. Document pill displays processing status (`Preparing document for use...`) with the cancel button. Chat message `Send` remains disabled.
4. **`ready`**: Backend returns `200 OK` with `status: "ready"` (or `duplicate: false`). Document pill displays the file name and the cancel button. Chat message `Send` is re-enabled. Attachment (`+`) button remains disabled until the file is cancelled.
5. **`already_added`**: Backend returns `200 OK` with `status: "duplicate"` (or `duplicate: true`). Treated as an informational success; document pill displays the file name and the cancel button. Chat message `Send` is re-enabled.
6. **`failed`**: Validation error (unsupported format, `0` bytes, `> 3 MB`), network error, or backend `4xx`/`5xx` response. Document pill displays an alert/error styling with the error message/tooltip and a cancel/dismiss button. Chat message `Send` is re-enabled.
7. **Cancellation (Reset to `idle`)**: Clicking the cancel button inside the pill from any state aborts any in-flight request via `AbortController`, removes the pill, clears the file from the thread's upload state back to `idle`, and re-enables the Attachment (`+`) button so another file can be selected.


## Startup Readiness Types (`lib/conversation/backend-readiness.ts`)

### `ReadinessOptions`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `endpoint` | `string` | `${getBackendUrl()}/health/ready` | Full URL for the readiness probe (`GET /health/ready`). |
| `baseDelayMs` | `number` | `500` | Initial backoff window ceiling in milliseconds. |
| `maxDelayMs` | `number` | `10_000` | Maximum backoff window ceiling in milliseconds. |
| `requestTimeoutMs` | `number` | `3_000` | Per-attempt timeout in milliseconds before aborting that single `GET` request. |
| `overallTimeoutMs` | `number` | `120_000` | Overall readiness deadline in milliseconds before throwing `BackendReadinessError("timeout")`. |
| `signal` | `AbortSignal` | `undefined` | Optional external signal to cancel active requests and backoff timers on unmount or retry. |
| `fetchFn` | `typeof fetch` | `fetch` | Injectable fetch implementation for deterministic unit testing. |
| `randomFn` | `() => number` | `Math.random` | Injectable RNG (`[0, 1)`) for deterministic full-jitter testing. |

### `ReadinessResult`

| Field | Type | Description |
|-------|------|-------------|
| `status` | `'ready'` | Indicates `GET /health/ready` returned `200 OK`. |
| `attempts` | `number` | Total number of `GET /health/ready` attempts performed before succeeding (`>= 1`). |

### `BackendReadinessError`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `'BackendReadinessError'` | Error class discriminator. |
| `message` | `string` | Diagnostic message (internal; never rendered raw to the user). |
| `causeType` | `'timeout' \| 'aborted' \| 'permanent-response'` | Reason readiness polling stopped (`timeout` after 120s, `aborted` by outer signal, or `permanent-response` on non-retriable `4xx`). |
| `status` | `number \| undefined` | HTTP status code when `causeType === 'permanent-response'`. |

## Startup Lifecycle State Transitions (`useConversation`)

1. **`connecting` (Phase 1 — Readiness Polling)**:
   - `isBackendReady = false`, `status = 'connecting'`, `LoadingOverlay` visible.
   - Polls `GET /health/ready` up to `120_000 ms`.
   - `POST /threads`, `GET /conversations`, and `POST /models` are held back.
2. **`connecting` (Phase 2 — Thread Creation / Restoration)**:
   - Triggered when `GET /health/ready` returns `200 OK`.
   - `isBackendReady = true` (unblocks `Sidebar` `GET /conversations` and `MessageInput` `POST /models`).
   - Issues `POST /threads` with an independent `10_000 ms` timeout (unless a cached `threadId` was restored from `sessionStorage`).
3. **`idle` (Startup Complete)**:
   - `threadId` is available and `isBackendReady === true`.
   - `LoadingOverlay` smoothly fades out (`opacity-0 pointer-events-none`).
4. **`error` (Startup Failed)**:
   - Entered if Phase 1 times out after 120s, Phase 1 receives a permanent `4xx` (`!= 408, 425, 429`), or Phase 2 fails/times out after 10s.
   - `notice` set to a generic, actionable message (`copy.backendUnavailable`); `LoadingOverlay` shows the error and "Retry" button.
   - Clicking "Retry" calls `retryStartup()`, which aborts any in-flight startup controller, resets state to Phase 1 (`connecting`, `isBackendReady = false`), and starts a fresh 120s readiness cycle.

## External Contracts (API Payloads)

### GET /health/ready
- **Request**: `GET /health/ready`, `cache: "no-store"`, `Accept: "application/json"`.
- **Response (`200 OK`)**: Backend is ready (`{ "status": "ready" }` or any `2xx`).
- **Response (`408`, `425`, `429`, `5xx` including `503`)**: Temporary unavailability; retried with capped exponential backoff and full jitter.
- **Response (other `4xx`)**: Permanent client error; stops polling immediately.

### POST /threads
- **Request**: Empty body (with 10-second timeout during initial startup).
- **Response**: UUID string or `{ "id": "string", "createdAt": "DateTime" }`

### POST /chat
- **Request**: `{ "thread_id": "string", "message": "string", "model": "string" }`
- **Response**: Streaming NDJSON or status object.

### POST /chat/stop
- **Request**: `{ "thread_id": "string", "run_id": "string" }`
- **Response**: `{ "success": boolean }`

### POST /chat/resume
- **Request**: `{ "thread_id": "string", "interrupt_id": "string", "resume": boolean }`
- **Response**: Streaming NDJSON or status object.

### GET /conversations
- **Response**: `[{ "id": "string", "threadId": "string", "title": "string", "createdAt": "DateTime", "updatedAt": "DateTime" }]`

### GET /history/{thread_id}
- **Response**: `[{ "id": "string", "author": "string", "text": "string", "status": "string", "toolCalls": "string", "interruptId": "string", "interruptDecision": "string", "createdAt": "DateTime" }]`

### POST /rag/upload
- **Request**: `multipart/form-data` with fields `file` (`File`) and `thread_id` (`string`).
- **Response (`200 OK`)**: `{ "status": "ready" | "duplicate", "duplicate"?: boolean, "filename"?: string, "original_filename"?: string, "message"?: string }`
- **Response (`4xx` / `5xx`)**: `{ "detail": "string" }` (mapped to safe user-facing copy).
