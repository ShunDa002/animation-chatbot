/**
 * Thin client wrapper for the external FastAPI backend (D15, FR-047).
 *
 * This module is the single place that knows the backend URL and the request shapes.
 * All backend configuration is via NEXT_PUBLIC_BACKEND_URL.
 */

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000';

/**
 * Resolves the backend base URL from the environment, falling back to localhost.
 * Trailing slashes are stripped for consistent URL joining.
 */
export function getBackendUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!envUrl || envUrl.trim().length === 0) {
    return DEFAULT_BACKEND_URL;
  }
  return envUrl.trim().replace(/\/+$/, '');
}

/**
 * Creates a new conversation thread on the backend (FR-043).
 * Returns the UUID string assigned to this thread.
 * Throws on non-200 response or network error.
 */
export async function createThread(): Promise<string> {
  const backendUrl = getBackendUrl();
  const response = await fetch(`${backendUrl}/threads`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Thread creation failed with status ${response.status}`);
  }

  console.log(await response);
  const rawText = await response.text();
  const threadId = rawText.replace(/^"|"$/g, '').trim();

  if (!threadId) {
    throw new Error('Received empty thread id from backend');
  }

  return threadId;
}

/**
 * Sends a visitor message to the backend and returns the raw streaming response (FR-046).
 * Throws on network error (per standard fetch behaviour).
 */
export async function sendMessage(
  threadId: string,
  userInput: string,
  signal?: AbortSignal,
): Promise<Response> {
  const backendUrl = getBackendUrl();
  return fetch(`${backendUrl}/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      user_input: userInput,
      thread_id: threadId,
    }),
    signal,
  });
}
