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

export interface SendMessageOptions {
  signal?: AbortSignal;
  model?: string;
}

/**
 * Sends a visitor message to the backend and returns the raw streaming response (FR-046, API-001).
 * Throws on network error (per standard fetch behaviour).
 */
export async function sendMessage(
  threadId: string,
  userInput: string,
  signalOrOptions?: AbortSignal | SendMessageOptions,
  modelParam?: string,
): Promise<Response> {
  const backendUrl = getBackendUrl();
  const signal = signalOrOptions instanceof AbortSignal ? signalOrOptions : signalOrOptions?.signal;
  const model = signalOrOptions instanceof AbortSignal ? modelParam : (signalOrOptions?.model ?? modelParam);

  const payload: Record<string, unknown> = {
    thread_id: threadId,
    user_input: userInput,
  };
  if (model) {
    payload.model = model;
  }

  return fetch(`${backendUrl}/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/x-ndjson',
    },
    body: JSON.stringify(payload),
    signal,
  });
}

export type ResumeDecision = 'yes' | 'no' | boolean | Record<string, unknown>;

export interface ResumeChatOptions {
  signal?: AbortSignal;
  model?: string;
}

/**
 * Sends a HITL resume decision to the backend (API-002).
 * Throws on network error (per standard fetch behaviour).
 */
export async function resumeChat(
  threadId: string,
  decision: ResumeDecision,
  interruptId?: string,
  signalOrOptions?: AbortSignal | ResumeChatOptions,
  modelParam?: string,
): Promise<Response> {
  const backendUrl = getBackendUrl();
  const signal = signalOrOptions instanceof AbortSignal ? signalOrOptions : signalOrOptions?.signal;
  const model = signalOrOptions instanceof AbortSignal ? modelParam : (signalOrOptions?.model ?? modelParam);

  const payload: Record<string, unknown> = {
    thread_id: threadId,
    interrupt_id: interruptId,
    resume: decision,
  };
  if (model) {
    payload.model = model;
  }

  return fetch(`${backendUrl}/chat/resume`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/x-ndjson',
    },
    body: JSON.stringify(payload),
    signal,
  });
}

/**
 * Sends a request to cancel an active generation stream (API-003).
 * Throws on network error (per standard fetch behaviour).
 */
export async function stopChat(
  threadId: string,
  runId?: string | null,
  signal?: AbortSignal,
): Promise<Response> {
  const backendUrl = getBackendUrl();
  return fetch(`${backendUrl}/chat/stop`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      thread_id: threadId,
      run_id: runId ?? null,
    }),
    signal,
  });
}

/**
 * Fetches available models from the backend via POST /models.
 * Throws on network error (per standard fetch behaviour).
 */
export async function fetchModels(signal?: AbortSignal): Promise<string[]> {
  const backendUrl = getBackendUrl();
  const response = await fetch(`${backendUrl}/models`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Models request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (Array.isArray(data)) {
    return data
      .map((item) => (typeof item === 'string' ? item : (item as { id?: string; name?: string })?.id || (item as { id?: string; name?: string })?.name || String(item)))
      .filter(Boolean);
  }
  if (data && typeof data === 'object') {
    const list = Array.isArray((data as { models?: unknown[] }).models)
      ? (data as { models: unknown[] }).models
      : Array.isArray((data as { data?: unknown[] }).data)
        ? (data as { data: unknown[] }).data
        : [];
    if (list.length > 0) {
      return list
        .map((item) => (typeof item === 'string' ? item : (item as { id?: string; name?: string })?.id || (item as { id?: string; name?: string })?.name || String(item)))
        .filter(Boolean);
    }
  }
  return [];
}

export const getModels = fetchModels;

export interface ConversationSummary {
  id: string;
  threadId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetches historical conversations from the backend via GET /conversations (API-006, US7).
 * Throws on non-ok response or network error.
 */
export async function fetchConversations(signal?: AbortSignal): Promise<ConversationSummary[]> {
  const backendUrl = getBackendUrl();
  const response = await fetch(`${backendUrl}/conversations`, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Conversations request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (Array.isArray(data)) {
    return data;
  }
  return [];
}

export interface HistoryMessageItem {
  id: string;
  author: string;
  text: string;
  status: string;
  toolCalls?: string;
  interruptId?: string;
  interruptDecision?: string;
  createdAt?: string;
}

/**
 * Fetches the message history for a specific thread via GET /history/{thread_id} (API-007, US8).
 * Throws on non-ok response or network error.
 */
export async function fetchHistory(threadId: string, signal?: AbortSignal): Promise<HistoryMessageItem[]> {
  const backendUrl = getBackendUrl();
  const response = await fetch(`${backendUrl}/history/${encodeURIComponent(threadId)}`, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`History request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (Array.isArray(data)) {
    return data;
  }
  return [];
}

