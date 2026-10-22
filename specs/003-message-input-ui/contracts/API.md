# Interface Contract: API

## `GET /health/ready` (API-009)

Checks whether the backend has completed startup initialization (e.g., `init_db()`) and is ready to serve requests. Called on frontend startup and when the loading-page "Retry" button is clicked.

**Request**:
- Method: `GET`
- Path: `/health/ready`
- Cache mode: `no-store`
- Headers:
  - `Accept: application/json`
- Per-request timeout: `3,000 ms`
- Overall polling deadline: `120,000 ms`

**Response (Ready)**:
- Status: `200 OK`
- Behavior: Polling stops immediately; gated startup requests (`POST /threads`, `GET /conversations`, `POST /models`) are allowed to proceed.

**Response (Transient / Not Ready Yet)**:
- Status: `408`, `425`, `429`, or `5xx` (including `502`, `503`, `504`), or network error / per-request timeout.
- Behavior: Retried with bounded exponential backoff (`baseDelayMs = 500`, `maxDelayMs = 10,000`) and full jitter (`0` to `min(10000, 500 * 2^retryIndex)` ms) until the `120,000 ms` overall deadline expires.

**Response (Permanent Client Error)**:
- Status: Any other `4xx` (e.g., `400`, `401`, `403`, `404`).
- Behavior: Polling stops immediately without further retries. The loading page displays a generic, actionable error message and a "Retry" button without exposing the HTTP status code.

---

## `POST /threads` (API-008)

Creates a new conversation thread and returns its UUID. On initial startup, this request is gated until `GET /health/ready` returns `200 OK` and is subject to an independent `10,000 ms` timeout.

**Request**:
- Method: `POST`
- Path: `/threads`
- Startup timeout: `10,000 ms` (begins only after `GET /health/ready` succeeds)

**Response (Success)**:
- Status: `200 OK`
- Body: UUID string (e.g., `"a1b2c3d4-..."`)

**Response (Error / Timeout)**:
- On initial startup: Displays a generic error message and "Retry" button on the white loading overlay. Clicking "Retry" restarts the full startup sequence from `GET /health/ready`.
- On mid-session "New Chat": Displays an inline error message with a "Retry" button centered in the main chat area (no readiness re-check).

---

## `GET /conversations` (API-006)

Fetches the user's historical conversations. On initial startup, this request is gated until `GET /health/ready` returns `200 OK`.

**Request**:
- Method: `GET`
- Path: `/conversations`
- Headers: `Accept: application/json`

**Response (Success)**:
- Status: `200 OK`
- Body:
```json
[
  {
    "id": "string",
    "threadId": "string",
    "title": "string",
    "createdAt": "DateTime string",
    "updatedAt": "DateTime string"
  }
]
```

**Response (Error)**:
- Status: `500 Internal Server Error` (or other standard HTTP errors)
- Handled by displaying an inline error message and a 'Retry' button in the Sidebar.

---

## `POST /models` (API-005)

Fetches the available AI models for the model selector dropdown. On initial startup, this request is gated until `GET /health/ready` returns `200 OK`.

**Request**:
- Method: `POST`
- Path: `/models`
- Headers: `Content-Type: application/json`

**Response (Success)**:
- Status: `200 OK`
- Body: JSON array of model identifier strings or model objects.

---

## `POST /rag/upload` (API-010)

Uploads a single supported document (`.pdf`, `.txt`, `.md`, `.docx`, `<= 3 MB`) to be indexed for retrieval-augmented responses in the active conversation (`thread_id`).

**Request**:
- Method: `POST`
- Path: `/rag/upload`
- Content-Type: `multipart/form-data`
- Form Fields:
  - `file`: Binary `File` object
  - `thread_id`: Active conversation thread UUID string

**Response (Newly Indexed — `Ready`)**:
- Status: `200 OK` (or `201 Created`)
- Body:
```json
{
  "status": "ready",
  "duplicate": false,
  "filename": "notes.pdf"
}
```

**Response (Duplicate Content — `Already Added`)**:
- Status: `200 OK`
- Body:
```json
{
  "status": "duplicate",
  "duplicate": true,
  "filename": "notes-copy.pdf",
  "original_filename": "notes.pdf"
}
```

**Response (Error)**:
- Status: `4xx` / `5xx`
- Body: `{ "detail": "string" }`
- Behavior: Mapped to safe, actionable user-facing copy in the inline upload panel without exposing internal file paths, content hashes, or HTTP status codes. Retains selected file context for **Retry**, **Replace**, or **Remove**.
