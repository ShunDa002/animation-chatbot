import { describe, expect, it, vi } from 'vitest';
import { createStreamController } from '@/lib/conversation/stream-controller';
import { NEUTRAL } from '@/lib/emotion';

const encoder = new TextEncoder();

describe('StreamController - User Story 1 (Core streaming path)', () => {
  it('processes start, tokens, and done events end-to-end', () => {
    const onStatus = vi.fn();
    const onText = vi.fn();
    const onComplete = vi.fn();

    const controller = createStreamController({
      onStatus,
      onText,
      onComplete,
    });

    const chunk1 = encoder.encode('{"type":"start","thread_id":"th-1"}\n{"type":"token","content":"Hello "}\n');
    controller.processChunk(chunk1);

    expect(onStatus).toHaveBeenCalledWith('streaming', expect.any(String));
    expect(onText).toHaveBeenCalledWith('Hello', expect.any(String));

    const chunk2 = encoder.encode('{"type":"token","content":"world! [emotion:happy]"}\n{"type":"done"}\n');
    controller.processChunk(chunk2);

    expect(onText).toHaveBeenLastCalledWith('Hello world!', expect.any(String));
    expect(onComplete).toHaveBeenCalledTimes(1);
    const [finalText, emotion, metrics] = onComplete.mock.calls[0]!;

    expect(finalText).toBe('Hello world!');
    expect(emotion).toBe('happy');
    expect(metrics.outcome).toBe('completed');
    expect(typeof metrics.firstTokenTime).toBe('number');
    expect(metrics.firstTokenTime).toBeGreaterThanOrEqual(metrics.sendTime);
    expect(metrics.timeToFirstToken).toBeGreaterThanOrEqual(0);
    expect(metrics.totalDuration).toBeGreaterThanOrEqual(0);
    expect(metrics.eventCounts.start).toBe(1);
    expect(metrics.eventCounts.token).toBe(2);
    expect(metrics.eventCounts.done).toBe(1);
  });

  it('handles token events arriving without a preceding start event by transitioning to streaming and warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onStatus = vi.fn();
    const onText = vi.fn();
    const onComplete = vi.fn();

    const controller = createStreamController({
      onStatus,
      onText,
      onComplete,
    });

    controller.processChunk(encoder.encode('{"type":"token","content":"surprise token"}\n{"type":"done"}\n'));

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('token event received before start'));
    expect(onStatus).toHaveBeenCalledWith('streaming', expect.any(String));
    expect(onText).toHaveBeenCalledWith('surprise token', expect.any(String));
    expect(onComplete).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it('finalizes an empty message when done arrives with no preceding tokens', () => {
    const onStatus = vi.fn();
    const onText = vi.fn();
    const onComplete = vi.fn();

    const controller = createStreamController({
      onStatus,
      onText,
      onComplete,
    });

    controller.processChunk(encoder.encode('{"type":"start","thread_id":"th-1"}\n{"type":"done"}\n'));

    expect(onStatus).toHaveBeenCalledWith('streaming', expect.any(String));
    expect(onText).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith('', NEUTRAL, expect.objectContaining({ outcome: 'completed' }), expect.any(String));
  });

  it('handles multibyte UTF-8 characters split across chunk boundaries (US2)', () => {
    const onText = vi.fn();
    const onComplete = vi.fn();
    const controller = createStreamController({ onText, onComplete });

    // 'あ' is encoded as 3 bytes: 0xE3, 0x81, 0x82
    const fullJson = '{"type":"token","content":"あ"}\n{"type":"done"}\n';
    const allBytes = encoder.encode(fullJson);

    // Find the index of byte 0xE3
    const splitIndex = allBytes.indexOf(0xe3) + 1; // Split right after the first byte of 'あ'

    const chunk1 = allBytes.slice(0, splitIndex);
    const chunk2 = allBytes.slice(splitIndex);

    controller.processChunk(chunk1);
    expect(onText).not.toHaveBeenCalled();

    controller.processChunk(chunk2);
    expect(onText).toHaveBeenCalledWith('あ', expect.any(String));
    expect(onComplete).toHaveBeenCalledWith('あ', NEUTRAL, expect.any(Object), expect.any(String));
  });

  describe('User Story 3 - Error event handling and partial preservation', () => {
    it('preserves partial content and invokes onError when error event arrives', () => {
      const onText = vi.fn();
      const onError = vi.fn();
      const onComplete = vi.fn();

      const controller = createStreamController({ onText, onError, onComplete });

      controller.processChunk(
        encoder.encode('{"type":"start","thread_id":"t1"}\n{"type":"token","content":"Partial answer before "}\n'),
      );
      expect(onText).toHaveBeenCalledWith('Partial answer before', expect.any(String));

      controller.processChunk(
        encoder.encode('{"type":"error","message":"Model generation limit exceeded"}\n{"type":"token","content":"ignored"}\n{"type":"done"}\n'),
      );

      expect(onError).toHaveBeenCalledTimes(1);
      const [message, partialText, emotion, metrics, reqId] = onError.mock.calls[0]!;

      expect(message).toBe('Model generation limit exceeded');
      expect(partialText).toBe('Partial answer before');
      expect(emotion).toBe(NEUTRAL);
      expect(metrics.outcome).toBe('error');
      expect(metrics.eventCounts.error).toBe(1);
      expect(reqId).toEqual(expect.any(String));

      // No onComplete, and subsequent events ignored
      expect(onComplete).not.toHaveBeenCalled();
      expect(onText).toHaveBeenCalledTimes(1);
    });

    it('invokes onError with empty partial text when error arrives with no preceding tokens', () => {
      const onText = vi.fn();
      const onError = vi.fn();

      const controller = createStreamController({ onText, onError });

      controller.processChunk(
        encoder.encode('{"type":"start","thread_id":"t1"}\n{"type":"error","message":"Immediate failure"}\n'),
      );

      expect(onText).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(
        'Immediate failure',
        '',
        NEUTRAL,
        expect.objectContaining({ outcome: 'error' }),
        expect.any(String),
      );
    });
  });

  describe('User Story 4 - Stream interruption detection', () => {
    it('invokes onInterrupted with partial text when stream ends without terminal event', () => {
      const onText = vi.fn();
      const onInterrupted = vi.fn();
      const onComplete = vi.fn();

      const controller = createStreamController({ onText, onInterrupted, onComplete });

      controller.processChunk(
        encoder.encode('{"type":"start","thread_id":"t1"}\n{"type":"token","content":"Midway through replying "}\n'),
      );
      expect(onText).toHaveBeenCalledWith('Midway through replying', expect.any(String));

      // Stream closes abruptly without done or error
      controller.end();

      expect(onInterrupted).toHaveBeenCalledTimes(1);
      const [partialText, emotion, metrics, reqId] = onInterrupted.mock.calls[0]!;

      expect(partialText).toBe('Midway through replying');
      expect(emotion).toBe(NEUTRAL);
      expect(metrics.outcome).toBe('interrupted');
      expect(metrics.eventCounts.token).toBe(1);
      expect(reqId).toEqual(expect.any(String));

      expect(onComplete).not.toHaveBeenCalled();
    });

    it('invokes onInterrupted with empty text when stream ends with no tokens received', () => {
      const onInterrupted = vi.fn();
      const controller = createStreamController({ onInterrupted });

      controller.processChunk(encoder.encode('{"type":"start","thread_id":"t1"}\n'));
      controller.end();

      expect(onInterrupted).toHaveBeenCalledWith(
        '',
        NEUTRAL,
        expect.objectContaining({ outcome: 'interrupted' }),
        expect.any(String),
      );
    });
  });

  describe('User Story 5 - Tool-call lifecycle', () => {
    it('accumulates tool deltas with sticky fields, validates JSON, and correlates result by tool_call_id', () => {
      const onToolUpdate = vi.fn();
      const controller = createStreamController({ onToolUpdate });

      // First delta has tool_name and tool_call_id
      controller.processChunk(
        encoder.encode(
          '{"type":"tool_call_delta","tool_name":"get_weather","tool_call_id":"call_123","tool_call_index":0,"args_delta":"{\\"city\\":"}\n',
        ),
      );

      expect(onToolUpdate).toHaveBeenCalledTimes(1);
      let tools = onToolUpdate.mock.calls[0]![0];
      expect(tools).toHaveLength(1);
      expect(tools[0].id).toBe('call_123');
      expect(tools[0].toolName).toBe('get_weather');
      expect(tools[0].status).toBe('generating_args');
      expect(tools[0].argsAccumulator).toBe('{"city":');
      expect(tools[0].parsedArgs).toBeNull();

      // Second delta has null tool_name and null tool_call_id (sticky)
      controller.processChunk(
        encoder.encode(
          '{"type":"tool_call_delta","tool_name":null,"tool_call_id":null,"tool_call_index":0,"args_delta":"\\"Tokyo\\"}"}\n',
        ),
      );

      expect(onToolUpdate).toHaveBeenCalledTimes(2);
      tools = onToolUpdate.mock.calls[1]![0];
      expect(tools).toHaveLength(1);
      expect(tools[0].toolName).toBe('get_weather');
      expect(tools[0].toolCallId).toBe('call_123');
      expect(tools[0].argsAccumulator).toBe('{"city":"Tokyo"}');
      expect(tools[0].parsedArgs).toEqual({ city: 'Tokyo' });

      // Tool result arrives
      controller.processChunk(
        encoder.encode(
          '{"type":"tool_result","tool_call_id":"call_123","content":{"temp":22},"status":"success"}\n',
        ),
      );

      expect(onToolUpdate).toHaveBeenCalledTimes(3);
      tools = onToolUpdate.mock.calls[2]![0];
      expect(tools[0].status).toBe('completed');
      expect(tools[0].result).toEqual({ temp: 22 });
      expect(tools[0].endTime).toBeGreaterThanOrEqual(tools[0].startTime);
    });

    it('tracks parallel tool calls with different indexes independently and supports re-keying', () => {
      const onToolUpdate = vi.fn();
      const controller = createStreamController({ onToolUpdate });

      // Tool 0 arrives with temp index key first (tool_call_id is null)
      controller.processChunk(
        encoder.encode(
          '{"type":"tool_call_delta","tool_name":null,"tool_call_id":null,"tool_call_index":0,"args_delta":"{\\"a\\":1"}\n',
        ),
      );

      // Tool 1 arrives with its own index
      controller.processChunk(
        encoder.encode(
          '{"type":"tool_call_delta","tool_name":"search","tool_call_id":"call_search_1","tool_call_index":1,"args_delta":"{\\"q\\":\\"react\\"}"}\n',
        ),
      );

      let tools = onToolUpdate.mock.calls[1]![0];
      expect(tools).toHaveLength(2);
      expect(tools.some((t: any) => t.toolCallIndex === 0 && t.status === 'preparing')).toBe(true);
      expect(tools.some((t: any) => t.toolCallIndex === 1 && t.toolName === 'search')).toBe(true);

      // Later delta for Tool 0 provides the actual tool_call_id and tool_name (re-keying)
      controller.processChunk(
        encoder.encode(
          '{"type":"tool_call_delta","tool_name":"calc","tool_call_id":"call_calc_0","tool_call_index":0,"args_delta":"}"}\n',
        ),
      );

      tools = onToolUpdate.mock.calls[2]![0];
      expect(tools).toHaveLength(2);
      const rekeyed = tools.find((t: any) => t.toolCallId === 'call_calc_0');
      expect(rekeyed).toBeDefined();
      expect(rekeyed.id).toBe('call_calc_0');
      expect(rekeyed.toolName).toBe('calc');
      expect(rekeyed.argsAccumulator).toBe('{"a":1}');
      expect(rekeyed.parsedArgs).toEqual({ a: 1 });
    });

    it('warns on unmatched tool_result and creates unmatched record', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const onToolUpdate = vi.fn();
      const controller = createStreamController({ onToolUpdate });

      controller.processChunk(
        encoder.encode('{"type":"tool_result","tool_call_id":"unknown_id","content":"done"}\n'),
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('unmatched tool_result'),
        expect.any(Object),
      );
      const tools = onToolUpdate.mock.calls[0]![0];
      expect(tools).toHaveLength(1);
      expect(tools[0].toolCallId).toBe('unknown_id');
      expect(tools[0].status).toBe('completed');

      warnSpy.mockRestore();
    });
  });

  describe('User Story 6 - Event-type dispatch and forward compatibility', () => {
    it('logs unknown event types at debug level and continues streaming surrounding events', () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const onText = vi.fn();
      const onComplete = vi.fn();

      const controller = createStreamController({ onText, onComplete });

      controller.processChunk(
        encoder.encode(
          '{"type":"start","thread_id":"t1"}\n{"type":"future_experimental_feature","foo":"bar"}\n{"type":"token","content":"Continues unaffected"}\n{"type":"done"}\n',
        ),
      );

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('unknown event received'),
        expect.objectContaining({ type: 'future_experimental_feature' }),
      );
      expect(onText).toHaveBeenCalledWith('Continues unaffected', expect.any(String));
      expect(onComplete).toHaveBeenCalledTimes(1);

      debugSpy.mockRestore();
    });
  });

  describe('User Story 7 - Stale-event and concurrency protection', () => {
    it('sets terminated flag on cancel(), emits onCancelled with partial text, and ignores subsequent chunks', () => {
      const onText = vi.fn();
      const onCancelled = vi.fn();
      const onComplete = vi.fn();

      const controller = createStreamController({
        requestId: 'req-alpha',
        onText,
        onCancelled,
        onComplete,
      });

      controller.processChunk(
        encoder.encode('{"type":"start","thread_id":"t1"}\n{"type":"token","content":"First partial text "}\n'),
      );
      expect(onText).toHaveBeenCalledWith('First partial text', 'req-alpha');

      // User or system aborts
      controller.cancel();

      expect(onCancelled).toHaveBeenCalledTimes(1);
      const [partialText, emotion, metrics, reqId] = onCancelled.mock.calls[0]!;
      expect(partialText).toBe('First partial text');
      expect(emotion).toBe(NEUTRAL);
      expect(metrics.outcome).toBe('cancelled');
      expect(reqId).toBe('req-alpha');

      // Subsequent processChunk calls must be no-ops
      controller.processChunk(
        encoder.encode('{"type":"token","content":"late token that should be dropped"}\n{"type":"done"}\n'),
      );

      expect(onText).toHaveBeenCalledTimes(1);
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  describe('User Story 8 - Heartbeat and inactivity timeout', () => {
    it('triggers stall timeout after configured interval of silence', () => {
      vi.useFakeTimers();
      const onCancelled = vi.fn();

      const controller = createStreamController({
        stallTimeoutMs: 5000,
        onCancelled,
      });

      controller.processChunk(
        encoder.encode('{"type":"start","thread_id":"t1"}\n{"type":"token","content":"Start of reply "}\n'),
      );

      // Advance by 4999ms - stall timer should not have fired yet
      vi.advanceTimersByTime(4999);
      expect(onCancelled).not.toHaveBeenCalled();

      // Advance past 5000ms
      vi.advanceTimersByTime(2);
      expect(onCancelled).toHaveBeenCalledTimes(1);
      const [partialText, emotion, metrics] = onCancelled.mock.calls[0]!;
      expect(partialText).toBe('Start of reply');
      expect(emotion).toBe(NEUTRAL);
      expect(metrics.outcome).toBe('stalled');

      vi.useRealTimers();
    });

    it('heartbeat events reset the stall timer and keep the stream alive', () => {
      vi.useFakeTimers();
      const onCancelled = vi.fn();
      const onComplete = vi.fn();

      const controller = createStreamController({
        stallTimeoutMs: 5000,
        onCancelled,
        onComplete,
      });

      controller.processChunk(
        encoder.encode('{"type":"start","thread_id":"t1"}\n{"type":"token","content":"Working "}\n'),
      );

      // Advance by 4000ms
      vi.advanceTimersByTime(4000);
      expect(onCancelled).not.toHaveBeenCalled();

      // Heartbeat arrives before 5000ms
      controller.processChunk(encoder.encode('{"type":"heartbeat"}\n'));

      // Advance another 4000ms (total 8000ms since start, but only 4000ms since heartbeat)
      vi.advanceTimersByTime(4000);
      expect(onCancelled).not.toHaveBeenCalled();

      // Now complete
      controller.processChunk(encoder.encode('{"type":"done"}\n'));
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onCancelled).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('StreamMetrics collection (T031, T032)', () => {
    it('populates all metrics fields for completed outcome', () => {
      const onComplete = vi.fn();
      const onMetrics = vi.fn();

      const controller = createStreamController({ onComplete, onMetrics });

      controller.processChunk(
        encoder.encode(
          '{"type":"start","thread_id":"t1"}\n{"type":"tool_call_delta","tool_name":"calc","tool_call_id":"c1","args_delta":"{}"}\n{"type":"tool_result","tool_call_id":"c1","content":42}\n{"type":"token","content":"Done"}\n{"type":"done"}\n',
        ),
      );

      expect(onComplete).toHaveBeenCalledTimes(1);
      const metrics: any = onComplete.mock.calls[0]![2];

      expect(metrics.outcome).toBe('completed');
      expect(metrics.sendTime).toBeGreaterThan(0);
      expect(metrics.firstTokenTime).toBeGreaterThanOrEqual(metrics.sendTime);
      expect(metrics.endTime).toBeGreaterThanOrEqual(metrics.firstTokenTime);
      expect(metrics.timeToFirstToken).toBe(metrics.firstTokenTime - metrics.sendTime);
      expect(metrics.totalDuration).toBe(metrics.endTime - metrics.sendTime);
      expect(metrics.eventCounts.start).toBe(1);
      expect(metrics.eventCounts.token).toBe(1);
      expect(metrics.eventCounts.tool_call_delta).toBe(1);
      expect(metrics.eventCounts.tool_result).toBe(1);
      expect(metrics.eventCounts.done).toBe(1);
      expect(metrics.toolCallCount).toBe(1);
      expect(onMetrics).toHaveBeenCalledWith(metrics, expect.any(String));
    });

    it('populates metrics fields for error outcome', () => {
      const onError = vi.fn();
      const controller = createStreamController({ onError });

      controller.processChunk(
        encoder.encode('{"type":"start","thread_id":"t1"}\n{"type":"error","message":"boom"}\n'),
      );

      const metrics: any = onError.mock.calls[0]![3];
      expect(metrics.outcome).toBe('error');
      expect(metrics.firstTokenTime).toBeNull();
      expect(metrics.timeToFirstToken).toBeNull();
      expect(metrics.eventCounts.error).toBe(1);
    });

    it('populates metrics fields for interrupted outcome', () => {
      const onInterrupted = vi.fn();
      const controller = createStreamController({ onInterrupted });

      controller.processChunk(
        encoder.encode('{"type":"start","thread_id":"t1"}\n{"type":"token","content":"partial"}\n'),
      );
      controller.end();

      const metrics: any = onInterrupted.mock.calls[0]![2];
      expect(metrics.outcome).toBe('interrupted');
      expect(metrics.firstTokenTime).toBeGreaterThan(0);
      expect(metrics.timeToFirstToken).toBeGreaterThanOrEqual(0);
    });

    it('populates metrics fields for cancelled outcome', () => {
      const onCancelled = vi.fn();
      const controller = createStreamController({ onCancelled });

      controller.processChunk(
        encoder.encode('{"type":"start","thread_id":"t1"}\n'),
      );
      controller.cancel();

      const metrics: any = onCancelled.mock.calls[0]![2];
      expect(metrics.outcome).toBe('cancelled');
    });

    it('populates metrics fields for stalled outcome', () => {
      vi.useFakeTimers();
      const onCancelled = vi.fn();
      const controller = createStreamController({ stallTimeoutMs: 1000, onCancelled });

      controller.processChunk(
        encoder.encode('{"type":"start","thread_id":"t1"}\n'),
      );
      vi.advanceTimersByTime(1001);

      const metrics: any = onCancelled.mock.calls[0]![2];
      expect(metrics.outcome).toBe('stalled');

      vi.useRealTimers();
    });
  });
});
