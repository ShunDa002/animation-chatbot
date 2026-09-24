'use client';

import { copy } from '@/lib/ui/copy';
import type { ConversationStatus } from '@/lib/conversation/useConversation';

interface Props {
  status: ConversationStatus;
  /** The completed reply, or null. Announced once, whole (FR-036). */
  announcement: string | null;
  /** Visitor-facing failure or limit wording, or null (FR-037). */
  notice: string | null;
}

/**
 * One polite live region for everything a visitor needs told rather than shown (FR-036, FR-037, FR-045, D13).
 */
export default function Announcer({ status, announcement, notice }: Props) {
  const message = (() => {
    // Order is precedence. The newest state the visitor is in wins.
    if (status === 'waiting') return copy.thinking;
    if (status === 'connecting') return copy.connecting;
    if (notice) return notice;
    if (announcement) return copy.replyComplete(announcement);
    return '';
  })();

  return (
    <div className="visually-hidden sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
