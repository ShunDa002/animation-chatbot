/**
 * Event dispatcher for NDJSON stream events.
 * Validates payload structure and required fields, routes to typed handlers,
 * handles unknown event types forward-compatibly, and tracks terminal states.
 * Per specs/002-streaming-response-arch/contracts/ndjson-event-dispatch.md and research.md R2
 */

import type {
  DoneEvent,
  ErrorEvent,
  HeartbeatEvent,
  InterruptEvent,
  StartEvent,
  StoppedEvent,
  StreamEventHandlers,
  TokenEvent,
  ToolCallDeltaEvent,
  ToolResultEvent,
} from './stream-types';


export interface EventDispatcher {
  dispatch(event: unknown): void;
}

export function createEventDispatcher(handlers: StreamEventHandlers): EventDispatcher {
  let terminated = false;

  const invoke = (fn: () => void): void => {
    try {
      fn();
    } catch (err) {
      console.error('Event dispatcher: handler exception', err);
    }
  };

  return {
    dispatch(event: unknown): void {
      if (terminated) {
        return;
      }

      if (typeof event !== 'object' || event === null || Array.isArray(event)) {
        console.warn('Event dispatcher: non-object record received', event);
        return;
      }

      const raw = event as Record<string, unknown>;
      if (typeof raw.type !== 'string') {
        console.warn('Event dispatcher: record missing string type discriminator', event);
        return;
      }

      switch (raw.type) {
        case 'start': {
          if (typeof raw.thread_id !== 'string') {
            console.warn('Event dispatcher: start event missing string thread_id', raw);
            return;
          }
          invoke(() => handlers.onStart(raw as unknown as StartEvent));
          break;
        }

        case 'token': {
          if (typeof raw.content !== 'string') {
            console.warn('Event dispatcher: token event missing string content', raw);
            return;
          }
          invoke(() => handlers.onToken(raw as unknown as TokenEvent));
          break;
        }

        case 'tool_call_delta': {
          if (typeof raw.args_delta !== 'string') {
            console.warn('Event dispatcher: tool_call_delta missing string args_delta', raw);
            return;
          }
          invoke(() => handlers.onToolCallDelta(raw as unknown as ToolCallDeltaEvent));
          break;
        }

        case 'tool_result': {
          if (raw.content === undefined) {
            console.warn('Event dispatcher: tool_result missing content', raw);
            return;
          }
          invoke(() => handlers.onToolResult(raw as unknown as ToolResultEvent));
          break;
        }

        case 'done': {
          terminated = true;
          invoke(() => handlers.onDone(raw as unknown as DoneEvent));
          break;
        }

        case 'stopped': {
          terminated = true;
          invoke(() => handlers.onStopped?.(raw as unknown as StoppedEvent));
          break;
        }

        case 'error': {
          if (typeof raw.message !== 'string') {
            console.warn('Event dispatcher: error event missing string message', raw);
            return;
          }
          terminated = true;
          invoke(() => handlers.onError(raw as unknown as ErrorEvent));
          break;
        }

        case 'heartbeat': {
          invoke(() => handlers.onHeartbeat(raw as unknown as HeartbeatEvent));
          break;
        }

        case 'interrupt': {
          if (typeof raw.thread_id !== 'string' || typeof raw.interrupt_id !== 'string') {
            console.warn('Event dispatcher: interrupt event missing string thread_id or interrupt_id', raw);
            return;
          }
          invoke(() => handlers.onInterrupt?.(raw as unknown as InterruptEvent));
          break;
        }

        default: {
          invoke(() => handlers.onUnknown(event));
          break;
        }
      }
    },
  };
}
