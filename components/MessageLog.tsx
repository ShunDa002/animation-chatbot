'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Message } from '@/lib/conversation/limits';
import type { ConversationStatus } from '@/lib/conversation/useConversation';
import ToolActivity from './ToolActivity';

interface Props {
  messages: readonly Message[];
  status?: ConversationStatus;
}

/**
 * The scrolling log (FR-002, FR-040, D14).
 *
 * - Visitor messages: right-aligned to right margin.
 * - Character messages: left-aligned with character icon/avatar on left, bubble extends to right margin (sharing the same right edge).
 * - Distinguishes visitor and character messages with distinct bubble backgrounds.
 * - Displays a temporary typing/thinking indicator bubble when status === 'waiting' (FR-040).
 * - Auto-scroll pinned to bottom when user is near bottom.
 */
export default function MessageLog({ messages, status }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  // Record whether the visitor is following along, before the DOM changes height.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    pinnedToBottom.current = distanceFromBottom < 80;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !pinnedToBottom.current) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, status]);

  return (
    <div
      className="message-log flex-1 overflow-y-auto flex flex-col gap-3 min-h-0 pr-1"
      ref={containerRef}
      role="log"
      aria-label="Messages"
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
                </div>
              ) : null}
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
    </div>
  );
}
