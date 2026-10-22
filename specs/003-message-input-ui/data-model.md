# Data Model: message-input-ui

## Frontend Component State (MessageInputState)

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | The current value of the textarea. |
| `lineCount` | `number` | The calculated number of lines of the current text. |
| `isMultiLine` | `boolean` | Derived state (`text.length > 36 || text.includes('\n')`). Triggers UI morphing. |
| `isSubmitting` | `boolean` | True when waiting for `POST /chat` or `POST /threads` to resolve. |
| `isStreaming` | `boolean` | True when the AI is currently streaming a response. |
| `interruptState` | `object` | Contains the pending HITL interrupt details (`interruptId`, etc.) when applicable. |
| `selectedModel` | `string` | The ID of the currently selected model from the dropdown. |
| `isBackendReady` | `boolean` | True once `GET /health/ready` has returned `200 OK` during initial startup; gates initial `POST /models` fetch when provided. |
| `isUploadPanelOpen` | `boolean` | True when the inline RAG document upload panel above the composer is toggled open via the Attachment (`+`) button. |
| `uploadsByThread` | `Record<string, ThreadRagUploadState>` | Per-conversation RAG upload state keyed by `threadId` (FR-047). |

## RAG Document Upload Types (`lib/conversation/limits.ts` & `lib/conversation/backend.ts`)

### `RagUploadStatus`
`'idle' | 'selected' | 'uploading' | 'processing' | 'ready' | 'already_added' | 'failed'`

### `ThreadRagUploadState`

| Field | Type | Description |
|-------|------|-------------|
| `status` | `RagUploadStatus` | Current lifecycle stage for this conversation's document upload. |
| `file` | `File \| null` | The selected `File` instance retained for review, upload, or retry. |
| `fileName` | `string \| null` | Plain-text file name displayed in the summary card. |
| `fileTypeLabel` | `string \| null` | Normalized uppercase format label (`PDF`, `TXT`, `MD`, `DOCX`). |
| `fileSizeBytes` | `number \| null` | File size in bytes (formatted for human-readable display). |
| `progress` | `number \| null` | Upload transfer percentage (`0`–`100`) when measurable during `uploading`. |
| `statusMessage` | `string \| null` | Accessible user-facing status or error copy from `lib/ui/copy.ts`. |
| `originalFilename` | `string \| null` | Optional original file name returned by the backend when `status === 'already_added'`. |

### RAG Upload State Transitions (`FR-045`, `FR-046`, `FR-047`)

1. **`idle`**: No valid file is staged for the active `threadId`. Browse and drag-and-drop controls are active.
2. **`selected`**: User selects or drops a file that passes client-side validation (`.pdf`, `.txt`, `.md`, `.docx`, `0 < size <= 3 MB`, active `threadId` present). User can click **Upload**, **Replace**, or **Remove**. (If client-side validation fails, status transitions to `failed` with the validation error message and no file staged for upload.)
3. **`uploading`**: User clicks **Upload** (or **Retry**). `POST /rag/upload` begins transferring `multipart/form-data` (`file`, `thread_id`). Duplicate upload clicks and chat message `Send` are disabled. Displays `Uploading document...` (with progress percentage when available).
4. **`processing`**: Triggered when `xhr.upload.onload` fires (all request bytes transferred) while awaiting the HTTP response from `POST /rag/upload`. Chat message `Send` remains disabled. Displays `Preparing document for use...`.
5. **`ready`**: Backend returns `200 OK` with `status: "ready"` (or `duplicate: false`). Chat message `Send` is re-enabled. Displays `Document is ready. You can now ask questions about it.`
6. **`already_added`**: Backend returns `200 OK` with `status: "duplicate"` (or `duplicate: true`). Treated as an informational success; chat message `Send` is re-enabled. Displays `This document is already available in this conversation.`
7. **`failed`**: Network error, timeout, or `4xx`/`5xx` response from `POST /rag/upload`. Retains `file` context so the user can click **Retry**, **Replace**, or **Remove**. Chat message `Send` is re-enabled.

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
