import type { Message, ConversationStatus, InterruptDecision } from '@/lib/conversation/useConversation';
import type { EmotionState } from '@/lib/emotion';

export interface InterruptState {
  interruptId?: string;
  pending?: boolean;
  decision?: InterruptDecision;
}

export interface MessageInputState {
  text: string;
  lineCount: number;
  isMultiLine: boolean;
  isSubmitting: boolean;
  isStreaming: boolean;
  interruptState?: InterruptState;
  selectedModel: string;
}

export interface ConversationItem {
  id: string;
  threadId?: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  date?: string;
}

export type ConversationSummary = ConversationItem;

export interface ConversationState {
  messages: Message[];
  status: ConversationStatus;
  threadId: string | null;
  emotion: EmotionState;
  inFlight: boolean;
  notice: string | null;
  announcement: string | null;
  isHistoryLoading?: boolean;
  historyError?: string | null;
}
