import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getBackendUrl, createThread, sendMessage, resumeChat, stopChat, fetchModels, getModels, fetchConversations, fetchHistory } from '@/lib/conversation/backend';

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
      const response = await sendMessage('test-thread-123', 'Hello Aria!', controller.signal);

      expect(response).toBe(mockResponse);
      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/x-ndjson',
        },
        body: JSON.stringify({
          thread_id: 'test-thread-123',
          user_input: 'Hello Aria!',
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
          text: 'Hello Aria',
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
});


