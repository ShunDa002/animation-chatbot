# Validation & Quickstart: message-input-ui

This guide describes how to validate the interactive message input, startup readiness, new chat, and RAG document upload functionality manually or via tests.

## Prerequisites

- Next.js development server running (`npm run dev`)
- Backend API server running (or API routes mocked via msw/interceptors)
- Playwright installed for E2E tests (`npx playwright install`)

## Scenario 1: Morphing Animation Validation

**Steps:**
1. Open the application in a web browser.
2. Locate the single-line, pill-shaped message input at the bottom of the screen.
3. Type a long string of text exceeding 36 characters OR press `Shift+Enter` to insert a newline.
4. **Observe:** The input container morphs smoothly into a multi-line rectangular card. The controls (Attachment, Model Selector, Send) rearrange to the bottom footer.
5. Delete the text.
6. **Observe:** The input reverts to the single-line pill layout.

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

## Scenario 5: RAG Document Upload via Attachment Button

**Steps:**
1. Click the Attachment (`+`) button inside `MessageInput`.
2. **Observe:** An inline upload panel toggles open above the composer bar showing supported formats (`.pdf`, `.txt`, `.md`, `.docx`), the `3 MB` maximum size limit, and the conversation scope notice.
3. Select or drag-and-drop an invalid file (e.g., `.exe`, `0`-byte file, or a `> 3 MB` file).
4. **Observe:** Client-side validation immediately rejects the file with an actionable error message and zero network requests to `POST /rag/upload`.
5. Select or drag-and-drop a valid file (e.g., `guide.pdf`, `120 KB`).
6. **Observe:** The panel enters `Selected` state showing `guide.pdf`, `PDF`, `120 KB`, along with **Upload**, **Replace**, and **Remove** controls.
7. Click **Upload**.
8. **Observe:** Duplicate upload clicks and chat `Send` are disabled; the status displays `Uploading document...` during byte transfer, transitions to `Preparing document for use...` once bytes finish uploading, and upon `200 OK` displays `Document is ready. You can now ask questions about it.` (or `This document is already available in this conversation.` when the backend reports `status: "duplicate"`).
9. Switch to another conversation in the sidebar or click "New Chat".
10. **Observe:** The upload status remains scoped to the conversation where the upload occurred and does not leak into the newly opened conversation.

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
