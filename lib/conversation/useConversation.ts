'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NEUTRAL, type Emotion } from '@/lib/emotion';
import { createCueReader } from '@/lib/conversation/cue';
import { isSendable, type Message } from '@/lib/conversation/limits';
import { createThread, sendMessage } from '@/lib/conversation/backend';
import { copy } from '@/lib/ui/copy';

/**
 * The conversation layer. Knows nothing about rendering.
 *
 * It imports lib/emotion.ts and lib/ui/*, and nothing from lib/character/**. It does not know
 * whether a canvas, a still image, or nothing at all is on the other side of the seam - it hands
 * over one Emotion and one thinking flag, and never learns what happened to them
 * (contracts/emotion-seam.md).
 *
 * Everything here lives in memory for the length of one visit. Nothing is written to any persistent
 * store on the device or the server (FR-024).
 */

export type ConversationStatus =
  | 'connecting'
  | 'idle'
  | 'waiting'
  | 'streaming'
  | 'error'
  | 'limited';

export interface Conversation {
  messages: Message[];
  status: ConversationStatus;
  /** UUID assigned by POST /threads on page load (FR-043). Null until thread is ready. */
  threadId: string | null;
  /** The last value handed across the seam. */
  emotion: Emotion;
  /** True from send until the reply completes, fails, or times out (FR-021). */
  inFlight: boolean;
  /** Visitor-facing reason the panel and the live region both show (FR-004, FR-037). */
  notice: string | null;
  /**
   * The completed reply, for the one-shot announcement (FR-036). Announcer derives its message
   * from this rather than being handed it, so nothing needs clearing and no announcement is lost.
   */
  announcement: string | null;
  send(draft: string): void;
}

/**
 * How long a reply that has already begun may go silent before the client gives up on it.
 *
 * Not the same thing as FR-034's 20-second provider deadline, which covers a reply that never
 * starts. This one covers a reply that starts and then stops, and it is deliberately shorter: the
 * visitor is already looking at text, so the sooner they can act the better.
 */
const STALL_TIMEOUT_MS = 10_000;

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

/** Which visitor-facing sentence a failed response maps to. The body is never displayed (FR-030). */
function noticeForStatus(status: number): { notice: string; status: ConversationStatus } {
  if (status === 429) return { notice: copy.limited, status: 'limited' };
  if (status === 504) return { notice: copy.failedTimeout, status: 'error' };
  if (status === 400) return { notice: copy.failedSend, status: 'error' };
  return { notice: copy.failedGeneric, status: 'error' };
}

