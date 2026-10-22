# Interface Contract: MessageInput

## Props

| Prop | Type | Optional | Description |
|------|------|----------|-------------|
| `onSubmit` | `(text: string, model?: string) => void` | Yes | Callback invoked when the user submits a message via Enter key or Send button. |
| `onSend` | `(draft: string, model?: string) => void` | Yes | Legacy alias for `onSubmit`. |
| `onStop` | `() => void` | Yes | Callback invoked when the user clicks the Stop button or presses Escape during generation. |
| `value` | `string` | Yes | The controlled text value of the input, enabling the parent to restore drafts on error. |
| `onChange` | `(text: string) => void` | Yes | Callback when text changes to update the controlled value. |
| `disabled` | `boolean` | Yes | If true, disables the text area and all actions (used during network requests or HITL interrupt states). |
| `isWaitingForResponse` | `boolean` | Yes | If true, places the input in a waiting state where the send button is disabled but text input remains enabled. |
| `isStreaming` | `boolean` | Yes | If true, indicates the AI is generating a response. The component morphs the Send button into a Stop button. |
| `isBackendReady` | `boolean` | Yes | Defaults to `true`. When `false` during initial startup, holds back the `POST /models` fetch until `GET /health/ready` returns `200 OK` (FR-040). |
| `threadId` | `string \| null` | Yes | Active conversation thread identifier used to associate `POST /rag/upload` requests and scope RAG upload state per conversation (FR-043, FR-047). Defaults to an internal fallback key in isolated component tests when omitted; when explicitly `null` or `""`, blocks upload with an actionable message. |

## Interface Contract: Sidebar (Startup Gating)

| Prop | Type | Optional | Description |
|------|------|----------|-------------|
| `isBackendReady` | `boolean` | Yes | Defaults to `true`. When `false` during initial startup, keeps the sidebar in its skeleton loading state and holds back `GET /conversations` until `GET /health/ready` returns `200 OK` (FR-040). |

## Interface Contract: LoadingOverlay

## Props

| Prop | Type | Optional | Description |
|------|------|----------|-------------|
| `isConnecting` | `boolean` | No | True while `GET /health/ready` polling is in progress. |
| `isGeneratingThread` | `boolean` | No | True while `POST /threads` is in flight on initial load. |
| `onRetry` | `() => void` | No | Callback when the "Retry" button is clicked; restarts the full startup sequence from `GET /health/ready` with a fresh 120s deadline (FR-041). |
| `error` | `string \| null` | Yes | Generic, actionable error message when readiness (120s deadline or permanent `4xx`) or thread creation (10s timeout or error) fails. Never contains raw HTTP status codes (FR-017). |
| `timeoutMs` | `number` | Yes | Optional safety fallback timeout override (defaults to `130000` ms when not controlled by the startup coordinator, or remains configurable for isolated component tests). |
