'use client';

import { useEffect, useRef, useState } from 'react';
import Announcer from '@/components/Announcer';
import MessageInput, { STORAGE_KEY_DRAFT } from '@/components/MessageInput';
import MessageLog from '@/components/MessageLog';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { copy } from '@/lib/ui/copy';
import type { Conversation } from '@/lib/conversation/useConversation';

export interface ChatPanelProps {
  conversation: Conversation;
  className?: string;
  isHistoryLoading?: boolean;
  historyError?: string | null;
  onRetryHistory?: () => void;
}

/**
 * The chat panel (FR-001, D13, D14).
 *
 * Overlays the bottom 50% of the character area with a transparent background.
 *
 * Composes:
 * - MessageLog (scrolling conversation history)
 * - Status line with waiting indicator, connecting notice, or failure notice (SC-004, FR-037, FR-045)
 * - MessageInput composer (FR-022)
 * - Announcer polite live region (FR-036, FR-037)
 */
export default function ChatPanel({
  conversation,
  className = '',
  isHistoryLoading,
  historyError,
  onRetryHistory,
}: ChatPanelProps) {
  const { messages, status, notice, announcement, inFlight, send, resume, threadId } = conversation;

  const effectiveIsHistoryLoading = isHistoryLoading ?? conversation.isHistoryLoading ?? false;
  const effectiveHistoryError = historyError ?? conversation.historyError ?? null;
  const handleRetryHistory = onRetryHistory ?? conversation.retryHistory;

  const [inputDraft, setInputDraft] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        return window.sessionStorage.getItem(STORAGE_KEY_DRAFT) || '';
      }
    } catch {
      // Ignore
    }
    return '';
  });

  const lastSubmittedPromptRef = useRef<string>('');
  const prevStatusRef = useRef(status);

  // Restore draft on error (FR-020)
  useEffect(() => {
    if (status === 'error' && prevStatusRef.current !== 'error' && lastSubmittedPromptRef.current) {
      setInputDraft(lastSubmittedPromptRef.current);
    }
    prevStatusRef.current = status;
  }, [status]);

  const handleSubmit = (text: string, model?: string) => {
    lastSubmittedPromptRef.current = text;
    if (model) {
      send(text, model);
    } else {
      send(text);
    }
    setInputDraft('');
  };

  const isThreadUnavailable = !threadId && !effectiveIsHistoryLoading;
  const isInterruptActive = messages.some((m) => m.status === 'interrupted');
  const isDisabled =
    inFlight ||
    isThreadUnavailable ||
    isInterruptActive ||
    effectiveIsHistoryLoading ||
    Boolean(effectiveHistoryError);
  const disabledReason = effectiveIsHistoryLoading
    ? 'Loading conversation history...'
    : effectiveHistoryError
      ? 'Failed to load conversation history.'
      : isInterruptActive
        ? 'Awaiting approval...'
        : isThreadUnavailable
          ? status === 'connecting'
            ? copy.connecting
            : (notice ?? copy.backendUnavailable)
          : copy.replyInProgress;

  return (
    <section
      className={`chat-panel absolute bottom-0 inset-x-0 h-1/2 z-20 flex flex-col bg-transparent bg-gradient-to-b from-transparent via-[rgba(28,30,39,0.6)] to-[rgba(28,30,39,0.8)] overflow-hidden text-white ${className}`}
      aria-label="Conversation"
    >
      <div className="w-[90%] mx-auto flex-1 flex flex-col justify-end min-h-0 gap-2 sm:gap-3 text-white pb-0">
        {effectiveIsHistoryLoading ? (
          <LoadingSkeleton variant="chat" data-testid="chat-history-skeleton" />
        ) : effectiveHistoryError ? (
          <div
            data-testid="chat-history-error"
            className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3 my-auto min-h-0"
          >
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 max-w-md w-full flex flex-col items-center gap-3 shadow-lg">
              <p className="text-sm text-rose-300 font-medium m-0">
                {effectiveHistoryError}
              </p>
              <button
                type="button"
                onClick={handleRetryHistory}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer shadow-sm"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <MessageLog messages={messages} status={status} notice={notice} threadId={threadId} onResume={resume} />
        )}

        <MessageInput
          value={inputDraft}
          onChange={setInputDraft}
          onSubmit={handleSubmit}
          onSend={handleSubmit}
          onStop={conversation.stop}
          isStreaming={status === 'streaming'}
          disabled={isDisabled}
          disabledReason={disabledReason}
          isWaitingForResponse={inFlight && !isInterruptActive}
          status={status}
        />

        <Announcer status={status} announcement={announcement} notice={notice} />
      </div>

    </section>
  );
}
