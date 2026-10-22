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

## R4: Startup Backend Readiness Polling & Backoff Strategy
**Decision**: Implement a framework-neutral `waitForBackendReady` utility in `lib/conversation/backend-readiness.ts` (following `docs/frontend_backend_readiness.md`) that polls `GET /health/ready` with `cache: "no-store"`, a 500 ms base delay, a 10,000 ms maximum delay cap, full jitter (`Math.floor(randomFn() * Math.min(maxDelayMs, baseDelayMs * 2 ** retryIndex))`), a 3,000 ms per-request timeout, and a 120,000 ms overall deadline. Inject `fetchFn` and `randomFn` for deterministic unit testing.
**Rationale**: During backend startup (e.g., while `init_db()` runs before FastAPI serves requests), the frontend may encounter connection refusals, gateway errors (`502`/`503`/`504`), or per-request timeouts. Full jitter prevents synchronized retry storms across concurrent clients, while injectable `fetchFn` and `randomFn` satisfy Constitution Principle II (deterministic tests without wall-clock or network reliance).
**Alternatives considered**:
- Fixed-interval polling without jitter (Rejected: Causes thundering herd spikes when backend finishes booting).
- Retrying all HTTP error codes until 120s (Rejected: Permanent client errors like `400`, `401`, `403`, `404` indicate misconfiguration or version mismatch; failing fast avoids a pointless 2-minute wait).

## R5: Two-Phase Startup Timeout & Retry Architecture
**Decision**: Enforce two independent, sequential startup deadlines inside the conversation startup coordinator (`useConversation`):
1. **Phase 1 (Readiness)**: `waitForBackendReady` enforces a 120-second (`120_000 ms`) overall deadline (or fails immediately on non-retriable `4xx` other than `408`, `425`, `429`).
2. **Phase 2 (Thread Creation)**: Once `/health/ready` returns `200 OK`, `createThread` runs with its own independent 10-second (`10_000 ms`) timeout.
Clicking "Retry" on `LoadingOverlay` invokes a `retryStartup()` callback in `useConversation` (instead of `window.location.reload()`) that aborts any active startup `AbortController`, resets error state, and starts a fresh Phase 1 (120 s) → Phase 2 (10 s) sequence.
**Rationale**: Keeps a single active polling loop at any time, prevents `LoadingOverlay`'s legacy 30-second timer from cutting off the 120-second readiness window prematurely, and ensures user-facing error copy remains generic (`copy.backendUnavailable`) without leaking HTTP status codes (Constitution Principle III, FR-017, FR-041).
**Alternatives considered**:
- Single shared timeout across readiness and thread creation (Rejected during clarification: readiness needs up to 120s for cold backend boots, whereas `POST /threads` against a ready server should fail within 10s).
- Full page reload on Retry via `window.location.reload()` (Rejected: Re-downloads all static assets and Live2D bundles unnecessarily instead of cleanly restarting the startup state machine).

## R6: Gating Backend-Dependent Startup Requests on Readiness
**Decision**: Expose `isBackendReady: boolean` from `useConversation` (initially `false`, set to `true` as soon as `waitForBackendReady` resolves with `200 OK`). Pass `isBackendReady` from `app/page.tsx` and `components/ChatPanel.tsx` into `Sidebar` and `MessageInput` (defaulting the prop to `true` when omitted so isolated component tests remain backward-compatible). Neither `POST /threads`, `GET /conversations`, nor `POST /models` fires until `isBackendReady` is `true`. Mid-session operations (`startNewChat`, `send`, `loadHistory`, sidebar retry) do not re-run `/health/ready`.
**Rationale**: Prevents `Sidebar` and `MessageInput` from firing requests against an unready backend on initial mount and rendering premature inline errors behind the loading overlay (FR-040, FR-042).
**Alternatives considered**:
- Intercepting all `fetch` calls globally (Rejected: Over-engineered and violates Constitution Principle I "no speculative abstraction").

