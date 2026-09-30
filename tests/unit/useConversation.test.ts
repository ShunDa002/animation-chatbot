import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConversation } from '@/lib/conversation/useConversation';

describe('useConversation with Tool Calls', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
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
});
