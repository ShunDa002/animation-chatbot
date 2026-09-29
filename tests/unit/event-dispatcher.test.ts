import { describe, expect, it, vi } from 'vitest';
import { createEventDispatcher } from '@/lib/conversation/event-dispatcher';
import type { StreamEventHandlers } from '@/lib/conversation/stream-types';

function createMockHandlers(overrides: Partial<StreamEventHandlers> = {}): StreamEventHandlers {
  return {
    onStart: vi.fn(),
    onToken: vi.fn(),
    onToolCallDelta: vi.fn(),
    onToolResult: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    onHeartbeat: vi.fn(),
    onUnknown: vi.fn(),
    ...overrides,
  };
}

describe('Event dispatcher', () => {
  it('dispatches all 7 event types to their matching handlers', () => {
    const handlers = createMockHandlers();
    const dispatcher = createEventDispatcher(handlers);

    dispatcher.dispatch({ type: 'start', thread_id: 'th-123' });
    expect(handlers.onStart).toHaveBeenCalledWith({ type: 'start', thread_id: 'th-123' });

    dispatcher.dispatch({ type: 'token', content: 'hello', node: 'agent' });
    expect(handlers.onToken).toHaveBeenCalledWith({ type: 'token', content: 'hello', node: 'agent' });

    dispatcher.dispatch({ type: 'tool_call_delta', args_delta: '{"q":' });
    expect(handlers.onToolCallDelta).toHaveBeenCalledWith({ type: 'tool_call_delta', args_delta: '{"q":' });

    dispatcher.dispatch({ type: 'tool_result', content: 'ok', tool_call_id: 'call_1' });
    expect(handlers.onToolResult).toHaveBeenCalledWith({ type: 'tool_result', content: 'ok', tool_call_id: 'call_1' });

    dispatcher.dispatch({ type: 'heartbeat' });
    expect(handlers.onHeartbeat).toHaveBeenCalled();

    dispatcher.dispatch({ type: 'done' });
    expect(handlers.onDone).toHaveBeenCalled();
  });

  it('dispatches error event to onError', () => {
    const handlers = createMockHandlers();
    const dispatcher = createEventDispatcher(handlers);

    dispatcher.dispatch({ type: 'error', message: 'backend failure' });
    expect(handlers.onError).toHaveBeenCalledWith({ type: 'error', message: 'backend failure' });
  });

  it('routes unknown event types to onUnknown and continues processing', () => {
    const handlers = createMockHandlers();
    const dispatcher = createEventDispatcher(handlers);

    dispatcher.dispatch({ type: 'custom_extension', payload: 42 });
    expect(handlers.onUnknown).toHaveBeenCalledWith({ type: 'custom_extension', payload: 42 });

    // Stream remains active
    dispatcher.dispatch({ type: 'token', content: 'still working' });
    expect(handlers.onToken).toHaveBeenCalledWith({ type: 'token', content: 'still working' });
  });

  it('skips non-object inputs with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handlers = createMockHandlers();
    const dispatcher = createEventDispatcher(handlers);

    dispatcher.dispatch(null);
    dispatcher.dispatch('a string');
    dispatcher.dispatch(123);
    dispatcher.dispatch([1, 2, 3]);

    expect(warnSpy).toHaveBeenCalledTimes(4);
    expect(handlers.onStart).not.toHaveBeenCalled();
    expect(handlers.onUnknown).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('skips objects with missing or non-string type field with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handlers = createMockHandlers();
    const dispatcher = createEventDispatcher(handlers);

    dispatcher.dispatch({});
    dispatcher.dispatch({ type: 123 });
    dispatcher.dispatch({ type: null });

    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(handlers.onUnknown).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('skips start event with missing or non-string thread_id with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handlers = createMockHandlers();
    const dispatcher = createEventDispatcher(handlers);

    dispatcher.dispatch({ type: 'start' });
    dispatcher.dispatch({ type: 'start', thread_id: 123 });

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(handlers.onStart).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('skips token event with missing or non-string content with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handlers = createMockHandlers();
    const dispatcher = createEventDispatcher(handlers);

    dispatcher.dispatch({ type: 'token' });
    dispatcher.dispatch({ type: 'token', content: null });
    dispatcher.dispatch({ type: 'token', content: 42 });

    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(handlers.onToken).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('skips tool_call_delta with missing or non-string args_delta with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handlers = createMockHandlers();
    const dispatcher = createEventDispatcher(handlers);

    dispatcher.dispatch({ type: 'tool_call_delta' });
    dispatcher.dispatch({ type: 'tool_call_delta', args_delta: 123 });

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(handlers.onToolCallDelta).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('skips tool_result with missing content with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handlers = createMockHandlers();
    const dispatcher = createEventDispatcher(handlers);

    dispatcher.dispatch({ type: 'tool_result' });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(handlers.onToolResult).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('skips error event with missing or non-string message with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handlers = createMockHandlers();
    const dispatcher = createEventDispatcher(handlers);

    dispatcher.dispatch({ type: 'error' });
    dispatcher.dispatch({ type: 'error', message: 500 });

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(handlers.onError).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('ignores subsequent events after done event', () => {
    const handlers = createMockHandlers();
    const dispatcher = createEventDispatcher(handlers);

    dispatcher.dispatch({ type: 'done' });
    expect(handlers.onDone).toHaveBeenCalledTimes(1);

    dispatcher.dispatch({ type: 'token', content: 'late token' });
    dispatcher.dispatch({ type: 'heartbeat' });
    dispatcher.dispatch({ type: 'done' });

    expect(handlers.onToken).not.toHaveBeenCalled();
    expect(handlers.onHeartbeat).not.toHaveBeenCalled();
    expect(handlers.onDone).toHaveBeenCalledTimes(1);
  });

  it('ignores subsequent events after error event', () => {
    const handlers = createMockHandlers();
    const dispatcher = createEventDispatcher(handlers);

    dispatcher.dispatch({ type: 'error', message: 'fail' });
    expect(handlers.onError).toHaveBeenCalledTimes(1);

    dispatcher.dispatch({ type: 'token', content: 'late token' });
    dispatcher.dispatch({ type: 'done' });

    expect(handlers.onToken).not.toHaveBeenCalled();
    expect(handlers.onDone).not.toHaveBeenCalled();
  });

  it('catches and logs handler exceptions without crashing or terminating stream', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handlers = createMockHandlers({
      onToken: vi.fn().mockImplementation(() => {
        throw new Error('Handler crash');
      }),
    });
    const dispatcher = createEventDispatcher(handlers);

    expect(() => {
      dispatcher.dispatch({ type: 'token', content: 'boom' });
    }).not.toThrow();

    expect(errorSpy).toHaveBeenCalled();

    // Subsequent events continue
    dispatcher.dispatch({ type: 'heartbeat' });
    expect(handlers.onHeartbeat).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
