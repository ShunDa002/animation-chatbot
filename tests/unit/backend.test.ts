import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getBackendUrl, createThread, sendMessage } from '@/lib/conversation/backend';

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
    it('sends POST /chat with user_input and thread_id in JSON body and returns Response', async () => {
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
        },
        body: JSON.stringify({
          user_input: 'Hello Aria!',
          thread_id: 'test-thread-123',
        }),
        signal: controller.signal,
      });
    });

    it('throws when network error occurs', async () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:8000';
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Network failure'));

      await expect(sendMessage('test-thread-123', 'Hello')).rejects.toThrow('Network failure');
    });
  });
});
