# Validation & Quickstart: message-input-ui

This guide describes how to validate the interactive message input, startup readiness, new chat, and RAG document upload functionality manually or via tests.

## Prerequisites

- Next.js development server running (`npm run dev`)
- Backend API server running (or API routes mocked via msw/interceptors)
- Playwright installed for E2E tests (`npx playwright install`)

## Scenario 1: Morphing Animation & Single-Line Fixed Height Validation

**Steps:**
1. Open the application in a web browser.
2. Locate the single-line, pill-shaped message input at the bottom of the screen.
3. **Observe:** The input textarea is fixed to exactly one line of text. Vertical scrolling is suppressed (`overflow-y: hidden`); there is no vertical scrollbar, and mouse wheel or arrow keys cannot scroll text out of view.
4. Type a short message (<= 48 characters without newlines).
5. **Observe:** The input remains in a compact single-line pill, with the text baseline vertically centered with the action buttons and zero vertical scrollbar or jitter.
6. Type a longer string exceeding 48 characters OR press `Shift+Enter` to insert a newline.
7. **Observe:** The input container morphs smoothly into a multi-line rectangular card. The controls (Attachment, Model Selector, Send) rearrange to the bottom footer. The textarea expands upward line-by-line while keeping `overflow-y: hidden` (no inner scrollbars for 2–5 lines).
8. Type more than 5 lines of text.
9. **Observe:** The container height caps at 5 lines (~120px) and introduces an inner vertical scrollbar (`overflow-y: auto`).
10. Delete the text back to empty or a single line.
11. **Observe:** The input reverts to the single-line pill layout with fixed 1-line height and `overflow-y: hidden`.

## Scenario 2: New Chat Flow

**Steps:**
1. Click the "New Chat" button in the sidebar.
2. **Observe:** The main chat area clears instantly and displays a loading skeleton.
3. **Observe:** Network tab shows a `POST /threads` request.
4. Wait for the new thread ID to return.
5. Type and send a message.
6. **Observe:** The new conversation appears at the top of the sidebar.

## Scenario 3: AI Stream Cancellation

**Steps:**
1. Type a message and hit `Enter`.
2. While the AI is streaming the response, the Send button becomes a Stop button (square icon).
3. Click the Stop button OR press `Escape`.
4. **Observe:** The stream stops immediately, a `POST /chat/stop` request is fired, and "(Stopped)" is appended to the message.

## Scenario 4: Backend Readiness Check & Startup Retry

**Steps:**
1. Start the frontend while the backend is either stopped or returning `503 Service Unavailable` on `GET /health/ready`.
2. Open the application in a browser and inspect the Network tab.
3. **Observe:** The white loading page (`public/assets/loader.gif`) remains visible while `GET /health/ready` is polled with exponential backoff + jitter. Neither `POST /threads`, `GET /conversations`, nor `POST /models` is called while `/health/ready` is pending.
4. Start the backend (or make `GET /health/ready` return `200 OK`).
5. **Observe:** Polling stops immediately on the first `200 OK`, `POST /threads` (with a 10s timeout), `GET /conversations`, and `POST /models` are triggered, and once `threadId` returns, the loading overlay smoothly fades out.

## Scenario 5: RAG Document Upload via Attachment Dropdown and Sticky Pill

**Steps:**
1. Click the Attachment (`+`) button inside `MessageInput`.
2. **Observe:** A clean dropdown menu opens above the button with two options: `Browse files` and `resume.pdf`, separated by a divider line.
3. Click `resume.pdf` (or click `Browse files` and pick a valid file from your computer).
4. **Observe:** The dropdown closes immediately, `POST /rag/upload` starts automatically, and a document pill appears stacked directly above the top border of the message input container showing `resume.pdf`, an in-flight loading indicator, and a cancel button (`X`).
5. **Observe:** While the document is active or uploading, the Attachment (`+`) button is disabled with reduced opacity and a tooltip indicating the active document must be cancelled before uploading another file.
6. Once upload finishes, the pill displays the document name with the cancel button (`X`), and chat message `Send` is enabled.
7. Click the cancel button (`X`) on the pill.
8. **Observe:** The pill disappears, the active file state is cleared, and the Attachment (`+`) button is re-enabled.
9. Try selecting an invalid file (e.g., `.exe` or `> 3 MB` file) via `Browse files`.
10. **Observe:** Client-side validation immediately flags the error within the pill with an actionable error message and cancel button, with zero network requests to `POST /rag/upload`.
11. Switch to another conversation in the sidebar or click "New Chat".
12. **Observe:** The document pill status remains scoped to the conversation where the upload occurred and does not leak into the newly opened conversation.


## Automated Validation

Run the unit, component, and E2E tests to validate these scenarios automatically:

```bash
# Run unit tests for backend readiness polling, RAG upload client, and limits validation
npm run test tests/unit/backend-readiness.test.ts tests/unit/backend.test.ts tests/unit/useConversation.test.ts

# Run component tests for MessageInput (including RAG file upload) and loading overlay
npm run test tests/components/MessageInput.test.tsx tests/components/ChatInput.test.tsx tests/components/LoadingOverlay.test.tsx

# Run E2E tests for the chat and sidebar flows
npx playwright test e2e/message-input.spec.ts
```
