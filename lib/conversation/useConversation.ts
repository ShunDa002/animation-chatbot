'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NEUTRAL, type Emotion } from '@/lib/emotion';
import {
  isSendable,
  type InterruptDecision,
  type Message,
  type MessageStatus,
} from '@/lib/conversation/limits';
import {
  createStreamController,
  type StreamController,
} from '@/lib/conversation/stream-controller';
import {
  createThread,
  sendMessage,
  resumeChat,
  stopChat,
  fetchConversations,
  type ConversationSummary,
  fetchHistory,
  type HistoryMessageItem,
  getBackendUrl,
} from '@/lib/conversation/backend';
import {
  waitForBackendReady,
  BackendReadinessError,
} from '@/lib/conversation/backend-readiness';
import { copy } from '@/lib/ui/copy';

export {
  fetchConversations,
  type ConversationSummary,
  fetchHistory,
  type HistoryMessageItem,
};
export type { Message, MessageStatus, InterruptDecision } from '@/lib/conversation/limits';

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
  /** True once GET /health/ready has returned 200 OK during startup (FR-040). */
  isBackendReady: boolean;
  /** Restarts the full startup sequence (120s readiness -> 10s thread creation) (FR-041). */
  retryStartup: () => void;
  send(draft: string, model?: string): void;
  resume(
    decision: 'yes' | 'no' | InterruptDecision,
    interruptId?: string,
    targetMessageId?: string,
  ): Promise<void>;
  stop: () => Promise<void>;
  isHistoryLoading?: boolean;
  historyError?: string | null;
  loadHistory?: (threadId: string) => Promise<void>;
  retryHistory?: () => Promise<void>;
  startNewChat?: () => Promise<string | null>;
}

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

/** Which visitor-facing sentence a failed response maps to. The body is never displayed (FR-030). */
function noticeForStatus(status: number): {
  notice: string;
  status: ConversationStatus;
} {
  if (status === 429) return { notice: copy.limited, status: 'limited' };
  if (status === 504) return { notice: copy.failedTimeout, status: 'error' };
  if (status === 400) return { notice: copy.failedSend, status: 'error' };
  return { notice: copy.failedGeneric, status: 'error' };
}

export const STORAGE_KEY_THREAD = 'chat_thread_id';
export const STORAGE_KEY_MESSAGES = 'chat_messages';

function getInitialSession(): {
  messages: Message[];
  threadId: string | null;
  isRestored: boolean;
} {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const storedThread = sessionStorage.getItem(STORAGE_KEY_THREAD);
      const storedMessages = sessionStorage.getItem(STORAGE_KEY_MESSAGES);

      if (storedThread) {
        let messages: Message[] = [];
        if (storedMessages) {
          try {
            const parsed = JSON.parse(storedMessages);
            if (Array.isArray(parsed)) {
              const seenIds = new Set<string>();
              messages = parsed
                .map((m: Message) => {
                  let id = m.id;
                  if (!id || seenIds.has(id)) {
                    id = nextId(m.author || 'msg');
                  }
                  seenIds.add(id);
                  if (
                    m.author === 'character' &&
                    (!m.text || m.text.trim().length === 0) &&
                    (!m.toolCalls || m.toolCalls.length === 0)
                  ) {
                    return null;
                  }
                  if (m.status === 'streaming') {
                    return { ...m, id, status: 'interrupted' as const };
                  }
                  return { ...m, id };
                })
                .filter((m): m is Message => m !== null);
            }
          } catch {
            // Ignore parse errors
          }
        }
        return { messages, threadId: storedThread, isRestored: true };
      }
    }
  } catch {
    // Ignore sessionStorage access errors
  }
  return { messages: [], threadId: null, isRestored: false };
}

