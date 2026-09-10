'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Message } from '@/lib/conversation/limits';

interface Props {
  messages: readonly Message[];
}

/**
 * The scrolling log (FR-002).
 *
 * Visitor and character messages are visually distinguished, and the newest message is kept in view
 * as content grows - including as a reply streams, which changes the height of the last bubble on
 * almost every chunk.
 *
 * Scroll position survives re-render (constitution III) by only forcing the view when the visitor was
 * already near the bottom. A visitor who has scrolled up to re-read something is not yanked back
 * down by an arriving reply.
 */
export default function MessageLog({ messages }: Props) {
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
  }, [messages]);

  return (
    <div className="message-log" ref={containerRef} role="log" aria-label="Messages">
      {messages.map((message) => (
        <div key={message.id} className={`message ${message.author}`} data-status={message.status}>
          <span className="message-author">{message.author === 'visitor' ? 'You' : 'Aria'}</span>
          {message.text}
        </div>
      ))}
    </div>
  );
}