export function useConversation(): Conversation {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<ConversationStatus>('connecting');
  const [threadId, setThreadId] = useState<string | null>(null);
  const threadIdRef = useRef<string | null>(null);
  const [emotion, setEmotion] = useState<Emotion>(NEUTRAL);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  /**
   * The in-flight guard is a ref, not state, because two sends dispatched in the same tick would
   * both read the same stale state value and both proceed. FR-021 allows exactly one turn in
   * flight, and "exactly one" has to hold against a double-click, not just against a slow user.
   */
  const inFlightRef = useRef(false);
  const [inFlight, setInFlight] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<Message[]>([]);
  /** Set by the stall watchdog so the abort handler can tell a stall from an unmount. */
  const stalledRef = useRef(false);

  // Kept in step through an effect rather than assigned during render: the send handler and the
  // stall handler both need the latest log, and neither runs during render.
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Request a thread from the backend on mount (FR-043).
  // If thread creation fails, set status to 'error', show backendUnavailable notice,
  // and leave threadId as null (FR-045).
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const id = await createThread();
        if (!cancelled) {
          threadIdRef.current = id;
          setThreadId(id);
          setStatus('idle');
        }
      } catch {
        if (!cancelled) {
          threadIdRef.current = null;
          setThreadId(null);
          setStatus('error');
          setNotice(copy.backendUnavailable);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // A visitor who navigates away or reloads mid-reply abandons the request cleanly, so no further
  // work is charged to the demo's allowance (spec Edge Cases).
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const finish = useCallback((next: ConversationStatus, noticeText: string | null) => {
    inFlightRef.current = false;
    setInFlight(false);
    setStatus(next);
    setNotice(noticeText);
    abortRef.current = null;
  }, []);

  /** Mark the reply complete, hand the emotion across the seam, and announce it once. */
  const completeReply = useCallback(
    (replyId: string, text: string, emotion: Emotion) => {
      setMessages((current) => {
        const hasBubble = current.some((message) => message.id === replyId);
        const completed: Message = { id: replyId, author: 'character', text, status: 'complete' };
        return hasBubble
          ? current.map((message) => (message.id === replyId ? completed : message))
          : [...current, completed];
      });
      // The single value that crosses the seam (FR-020).
      setEmotion(emotion);
      // Announced once, whole, on completion - never progressively (FR-036).
      setAnnouncement(text);
      finish('idle', null);
    },
    [finish],
  );

  const send = useCallback(
    (draft: string) => {
      if (!isSendable(draft)) return;

      const currentThreadId = threadIdRef.current;
      // Refuse to send if thread creation hasn't completed or failed (FR-045).
      if (!currentThreadId) {
        setNotice(copy.backendUnavailable);
        return;
      }

      // Refused rather than queued, with the reason visible (FR-021).
      if (inFlightRef.current) {
        setNotice(copy.replyInProgress);
        return;
      }
      inFlightRef.current = true;
      setInFlight(true);

      const text = draft.trim();
      const visitorMessage: Message = {
        id: nextId('visitor'),
        author: 'visitor',
        text,
        status: 'complete',
      };
      const replyId = nextId('character');

      // The visitor's message and the waiting state land in the same update as the send, before any
      // request is made, so the visible response to a send is immediate (FR-015, SC-004).
      setMessages((current) => [...current, visitorMessage]);
      setStatus('waiting');
      setNotice(null);

      const controller = new AbortController();
      abortRef.current = controller;

      void (async () => {
        try {
          const response = await sendMessage(currentThreadId, text, controller.signal);

          if (!response.ok || !response.body) {
            const mapped = noticeForStatus(response.status);
            finish(mapped.status, mapped.notice);
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          const cue = createCueReader();
          let started = false;

          /**
           * The stall watchdog.
           *
           * FR-034 forbids the endpoint cutting off a reply that has already begun streaming, and it
           * is right to: the visitor is reading it. But a provider that sends three words and then
           * hangs forever would otherwise leave the turn in flight for the rest of the visit, while
           * the spec's edge case for a stalled reply says the partial text stays visible *and the
           * visitor can send again*. Nothing on the server can deliver that second half without
           * violating FR-034, so it belongs here.
           *
           * Every chunk resets the timer, so a slow-but-alive stream is never interrupted.
           */
          let stallTimer: ReturnType<typeof setTimeout> | undefined;
          const resetStallTimer = (): void => {
            clearTimeout(stallTimer);
            stallTimer = setTimeout(() => {
              stalledRef.current = true;
              controller.abort();
            }, STALL_TIMEOUT_MS);
          };

          try {
            resetStallTimer();

            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              resetStallTimer();

              const visible = cue.push(decoder.decode(value, { stream: true }));

              if (!started) {
                // First text has arrived: the thinking state ends here, not when the reply
                // completes (FR-010).
                started = true;
                setStatus('streaming');
                setMessages((current) => [
                  ...current,
                  { id: replyId, author: 'character', text: visible, status: 'streaming' },
                ]);
              } else {
                setMessages((current) =>
                  current.map((message) =>
                    message.id === replyId ? { ...message, text: visible } : message,
                  ),
                );
              }
            }
          } finally {
            clearTimeout(stallTimer);
          }

          const result = cue.end();

          if (result.isEmpty) {
            // Nothing to show. The partial bubble, if one was created, is removed rather than left
            // blank, and the character stays neutral (spec Edge Cases, FR-019).
            setMessages((current) => current.filter((message) => message.id !== replyId));
            setEmotion(NEUTRAL);
            finish('error', copy.failedEmpty);
            return;
          }

          completeReply(replyId, result.text, result.emotion);
        } catch (error) {
          const aborted = error instanceof DOMException && error.name === 'AbortError';

          if (aborted && stalledRef.current) {
            // A reply that started and then stopped. Nothing already shown is retracted: the partial
            // text stays exactly as the visitor last saw it, marked complete so it can travel onward
            // as history, and the turn ends so another send is possible (spec Edge Cases, FR-023).
            stalledRef.current = false;
            const partial = messagesRef.current.find((message) => message.id === replyId);
            if (partial && partial.text.trim().length > 0) {
              setMessages((current) =>
                current.map((message) =>
                  message.id === replyId ? { ...message, status: 'complete' } : message,
                ),
              );
              setEmotion(NEUTRAL);
              finish('error', copy.failedStalled);
              return;
            }
            finish('error', copy.failedTimeout);
            return;
          }

          if (aborted) {
            // Unmount or deliberate abandonment. Not a failure to report to anyone.
            inFlightRef.current = false;
            return;
          }

          finish('error', copy.failedGeneric);
        }
      })();
    },
    [finish, completeReply],
  );

  return {
    messages,
    status,
    threadId,
    emotion,
    inFlight,
    notice,
    announcement,
    send,
  };
}
