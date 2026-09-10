'use client';

import Announcer from '@/components/Announcer';
import MessageInput from '@/components/MessageInput';
import MessageLog from '@/components/MessageLog';
import { copy } from '@/lib/ui/copy';
import type { Conversation } from '@/lib/conversation/useConversation';

interface Props {
  conversation: Conversation;
}

/**
 * The chat panel (FR-001).
 *
 * This component owns the waiting indicator. It belongs here rather than with the character's
 * thinking state because US2 must be complete on its own: the panel's four failure paths and its
 * 100ms feedback affordance (SC-004) have to work before any animation exists, and FR-037's
 * "no visitor-facing state is visible-only" has to hold at this story's checkpoint.
 */
export default function ChatPanel({ conversation }: Props) {
  const { messages, status, notice, announcement, inFlight, send } = conversation;

  const isFailure = status === 'error' || status === 'limited';

  return (
    <section className="chat-panel" aria-label="Conversation">
      <MessageLog messages={messages} />

      <p className={`status-line${isFailure ? ' error' : ''}`}>
        {status === 'waiting' ? (
          <span className="waiting-indicator">{copy.waiting}</span>
        ) : (
          (notice ?? '')
        )}
      </p>

      <MessageInput onSend={send} disabled={inFlight} disabledReason={copy.replyInProgress} />

      <Announcer status={status} announcement={announcement} notice={notice} />
    </section>
  );
}