export function useConversation(): Conversation {
  const [initialSession] = useState(getInitialSession);
  const [messages, setMessages] = useState<Message[]>(initialSession.messages);
  const [status, setStatus] = useState<ConversationStatus>('connecting');
  const [threadId, setThreadId] = useState<string | null>(initialSession.threadId);
  const threadIdRef = useRef<string | null>(initialSession.threadId);
  const isRestoredRef = useRef(initialSession.isRestored);
  const [isBackendReady, setIsBackendReady] = useState(false);
  const [startupRetryTrigger, setStartupRetryTrigger] = useState(0);
  const startupControllerRef = useRef<AbortController | null>(null);

  const [emotion, setEmotion] = useState<Emotion>(NEUTRAL);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const activeHistoryThreadIdRef = useRef<string | null>(null);
  const isNewThreadUnsentRef = useRef(false);

  const inFlightRef = useRef(false);
  const [inFlight, setInFlight] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamControllerRef = useRef<StreamController | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const pendingTextRef = useRef<string | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const currentRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Two-phase startup on mount / retry (FR-017, FR-040, FR-041):
  // Phase 1: Poll GET /health/ready up to 120s with exponential backoff & jitter.
  // Phase 2: If no threadId was restored from sessionStorage, call POST /threads with a 10s timeout.
  useEffect(() => {
    const controller = new AbortController();
    startupControllerRef.current = controller;

    void (async () => {
      try {
        await waitForBackendReady({
          endpoint: `${getBackendUrl()}/health/ready`,
          signal: controller.signal,
          overallTimeoutMs: 120_000,
        });

        if (controller.signal.aborted) return;
        setIsBackendReady(true);

        // If thread was restored from sessionStorage, skip POST /threads and become ready immediately
        if (threadIdRef.current) {
          setStatus('idle');
          return;
        }

        // Phase 2: Create thread with 10s timeout (FR-017)
        const id = await createThread({
          signal: controller.signal,
          timeoutMs: 10_000,
        });

        if (controller.signal.aborted) return;
        threadIdRef.current = id;
        setThreadId(id);
        setStatus('idle');
        isRestoredRef.current = true;
        try {
          if (typeof window !== 'undefined' && window.sessionStorage) {
            sessionStorage.setItem(STORAGE_KEY_THREAD, id);
          }
        } catch {
          // Ignore sessionStorage access errors
        }
      } catch {
        if (controller.signal.aborted) return;
        setIsBackendReady(false);
        setStatus('error');
        setNotice(copy.backendUnavailable);
      }
    })();

    return () => {
      controller.abort();
      if (startupControllerRef.current === controller) {
        startupControllerRef.current = null;
      }
    };
  }, [startupRetryTrigger]);

  const retryStartup = useCallback(() => {
    if (startupControllerRef.current) {
      startupControllerRef.current.abort();
      startupControllerRef.current = null;
    }
    setIsBackendReady(false);
    setStatus('connecting');
    setNotice(null);
    setStartupRetryTrigger((prev) => prev + 1);
  }, []);

  // Sync messages or threadId to sessionStorage
  useEffect(() => {
    if (!isRestoredRef.current || !threadId) return;
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        sessionStorage.setItem(STORAGE_KEY_THREAD, threadId);
      }
    } catch {
      // Ignore
    }
  }, [threadId]);

  useEffect(() => {
    if (!isRestoredRef.current || !threadId) return;
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        sessionStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
      }
    } catch {
      // Ignore
    }
  }, [messages, threadId]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      streamControllerRef.current?.cancel();
      abortRef.current?.abort();
    };
  }, []);

  const finish = useCallback((next: ConversationStatus, noticeText: string | null) => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    pendingTextRef.current = null;
    currentRunIdRef.current = null;
    inFlightRef.current = false;
    setInFlight(false);
    setStatus(next);
    setNotice(noticeText);
    abortRef.current = null;
    streamControllerRef.current = null;

    setMessages((current) =>
      current.filter(
        (m) =>
          !(
            m.author === 'character' &&
            m.status === 'streaming' &&
            (!m.text || m.text.trim().length === 0) &&
            (!m.toolCalls || m.toolCalls.length === 0)
          ),
      ),
    );
  }, []);

  const completeReply = useCallback(
    (replyId: string, text: string, emotion: Emotion) => {
      setMessages((current) => {
        const hasBubble = current.some((message) => message.id === replyId);
        return hasBubble
          ? current.map((message) =>
            message.id === replyId
              ? { ...message, text, status: 'completed', interruptId: undefined }
              : message,
          )
          : [...current, { id: replyId, author: 'character', text, status: 'completed' }];
      });
      setEmotion(emotion);
      setAnnouncement(text);
      finish('idle', null);
    },
    [finish],
  );

  const send = useCallback(
    (draft: string, model?: string) => {
      if (!isSendable(draft)) return;

      const currentThreadId = threadIdRef.current;
      if (!currentThreadId) {
        setNotice(copy.backendUnavailable);
        return;
      }

      if (inFlightRef.current) {
        setNotice(copy.replyInProgress);
        return;
      }
      inFlightRef.current = true;
      setInFlight(true);

      const text = draft.trim();

      if (isNewThreadUnsentRef.current && currentThreadId) {
        isNewThreadUnsentRef.current = false;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('chat:new-conversation', {
              detail: {
                id: currentThreadId,
                threadId: currentThreadId,
                title: text.slice(0, 30) || 'New Conversation',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            }),
          );
        }
      }

      const visitorMessage: Message = {
        id: nextId('visitor'),
        author: 'visitor',
        text,
        status: 'completed',
      };
      const replyId = nextId('character');

      setMessages((current) => {
        const cleaned = current.filter(
          (m) =>
            !(
              m.author === 'character' &&
              (!m.text || m.text.trim().length === 0) &&
              (!m.toolCalls || m.toolCalls.length === 0)
            ),
        );
        return [...cleaned, visitorMessage];
      });
      setStatus('waiting');
      setNotice(null);

      const controller = new AbortController();
      abortRef.current = controller;

      void (async () => {
        try {
          const response = await sendMessage(currentThreadId, text, controller.signal, model);

          if (!response.ok || !response.body) {
            const mapped = noticeForStatus(response.status);
            finish(mapped.status, mapped.notice);
            return;
          }

          const headerRunId = response.headers.get('x-chat-run-id');
          if (headerRunId) {
            currentRunIdRef.current = headerRunId;
          }

          const reader = response.body.getReader();
          const requestId = nextId('req');
          currentRequestIdRef.current = requestId;

          const streamController = createStreamController({
            requestId,
            onStart: (event, reqId) => {
              if (reqId && reqId !== currentRequestIdRef.current) return;
              if (event.run_id) {
                currentRunIdRef.current = event.run_id;
              }
            },
            onStatus: (nextStatus, reqId) => {
              if (reqId && reqId !== currentRequestIdRef.current) return;
              if (nextStatus === 'streaming') {
                setStatus('streaming');
                setMessages((current) => {
                  const hasBubble = current.some((message) => message.id === replyId);
                  return hasBubble
                    ? current.map((message) =>
                      message.id === replyId ? { ...message, status: 'streaming' } : message,
                    )
                    : [...current, { id: replyId, author: 'character', text: '', status: 'streaming' }];
                });
              }
            },
            onText: (visible, reqId) => {
              if (reqId && reqId !== currentRequestIdRef.current) return;
              setStatus('streaming');
              pendingTextRef.current = visible;
              if (typeof requestAnimationFrame === 'function') {
                if (rafIdRef.current === null) {
                  rafIdRef.current = requestAnimationFrame(() => {
                    rafIdRef.current = null;
                    const latest = pendingTextRef.current;
                    if (latest !== null) {
                      setMessages((current) => {
                        const hasBubble = current.some((message) => message.id === replyId);
                        return hasBubble
                          ? current.map((message) =>
                            message.id === replyId ? { ...message, text: latest } : message,
                          )
                          : [...current, { id: replyId, author: 'character', text: latest, status: 'streaming' }];
                      });
                    }
                  });
                }
              } else {
                setMessages((current) => {
                  const hasBubble = current.some((message) => message.id === replyId);
                  return hasBubble
                    ? current.map((message) =>
                      message.id === replyId ? { ...message, text: visible } : message,
                    )
                    : [...current, { id: replyId, author: 'character', text: visible, status: 'streaming' }];
                });
              }
            },
            onComplete: (completedText, emotion, _metrics, reqId) => {
              if (reqId && reqId !== currentRequestIdRef.current) return;
              if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
              }
              pendingTextRef.current = null;
              if (completedText.trim().length === 0) {
                let hadToolCalls = false;
                setMessages((current) => {
                  const target = current.find((message) => message.id === replyId);
                  if (target?.toolCalls && target.toolCalls.length > 0) {
                    hadToolCalls = true;
                    return current.map((message) =>
                      message.id === replyId ? { ...message, text: '', status: 'completed' } : message,
                    );
                  }
                  return current.filter((message) => message.id !== replyId);
                });
                if (hadToolCalls) {
                  setEmotion(emotion);
                  finish('idle', null);
                  return;
                }
                setEmotion(NEUTRAL);
                finish('error', copy.failedEmpty);
                return;
              }
              completeReply(replyId, completedText, emotion);
            },
            onError: (errorMessage, partialText, emotion, _metrics, reqId) => {
              if (reqId && reqId !== currentRequestIdRef.current) return;
              if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
              }
              pendingTextRef.current = null;
              if (partialText.trim().length > 0) {
                setMessages((current) =>
                  current.map((message) =>
                    message.id === replyId ? { ...message, text: partialText, status: 'error' } : message,
                  ),
                );
              } else {
                setMessages((current) => current.filter((message) => message.id !== replyId));
              }
              setEmotion(emotion);
              finish('error', errorMessage || copy.failedGeneric);
            },
            onInterrupt: (interruptEvent, partialText, emotion, _metrics, reqId) => {
              if (reqId && reqId !== currentRequestIdRef.current) return;
              if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
              }
              pendingTextRef.current = null;

              const promptVal = interruptEvent.value;
              const interruptPrompt =
                typeof promptVal === 'string'
                  ? promptVal
                  : typeof promptVal === 'object' && promptVal !== null
                    ? (promptVal as Record<string, unknown>).message?.toString() ||
                    (promptVal as Record<string, unknown>).question?.toString() ||
                    JSON.stringify(promptVal)
                    : '';

              const displayText = partialText.trim().length > 0 ? partialText : interruptPrompt;

              setMessages((current) => {
                const hasBubble = current.some((message) => message.id === replyId);
                return hasBubble
                  ? current.map((message) =>
                    message.id === replyId
                      ? {
                        ...message,
                        text: displayText,
                        status: 'interrupted',
                        interruptId: interruptEvent.interrupt_id,
                      }
                      : message,
                  )
                  : [
                    ...current,
                    {
                      id: replyId,
                      author: 'character',
                      text: displayText,
                      status: 'interrupted',
                      interruptId: interruptEvent.interrupt_id,
                    },
                  ];
              });

              setEmotion(emotion);
              finish('idle', null);
            },
            onInterrupted: (partialText, emotion, _metrics, reqId) => {
              if (reqId && reqId !== currentRequestIdRef.current) return;
              if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
              }
              pendingTextRef.current = null;
              if (partialText.trim().length > 0) {
                setMessages((current) =>
                  current.map((message) =>
                    message.id === replyId ? { ...message, text: partialText, status: 'interrupted' } : message,
                  ),
                );
                setEmotion(emotion);
                finish('error', copy.failedStalled);
              } else {
                let hadToolCalls = false;
                setMessages((current) => {
                  const target = current.find((message) => message.id === replyId);
                  if (target?.toolCalls && target.toolCalls.length > 0) {
                    hadToolCalls = true;
                    return current.map((message) =>
                      message.id === replyId ? { ...message, text: '', status: 'interrupted' } : message,
                    );
                  }
                  return current.filter((message) => message.id !== replyId);
                });
                if (hadToolCalls) {
                  setEmotion(emotion);
                  finish('idle', null);
                  return;
                }
                setEmotion(NEUTRAL);
                finish('error', copy.failedEmpty);
              }
            },
            onCancelled: (partialText, emotion, metrics, reqId) => {
              if (reqId && reqId !== currentRequestIdRef.current) return;
              if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
              }
              pendingTextRef.current = null;
              if (metrics.outcome === 'stalled') {
                if (partialText.trim().length > 0) {
                  setMessages((current) =>
                    current.map((message) =>
                      message.id === replyId ? { ...message, text: partialText, status: 'interrupted' } : message,
                    ),
                  );
                  setEmotion(NEUTRAL);
                  finish('error', copy.failedStalled);
                  return;
                }
                let hadToolCalls = false;
                setMessages((current) => {
                  const target = current.find((message) => message.id === replyId);
                  if (target?.toolCalls && target.toolCalls.length > 0) {
                    hadToolCalls = true;
                    return current.map((message) =>
                      message.id === replyId ? { ...message, text: '', status: 'interrupted' } : message,
                    );
                  }
                  return current.filter((message) => message.id !== replyId);
                });
                if (hadToolCalls) {
                  setEmotion(NEUTRAL);
                  finish('idle', null);
                  return;
                }
                finish('error', copy.failedTimeout);
                return;
              }
              if (partialText.trim().length > 0) {
                setMessages((current) =>
                  current.map((message) =>
                    message.id === replyId ? { ...message, text: partialText, status: 'cancelled' } : message,
                  ),
                );
              } else {
                setMessages((current) => current.filter((message) => message.id !== replyId));
              }
              setEmotion(emotion);
              finish('idle', null);
            },
            onToolUpdate: (toolCalls, reqId) => {
              if (reqId && reqId !== currentRequestIdRef.current) return;
              setMessages((current) => {
                const hasBubble = current.some((message) => message.id === replyId);
                return hasBubble
                  ? current.map((message) =>
                    message.id === replyId ? { ...message, toolCalls } : message,
                  )
                  : [...current, { id: replyId, author: 'character', text: '', status: 'streaming', toolCalls }];
              });
            },
          });
          streamControllerRef.current = streamController;

          for (; ;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              streamController.processChunk(value);
            }
          }
          streamController.end();
        } catch (error) {
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
          const aborted = error instanceof DOMException && error.name === 'AbortError';
          if (aborted) {
            inFlightRef.current = false;
            return;
          }

          setMessages((current) => {
            const target = current.find((message) => message.id === replyId);
            if (target && target.text && target.text.trim().length > 0) {
              return current.map((message) =>
                message.id === replyId ? { ...message, status: 'error' } : message,
              );
            }
            if (target?.toolCalls && target.toolCalls.length > 0) {
              return current.map((message) =>
                message.id === replyId ? { ...message, status: 'error' } : message,
              );
            }
            return current.filter((message) => message.id !== replyId);
          });

          finish('error', copy.failedGeneric);
        }
      })();
    },
    [finish, completeReply],
  );

  const resume = useCallback(
    async (decision: 'yes' | 'no' | InterruptDecision, interruptId?: string, targetMessageId?: string) => {
      const currentThreadId = threadIdRef.current;
      if (!currentThreadId) {
        throw new Error('Thread unavailable');
      }

      inFlightRef.current = true;
      setInFlight(true);
      setStatus('streaming');
      setNotice(null);

      const targetMsg =
        (targetMessageId && messagesRef.current.find((m) => m.id === targetMessageId)) ||
        messagesRef.current.find((m) => m.status === 'interrupted');
      const replyId = targetMsg?.id || nextId('character');
      const effectiveInterruptId = interruptId || targetMsg?.interruptId;

      setMessages((current) =>
        current.map((message) =>
          message.id === replyId
            ? { ...message, interruptDecision: decision }
            : message,
        ),
      );

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await resumeChat(currentThreadId, decision, effectiveInterruptId, controller.signal);

        if (!response.ok || !response.body) {
          const mapped = noticeForStatus(response.status);
          finish(mapped.status, mapped.notice);
          throw new Error(`Resume failed with status ${response.status}`);
        }

        const headerRunId = response.headers.get('x-chat-run-id');
        if (headerRunId) {
          currentRunIdRef.current = headerRunId;
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          setMessages((current) =>
            current.map((message) =>
              message.id === replyId
                ? { ...message, status: 'completed', interruptDecision: decision, interruptId: undefined }
                : message,
            ),
          );
          finish('idle', null);
          return;
        }

        const reader = response.body.getReader();
        const requestId = nextId('req');
        currentRequestIdRef.current = requestId;

        const streamController = createStreamController({
          requestId,
          initialToolCalls: targetMsg?.toolCalls,
          onStart: (event, reqId) => {
            if (reqId && reqId !== currentRequestIdRef.current) return;
            if (event.run_id) {
              currentRunIdRef.current = event.run_id;
            }
          },
          onStatus: (nextStatus, reqId) => {
            if (reqId && reqId !== currentRequestIdRef.current) return;
            if (nextStatus === 'streaming') {
              setStatus('streaming');
            }
          },
          onText: (visible, reqId) => {
            if (reqId && reqId !== currentRequestIdRef.current) return;
            setStatus('streaming');
            pendingTextRef.current = visible;
            setMessages((current) =>
              current.map((message) =>
                message.id === replyId ? { ...message, text: visible, status: 'streaming' } : message,
              ),
            );
          },
          onComplete: (completedText, emotion, _metrics, reqId) => {
            if (reqId && reqId !== currentRequestIdRef.current) return;
            pendingTextRef.current = null;
            completeReply(replyId, completedText, emotion);
          },
          onError: (errorMessage, partialText, emotion, _metrics, reqId) => {
            if (reqId && reqId !== currentRequestIdRef.current) return;
            pendingTextRef.current = null;
            if (partialText.trim().length > 0) {
              setMessages((current) =>
                current.map((message) =>
                  message.id === replyId ? { ...message, text: partialText, status: 'error' } : message,
                ),
              );
            }
            setEmotion(emotion);
            finish('error', errorMessage || copy.failedGeneric);
          },
          onInterrupt: (interruptEvent, partialText, emotion, _metrics, reqId) => {
            if (reqId && reqId !== currentRequestIdRef.current) return;
            pendingTextRef.current = null;
            const promptVal = interruptEvent.value;
            const interruptPrompt =
              typeof promptVal === 'string'
                ? promptVal
                : typeof promptVal === 'object' && promptVal !== null
                  ? (promptVal as Record<string, unknown>).message?.toString() ||
                  (promptVal as Record<string, unknown>).question?.toString() ||
                  JSON.stringify(promptVal)
                  : '';
            const displayText = partialText.trim().length > 0 ? partialText : interruptPrompt;
            setMessages((current) =>
              current.map((message) =>
                message.id === replyId
                  ? {
                    ...message,
                    text: displayText,
                    status: 'interrupted',
                    interruptId: interruptEvent.interrupt_id,
                  }
                  : message,
              ),
            );
            setEmotion(emotion);
            finish('idle', null);
          },
          onInterrupted: (partialText, emotion, _metrics, reqId) => {
            if (reqId && reqId !== currentRequestIdRef.current) return;
            pendingTextRef.current = null;
            if (partialText.trim().length > 0) {
              setMessages((current) =>
                current.map((message) =>
                  message.id === replyId ? { ...message, text: partialText, status: 'interrupted' } : message,
                ),
              );
              setEmotion(emotion);
              finish('error', copy.failedStalled);
            } else {
              setEmotion(NEUTRAL);
              finish('error', copy.failedEmpty);
            }
          },
          onCancelled: (partialText, emotion, _metrics, reqId) => {
            if (reqId && reqId !== currentRequestIdRef.current) return;
            pendingTextRef.current = null;
            if (partialText.trim().length > 0) {
              setMessages((current) =>
                current.map((message) =>
                  message.id === replyId ? { ...message, text: partialText, status: 'cancelled' } : message,
                ),
              );
            } else {
              setMessages((current) => current.filter((message) => message.id !== replyId));
            }
            setEmotion(emotion);
            finish('idle', null);
          },
          onToolUpdate: (toolCalls, reqId) => {
            if (reqId && reqId !== currentRequestIdRef.current) return;
            setMessages((current) =>
              current.map((message) =>
                message.id === replyId ? { ...message, toolCalls } : message,
              ),
            );
          },
        });

        for (; ;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            streamController.processChunk(value);
          }
        }
        streamController.end();
      } catch (error) {
        setMessages((current) =>
          current.map((message) =>
            message.id === replyId ? { ...message, interruptDecision: undefined } : message,
          ),
        );
        finish('idle', null);
        throw error;
      }
    },
    [completeReply, finish],
  );

  const stop = useCallback(async () => {
    const currentThreadId = threadIdRef.current;
    const currentRunId = currentRunIdRef.current;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    pendingTextRef.current = null;
    abortRef.current?.abort();
    streamControllerRef.current?.cancel('user_stopped');

    setMessages((current) =>
      current.map((message) =>
        message.status === 'streaming'
          ? { ...message, status: 'cancelled' }
          : message,
      ),
    );
    finish('idle', null);

    if (currentThreadId) {
      try {
        await stopChat(currentThreadId, currentRunId);
      } catch {
        // Local cancellation succeeded; network failure ignored (FR-026, spec Edge Cases).
      }
    }
  }, [finish]);

  const loadHistory = useCallback(
    async (targetThreadId: string) => {
      if (!targetThreadId) return;

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingTextRef.current = null;
      abortRef.current?.abort();
      streamControllerRef.current?.cancel('user_navigated');

      activeHistoryThreadIdRef.current = targetThreadId;
      setIsHistoryLoading(true);
      setHistoryError(null);
      setMessages([]);

      try {
        const historyItems = await fetchHistory(targetThreadId);

        if (activeHistoryThreadIdRef.current !== targetThreadId) {
          return;
        }

        const mappedMessages: Message[] = historyItems.map((item) => {
          const author = item.author === 'visitor' || item.author === 'user' ? 'visitor' : 'character';
          let toolCalls;
          if (typeof item.toolCalls === 'string') {
            try {
              const parsed = JSON.parse(item.toolCalls);
              if (Array.isArray(parsed)) toolCalls = parsed;
            } catch {
              // Ignore
            }
          } else if (Array.isArray(item.toolCalls)) {
            toolCalls = item.toolCalls;
          }

          const validStatus: MessageStatus =
            ['interrupted', 'cancelled', 'error', 'streaming', 'pending'].includes(item.status || '')
              ? (item.status as MessageStatus)
              : 'completed';

          return {
            id: item.id || nextId(author),
            author,
            text: item.text || '',
            status: validStatus,
            toolCalls,
            interruptId: item.interruptId || undefined,
            interruptDecision:
              item.interruptDecision === 'yes' || item.interruptDecision === 'no'
                ? item.interruptDecision
                : undefined,
          };
        });

        setMessages(mappedMessages);
        setThreadId(targetThreadId);
        threadIdRef.current = targetThreadId;
        isRestoredRef.current = true;
        setStatus('idle');
        inFlightRef.current = false;
        setIsHistoryLoading(false);
        setHistoryError(null);

        try {
          if (typeof window !== 'undefined' && window.sessionStorage) {
            sessionStorage.setItem(STORAGE_KEY_THREAD, targetThreadId);
            sessionStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(mappedMessages));
          }
        } catch {
          // Ignore
        }
      } catch (error) {
        if (activeHistoryThreadIdRef.current !== targetThreadId) {
          return;
        }
        setHistoryError(error instanceof Error ? error.message : 'Failed to load conversation history.');
        setIsHistoryLoading(false);
      }
    },
    [],
  );

  const startNewChat = useCallback(async () => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    pendingTextRef.current = null;
    abortRef.current?.abort();
    streamControllerRef.current?.cancel('user_navigated');

    activeHistoryThreadIdRef.current = null;
    setIsHistoryLoading(true);
    setHistoryError(null);
    setMessages([]);
    setThreadId(null);
    threadIdRef.current = null;

    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        sessionStorage.removeItem(STORAGE_KEY_THREAD);
        sessionStorage.removeItem(STORAGE_KEY_MESSAGES);
      }
    } catch {
      // Ignore
    }

    try {
      const newId = await createThread();
      threadIdRef.current = newId;
      setThreadId(newId);
      isNewThreadUnsentRef.current = true;
      isRestoredRef.current = true;
      setStatus('idle');
      inFlightRef.current = false;
      setIsHistoryLoading(false);
      setHistoryError(null);

      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          sessionStorage.setItem(STORAGE_KEY_THREAD, newId);
        }
      } catch {
        // Ignore
      }

      return newId;
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : 'Failed to initialize new conversation. Please try again.',
      );
      setIsHistoryLoading(false);
      return null;
    }
  }, []);

  const retryHistory = useCallback(async () => {
    if (activeHistoryThreadIdRef.current) {
      await loadHistory(activeHistoryThreadIdRef.current);
    } else {
      await startNewChat();
    }
  }, [loadHistory, startNewChat]);

  return {
    messages,
    status,
    threadId,
    emotion,
    inFlight,
    notice,
    announcement,
    isBackendReady,
    retryStartup,
    send,
    resume,
    stop,
    isHistoryLoading,
    historyError,
    loadHistory,
    retryHistory,
    startNewChat,
  };
}
