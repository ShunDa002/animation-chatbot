# Data Model: message-input-ui

No new persistence entities or complex data structures are introduced in this feature. 

The feature purely modifies the local React state and CSS styling of the `MessageInput` component.
The state relies on:
- `draft` (string): The current text in the textarea.
- `isFocused` (boolean): Tracked implicitly via CSS pseudo-classes or React state if needed for styling the container.
- `rows` / height (number): Derived from the `textarea`'s `scrollHeight`.
