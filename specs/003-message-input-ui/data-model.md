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

## External Contracts (API Payloads)

### POST /threads
- **Request**: Empty body (or user metadata if required).
- **Response**: `{ "id": "string", "createdAt": "DateTime" }`

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
