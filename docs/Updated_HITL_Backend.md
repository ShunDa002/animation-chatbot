# Updated NDJSON protocol

The complete protocol now contains the following event types.

Initial invocation begins
{
  "type": "start",
  "thread_id": "123",
  "operation": "invoke"
}

Resume invocation begins
{
  "type": "start",
  "thread_id": "123",
  "operation": "resume",
  "interrupt_id": "efc95671440bc6dae53e7dae128777a4"
}

Assistant text
{
  "type": "token",
  "content": "Your purchase was approved.",
  "node": "chat"
}

Tool call
{
  "type": "tool_call_delta",
  "tool_name": "purchase_stock",
  "tool_call_id": "fc_a0e51b70-edc1-4401-ba94-b0e802d42c88",
  "tool_call_index": 0,
  "args_delta": "{\"quantity\":10,\"symbol\":\"META\"}",
  "node": "chat"
}

Workflow paused
{
  "type": "interrupt",
  "thread_id": "123",
  "interrupt_id": "efc95671440bc6dae53e7dae128777a4",
  "value": "Approve buying 10 shares of META? (yes/no)",
  "resumable": true
}

Tool completed after resume
{
  "type": "tool_result",
  "tool_name": "purchase_stock",
  "tool_call_id": "fc_a0e51b70-edc1-4401-ba94-b0e802d42c88",
  "content": "Purchased 10 shares of META.",
  "status": "success",
  "node": "tools"
}

Workflow completed
{
  "type": "done",
  "thread_id": "123"
}

Workflow failed
{
  "type": "error",
  "thread_id": "123",
  "message": "The chatbot response stream failed."
}

# Frontend state transitions

The frontend should interpret the terminal stream events as follows:

start
  → request is running

token
  → append assistant text

tool_call_delta
  → accumulate tool name, ID, and argument fragments

interrupt
  → mark workflow as paused
  → display approval prompt
  → retain thread_id and interrupt_id
  → close the current active-reader state
  → wait for human input

POST /chat/resume
  → send same thread_id
  → send human response through resume

done
  → mark workflow as completed

error
  → mark workflow as failed

HTTP closure without interrupt, done, or error
  → mark workflow as unexpectedly interrupted


For your approval prompt, the frontend might submit:

{
  "thread_id": "123",
  "interrupt_id": "efc95671440bc6dae53e7dae128777a4",
  "resume": "yes"
}


The value should match what the interrupted node expects. If the node expects a Boolean rather than text, the frontend should submit:

{
  "thread_id": "123",
  "interrupt_id": "efc95671440bc6dae53e7dae128777a4",
  "resume": true
}

# Backend Endpoints
Expected lifecycle

For an interrupted initial request:

POST /chat
→ start
→ tool_call_delta
→ interrupt
→ HTTP stream closes


No done event is emitted.

For a resumed and completed request:

POST /chat/resume
→ start with operation="resume"
→ tool_result
→ token events
→ done
→ HTTP stream closes

*Note: If the resumed execution completes immediately with no further messages, the backend may respond with a plain JSON object (e.g., `{"success": true}`) instead of an NDJSON stream.*

The request format that will be sent to backend as follows:
{
  "thread_id": "123",
  "user_input": "Buy 10 shares of META"
}



If the resumed workflow reaches another interrupt:

POST /chat/resume
→ start with operation="resume"
→ zero or more events
→ interrupt
→ HTTP stream closes

The request format that will be sent to backend to resume as follows:
{
  "thread_id": "123",
  "resume": "yes",
  "interrupt_id": "efc95671440bc6dae53e7dae128777a4"
}

The shared generator correctly supports repeated pause-and-resume cycles because every run processes updates and suppresses done whenever it detects __interrupt__.
