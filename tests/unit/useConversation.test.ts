import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConversation } from '@/lib/conversation/useConversation';
import { copy } from '@/lib/ui/copy';

const mockReadyResponse = () =>
  new Response(JSON.stringify({ status: 'ready' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

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
    const mockThreadResponse = new Response('thread-123', { status: 200 });

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
      .mockResolvedValueOnce(mockReadyResponse())
      .mockResolvedValueOnce(mockThreadResponse)
      .mockResolvedValueOnce(mockChatResponse);

    const { result } = renderHook(() => useConversation());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      result.current.send('What is the weather in Paris?');
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    const messages = result.current.messages;
    const assistantMessage = messages.find((m) => m.author === 'character');

    expect(assistantMessage).toBeDefined();
    expect(assistantMessage?.status).toBe('completed');
    expect(assistantMessage?.text).toBe('The weather in Paris is 18°C.');
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
          encoder.encode(
            '{"type":"tool_call_delta","tool_name":"convert_temp","tool_call_id":"tc-2","args_delta":"{\\"c\\":18}"}\n',
          ),
        );
        controller.enqueue(
          encoder.encode(
            '{"type":"tool_result","tool_call_id":"tc-2","content":{"f":64.4}}\n',
          ),
        );
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
      .mockResolvedValueOnce(mockReadyResponse())
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
    expect(assistantMessage?.toolCalls).toBeDefined();
    expect(assistantMessage?.toolCalls?.length).toBe(2);
    expect(assistantMessage?.toolCalls?.[0]?.toolName).toBe('get_weather');
    expect(assistantMessage?.toolCalls?.[0]?.result).toEqual({ temp: 18 });
    expect(assistantMessage?.toolCalls?.[1]?.toolName).toBe('convert_temp');
    expect(assistantMessage?.toolCalls?.[1]?.result).toEqual({ f: 64.4 });
  });

  describe('HITL interrupt and resume handling', () => {
    it('preserves message with status interrupted and populates prompt from interrupt.value without failedEmpty error', async () => {
      const mockThreadResponse = new Response('thread-hitl', { status: 200 });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"type":"start","thread_id":"thread-hitl"}\n'));
          controller.enqueue(
            encoder.encode(
              '{"type":"interrupt","thread_id":"thread-hitl","interrupt_id":"int-999","value":"Confirm deletion?","resumable":true}\n',
            ),
          );
          controller.close();
        },
      });

      const mockChatResponse = new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      });

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockReadyResponse())
        .mockResolvedValueOnce(mockThreadResponse)
        .mockResolvedValueOnce(mockChatResponse);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      await act(async () => {
        result.current.send('Delete database');
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const assistantMessage = result.current.messages.find((m) => m.author === 'character');

      expect(assistantMessage).toBeDefined();
      expect(assistantMessage?.status).toBe('interrupted');
      expect(assistantMessage?.interruptId).toBe('int-999');
      expect(assistantMessage?.text).toBe('Confirm deletion?');
      expect(result.current.status).toBe('idle');
      expect(result.current.notice).toBeNull();
    });

    it('resumes interrupted flow when resume is called, streaming result to completion', async () => {
      const mockThreadResponse = new Response('thread-hitl', { status: 200 });

      const encoder = new TextEncoder();
      const interruptStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"type":"start","thread_id":"thread-hitl"}\n'));
          controller.enqueue(
            encoder.encode(
              '{"type":"interrupt","thread_id":"thread-hitl","interrupt_id":"int-999","value":"Confirm deletion?","resumable":true}\n',
            ),
          );
          controller.close();
        },
      });

      const resumeStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"type":"start","thread_id":"thread-hitl"}\n'));
          controller.enqueue(
            encoder.encode(
              '{"type":"tool_result","tool_call_id":"tc-danger","content":{"deleted":true}}\n',
            ),
          );
          controller.enqueue(
            encoder.encode('{"type":"token","content":"Database deleted successfully."}\n'),
          );
          controller.enqueue(encoder.encode('{"type":"done"}\n'));
          controller.close();
        },
      });

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockReadyResponse())
        .mockResolvedValueOnce(mockThreadResponse)
        .mockResolvedValueOnce(
          new Response(interruptStream, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(resumeStream, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          }),
        );

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      await act(async () => {
        result.current.send('Delete DB');
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      let assistantMessage = result.current.messages.find((m) => m.author === 'character');
      expect(assistantMessage?.status).toBe('interrupted');
      expect(assistantMessage?.interruptId).toBe('int-999');

      await act(async () => {
        await result.current.resume('yes', 'int-999', assistantMessage?.id);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/chat/resume'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            thread_id: 'thread-hitl',
            interrupt_id: 'int-999',
            resume: 'yes',
          }),
        }),
      );

      assistantMessage = result.current.messages.find((m) => m.author === 'character');
      expect(assistantMessage?.status).toBe('completed');
      expect(assistantMessage?.text).toBe('Database deleted successfully.');
      expect(assistantMessage?.interruptId).toBeUndefined();
      expect(result.current.status).toBe('idle');
    });

    it('includes model in POST /chat/resume when original send specified a model', async () => {
      const mockThreadResponse = new Response('thread-hitl-model', { status: 200 });

      const encoder = new TextEncoder();
      const interruptStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"type":"start","thread_id":"thread-hitl-model"}\n'));
          controller.enqueue(
            encoder.encode(
              '{"type":"interrupt","thread_id":"thread-hitl-model","interrupt_id":"int-888","value":"Confirm action?","resumable":true}\n',
            ),
          );
          controller.close();
        },
      });

      const resumeStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"type":"start","thread_id":"thread-hitl-model"}\n'));
          controller.enqueue(encoder.encode('{"type":"token","content":"Action completed."}\n'));
          controller.enqueue(encoder.encode('{"type":"done"}\n'));
          controller.close();
        },
      });

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockReadyResponse())
        .mockResolvedValueOnce(mockThreadResponse)
        .mockResolvedValueOnce(
          new Response(interruptStream, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(resumeStream, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          }),
        );

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      await act(async () => {
        result.current.send('Execute risky action', 'custom-model-abc');
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const assistantMessage = result.current.messages.find((m) => m.author === 'character');
      expect(assistantMessage?.status).toBe('interrupted');
      expect(assistantMessage?.interruptId).toBe('int-888');

      await act(async () => {
        await result.current.resume('yes', 'int-888', assistantMessage?.id);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/chat/resume'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            thread_id: 'thread-hitl-model',
            interrupt_id: 'int-888',
            resume: 'yes',
            model: 'custom-model-abc',
          }),
        }),
      );
    });

    it('preserves interrupted message on resume failure allowing subsequent retry', async () => {
      const mockThreadResponse = new Response('thread-hitl', { status: 200 });

      const encoder = new TextEncoder();
      const interruptStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"type":"start","thread_id":"thread-hitl"}\n'));
          controller.enqueue(
            encoder.encode(
              '{"type":"interrupt","thread_id":"thread-hitl","interrupt_id":"int-555","value":"Authorize action?","resumable":true}\n',
            ),
          );
          controller.close();
        },
      });

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockReadyResponse())
        .mockResolvedValueOnce(mockThreadResponse)
        .mockResolvedValueOnce(
          new Response(interruptStream, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          }),
        )
        .mockResolvedValueOnce(new Response('Server Error', { status: 500 }))
        .mockResolvedValueOnce(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode('{"type":"start","thread_id":"thread-hitl"}\n'));
                controller.enqueue(encoder.encode('{"type":"token","content":"Action authorized."}\n'));
                controller.enqueue(encoder.encode('{"type":"done"}\n'));
                controller.close();
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } },
          ),
        );

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      await act(async () => {
        result.current.send('Authorize');
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      let assistantMessage = result.current.messages.find((m) => m.author === 'character');
      expect(assistantMessage?.status).toBe('interrupted');

      await act(async () => {
        await expect(result.current.resume('yes', 'int-555', assistantMessage?.id)).rejects.toThrow();
      });

      assistantMessage = result.current.messages.find((m) => m.author === 'character');
      expect(assistantMessage).toBeDefined();
      expect(assistantMessage?.status).toBe('interrupted');
      expect(assistantMessage?.text).toBe('Authorize action?');
      expect(result.current.status).toBe('idle');

      await act(async () => {
        await result.current.resume('yes', 'int-555', assistantMessage?.id);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      assistantMessage = result.current.messages.find((m) => m.author === 'character');
      expect(assistantMessage?.status).toBe('completed');
      expect(assistantMessage?.text).toBe('Action authorized.');
    });
  });

  describe('sessionStorage persistence (FR-024, FR-040, C1)', () => {
    beforeEach(() => {
      sessionStorage.clear();
    });

    afterEach(() => {
      sessionStorage.clear();
    });

    it('initializes from sessionStorage on mount, checks readiness, and skips createThread', async () => {
      const savedMessages = [
        { id: 'visitor-1', author: 'visitor', text: 'Hello', status: 'completed' },
        { id: 'character-2', author: 'character', text: 'Hi there!', status: 'completed' },
      ];
      sessionStorage.setItem('chat_thread_id', 'existing-thread-uuid');
      sessionStorage.setItem('chat_messages', JSON.stringify(savedMessages));

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockReadyResponse());

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.threadId).toBe('existing-thread-uuid');
      expect(result.current.status).toBe('idle');
      expect(result.current.isBackendReady).toBe(true);
      expect(result.current.messages).toEqual(savedMessages);

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/health/ready'),
        expect.anything(),
      );
    });

    it('creates new thread and stores it in sessionStorage when absent after readiness', async () => {
      const mockThreadResponse = new Response('new-thread-uuid', { status: 200 });
      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockReadyResponse())
        .mockResolvedValueOnce(mockThreadResponse);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.threadId).toBe('new-thread-uuid');
      expect(result.current.status).toBe('idle');
      expect(result.current.isBackendReady).toBe(true);
      expect(sessionStorage.getItem('chat_thread_id')).toBe('new-thread-uuid');
    });

    it('sanitizes in-flight streaming messages to interrupted when restored from sessionStorage', async () => {
      const savedMessages = [
        { id: 'visitor-1', author: 'visitor', text: 'Tell me a story', status: 'completed' },
        { id: 'character-2', author: 'character', text: 'Once upon a time...', status: 'streaming' },
      ];
      sessionStorage.setItem('chat_thread_id', 'interrupted-thread');
      sessionStorage.setItem('chat_messages', JSON.stringify(savedMessages));

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockReadyResponse());

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

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockReadyResponse())
        .mockResolvedValueOnce(
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

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

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

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockReadyResponse())
        .mockResolvedValueOnce(
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

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.messages[0]?.id).toBe('visitor-1');

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

  describe('stop generation (API-003, US6)', () => {
    it('aborts active streaming response, marks message as cancelled, and sends POST /chat/stop', async () => {
      const mockThreadResponse = new Response('thread-123', { status: 200 });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"type":"start","thread_id":"thread-123"}\n'));
          controller.enqueue(encoder.encode('{"type":"token","content":"Generating response..."}\n'));
        },
      });

      const mockChatResponse = new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      });

      const mockStopResponse = new Response('{}', { status: 200 });

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockReadyResponse())
        .mockResolvedValueOnce(mockThreadResponse)
        .mockResolvedValueOnce(mockChatResponse)
        .mockResolvedValueOnce(mockStopResponse);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      await act(async () => {
        result.current.send('Tell me a long story');
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.status).toBe('streaming');

      await act(async () => {
        await result.current.stop();
      });

      expect(result.current.status).toBe('idle');
      expect(result.current.inFlight).toBe(false);

      const assistantMessage = result.current.messages.find((m) => m.author === 'character');
      expect(assistantMessage).toBeTruthy();
      expect(assistantMessage?.status).toBe('cancelled');

      expect(globalThis.fetch).toHaveBeenCalledWith('http://127.0.0.1:8000/chat/stop', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          thread_id: 'thread-123',
          run_id: null,
        }),
      });
    });

    it('sends user_input, current thread_id, and model to POST /chat payload', async () => {
      const mockThreadResponse = new Response('thread-xyz-456', { status: 200 });
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('{"type":"start","thread_id":"thread-xyz-456"}\n'));
          controller.enqueue(encoder.encode('{"type":"token","content":"Hi"}\n'));
          controller.enqueue(encoder.encode('{"type":"done"}\n'));
          controller.close();
        },
      });
      const mockChatResponse = new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      });

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockReadyResponse())
        .mockResolvedValueOnce(mockThreadResponse)
        .mockResolvedValueOnce(mockChatResponse);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      await act(async () => {
        result.current.send('Hello model!', 'model-custom-123');
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(globalThis.fetch).toHaveBeenCalledWith('http://127.0.0.1:8000/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/x-ndjson',
        },
        body: JSON.stringify({
          thread_id: 'thread-xyz-456',
          user_input: 'Hello model!',
          model: 'model-custom-123',
        }),
        signal: expect.any(AbortSignal),
      });
    });

    it('removes empty failed response when stream fails with no tokens and prevents it from rendering when second message is sent', async () => {
      const mockThreadResponse = new Response('thread-stall-test', { status: 200 });
      const encoder = new TextEncoder();

      const stallStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"type":"start","thread_id":"thread-stall-test"}\n'));
          controller.close();
        },
      });

      const secondStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"type":"start","thread_id":"thread-stall-test"}\n'));
          controller.enqueue(encoder.encode('{"type":"token","content":"Supervised learning uses labeled data."}\n'));
          controller.enqueue(encoder.encode('{"type":"done"}\n'));
          controller.close();
        },
      });

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockReadyResponse())
        .mockResolvedValueOnce(mockThreadResponse)
        .mockResolvedValueOnce(
          new Response(stallStream, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(secondStream, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          }),
        );

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      await act(async () => {
        result.current.send('First question');
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      expect(result.current.status).toBe('error');
      const messagesAfterFirst = result.current.messages;
      expect(messagesAfterFirst.filter((m) => m.author === 'character')).toHaveLength(0);

      await act(async () => {
        result.current.send('Second question');
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const finalMessages = result.current.messages;
      const characterMessages = finalMessages.filter((m) => m.author === 'character');
      expect(characterMessages).toHaveLength(1);
      expect(characterMessages[0]?.text).toBe('Supervised learning uses labeled data.');
      expect(characterMessages[0]?.status).toBe('completed');
    });
  });

  describe('loadHistory and retryHistory (US8, API-007)', () => {
    it('fetches history, populates messages and threadId, and manages isHistoryLoading state', async () => {
      const mockThreadResponse = new Response('init-thread', { status: 200 });
      const mockHistoryData = [
        {
          id: 'h-1',
          author: 'visitor',
          text: 'What is deep learning?',
          status: 'completed',
          createdAt: '2026-10-08T09:00:00Z',
        },
        {
          id: 'h-2',
          author: 'character',
          text: 'Deep learning is a subset of machine learning.',
          status: 'completed',
          toolCalls: '[{"id":"t-1","tool":"search","status":"completed","args":{"q":"deep learning"}}]',
          createdAt: '2026-10-08T09:00:01Z',
        },
      ];

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockReadyResponse())
        .mockResolvedValueOnce(mockThreadResponse)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockHistoryData,
        });

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.threadId).toBe('init-thread');

      await act(async () => {
        await result.current.loadHistory?.('history-thread-456');
      });

      expect(result.current.isHistoryLoading).toBe(false);
      expect(result.current.threadId).toBe('history-thread-456');
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0]?.text).toBe('What is deep learning?');
      expect(result.current.messages[1]?.text).toBe('Deep learning is a subset of machine learning.');
      expect(sessionStorage.getItem('chat_thread_id')).toBe('history-thread-456');
    });

    it('handles history fetch failure and allows retryHistory to recover', async () => {
      const mockThreadResponse = new Response('init-thread', { status: 200 });

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockReadyResponse())
        .mockResolvedValueOnce(mockThreadResponse)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      await act(async () => {
        await result.current.loadHistory?.('fail-thread');
      });

      expect(result.current.isHistoryLoading).toBe(false);
      expect(result.current.historyError).toBe('History request failed with status 500');

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'recovered-1',
            author: 'visitor',
            text: 'Hello again',
            status: 'completed',
          },
        ],
      });

      await act(async () => {
        await result.current.retryHistory?.();
      });

      expect(result.current.isHistoryLoading).toBe(false);
      expect(result.current.historyError).toBeNull();
      expect(result.current.threadId).toBe('fail-thread');
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0]?.text).toBe('Hello again');
    });
  });

  describe('two-phase startup orchestration (T039, FR-017, FR-040, FR-041, FR-042)', () => {
    it('initializes in connecting state with isBackendReady=false before readiness check succeeds', () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useConversation());

      expect(result.current.status).toBe('connecting');
      expect(result.current.isBackendReady).toBe(false);
      expect(result.current.threadId).toBeNull();
    });

    it('gates createThread until GET /health/ready returns 200 OK', async () => {
      let resolveHealth!: (res: Response) => void;
      const healthPromise = new Promise<Response>((resolve) => {
        resolveHealth = resolve;
      });

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => healthPromise)
        .mockResolvedValueOnce(new Response('created-thread-99', { status: 200 }));

      const { result } = renderHook(() => useConversation());

      expect(result.current.status).toBe('connecting');
      expect(result.current.isBackendReady).toBe(false);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/health/ready'),
        expect.anything(),
      );

      // Now resolve readiness
      await act(async () => {
        resolveHealth(mockReadyResponse());
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.isBackendReady).toBe(true);
      expect(result.current.threadId).toBe('created-thread-99');
      expect(result.current.status).toBe('idle');
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(globalThis.fetch).toHaveBeenLastCalledWith(
        expect.stringContaining('/threads'),
        expect.anything(),
      );
    });

    it('sets status=error with generic notice (no status codes) on permanent 4xx or readiness timeout', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        new Response('Not Found', { status: 404 }),
      );

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.isBackendReady).toBe(false);
      expect(result.current.status).toBe('error');
      expect(result.current.notice).toBe(copy.backendUnavailable);
      expect(result.current.notice).not.toContain('404');
    });

    it('sets status=error with generic notice when POST /threads fails after readiness', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockReadyResponse())
        .mockResolvedValueOnce(new Response('Internal Error', { status: 500 }));

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.isBackendReady).toBe(false);
      expect(result.current.status).toBe('error');
      expect(result.current.notice).toBe(copy.backendUnavailable);
    });

    it('retryStartup restarts the sequence from GET /health/ready cleanly', async () => {
      let resolveRetryHealth!: (res: Response) => void;
      const retryHealthPromise = new Promise<Response>((resolve) => {
        resolveRetryHealth = resolve;
      });

      // First attempt fails on readiness
      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
        // Retry attempt waits on readiness, then creates thread
        .mockImplementationOnce(() => retryHealthPromise)
        .mockResolvedValueOnce(new Response('retry-thread-uuid', { status: 200 }));

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.status).toBe('error');
      expect(result.current.isBackendReady).toBe(false);

      // Trigger retryStartup
      await act(async () => {
        result.current.retryStartup();
      });

      expect(result.current.status).toBe('connecting');
      expect(result.current.isBackendReady).toBe(false);

      await act(async () => {
        resolveRetryHealth(mockReadyResponse());
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.isBackendReady).toBe(true);
      expect(result.current.status).toBe('idle');
      expect(result.current.threadId).toBe('retry-thread-uuid');
    });
  });

  describe('New Chat and Conversation History Dispatches', () => {
    it('dispatches chat:new-conversation when first message is sent in initial thread', async () => {
      const mockThreadResponse = new Response('thread-initial-1', { status: 200 });
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"type":"start","thread_id":"thread-initial-1"}\n'));
          controller.enqueue(encoder.encode('{"type":"token","content":"Hello!"}\n'));
          controller.enqueue(encoder.encode('{"type":"done"}\n'));
          controller.close();
        },
      });
      const mockChatResponse = new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      });

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockReadyResponse())
        .mockResolvedValueOnce(mockThreadResponse)
        .mockResolvedValueOnce(mockChatResponse);

      const eventListener = vi.fn();
      window.addEventListener('chat:new-conversation', eventListener);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.threadId).toBe('thread-initial-1');

      await act(async () => {
        result.current.send('Hello REM!');
      });

      expect(eventListener).toHaveBeenCalledTimes(1);
      const detail = (eventListener.mock.calls[0]![0] as CustomEvent).detail;
      expect(detail.threadId).toBe('thread-initial-1');
      expect(detail.title).toBe('Hello REM!');

      window.removeEventListener('chat:new-conversation', eventListener);
    });

    it('dispatches chat:new-conversation on startNewChat when active conversation has messages', async () => {
      const mockThreadResponse = new Response('thread-initial-1', { status: 200 });
      const mockNewThreadResponse = new Response('thread-new-2', { status: 200 });
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"type":"start","thread_id":"thread-initial-1"}\n'));
          controller.enqueue(encoder.encode('{"type":"token","content":"Hello!"}\n'));
          controller.enqueue(encoder.encode('{"type":"done"}\n'));
          controller.close();
        },
      });
      const mockChatResponse = new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      });

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockReadyResponse())
        .mockResolvedValueOnce(mockThreadResponse)
        .mockResolvedValueOnce(mockChatResponse)
        .mockResolvedValueOnce(mockNewThreadResponse);

      const eventListener = vi.fn();
      window.addEventListener('chat:new-conversation', eventListener);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      await act(async () => {
        result.current.send('Hello REM!');
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Clear calls from initial send
      eventListener.mockClear();

      // Call startNewChat
      await act(async () => {
        await result.current.startNewChat?.();
      });

      // It should dispatch chat:new-conversation to ensure thread-initial-1 is updated
      expect(eventListener).toHaveBeenCalledTimes(1);
      const detail = (eventListener.mock.calls[0]![0] as CustomEvent).detail;
      expect(detail.threadId).toBe('thread-initial-1');
      expect(detail.title).toBe('Hello REM!');

      // Thread ID transitions to thread-new-2
      expect(result.current.threadId).toBe('thread-new-2');
      expect(result.current.messages).toHaveLength(0);

      window.removeEventListener('chat:new-conversation', eventListener);
    });

    it('does not dispatch chat:new-conversation on startNewChat when active conversation is empty', async () => {
      const mockThreadResponse = new Response('thread-initial-1', { status: 200 });
      const mockNewThreadResponse = new Response('thread-new-2', { status: 200 });

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockReadyResponse())
        .mockResolvedValueOnce(mockThreadResponse)
        .mockResolvedValueOnce(mockNewThreadResponse);

      const eventListener = vi.fn();
      window.addEventListener('chat:new-conversation', eventListener);

      const { result } = renderHook(() => useConversation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // No message sent yet, call startNewChat directly
      await act(async () => {
        await result.current.startNewChat?.();
      });

      expect(eventListener).not.toHaveBeenCalled();
      expect(result.current.threadId).toBe('thread-new-2');

      window.removeEventListener('chat:new-conversation', eventListener);
    });
  });
});
