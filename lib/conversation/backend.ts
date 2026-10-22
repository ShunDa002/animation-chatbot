/**
 * Thin client wrapper for the external FastAPI backend (D15, FR-047).
 *
 * This module is the single place that knows the backend URL and the request shapes.
 * All backend configuration is via NEXT_PUBLIC_BACKEND_URL.
 */

import { copy } from '@/lib/ui/copy';

export {
  waitForBackendReady,
  BackendReadinessError,
  type ReadinessOptions,
  type ReadinessResult,
} from './backend-readiness';

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

export interface CreateThreadOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Creates a new conversation thread on the backend (FR-043, API-008).
 * Returns the UUID string assigned to this thread.
 * Throws on non-200 response, timeout, or network error.
 */
export async function createThread(
  signalOrOptions?: AbortSignal | CreateThreadOptions,
): Promise<string> {
  const backendUrl = getBackendUrl();
  const signal = signalOrOptions instanceof AbortSignal ? signalOrOptions : signalOrOptions?.signal;
  const timeoutMs = signalOrOptions instanceof AbortSignal ? undefined : signalOrOptions?.timeoutMs;

  const hasTimeout = typeof timeoutMs === 'number' && timeoutMs > 0;
  let controller: AbortController | undefined;
  let timer: NodeJS.Timeout | null = null;
  const abortCurrent = () => controller?.abort();

  if (signal || hasTimeout) {
    controller = new AbortController();
    signal?.addEventListener('abort', abortCurrent, { once: true });
    if (hasTimeout) {
      timer = setTimeout(() => controller?.abort(), timeoutMs);
    }
  }

  const init: RequestInit = {
    method: 'POST',
  };
  if (controller) {
    init.signal = controller.signal;
  }

  try {
    const response = await fetch(`${backendUrl}/threads`, init);

    if (!response.ok) {
      throw new Error(`Thread creation failed with status ${response.status}`);
    }

    const rawText = await response.text();
    const threadId = rawText.replace(/^"|"$/g, '').trim();

    if (!threadId) {
      throw new Error('Received empty thread id from backend');
    }

    return threadId;
  } finally {
    if (timer !== null) clearTimeout(timer);
    signal?.removeEventListener('abort', abortCurrent);
  }
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
  const init: RequestInit = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      thread_id: threadId,
      run_id: runId ?? null,
    }),
  };
  if (signal) {
    init.signal = signal;
  }
  return fetch(`${backendUrl}/chat/stop`, init);
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

/** RAG Document Upload Options and Types (API-010, FR-045, FR-046) */
export interface UploadRagDocumentOptions {
  signal?: AbortSignal;
  onUploadProgress?: (percentage: number) => void;
  onProcessingStart?: () => void;
  xhrFactory?: () => XMLHttpRequest;
}

export interface RagUploadResult {
  status: 'ready' | 'already_added';
  duplicate: boolean;
  filename?: string;
  originalFilename?: string;
  message?: string;
}

export class RagUploadError extends Error {
  readonly status?: number;
  readonly userMessage: string;

  constructor(userMessage: string, status?: number, message?: string) {
    super(message || userMessage);
    this.name = 'RagUploadError';
    this.userMessage = userMessage;
    this.status = status;
  }
}

/**
 * Uploads a document file to POST /rag/upload using multipart/form-data with file and thread_id.
 * Progress is reported via onUploadProgress, and onProcessingStart is triggered when upload bytes finish transferring.
 */
export function uploadRagDocument(
  threadId: string,
  file: File,
  options?: UploadRagDocumentOptions,
): Promise<RagUploadResult> {
  return new Promise((resolve, reject) => {
    const backendUrl = getBackendUrl();
    const xhrFactory = options?.xhrFactory ?? (() => new XMLHttpRequest());
    const xhr = xhrFactory();

    const formData = new FormData();
    formData.append('file', file);
    formData.append('thread_id', threadId);

    xhr.open('POST', `${backendUrl}/rag/upload`);
    xhr.setRequestHeader('Accept', 'application/json');

    if (options?.signal) {
      if (options.signal.aborted) {
        xhr.abort();
        reject(new RagUploadError(copy.ragErrorNetwork, undefined, 'Upload aborted'));
        return;
      }
      options.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    if (xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
          options?.onUploadProgress?.(percent);
        }
      };

      xhr.upload.onload = () => {
        options?.onProcessingStart?.();
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          const isDuplicate = data.status === 'duplicate' || data.duplicate === true;
          resolve({
            status: isDuplicate ? 'already_added' : 'ready',
            duplicate: isDuplicate,
            filename: data.filename || file.name,
            originalFilename: data.original_filename,
            message: data.message,
          });
        } catch {
          resolve({
            status: 'ready',
            duplicate: false,
            filename: file.name,
          });
        }
      } else {
        let detail = '';
        try {
          const errData = JSON.parse(xhr.responseText || '{}');
          detail = errData.detail || errData.message || '';
        } catch {
          // ignore parsing error
        }

        let userMsg: string = copy.ragErrorGeneric;
        const lowerDetail = detail.toLowerCase();
        if (xhr.status === 400 && (lowerDetail.includes('empty') || lowerDetail.includes('0 bytes'))) {
          userMsg = copy.ragErrorEmptyFile;
        } else if (
          xhr.status === 413 ||
          lowerDetail.includes('large') ||
          lowerDetail.includes('size') ||
          lowerDetail.includes('exceed')
        ) {
          userMsg = copy.ragErrorFileTooLarge;
        } else if (
          xhr.status === 415 ||
          lowerDetail.includes('format') ||
          lowerDetail.includes('extension') ||
          lowerDetail.includes('unsupported')
        ) {
          userMsg = copy.ragErrorUnsupportedFormat;
        } else if (lowerDetail.includes('unreadable') || lowerDetail.includes('no text')) {
          userMsg = copy.ragErrorUnreadableText;
        } else if (xhr.status === 502 || xhr.status === 503) {
          userMsg = copy.ragErrorServiceUnavailable;
        }

        reject(new RagUploadError(userMsg, xhr.status, detail || `Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new RagUploadError(copy.ragErrorNetwork, xhr.status, 'Network error during upload'));
    };

    xhr.ontimeout = () => {
      reject(new RagUploadError(copy.ragErrorNetwork, xhr.status, 'Upload request timed out'));
    };

    xhr.send(formData);
  });
}
