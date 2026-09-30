/**
 * Stream controller for NDJSON responses.
 * Manages UTF-8 decoding, NDJSON parsing, event dispatching,
 * CueReader marker stripping, stall watchdog, metrics, and tool calls.
 * Per specs/002-streaming-response-arch/research.md R3-R7
 */

import { createCueReader, type CueReader } from './cue';
import { createEventDispatcher } from './event-dispatcher';
import { createNdjsonParser, type NdjsonParser } from './ndjson-parser';
import type {
  DoneEvent,
  ErrorEvent,
  HeartbeatEvent,
  StartEvent,
  StreamMetrics,
  StreamOutcome,
  TokenEvent,
  ToolCallDeltaEvent,
  ToolCallRecord,
  ToolResultEvent,
} from './stream-types';
import type { Emotion } from '@/lib/emotion';
import type { MessageStatus } from './limits';

export interface StreamControllerOptions {
  requestId?: string;
  stallTimeoutMs?: number;
  onStatus?: (status: MessageStatus, requestId?: string) => void;
  onText?: (visibleText: string, requestId?: string) => void;
  onComplete?: (text: string, emotion: Emotion, metrics: StreamMetrics, requestId?: string) => void;
  onError?: (message: string, partialText: string, emotion: Emotion, metrics: StreamMetrics, requestId?: string) => void;
  onInterrupted?: (partialText: string, emotion: Emotion, metrics: StreamMetrics, requestId?: string) => void;
  onCancelled?: (partialText: string, emotion: Emotion, metrics: StreamMetrics, requestId?: string) => void;
  onToolUpdate?: (toolCalls: ToolCallRecord[], requestId?: string) => void;
  onMetrics?: (metrics: StreamMetrics, requestId?: string) => void;
}

export interface StreamController {
  readonly requestId: string;
  processChunk(bytes: Uint8Array): void;
  end(): void;
  cancel(reason?: string): void;
}

