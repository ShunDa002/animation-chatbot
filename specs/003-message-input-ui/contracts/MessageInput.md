# Interface Contract: MessageInput

## Props

| Prop | Type | Optional | Description |
|------|------|----------|-------------|
| `onSubmit` | `(text: string) => void` | No | Callback invoked when the user submits a message via Enter key or Send button. |
| `onStop` | `() => void` | No | Callback invoked when the user clicks the Stop button or presses Escape during generation. |
| `value` | `string` | No | The controlled text value of the input, enabling the parent to restore drafts on error. |
| `onChange` | `(text: string) => void` | No | Callback when text changes to update the controlled value. |
| `disabled` | `boolean` | Yes | If true, disables the text area and all actions (used during network requests or HITL interrupt states). |
| `isWaitingForResponse` | `boolean` | Yes | If true, places the input in a waiting state where the send button is disabled but text input remains enabled. |
| `isStreaming` | `boolean` | Yes | If true, indicates the AI is generating a response. The component morphs the Send button into a Stop button. |

## Interface Contract: LoadingOverlay

## Props

| Prop | Type | Optional | Description |
|------|------|----------|-------------|
| `isConnecting` | `boolean` | No | True if waiting for connection. |
| `isGeneratingThread` | `boolean` | No | True if generating threadId. |
| `onRetry` | `() => void` | No | Callback when retry button is clicked. |
| `timeoutMs` | `number` | Yes | Override the default 30s timeout. |
