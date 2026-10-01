import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConversation } from '@/lib/conversation/useConversation';

describe('useConversation with Tool Calls', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('preserves toolCalls in message state when reply completes', async () => {
    // Mock /thread response
    const mockThreadResponse = new Response('thread-123', { status: 200 });

    // Mock NDJSON streaming response with tool calls and tokens
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"type":"start","thread_id":"thread-123"}\n'));
        controller.enqueue(
          encoder.encode(
            '{"type":"tool_call_delta","tool_name":"get_weather","tool_call_id":"tc-1","args_delta":"{\\"city\\":\\"Paris\\"}"}\n',
          ),
        );
        controller.enqueue(
          encoder.encode(
            '{"type":"tool_result","tool_call_id":"tc-1","content":{"temp":18}}\n',
          ),
        );
        controller.enqueue(
          encoder.encode('{"type":"token","content":"The weather in Paris is 18°C."}\n'),
        );
        controller.enqueue(encoder.encode('{"type":"done"}\n'));
        controller.close();
      },
    });

    const mockChatResponse = new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    });

    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockThreadResponse)
      .mockResolvedValueOnce(mockChatResponse);

    const { result } = renderHook(() => useConversation());

    // Wait for thread initialization
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Send a message
    await act(async () => {
      result.current.send('What is the weather in Paris?');
    });

    // Wait for stream to finish processing
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    const messages = result.current.messages;
    const assistantMessage = messages.find((m) => m.author === 'character');

    expect(assistantMessage).toBeDefined();
    expect(assistantMessage?.status).toBe('completed');
    expect(assistantMessage?.text).toBe('The weather in Paris is 18°C.');

    // CRITICAL: toolCalls must remain attached to the message after generation completes!
    expect(assistantMessage?.toolCalls).toBeDefined();
    expect(assistantMessage?.toolCalls?.length).toBe(1);
    expect(assistantMessage?.toolCalls?.[0]?.toolName).toBe('get_weather');
    expect(assistantMessage?.toolCalls?.[0]?.status).toBe('completed');
    expect(assistantMessage?.toolCalls?.[0]?.result).toEqual({ temp: 18 });
  });

  it('preserves multiple sequential tools and results in message state when reply completes', async () => {
    const mockThreadResponse = new Response('thread-123', { status: 200 });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"type":"start","thread_id":"thread-123"}\n'));
        // Tool 1
        controller.enqueue(
          encoder.encode(
            '{"type":"tool_call_delta","tool_name":"get_weather","tool_call_id":"tc-1","args_delta":"{\\"city\\":\\"Paris\\"}"}\n',
          ),
        );
        controller.enqueue(
          encoder.encode(
            '{"type":"tool_result","tool_call_id":"tc-1","content":{"temp":18}}\n',
          ),
        );
        // Tool 2
        controller.enqueue(
          encoder.encode(
            '{"type":"tool_call_delta","tool_name":"convert_temp","tool_call_id":"tc-2","args_delta":"{\\"c\\":18}"}\n',
          ),
        );
        controller.enqueue(
          encoder.encode(
            '{"type":"tool_result","tool_call_id":"tc-2","content":{"f":64.4}}\n',
          ),
        );
        // Normal text
        controller.enqueue(
          encoder.encode('{"type":"token","content":"Paris is 18°C (64.4°F)."}\n'),
        );
        controller.enqueue(encoder.encode('{"type":"done"}\n'));
        controller.close();
      },
    });

    const mockChatResponse = new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    });

    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockThreadResponse)
      .mockResolvedValueOnce(mockChatResponse);

    const { result } = renderHook(() => useConversation());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      result.current.send('Weather in Paris in F?');
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    const assistantMessage = result.current.messages.find((m) => m.author === 'character');

    expect(assistantMessage).toBeDefined();
    expect(assistantMessage?.status).toBe('completed');
    expect(assistantMessage?.text).toBe('Paris is 18°C (64.4°F).');

    // Both tools must be in toolCalls!
    expect(assistantMessage?.toolCalls).toHaveLength(2);
    expect(assistantMessage?.toolCalls?.[0]?.toolName).toBe('get_weather');
    expect(assistantMessage?.toolCalls?.[0]?.result).toEqual({ temp: 18 });
    expect(assistantMessage?.toolCalls?.[1]?.toolName).toBe('convert_temp');
    expect(assistantMessage?.toolCalls?.[1]?.result).toEqual({ f: 64.4 });
  });

  describe('sessionStorage persistence (FR-024)', () => {
    beforeEach(() => {
      sessionStorage.clear();
    });

    afterEach(() => {
      sessionStorage.clear();
    });

    it('initializes from sessionStorage on mount without calling createThread', async () => {
      const savedMessages = [
        { id: 'visitor-1', author: 'visitor', text: 'Hello', status: 'completed' },
        { id: 'character-2', author: 'character', text: 'Hi there!', status: 'completed' },
      ];
      sessionStorage.setItem('chat_thread_id', 'existing-thread-uuid');
      sessionStorage.setItem('chat_messages', JSON.stringify(savedMessages));

      const { result } = renderHook(() => useConversation());

      // Wait for mount effect to run
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.threadId).toBe('existing-thread-uuid');
      expect(result.current.status).toBe('idle');
      expect(result.current.messages).toEqual(savedMessages);

      // fetch should NOT have been called to create a thread
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('creates new thread and stores it in sessionStorage when absent', async () => {
      const mockThreadResponse = new Response('new-thread-uuid', { status: 200 });
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockThreadResponse);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.threadId).toBe('new-thread-uuid');
      expect(result.current.status).toBe('idle');
      expect(sessionStorage.getItem('chat_thread_id')).toBe('new-thread-uuid');
    });

    it('sanitizes in-flight streaming messages to interrupted when restored from sessionStorage', async () => {
      const savedMessages = [
        { id: 'visitor-1', author: 'visitor', text: 'Tell me a story', status: 'completed' },
        { id: 'character-2', author: 'character', text: 'Once upon a time...', status: 'streaming' },
      ];
      sessionStorage.setItem('chat_thread_id', 'interrupted-thread');
      sessionStorage.setItem('chat_messages', JSON.stringify(savedMessages));

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1]?.status).toBe('interrupted');
      expect(result.current.messages[1]?.text).toBe('Once upon a time...');
    });

    it('syncs messages to sessionStorage when a visitor sends a message', async () => {
      sessionStorage.setItem('chat_thread_id', 'thread-sync-test');
      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"type":"done"}\n'));
              controller.close();
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } },
        ),
      );

      await act(async () => {
        result.current.send('Testing sync');
      });

      const stored = sessionStorage.getItem('chat_messages');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].text).toBe('Testing sync');
      expect(parsed[0].author).toBe('visitor');
    });

    it('generates distinct IDs for new messages even when restored messages have sequence-like IDs', async () => {
      const savedMessages = [
        { id: 'visitor-1', author: 'visitor', text: 'First visit message', status: 'completed' },
      ];
      sessionStorage.setItem('chat_thread_id', 'thread-id-reuse-check');
      sessionStorage.setItem('chat_messages', JSON.stringify(savedMessages));

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.messages[0]?.id).toBe('visitor-1');

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"type":"done"}\n'));
              controller.close();
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } },
        ),
      );

      await act(async () => {
        result.current.send('Second message after reload');
      });

      const visitorIds = result.current.messages
        .filter((m) => m.author === 'visitor')
        .map((m) => m.id);

      expect(visitorIds).toHaveLength(2);
      expect(visitorIds[0]).not.toBe(visitorIds[1]);
      expect(new Set(visitorIds).size).toBe(2);
    });
  });
});