## R7: RAG Document Upload Transport & Uploading-to-Processing Transition
**Decision**: Implement `uploadRagDocument` in `lib/conversation/backend.ts` targeting `POST /rag/upload` with `multipart/form-data` (`file`, `thread_id`) using `XMLHttpRequest` (with an injectable factory/transport for deterministic unit tests). Use `xhr.upload.onprogress` to report upload byte progress during the `Uploading` state (`Uploading document...`) and `xhr.upload.onload` to transition immediately to the `Processing` state (`Preparing document for use...`) while awaiting the server's HTTP response.
**Rationale**: Standard `fetch` does not expose request upload progress callbacks across browsers. `XMLHttpRequest.upload` natively separates byte transmission (`upload.onprogress` / `upload.onload`) from server-side document ingestion time (time between `upload.onload` and `xhr.onload`), satisfying FR-045 and FR-046 with zero third-party dependencies (Constitution Principle I).
**Alternatives considered**:
- `fetch` with a synthetic `setTimeout` timer to switch from `Uploading` to `Processing` (Rejected: Inaccurate on slow networks or fast local uploads).
- Two-endpoint polling architecture (Rejected: Backend uses a single synchronous `POST /rag/upload` request returning `{ status: "ready" | "duplicate" }`).

## R8: Client-Side File Validation & Centralized Copy
**Decision**: Validate files in `lib/conversation/limits.ts` (and surface all user-facing messages from `lib/ui/copy.ts`) prior to enabling or dispatching `POST /rag/upload`. Enforce non-empty size (`file.size > 0`), maximum size `3 MB` (`3 * 1024 * 1024` bytes), allowed extensions (`.pdf`, `.txt`, `.md`, `.docx`, case-insensitive), and active `threadId` presence.
**Rationale**: Satisfies FR-043 and Constitution Principle I & III by validating user/file input at the boundary and keeping all user-facing copy in `lib/ui/copy.ts`. Checking normalized file extensions alongside MIME types avoids browser quirks where `.md` files report an empty `file.type`.
**Alternatives considered**:
- Relying only on `input[accept]` attribute (Rejected: Users can bypass `accept` in the OS dialog or via drag-and-drop).

## R9: Per-Thread Upload State Scoping in `MessageInput`
**Decision**: Store RAG upload state inside `MessageInput` as a dictionary keyed by `threadId` (`Record<string, ThreadRagUploadState>`). Bind in-flight upload callbacks to the `threadId` that initiated the upload.
**Rationale**: Satisfies FR-047 and Section 8 of `docs/rag_frontend_implementation_plan.md`. If a user switches conversations while an upload is in progress, the newly opened conversation displays its own upload state (`idle` by default), and when the in-flight upload completes, its `Ready`, `Already Added`, or `Failed` status is recorded against the originating `threadId` only.
**Alternatives considered**:
- Single global upload state in `MessageInput` (Rejected: Would leak completion/duplicate banners into unrelated conversations when switching threads).
- Aborting in-flight uploads on conversation switch (Rejected during clarification in favor of Option A).

## R10: Dropdown Menu & Sticky Document Pill UX Architecture
**Decision**: Replace the inline multi-step upload panel with:
1. A dropdown popover menu anchored above the Attachment (`+`) button displaying exactly two items (`Browse files` and `resume.pdf`) separated by a divider line.
2. For `resume.pdf`, fetch the static bundled `/resume.pdf` asset via `fetch('/resume.pdf')`, convert to a `File` object, and upload via `POST /rag/upload`.
3. Immediate automatic upload upon selection (either through native file picker or clicking `resume.pdf`), without staging panels or secondary confirmation buttons.
4. An attached sticky document pill stacked directly above the outer top border of the message input container (left-aligned, attached to the composer wrapper).
5. The pill displays the file name, in-flight progress/spinner during `uploading`/`processing`, a cancel button (`X`), and alert/error styling with cancel/dismiss if upload fails.
6. Enforce single-active-file restriction: while a document is active or uploading, the Attachment (`+`) button is disabled (reduced opacity, aria-disabled) with a tooltip stating the active file must be cancelled first.
7. Clicking the cancel button immediately aborts any in-flight upload (`AbortController.abort()`), removes the pill, clears the active file state, and re-enables the Attachment (`+`) button without confirmation dialogs.
**Rationale**: Eliminates unnecessary staging clicks, provides clear visual feedback via the sticky pill, and preserves textarea auto-expansion measurements by placing the pill above the container border. Satisfies Constitution Principles I, III, and IV with zero third-party dependencies.
**Alternatives considered**:
- Keeping an intermediate review stage inside the pill before uploading (Rejected in Clarification Session 2026-10-22 Q1 in favor of immediate automatic upload).
- Embedding the pill inside the textarea composition card (Rejected in Clarification Session 2026-10-22 Q3: would interfere with textarea height recalculation and cursor positioning).
- Showing a confirmation dialog on cancel (Rejected in Clarification Session 2026-10-22 Q4: creates friction when switching files).