export function createStreamController(options: StreamControllerOptions): StreamController {
  const requestId = options.requestId ?? `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const stallTimeoutMs = options.stallTimeoutMs ?? 10_000;

  const decoder = new TextDecoder('utf-8');
  const cueReader: CueReader = createCueReader();
  const toolCalls = new Map<string, ToolCallRecord>();

  let started = false;
  let terminated = false;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;

  const sendTime = performance.now();
  let firstTokenTime: number | null = null;
  const eventCounts: Record<string, number> = {};

  const clearStallTimer = (): void => {
    if (stallTimer !== null) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  };

  const countEvent = (type: string): void => {
    eventCounts[type] = (eventCounts[type] ?? 0) + 1;
  };

  const finalizeMetrics = (outcome: StreamOutcome): StreamMetrics => {
    const endTime = performance.now();
    const metrics: StreamMetrics = {
      sendTime,
      firstTokenTime,
      endTime,
      timeToFirstToken: firstTokenTime !== null ? firstTokenTime - sendTime : null,
      totalDuration: endTime - sendTime,
      eventCounts: { ...eventCounts },
      toolCallCount: toolCalls.size,
      outcome,
    };
    options.onMetrics?.(metrics, requestId);
    return metrics;
  };

  const notifyToolUpdate = (): void => {
    options.onToolUpdate?.(Array.from(toolCalls.values()), requestId);
  };

  const dispatcher = createEventDispatcher({
    onStart(event: StartEvent): void {
      countEvent('start');
      started = true;
      options.onStatus?.('streaming', requestId);
    },

    onToken(event: TokenEvent): void {
      countEvent('token');
      if (!started) {
        started = true;
        console.warn('Stream controller: token event received before start event');
        options.onStatus?.('streaming', requestId);
      }
      if (firstTokenTime === null) {
        firstTokenTime = performance.now();
      }
      const visible = cueReader.push(event.content);
      options.onText?.(visible, requestId);
    },

    onToolCallDelta(event: ToolCallDeltaEvent): void {
      countEvent('tool_call_delta');

      let record: ToolCallRecord | undefined;

      // 1. If explicit tool_call_id is provided, look it up in toolCalls
      if (event.tool_call_id) {
        record = toolCalls.get(event.tool_call_id);
      }

      // 2. If not found by ID, look for an active (unfinished) record matching tool_call_index
      if (!record && event.tool_call_index !== null && event.tool_call_index !== undefined) {
        const indexKey = `index-${event.tool_call_index}`;
        const indexRecord = toolCalls.get(indexKey);
        if (
          indexRecord &&
          (indexRecord.status === 'preparing' || indexRecord.status === 'generating_args')
        ) {
          record = indexRecord;
        } else {
          for (const r of toolCalls.values()) {
            if (
              r.toolCallIndex === event.tool_call_index &&
              (r.status === 'preparing' || r.status === 'generating_args')
            ) {
              record = r;
              break;
            }
          }
        }
      }

      // 3. If still not found and no ID/index, look for an active tool with matching name or preparing
      if (!record && !event.tool_call_id && (event.tool_call_index === null || event.tool_call_index === undefined)) {
        for (const r of toolCalls.values()) {
          if (r.status === 'preparing' || r.status === 'generating_args') {
            if (!event.tool_name || !r.toolName || r.toolName === event.tool_name) {
              record = r;
              break;
            }
          }
        }
      }

      // 4. If no active record matched, this is a new tool call!
      if (!record) {
        let idKey = event.tool_call_id;
        if (!idKey) {
          if (event.tool_call_index !== null && event.tool_call_index !== undefined) {
            idKey = toolCalls.has(`index-${event.tool_call_index}`)
              ? `index-${event.tool_call_index}-${toolCalls.size}`
              : `index-${event.tool_call_index}`;
          } else {
            idKey = `temp-${toolCalls.size}`;
          }
        }

        record = {
          id: idKey,
          toolCallId: event.tool_call_id ?? null,
          toolCallIndex: event.tool_call_index ?? null,
          toolName: event.tool_name ?? null,
          argsAccumulator: '',
          parsedArgs: null,
          status: event.tool_name ? 'generating_args' : 'preparing',
          startTime: performance.now(),
          endTime: null,
          result: null,
          error: null,
        };
        toolCalls.set(idKey, record);
      } else {
        // Retain sticky fields if previously set and current is null
        if (event.tool_name && !record.toolName) {
          record.toolName = event.tool_name;
          if (record.status === 'preparing') {
            record.status = 'generating_args';
          }
        }
        if (event.tool_call_id && record.id !== event.tool_call_id) {
          toolCalls.delete(record.id);
          record.id = event.tool_call_id;
          record.toolCallId = event.tool_call_id;
          toolCalls.set(event.tool_call_id, record);
        }
        if (event.tool_call_index !== null && event.tool_call_index !== undefined && record.toolCallIndex === null) {
          record.toolCallIndex = event.tool_call_index;
        }
      }

      record.argsAccumulator += event.args_delta;
      try {
        record.parsedArgs = JSON.parse(record.argsAccumulator);
      } catch {
        // Valid during streaming deltas
        record.parsedArgs = null;
      }

      notifyToolUpdate();
    },

    onToolResult(event: ToolResultEvent): void {
      countEvent('tool_result');
      const id = event.tool_call_id;
      let record = id ? toolCalls.get(id) : undefined;

      if (!record && id) {
        for (const r of toolCalls.values()) {
          if (r.toolCallId === id) {
            record = r;
            break;
          }
        }
      }

      // If not matched by id (or no id provided), correlate with an active tool call waiting for result
      if (!record) {
        const activeRecords = Array.from(toolCalls.values()).filter(
          (r) => r.status === 'generating_args' || r.status === 'preparing',
        );
        if (event.tool_name) {
          record = activeRecords.find((r) => r.toolName === event.tool_name);
        }
        if (!record && activeRecords.length > 0) {
          record = activeRecords[0];
        }
      }

      if (!record) {
        // Try finding by any matching record
        console.warn('Stream controller: unmatched tool_result event received', event);
        record = {
          id: id ?? `unmatched-${toolCalls.size}`,
          toolCallId: id ?? null,
          toolCallIndex: null,
          toolName: event.tool_name ?? null,
          argsAccumulator: '',
          parsedArgs: null,
          status: event.status === 'error' ? 'failed' : 'completed',
          startTime: performance.now(),
          endTime: performance.now(),
          result: event.content,
          error: event.status === 'error' ? String(event.content) : null,
        };
        toolCalls.set(record.id, record);
      } else {
        record.endTime = performance.now();
        record.result = event.content;
        record.status = event.status === 'error' ? 'failed' : 'completed';
        if (event.status === 'error') {
          record.error = String(event.content);
        }
        if (id && !record.toolCallId) {
          record.toolCallId = id;
        }
      }

      notifyToolUpdate();
    },

    onDone(event?: DoneEvent): void {
      countEvent('done');
      terminated = true;
      clearStallTimer();
      const result = cueReader.end();
      const metrics = finalizeMetrics('completed');
      options.onComplete?.(result.text, result.emotion, metrics, requestId);
    },

    onError(event: ErrorEvent): void {
      countEvent('error');
      terminated = true;
      clearStallTimer();
      const result = cueReader.end();
      const metrics = finalizeMetrics('error');
      options.onError?.(event.message, result.text, result.emotion, metrics, requestId);
    },

    onHeartbeat(event?: HeartbeatEvent): void {
      countEvent('heartbeat');
      // Stall timer is refreshed in processChunk
    },

    onUnknown(event: unknown): void {
      console.debug('Stream controller: unknown event received', event);
    },
  });

  const parser: NdjsonParser = createNdjsonParser((record) => {
    dispatcher.dispatch(record);
  });

  const resetStallTimer = (): void => {
    clearStallTimer();
    stallTimer = setTimeout(() => {
      if (!terminated) {
        controller.cancel('stalled');
      }
    }, stallTimeoutMs);
  };

  const controller: StreamController = {
    requestId,

    processChunk(bytes: Uint8Array): void {
      if (terminated) {
        return;
      }
      resetStallTimer();
      const text = decoder.decode(bytes, { stream: true });
      parser.processText(text);
    },

    end(): void {
      if (terminated) {
        return;
      }
      clearStallTimer();
      const trailing = decoder.decode();
      if (trailing) {
        parser.processText(trailing);
      }
      parser.flush();

      if (!terminated) {
        terminated = true;
        const result = cueReader.end();
        const metrics = finalizeMetrics('interrupted');
        options.onInterrupted?.(result.text, result.emotion, metrics, requestId);
      }
    },

    cancel(reason?: string): void {
      if (terminated) {
        return;
      }
      terminated = true;
      clearStallTimer();
      const result = cueReader.end();
      const outcome: StreamOutcome = reason === 'stalled' ? 'stalled' : 'cancelled';
      const metrics = finalizeMetrics(outcome);
      options.onCancelled?.(result.text, result.emotion, metrics, requestId);
    },
  };

  return controller;
}
