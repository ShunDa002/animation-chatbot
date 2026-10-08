# Validation & Quickstart: message-input-ui

This guide describes how to validate the interactive message input and new chat functionality manually or via tests.

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

## Automated Validation

Run the component and E2E tests to validate these scenarios automatically:

```bash
# Run component tests for the morphing logic
npm run test ChatInput.test.tsx

# Run E2E tests for the chat and sidebar flows
npx playwright test e2e/message-input.spec.ts
```
