import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getBackendUrl,
  createThread,
  sendMessage,
  resumeChat,
  stopChat,
  fetchModels,
  getModels,
  fetchConversations,
  fetchHistory,
  uploadRagDocument,
  RagUploadError,
} from '@/lib/conversation/backend';
import { copy } from '@/lib/ui/copy';

describe('lib/conversation/backend', () => {
  const originalEnv = process.env.NEXT_PUBLIC_BACKEND_URL;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_BACKEND_URL;
    } else {
      process.env.NEXT_PUBLIC_BACKEND_URL = originalEnv;
    }
    globalThis.fetch = originalFetch;
  });

  describe('getBackendUrl', () => {
    it('falls back to default http://127.0.0.1:8000 when env variable is unset', () => {
      delete process.env.NEXT_PUBLIC_BACKEND_URL;
      expect(getBackendUrl()).toBe('http://127.0.0.1:8000');
    });

    it('falls back to default http://127.0.0.1:8000 when env variable is empty', () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = '   ';
      expect(getBackendUrl()).toBe('http://127.0.0.1:8000');
    });

    it('returns the configured URL when NEXT_PUBLIC_BACKEND_URL is set', () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'https://api.example.com';
      expect(getBackendUrl()).toBe('https://api.example.com');
    });

    it('strips trailing slashes from the configured URL', () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'https://api.example.com///';
      expect(getBackendUrl()).toBe('https://api.example.com');
    });
  });

  describe('createThread', () => {
    it('returns the UUID string on 200 response', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      const mockUuid = '550e8400-e29b-41d4-a716-446655440000';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(mockUuid),
      } as unknown as Response);

      const threadId = await createThread();

      expect(globalThis.fetch).toHaveBeenCalledWith('http://127.0.0.1:8000/threads', {
        method: 'POST',
      });
      expect(threadId).toBe(mockUuid);
    });

    it('handles quoted UUID strings gracefully', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      const mockUuid = '550e8400-e29b-41d4-a716-446655440000';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(`"${mockUuid}"`),
      } as unknown as Response);

      const threadId = await createThread();
      expect(threadId).toBe(mockUuid);
    });

    it('throws when the server responds with a non-200 status (e.g. 500)', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as unknown as Response);

      await expect(createThread()).rejects.toThrow('Thread creation failed with status 500');
    });

    it('throws when the server returns an empty body', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('   '),
      } as unknown as Response);

      await expect(createThread()).rejects.toThrow('Received empty thread id from backend');
    });

    it('throws when a network error occurs', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(createThread()).rejects.toThrow('Failed to fetch');
    });

    it('attaches AbortSignal when signal or timeoutMs is provided (T042, FR-017)', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      const mockUuid = 'thread-with-signal-123';
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(mockUuid),
      } as unknown as Response);
      globalThis.fetch = fetchMock;

      const controller = new AbortController();
      const threadId = await createThread({ signal: controller.signal, timeoutMs: 10000 });

      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/threads', {
        method: 'POST',
        signal: expect.any(AbortSignal),
      });
      expect(threadId).toBe(mockUuid);
    });
  });

  describe('sendMessage', () => {
    it('sends POST /chat with user_input, thread_id, and accept header in JSON body and returns Response', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      const mockResponse = {
        ok: true,
        status: 200,
        body: {},
      } as unknown as Response;

      const fetchMock = vi.fn().mockResolvedValue(mockResponse);
      globalThis.fetch = fetchMock;

      const controller = new AbortController();
      const response = await sendMessage('test-thread-123', 'Hello REM!', controller.signal);

      expect(response).toBe(mockResponse);
      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/x-ndjson',
        },
        body: JSON.stringify({
          thread_id: 'test-thread-123',
          user_input: 'Hello REM!',
        }),
        signal: controller.signal,
      });
    });

    it('includes model in payload when provided', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      const mockResponse = { ok: true, status: 200 } as unknown as Response;
      const fetchMock = vi.fn().mockResolvedValue(mockResponse);
      globalThis.fetch = fetchMock;

      await sendMessage('test-thread-123', 'Hello', undefined, 'custom-model');

      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/x-ndjson',
        },
        body: JSON.stringify({
          thread_id: 'test-thread-123',
          user_input: 'Hello',
          model: 'custom-model',
        }),
        signal: undefined,
      });
    });

    it('throws when network error occurs', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Network failure'));

      await expect(sendMessage('test-thread-123', 'Hello')).rejects.toThrow('Network failure');
    });
  });

  describe('resumeChat', () => {
    it('sends POST /chat/resume with thread_id, resume decision, interrupt_id, and accept header', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      const mockResponse = {
        ok: true,
        status: 200,
      } as unknown as Response;

      const fetchMock = vi.fn().mockResolvedValue(mockResponse);
      globalThis.fetch = fetchMock;

      const controller = new AbortController();
      const response = await resumeChat('test-thread-123', 'yes', 'int-456', controller.signal);

      expect(response).toBe(mockResponse);
      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/chat/resume', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/x-ndjson',
        },
        body: JSON.stringify({
          thread_id: 'test-thread-123',
          interrupt_id: 'int-456',
          resume: 'yes',
        }),
        signal: controller.signal,
      });
    });

    it('includes model in resume payload when provided', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      const mockResponse = { ok: true, status: 200 } as unknown as Response;
      const fetchMock = vi.fn().mockResolvedValue(mockResponse);
      globalThis.fetch = fetchMock;

      await resumeChat('test-thread-123', { approved: true }, 'int-456', undefined, 'custom-model');

      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/chat/resume', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/x-ndjson',
        },
        body: JSON.stringify({
          thread_id: 'test-thread-123',
          interrupt_id: 'int-456',
          resume: { approved: true },
          model: 'custom-model',
        }),
        signal: undefined,
      });
    });

    it('throws when network error occurs during resume', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Connection reset'));

      await expect(resumeChat('test-thread-123', 'no')).rejects.toThrow('Connection reset');
    });
  });

  describe('stopChat', () => {
    it('sends POST /chat/stop with thread_id and run_id in payload', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      const mockResponse = {
        ok: true,
        status: 200,
      } as unknown as Response;

      const fetchMock = vi.fn().mockResolvedValue(mockResponse);
      globalThis.fetch = fetchMock;

      const response = await stopChat('test-thread-123', 'run-456');

      expect(response).toBe(mockResponse);
      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/chat/stop', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          thread_id: 'test-thread-123',
          run_id: 'run-456',
        }),
        signal: undefined,
      });
    });

    it('defaults run_id to null when omitted', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      const mockResponse = {
        ok: true,
        status: 200,
      } as unknown as Response;

      const fetchMock = vi.fn().mockResolvedValue(mockResponse);
      globalThis.fetch = fetchMock;

      await stopChat('test-thread-123');

      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/chat/stop', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          thread_id: 'test-thread-123',
          run_id: null,
        }),
        signal: undefined,
      });
    });

    it('throws when network error occurs during stop', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Connection refused'));

      await expect(stopChat('test-thread-123')).rejects.toThrow('Connection refused');
    });
  });

  describe('fetchModels', () => {
    it('sends POST /models and parses array of strings', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      const mockModels = ['model-a', 'model-b'];
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockModels),
      } as unknown as Response);
      globalThis.fetch = fetchMock;

      const models = await fetchModels();

      expect(models).toEqual(mockModels);
      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/models', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        signal: undefined,
      });
    });

    it('parses object with models property', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ models: ['custom-1', 'custom-2'] }),
      } as unknown as Response);

      const models = await getModels();
      expect(models).toEqual(['custom-1', 'custom-2']);
    });

    it('throws on non-200 response', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as unknown as Response);

      await expect(fetchModels()).rejects.toThrow('Models request failed with status 500');
    });

    it('throws on network error', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Fetch failed'));

      await expect(fetchModels()).rejects.toThrow('Fetch failed');
    });
  });

  describe('fetchConversations', () => {
    it('sends GET /conversations with accept: application/json', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      const mockConversations = [
        { id: 'c-1', threadId: 't-1', title: 'Conversation 1', createdAt: '2026-10-08T10:00:00Z', updatedAt: '2026-10-08T10:00:00Z' },
      ];
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockConversations),
      } as unknown as Response);
      globalThis.fetch = fetchMock;

      const result = await fetchConversations();

      expect(result).toEqual(mockConversations);
      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/conversations', {
        method: 'GET',
        headers: {
          'accept': 'application/json',
        },
        signal: undefined,
      });
    });

    it('returns empty array when response body is not an array', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      } as unknown as Response);

      const result = await fetchConversations();
      expect(result).toEqual([]);
    });

    it('throws on non-ok status', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
      } as unknown as Response);

      await expect(fetchConversations()).rejects.toThrow('Conversations request failed with status 502');
    });
  });

  describe('fetchHistory', () => {
    it('sends GET /history/{thread_id} with accept: application/json', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      const mockHistory = [
        {
          id: 'msg-1',
          author: 'visitor',
          text: 'Hello REM',
          status: 'completed',
          toolCalls: '',
          interruptId: '',
          interruptDecision: '',
          createdAt: '2026-10-08T10:00:00Z',
        },
        {
          id: 'msg-2',
          author: 'character',
          text: 'Hello! How can I help you?',
          status: 'completed',
          toolCalls: '',
          interruptId: '',
          interruptDecision: '',
          createdAt: '2026-10-08T10:00:01Z',
        },
      ];

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockHistory),
      } as unknown as Response);
      globalThis.fetch = fetchMock;

      const result = await fetchHistory('thread-abc-123');

      expect(result).toEqual(mockHistory);
      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/history/thread-abc-123', {
        method: 'GET',
        headers: {
          'accept': 'application/json',
        },
        signal: undefined,
      });
    });

    it('properly encodes thread_id in URL path', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([]),
      } as unknown as Response);
      globalThis.fetch = fetchMock;

      await fetchHistory('thread with spaces/special');

      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/history/thread%20with%20spaces%2Fspecial', {
        method: 'GET',
        headers: {
          'accept': 'application/json',
        },
        signal: undefined,
      });
    });

    it('returns empty array when response body is not an array', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(null),
      } as unknown as Response);

      const result = await fetchHistory('thread-empty');
      expect(result).toEqual([]);
    });

    it('throws on non-ok status', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response);

      await expect(fetchHistory('missing-thread')).rejects.toThrow('History request failed with status 404');
    });

    it('throws on network error', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Network connection reset'));

      await expect(fetchHistory('error-thread')).rejects.toThrow('Network connection reset');
    });
  });

  describe('uploadRagDocument (API-010, FR-045, FR-046, US9)', () => {
    class FakeXHR {
      open = vi.fn();
      setRequestHeader = vi.fn();
      send = vi.fn();
      abort = vi.fn();
      status = 200;
      responseText = '';
      upload = {
        onprogress: null as any,
        onload: null as any,
      };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
    }

    it('sends POST /rag/upload with file and thread_id in FormData', async () => {
      let createdXhr!: FakeXHR;
      const xhrFactory = () => {
        createdXhr = new FakeXHR();
        createdXhr.status = 200;
        createdXhr.responseText = JSON.stringify({ status: 'ready', filename: 'test.pdf' });
        createdXhr.send.mockImplementation(() => {
          createdXhr.onload?.();
        });
        return createdXhr as unknown as XMLHttpRequest;
      };

      const file = new File(['dummy content'], 'test.pdf', { type: 'application/pdf' });
      const result = await uploadRagDocument('thread-123', file, { xhrFactory });

      expect(createdXhr.open).toHaveBeenCalledWith('POST', 'http://127.0.0.1:8000/rag/upload');
      expect(createdXhr.setRequestHeader).toHaveBeenCalledWith('Accept', 'application/json');
      expect(createdXhr.send).toHaveBeenCalled();

      const sentFormData = createdXhr.send.mock.calls[0][0] as FormData;
      expect(sentFormData.get('file')).toBe(file);
      expect(sentFormData.get('thread_id')).toBe('thread-123');

      expect(result.status).toBe('ready');
      expect(result.duplicate).toBe(false);
      expect(result.filename).toBe('test.pdf');
    });

    it('triggers onUploadProgress and onProcessingStart callbacks', async () => {
      const onUploadProgress = vi.fn();
      const onProcessingStart = vi.fn();

      const xhrFactory = () => {
        const xhr = new FakeXHR();
        xhr.status = 200;
        xhr.responseText = JSON.stringify({ status: 'ready' });
        xhr.send.mockImplementation(() => {
          xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
          xhr.upload.onload?.();
          xhr.onload?.();
        });
        return xhr as unknown as XMLHttpRequest;
      };

      const file = new File(['sample'], 'doc.txt');
      await uploadRagDocument('t-1', file, {
        xhrFactory,
        onUploadProgress,
        onProcessingStart,
      });

      expect(onUploadProgress).toHaveBeenCalledWith(50);
      expect(onProcessingStart).toHaveBeenCalled();
    });

    it('resolves with already_added status when backend returns duplicate', async () => {
      const xhrFactory = () => {
        const xhr = new FakeXHR();
        xhr.status = 200;
        xhr.responseText = JSON.stringify({
          status: 'duplicate',
          duplicate: true,
          original_filename: 'original.pdf',
        });
        xhr.send.mockImplementation(() => {
          xhr.onload?.();
        });
        return xhr as unknown as XMLHttpRequest;
      };

      const file = new File(['content'], 'copy.pdf');
      const result = await uploadRagDocument('thread-dup', file, { xhrFactory });

      expect(result.status).toBe('already_added');
      expect(result.duplicate).toBe(true);
      expect(result.originalFilename).toBe('original.pdf');
    });

    it('maps 400 empty file error to copy.ragErrorEmptyFile', async () => {
      const xhrFactory = () => {
        const xhr = new FakeXHR();
        xhr.status = 400;
        xhr.responseText = JSON.stringify({ detail: 'File is empty' });
        xhr.send.mockImplementation(() => {
          xhr.onload?.();
        });
        return xhr as unknown as XMLHttpRequest;
      };

      const file = new File([], 'empty.pdf');
      await expect(uploadRagDocument('t-1', file, { xhrFactory })).rejects.toMatchObject({
        name: 'RagUploadError',
        userMessage: copy.ragErrorEmptyFile,
      });
    });

    it('maps 413 or large error to copy.ragErrorFileTooLarge', async () => {
      const xhrFactory = () => {
        const xhr = new FakeXHR();
        xhr.status = 413;
        xhr.responseText = JSON.stringify({ detail: 'File too large' });
        xhr.send.mockImplementation(() => {
          xhr.onload?.();
        });
        return xhr as unknown as XMLHttpRequest;
      };

      const file = new File(['large'], 'large.pdf');
      await expect(uploadRagDocument('t-1', file, { xhrFactory })).rejects.toMatchObject({
        userMessage: copy.ragErrorFileTooLarge,
      });
    });

    it('maps 415 or format error to copy.ragErrorUnsupportedFormat', async () => {
      const xhrFactory = () => {
        const xhr = new FakeXHR();
        xhr.status = 415;
        xhr.responseText = JSON.stringify({ detail: 'Unsupported format' });
        xhr.send.mockImplementation(() => {
          xhr.onload?.();
        });
        return xhr as unknown as XMLHttpRequest;
      };

      const file = new File(['bin'], 'app.exe');
      await expect(uploadRagDocument('t-1', file, { xhrFactory })).rejects.toMatchObject({
        userMessage: copy.ragErrorUnsupportedFormat,
      });
    });

    it('maps unreadable text error to copy.ragErrorUnreadableText', async () => {
      const xhrFactory = () => {
        const xhr = new FakeXHR();
        xhr.status = 422;
        xhr.responseText = JSON.stringify({ detail: 'Document contains no text' });
        xhr.send.mockImplementation(() => {
          xhr.onload?.();
        });
        return xhr as unknown as XMLHttpRequest;
      };

      const file = new File(['scanned'], 'scanned.pdf');
      await expect(uploadRagDocument('t-1', file, { xhrFactory })).rejects.toMatchObject({
        userMessage: copy.ragErrorUnreadableText,
      });
    });

    it('maps 502/503 service unavailable to copy.ragErrorServiceUnavailable', async () => {
      const xhrFactory = () => {
        const xhr = new FakeXHR();
        xhr.status = 503;
        xhr.responseText = 'Service Unavailable';
        xhr.send.mockImplementation(() => {
          xhr.onload?.();
        });
        return xhr as unknown as XMLHttpRequest;
      };

      const file = new File(['content'], 'test.pdf');
      await expect(uploadRagDocument('t-1', file, { xhrFactory })).rejects.toMatchObject({
        userMessage: copy.ragErrorServiceUnavailable,
      });
    });

    it('maps network errors to copy.ragErrorNetwork', async () => {
      const xhrFactory = () => {
        const xhr = new FakeXHR();
        xhr.send.mockImplementation(() => {
          xhr.onerror?.();
        });
        return xhr as unknown as XMLHttpRequest;
      };

      const file = new File(['content'], 'test.pdf');
      await expect(uploadRagDocument('t-1', file, { xhrFactory })).rejects.toMatchObject({
        userMessage: copy.ragErrorNetwork,
      });
    });

    it('handles AbortSignal cancellation', async () => {
      let createdXhr!: FakeXHR;
      const xhrFactory = () => {
        createdXhr = new FakeXHR();
        return createdXhr as unknown as XMLHttpRequest;
      };

      const controller = new AbortController();
      const file = new File(['content'], 'test.pdf');
      const uploadPromise = uploadRagDocument('t-1', file, {
        xhrFactory,
        signal: controller.signal,
      });

      controller.abort();
      expect(createdXhr.abort).toHaveBeenCalled();
    });
  });
});
