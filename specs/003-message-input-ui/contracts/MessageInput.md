# Interface Contract: MessageInput

## Props

| Prop | Type | Optional | Description |
|------|------|----------|-------------|
| `onSubmit` | `(text: string) => void` | No | Callback invoked when the user submits a message via Enter key or Send button. |
| `disabled` | `boolean` | Yes | If true, disables the text area and all actions. |
| `isWaitingForResponse` | `boolean` | Yes | If true, places the input in a waiting state where the send button is disabled but text input remains enabled. |

## Interface Contract: LoadingOverlay

## Props

| Prop | Type | Optional | Description |
|------|------|----------|-------------|
| `isConnecting` | `boolean` | No | True if waiting for connection. |
| `isGeneratingThread` | `boolean` | No | True if generating threadId. |
| `onRetry` | `() => void` | No | Callback when retry button is clicked. |
| `timeoutMs` | `number` | Yes | Override the default 30s timeout. |
