/**
 * Wire event types and client-side types for the NDJSON streaming response protocol.
 * Per specs/002-streaming-response-arch/data-model.md
 */

// ==========================================
// 1. Wire Event Types (NDJSON Protocol)
// ==========================================

export interface BaseEvent {
  type: string;
}

export interface StartEvent {
  type: 'start';
  thread_id: string;
}

export interface TokenEvent {
  type: 'token';
  content: string;
  node?: string | null;
}

export interface ToolCallDeltaEvent {
  type: 'tool_call_delta';
  tool_name?: string | null;
  tool_call_id?: string | null;
  tool_call_index?: number | null;
  args_delta: string;
  node?: string | null;
}

export interface ToolResultEvent {
  type: 'tool_result';
  tool_name?: string | null;
  tool_call_id?: string | null;
  content: unknown;
  status?: string | null;
  node?: string | null;
}

export interface DoneEvent {
  type: 'done';
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

export interface HeartbeatEvent {
  type: 'heartbeat';
}

export type StreamWireEvent =
  | StartEvent
  | TokenEvent
  | ToolCallDeltaEvent
  | ToolResultEvent
  | DoneEvent
  | ErrorEvent
  | HeartbeatEvent;

// ==========================================
// 2. Client-Side State Types
// ==========================================

export type ToolCallStatus =
  | 'preparing'
  | 'generating_args'
  | 'completed'
  | 'failed';

export interface ToolCallRecord {
  id: string;
  toolCallId: string | null;
  toolCallIndex: number | null;
  toolName: string | null;
  argsAccumulator: string;
  parsedArgs: unknown | null;
  status: ToolCallStatus;
  startTime: number;
  endTime: number | null;
  result: unknown | null;
  error: string | null;
}

export type StreamOutcome =
  | 'completed'
  | 'error'
  | 'cancelled'
  | 'interrupted'
  | 'stalled';

export interface StreamMetrics {
  sendTime: number;
  firstTokenTime: number | null;
  endTime: number;
  timeToFirstToken: number | null;
  totalDuration: number;
  eventCounts: Record<string, number>;
  toolCallCount: number;
  outcome: StreamOutcome;
}

export interface StreamEventHandlers {
  onStart(event: StartEvent): void;
  onToken(event: TokenEvent): void;
  onToolCallDelta(event: ToolCallDeltaEvent): void;
  onToolResult(event: ToolResultEvent): void;
  onDone(event?: DoneEvent): void;
  onError(event: ErrorEvent): void;
  onHeartbeat(event?: HeartbeatEvent): void;
  onUnknown(event: unknown): void;
}
