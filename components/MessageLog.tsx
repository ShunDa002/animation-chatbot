'use client';

import { useEffect, useRef } from 'react';
import type { Message } from '@/lib/conversation/limits';
import type { ConversationStatus } from '@/lib/conversation/useConversation';
import ToolActivity from './ToolActivity';
import HitlConfirmation from './HitlConfirmation';

export interface MessageLogProps {
  messages: readonly Message[];
  status?: ConversationStatus;
  notice?: string | null;
  threadId?: string | null;
  onResume?: (decision: 'yes' | 'no', interruptId?: string, targetMessageId?: string) => Promise<void>;
}

export type Props = MessageLogProps;

/**
 * The scrolling log (FR-002, FR-040, D14).
 *
 * - Visitor messages: right-aligned to right margin.
 * - Character messages: left-aligned with character icon/avatar on left, bubble extends to right margin (sharing the same right edge).
 * - Distinguishes visitor and character messages with distinct bubble backgrounds.
 * - Displays a temporary typing/thinking indicator bubble when status === 'waiting' (FR-040).
 * - Auto-scroll pinned to bottom when user is near bottom.
 */
export default function MessageLog({ messages, status, notice, threadId, onResume }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    pinnedToBottom.current = distanceFromBottom < 80;
  };

  const prevMessagesLength = useRef(messages.length);
  const prevStatus = useRef(status);
  const prevThreadId = useRef(threadId);

  // Scroll to bottom on initial mount (e.g., after history is rendered - FR-035)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let shouldScroll = pinnedToBottom.current;

    // Force scroll to bottom on new messages or when thread changes (FR-035)
    if (messages.length > prevMessagesLength.current || threadId !== prevThreadId.current) {
      shouldScroll = true;
      pinnedToBottom.current = true;
    }

    // Force scroll to bottom when thinking indicator appears
    if (status === 'waiting' && prevStatus.current !== 'waiting') {
      shouldScroll = true;
      pinnedToBottom.current = true;
    }

    prevMessagesLength.current = messages.length;
    prevStatus.current = status;
    prevThreadId.current = threadId;

    if (shouldScroll) {
      container.scrollTop = container.scrollHeight;
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      });
    }
  }, [messages, status, threadId]);

  return (
    <div
      className="message-log flex-1 overflow-y-auto flex flex-col gap-3 min-h-0 pr-1"
      ref={containerRef}
      role="log"
      aria-label="Messages"
      onScroll={handleScroll}
    >
      {messages.map((message) => {
        if (message.author === 'visitor') {
          return (
            <div key={message.id} className="w-full flex justify-end">
              <div
                className="message visitor max-w-[85%] sm:max-w-[80%] rounded-2xl bg-[var(--bubble-visitor)]/85 border border-white/10 p-3 sm:px-4 sm:py-2.5 text-white drop-shadow-md text-sm sm:text-base leading-relaxed break-words shadow-sm transition-all [text-shadow:_0_1px_2px_rgba(0,0,0,0.8)]"
                data-status={message.status}
                style={{ animation: 'message-in 180ms cubic-bezier(0.2, 0, 0.2, 1)' }}
              >
                <span className="message-author block text-[0.7rem] uppercase tracking-wider text-slate-300 mb-0.5 [text-shadow:none]">
                  You
                </span>
                {message.text}
              </div>
            </div>
          );
        }

        const characterMessages = messages.filter((m) => m.author === 'character');
        const isLastCharacterMessage =
          characterMessages.length > 0 && characterMessages[characterMessages.length - 1]?.id === message.id;
        const hasContent = Boolean(
          (message.text && message.text.trim().length > 0) ||
          (message.toolCalls && message.toolCalls.length > 0) ||
          message.status === 'cancelled' ||
          message.status === 'interrupted' ||
          message.interruptDecision
        );
        const isActivelyStreaming =
          (status === undefined || status === 'streaming') &&
          message.status === 'streaming' &&
          isLastCharacterMessage;

        if (!hasContent && !isActivelyStreaming) {
          return null;
        }

        return (
          <div key={message.id} className="w-full flex items-start gap-2 sm:gap-2.5">
            <div
              className="character-icon w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[var(--bubble-character)]/80 border border-[var(--border)] flex items-center justify-center flex-shrink-0 text-[var(--accent)] shadow-sm select-none mt-1"
              aria-hidden="true"
              data-testid="character-icon"
            >
              <svg
                className="w-4 h-4 text-[var(--accent)]"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
              </svg>
            </div>
            <div
              className="message character flex-1 rounded-2xl bg-[var(--bubble-character)]/60 border border-white/5 p-3 sm:px-4 sm:py-2.5 text-white drop-shadow-md text-sm sm:text-base leading-relaxed break-words shadow-sm transition-all [text-shadow:_0_1px_2px_rgba(0,0,0,0.8)]"
              data-status={message.status}
              style={{ animation: 'message-in 180ms cubic-bezier(0.2, 0, 0.2, 1)' }}
            >
              <span className="message-author block text-[0.7rem] uppercase tracking-wider text-slate-300 mb-0.5 [text-shadow:none]">
                Aria
              </span>
              {message.toolCalls && message.toolCalls.length > 0 && (
                <ToolActivity toolCalls={message.toolCalls} />
              )}
              {message.text ? (
                <div className="message-text">
                  {message.text}
                  {message.status === 'cancelled' && (
                    <span
                      className="text-xs text-[var(--text-muted)] italic ml-1.5 opacity-80"
                      data-testid="stopped-indicator"
                    >
                      (Stopped)
                    </span>
                  )}
                  {message.status === 'error' && notice && (
                    <div className="text-[var(--danger)] mt-2 font-medium">{notice}</div>
                  )}
                </div>
              ) : message.status === 'cancelled' ? (
                <div className="message-text">
                  <span
                    className="text-xs text-[var(--text-muted)] italic opacity-80"
                    data-testid="stopped-indicator"
                  >
                    (Stopped)
                  </span>
                </div>
              ) : (!message.toolCalls || message.toolCalls.length === 0) && isActivelyStreaming ? (
                <div
                  className="flex items-center gap-1.5 py-1 px-1"
                  data-testid="thinking-dots"
                  aria-hidden="true"
                >
                  <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce motion-reduce:animate-none [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce motion-reduce:animate-none [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce motion-reduce:animate-none" />
                </div>
              ) : null}
              {(message.status === 'interrupted' || message.interruptDecision) && (
                <HitlConfirmation
                  threadId={threadId || ''}
                  interruptId={message.interruptId}
                  initialDecision={message.interruptDecision}
                  onResume={
                    onResume
                      ? (decision) => onResume(decision, message.interruptId, message.id)
                      : undefined
                  }
                />
              )}
            </div>
          </div>
        );
      })}

      {status === 'waiting' && (
        <div className="w-full flex items-start gap-2 sm:gap-2.5" data-testid="thinking-bubble">
          <div
            className="character-icon w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[var(--bubble-character)]/80 border border-[var(--border)] flex items-center justify-center flex-shrink-0 text-[var(--accent)] shadow-sm select-none mt-1"
            aria-hidden="true"
            data-testid="character-icon"
          >
            <svg
              className="w-4 h-4 text-[var(--accent)]"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
            </svg>
          </div>
          <div
            className="message character thinking max-w-[85%] sm:max-w-[80%] rounded-2xl bg-[var(--bubble-character)]/60 border border-white/5 p-3 sm:px-4 sm:py-2.5 text-white drop-shadow-md text-sm sm:text-base leading-relaxed break-words shadow-sm transition-all"
            role="status"
            aria-label="Aria is thinking"
            style={{ animation: 'message-in 180ms cubic-bezier(0.2, 0, 0.2, 1)' }}
          >
            <span className="message-author block text-[0.7rem] uppercase tracking-wider text-slate-300 mb-1 [text-shadow:none]">
              Aria
            </span>
            <div
              className="flex items-center gap-1.5 py-1 px-1"
              data-testid="thinking-dots"
              aria-hidden="true"
            >
              <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce motion-reduce:animate-none [animation-delay:-0.3s]" />
              <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce motion-reduce:animate-none [animation-delay:-0.15s]" />
              <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce motion-reduce:animate-none" />
            </div>
          </div>
        </div>
      )}

      {(status === 'error' || status === 'limited') && notice && messages.length > 0 && messages[messages.length - 1]?.author === 'visitor' && (
        <div className="w-full flex items-start gap-2 sm:gap-2.5" data-testid="error-bubble">
          <div
            className="character-icon w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[var(--bubble-character)]/80 border border-[var(--border)] flex items-center justify-center flex-shrink-0 text-[var(--accent)] shadow-sm select-none mt-1"
            aria-hidden="true"
          >
            <svg
              className="w-4 h-4 text-[var(--accent)]"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
            </svg>
          </div>
          <div
            className="message character error max-w-[85%] sm:max-w-[80%] rounded-2xl bg-[var(--bubble-character)]/60 border border-[var(--danger)]/50 p-3 sm:px-4 sm:py-2.5 text-[var(--danger)] drop-shadow-md text-sm sm:text-base leading-relaxed break-words shadow-sm transition-all font-medium"
            role="alert"
            style={{ animation: 'message-in 180ms cubic-bezier(0.2, 0, 0.2, 1)' }}
          >
            <span className="message-author block text-[0.7rem] uppercase tracking-wider text-[var(--danger)] opacity-80 mb-1 [text-shadow:none] font-normal">
              Aria
            </span>
            <div className="message-text">
              {notice}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
