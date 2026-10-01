# Quickstart & Validation Guide: message-input-ui

## Validation Scenarios

This guide details how to validate the message input UI redesign manually.

### Prerequisites
1. Start the development server: `npm run dev`
2. Open the application in a modern web browser.

### 1. Initialization and Loading State Validation
- **Action**: Reload the application page.
- **Expected**: A full white page with a centered loader (`public/assets/loader.gif`) appears.
- **Action**: Simulate successful backend connection and threadId generation.
- **Expected**: The white loading page smoothly fades out, and the chatbot UI fades in.
- **Action**: Simulate a failure or wait for 30 seconds.
- **Expected**: An error message and "Retry" button appear on the white loading page.

### 2. Single-Line Pill Validation
- **Action**: Look at the input box when empty.
- **Expected**: It should appear as a single-line, pill-shaped dark container with all icons (Attachment, Model Selector, Voice, Send) horizontally inline.

### 3. Auto-Expansion and Layout Morphing Validation
- **Action**: Type a long sentence that exceeds the width of the input, or press `Shift+Enter`.
- **Expected**: The pill container should smoothly morph into a rounded rectangular card.
- **Expected**: The Attachment icon should drop to the bottom-left. The Model Selector, Voice, and Send icons should drop to the bottom-right.
- **Expected**: The caret should remain focused and not jump to the beginning of the text.

### 4. Maximum Height Validation
- **Action**: Continue pressing `Shift+Enter` until you have 6 or 7 lines of text.
- **Expected**: The container should stop growing vertically after exactly 5 lines of text.
- **Expected**: An inner scrollbar should appear within the text area.

### 5. Submission Validation
- **Action**: Press the `Enter` key.
- **Expected**: The message is submitted.
- **Expected**: The text area is cleared, but remains enabled.
- **Expected**: The Send button immediately becomes disabled indicating the loading state.
