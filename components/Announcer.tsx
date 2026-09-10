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
 * One polite live region for everything a visitor needs told rather than shown.
 *
 * Three rules do all the work:
 *
 * 1. **The reply is announced once, whole, on completion** (FR-036). The visible text and the
 *    announced text are deliberately decoupled: the DOM accumulates chunk by chunk, but a live
 *    region updated per chunk produces per-token interruptions, which SC-014 counts as a failure.
 *    This component therefore never receives a streaming message - only the finished one.
 *
 * 2. **Failures and limits use the same channel** (FR-037), so no visitor-facing state is
 *    visible-only. The wording is the panel's own, from lib/ui/copy.ts, so the two cannot drift.
 *
 * 3. **A later state wins, and nothing is lost** (spec Edge Cases). The message is *derived* from
 *    the current state rather than pushed into local state, so a visitor who sends again the instant
 *    a reply lands gets the thinking announcement replacing the reply announcement - one message in
 *    the region at a time, no queue to fall behind, and `aria-live="polite"` to stop either
 *    interrupting the other.
 */
export default function Announcer({ status, announcement, notice }: Props) {
  const message = (() => {
    // Order is precedence. The newest state the visitor is in wins.
    if (status === 'waiting') return copy.thinking;
    if (notice) return notice;
    if (announcement) return copy.replyComplete(announcement);
    return '';
  })();

  return (
    <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
