'use client';

import Announcer from '@/components/Announcer';
import MessageInput from '@/components/MessageInput';
import MessageLog from '@/components/MessageLog';
import { copy } from '@/lib/ui/copy';
import type { Conversation } from '@/lib/conversation/useConversation';

interface Props {
  conversation: Conversation;
  className?: string;
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
export default function ChatPanel({ conversation, className = '' }: Props) {
  const { messages, status, notice, announcement, inFlight, send, threadId } = conversation;

  const isFailure = status === 'error' || status === 'limited';
  const isThreadUnavailable = !threadId;
  const isDisabled = inFlight || isThreadUnavailable;
  const disabledReason = isThreadUnavailable
    ? status === 'connecting'
      ? copy.connecting
      : (notice ?? copy.backendUnavailable)
    : copy.replyInProgress;

  return (
    <section
      className={`chat-panel absolute bottom-0 inset-x-0 h-1/2 z-20 flex flex-col p-3 sm:p-4 md:p-5 bg-transparent bg-gradient-to-b from-transparent via-[rgba(28,30,39,0.8)] to-[rgba(28,30,39,0.95)] overflow-hidden text-white ${className}`}
      aria-label="Conversation"
    >
      <div className="w-full max-w-3xl mx-auto flex-1 flex flex-col min-h-0 gap-2 sm:gap-3 text-white">
        <MessageLog messages={messages} status={status} />

        <p
          className={`status-line min-h-[1.4em] text-xs sm:text-sm m-0 transition-colors flex items-center drop-shadow-sm ${
            isFailure ? 'error text-[var(--danger)]' : 'text-slate-200'
          }`}
        >
          {status === 'waiting' ? (
            <span className="waiting-indicator inline-flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full bg-[var(--accent)] animate-[waiting-pulse_1.4s_ease-in-out_infinite]"
                aria-hidden="true"
              />
              {copy.waiting}
            </span>
          ) : status === 'connecting' ? (
            <span className="connecting-indicator inline-flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full bg-[var(--accent)] animate-[waiting-pulse_1.4s_ease-in-out_infinite]"
                aria-hidden="true"
              />
              {copy.connecting}
            </span>
          ) : (
            (notice ?? '')
          )}
        </p>

        <MessageInput
          onSend={send}
          disabled={isDisabled}
          disabledReason={disabledReason}
          status={status}
        />

        <Announcer status={status} announcement={announcement} notice={notice} />

        <p className="attribution text-[10px] text-slate-300/80 drop-shadow-sm text-center m-0 truncate">
          Character model: Haru by Live2D Inc. (Free Material License). Rendering by pixi-live2d-display over PixiJS.
        </p>
      </div>
    </section>
  );
}
