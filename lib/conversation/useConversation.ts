'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NEUTRAL, type Emotion } from '@/lib/emotion';
import {
  isSendable,
  type InterruptDecision,
  type Message,
  type MessageStatus,
} from '@/lib/conversation/limits';
import type { ConversationStatus } from '@/lib/conversation/types';
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
} from '@/lib/conversation/backend';
import { copy } from '@/lib/ui/copy';

export {
  fetchConversations,
  type ConversationSummary,
  fetchHistory,
  type HistoryMessageItem,
};
export type { ConversationStatus } from '@/lib/conversation/types';

export interface Conversation {
  messages: Message[];
  status: ConversationStatus;
  threadId: string | null;
  emotion: Emotion;
  inFlight: boolean;
  notice: string | null;
  announcement: string | null;
  send(draft: string, model?: string): void;
  resume(
    decision: InterruptDecision,
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
  status: ConversationStatus;
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
                  if (!id || seenIds.has(id)) id = nextId(m.author || 'msg');
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
            // Ignore malformed session data.
          }
        }
        return { messages, threadId: storedThread, status: 'idle', isRestored: true };
      }
    }
  } catch {
    // Ignore sessionStorage access errors.
  }
  return { messages: [], threadId: null, status: 'connecting', isRestored: false };
}

export function useConversation(): Conversation {
  const [initialSession] = useState(getInitialSession);
  const [messages, setMessages] = useState<Message[]>(initialSession.messages);
  const [status, setStatus] = useState<ConversationStatus>(initialSession.status);
  const [threadId, setThreadId] = useState<string | null>(initialSession.threadId);
  const threadIdRef = useRef<string | null>(initialSession.threadId);
  const isRestoredRef = useRef(initialSession.isRestored);
  const [emotion, setEmotion] = useState<Emotion>(NEUTRAL);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    if (threadIdRef.current) return;

    void (async () => {
      try {
        const id = await createThread();
        if (!cancelled) {
          threadIdRef.current = id;
          setThreadId(id);
          setStatus('idle');
          isRestoredRef.current = true;
          try {
            sessionStorage.setItem(STORAGE_KEY_THREAD, id);
          } catch { }
        }
      } catch {
        if (!cancelled) {
          threadIdRef.current = null;
          setThreadId(null);
          setStatus('error');
          setNotice(copy.backendUnavailable);
          isRestoredRef.current = true;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isRestoredRef.current || !threadId) return;
    try {
      sessionStorage.setItem(STORAGE_KEY_THREAD, threadId);
    } catch { }
  }, [threadId]);

  useEffect(() => {
    if (!isRestoredRef.current || !threadId) return;
    try {
      sessionStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
    } catch { }
  }, [messages, threadId]);

  useEffect(() => () => {
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    streamControllerRef.current?.cancel();
    abortRef.current?.abort();
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
    (replyId: string, text: string, nextEmotion: Emotion) => {
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
      setEmotion(nextEmotion);
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

      if (isNewThreadUnsentRef.current) {
        isNewThreadUnsentRef.current = false;
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

      const visitorMessage: Message = {
        id: nextId('visitor'),
        author: 'visitor',
        text,
        status: 'completed',
      };
      const replyId = nextId('character');
      setMessages((current) => [
        ...current.filter(
          (m) =>
            !(
              m.author === 'character' &&
              (!m.text || m.text.trim().length === 0) &&
              (!m.toolCalls || m.toolCalls.length === 0)
            ),
        ),
        visitorMessage,
      ]);
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
          currentRunIdRef.current = response.headers.get('x-chat-run-id');
          const reader = response.body.getReader();
          const requestId = nextId('req');
          currentRequestIdRef.current = requestId;
          const streamController = createStreamController({
            requestId,
            onStart: (event, reqId) => {
              if (reqId && reqId !== currentRequestIdRef.current) return;
              if (event.run_id) currentRunIdRef.current = event.run_id;
            },
            onStatus: (nextStatus, reqId) => {
              if (reqId && reqId !== currentRequestIdRef.current) return;
              if (nextStatus !== 'streaming') return;
              setStatus('streaming');
              setMessages((current) =>
                current.some((message) => message.id === replyId)
                  ? current.map((message) =>
                    message.id === replyId ? { ...message, status: 'streaming' } : message,
                  )
                  : [...current, { id: replyId, author: 'character', text: '', status: 'streaming' }],
              );
            },
            onText: (visible, reqId) => {
              if (reqId && reqId !== currentRequestIdRef.current) return;
              setStatus('streaming');
              pendingTextRef.current = visible;
              const update = () => {
                const latest = pendingTextRef.current;
                if (latest === null) return;
                setMessages((current) =>
                  current.some((message) => message.id === replyId)
                    ? current.map((message) =>
                      message.id === replyId ? { ...message, text: latest } : message,
                    )
                    : [...current, { id: replyId, author: 'character', text: latest, status: 'streaming' }],
                );
              };
              if (typeof requestAnimationFrame === 'function') {
                if (rafIdRef.current === null) {
                  rafIdRef.current = requestAnimationFrame(() => {
                    rafIdRef.current = null;
                    update();
                  });
                }
              } else update();
            },
            onComplete: (completedText, nextEmotion, _metrics, reqId) => {
              if (reqId && reqId !== currentRequestIdRef.current) return;
              pendingTextRef.current = null;
              if (!completedText.trim()) {
                const hadToolCalls = messagesRef.current.some(
                  (message) => message.id === replyId && message.toolCalls?.length,
                );
                if (hadToolCalls) {
                  setMessages((current) =>
                    current.map((message) =>
                      message.id === replyId ? { ...message, text: '', status: 'completed' } : message,
                    ),
                  );
                  setEmotion(nextEmotion);
                  finish('idle', null);
                } else {
                  setMessages((current) => current.filter((message) => message.id !== replyId));
                  setEmotion(NEUTRAL);
                  finish('error', copy.failedEmpty);
                }
                return;
              }
              completeReply(replyId, completedText, nextEmotion);
            },
            onError: (errorMessage, partialText, nextEmotion, _metrics, reqId) => {
              if (reqId && reqId !== currentRequestIdRef.current) return;
              setMessages((current) =>
                partialText.trim()
                  ? current.map((message) =>
                    message.id === replyId
                      ? { ...message, text: partialText, status: 'error' }
                      : message,
                  )
                  : current.filter((message) => message.id !== replyId),
              );
              setEmotion(nextEmotion);
              finish('error', errorMessage || copy.failedGeneric);
            },
            onInterrupt: (event, partialText, nextEmotion, _metrics, reqId) => {
              if (reqId && reqId !== currentRequestIdRef.current) return;
              const value = event.value;
              const prompt =
                typeof value === 'string'
                  ? value
                  : typeof value === 'object' && value !== null
                    ? (value as Record<string, unknown>).message?.toString() ||
                    (value as Record<string, unknown>).question?.toString() ||
                    JSON.stringify(value)
                    : '';
              const displayText = partialText.trim() || prompt;
              setMessages((current) =>
                current.some((message) => message.id === replyId)
                  ? current.map((message) =>
                    message.id === replyId
                      ? { ...message, text: displayText, status: 'interrupted', interruptId: event.interrupt_id }
                      : message,
                  )
                  : [...current, { id: replyId, author: 'character', text: displayText, status: 'interrupted', interruptId: event.interrupt_id }],
              );
              setEmotion(nextEmotion);
              finish('idle', null);
            },
            onInterrupted: (partialText, nextEmotion, _metrics, reqId) => {
              if (reqId && reqId !== currentRequestIdRef.current) return;

              if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
              }

              pendingTextRef.current = null;

              if (partialText.trim().length > 0) {
                setMessages((current) =>
                  current.map((message) =>
                    message.id === replyId
                      ? {
                        ...message,
                        text: partialText,
                        status: 'interrupted',
                      }
                      : message,
                  ),
                );

                setEmotion(nextEmotion);
                finish('error', copy.failedStalled);
                return;
              }

              let hadToolCalls = false;

              setMessages((current) => {
                const target = current.find(
                  (message) => message.id === replyId,
                );

                if (target?.toolCalls && target.toolCalls.length > 0) {
                  hadToolCalls = true;

                  return current.map((message) =>
                    message.id === replyId
                      ? {
                        ...message,
                        text: '',
                        status: 'interrupted',
                      }
                      : message,
                  );
                }

                return current.filter(
                  (message) => message.id !== replyId,
                );
              });

              if (hadToolCalls) {
                setEmotion(nextEmotion);
                finish('idle', null);
                return;
              }

              setEmotion(NEUTRAL);
              finish('error', copy.failedEmpty);
            },
            onCancelled: (partialText, nextEmotion, metrics, reqId) => {
              if (reqId && reqId !== currentRequestIdRef.current) return;
              setMessages((current) =>
                partialText.trim()
                  ? current.map((message) =>
                    message.id === replyId
                      ? { ...message, text: partialText, status: metrics.outcome === 'stalled' ? 'interrupted' : 'cancelled' }
                      : message,
                  )
                  : current.filter((message) => message.id !== replyId),
              );
              setEmotion(metrics.outcome === 'stalled' ? NEUTRAL : nextEmotion);
              finish(metrics.outcome === 'stalled' ? 'error' : 'idle', metrics.outcome === 'stalled' ? copy.failedTimeout : null);
            },
            onToolUpdate: (toolCalls, reqId) => {
              if (reqId && reqId !== currentRequestIdRef.current) return;
              setMessages((current) =>
                current.some((message) => message.id === replyId)
                  ? current.map((message) => message.id === replyId ? { ...message, toolCalls } : message)
                  : [...current, { id: replyId, author: 'character', text: '', status: 'streaming', toolCalls }],
              );
            },
          });
          streamControllerRef.current = streamController;
          for (; ;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) streamController.processChunk(value);
          }
          streamController.end();
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            inFlightRef.current = false;
            return;
          }
          setMessages((current) =>
            current.filter((message) =>
              message.id !== replyId || Boolean(message.text.trim() || message.toolCalls?.length),
            ),
          );
          finish('error', copy.failedGeneric);
        }
      })();
    },
    [completeReply, finish],
  );

  const resume = useCallback(
    async (decision: InterruptDecision, interruptId?: string, targetMessageId?: string) => {
      const currentThreadId = threadIdRef.current;
      if (!currentThreadId) throw new Error('Thread unavailable');
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
          message.id === replyId ? { ...message, interruptDecision: decision } : message,
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
        currentRunIdRef.current = response.headers.get('x-chat-run-id');
        if ((response.headers.get('content-type') || '').includes('application/json')) {
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
            if (event.run_id) currentRunIdRef.current = event.run_id;
          },
          onStatus: (nextStatus, reqId) => {
            if ((!reqId || reqId === currentRequestIdRef.current) && nextStatus === 'streaming') setStatus('streaming');
          },
          onText: (visible, reqId) => {
            if (reqId && reqId !== currentRequestIdRef.current) return;
            setMessages((current) => current.map((message) => message.id === replyId ? { ...message, text: visible, status: 'streaming' } : message));
          },
          onComplete: (text, nextEmotion, _metrics, reqId) => {
            if (reqId && reqId !== currentRequestIdRef.current) return;
            completeReply(replyId, text, nextEmotion);
          },
          onError: (errorMessage, partialText, nextEmotion, _metrics, reqId) => {
            if (reqId && reqId !== currentRequestIdRef.current) return;
            if (partialText.trim()) setMessages((current) => current.map((message) => message.id === replyId ? { ...message, text: partialText, status: 'error' } : message));
            setEmotion(nextEmotion);
            finish('error', errorMessage || copy.failedGeneric);
          },
          onInterrupt: (event, partialText, nextEmotion, _metrics, reqId) => {
            if (reqId && reqId !== currentRequestIdRef.current) return;
            const value = event.value;
            const prompt = typeof value === 'string' ? value : typeof value === 'object' && value !== null ? (value as Record<string, unknown>).message?.toString() || (value as Record<string, unknown>).question?.toString() || JSON.stringify(value) : '';
            setMessages((current) => current.map((message) => message.id === replyId ? { ...message, text: partialText.trim() || prompt, status: 'interrupted', interruptId: event.interrupt_id } : message));
            setEmotion(nextEmotion);
            finish('idle', null);
          },
          onInterrupted: (partialText, nextEmotion, _metrics, reqId) => {
            if (reqId && reqId !== currentRequestIdRef.current) return;
            setMessages((current) => current.map((message) => message.id === replyId ? { ...message, text: partialText || message.text, status: 'interrupted' } : message));
            setEmotion(nextEmotion);
            finish('idle', null);
          },
          onToolUpdate: (toolCalls, reqId) => {
            if (reqId && reqId !== currentRequestIdRef.current) return;
            setMessages((current) => current.map((message) => message.id === replyId ? { ...message, toolCalls } : message));
          },
          onCancelled: (partialText, nextEmotion, _metrics, reqId) => {
            if (reqId && reqId !== currentRequestIdRef.current) return;
            if (partialText.trim()) setMessages((current) => current.map((message) => message.id === replyId ? { ...message, text: partialText, status: 'cancelled' } : message));
            setEmotion(nextEmotion);
            finish('idle', null);
          },
        });
        streamControllerRef.current = streamController;
        for (; ;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) streamController.processChunk(value);
        }
        streamController.end();
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          inFlightRef.current = false;
          return;
        }
        setMessages((current) => current.map((message) => message.id === replyId ? { ...message, status: 'interrupted', interruptDecision: undefined } : message));
        finish('idle', null);
        throw error;
      }
    },
    [completeReply, finish],
  );

  const stop = useCallback(async () => {
    const currentThreadId = threadIdRef.current;
    const currentRunId = currentRunIdRef.current;
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
    pendingTextRef.current = null;
    abortRef.current?.abort();
    streamControllerRef.current?.cancel('user_stopped');
    setMessages((current) => current.map((message) => message.status === 'streaming' ? { ...message, status: 'cancelled' } : message));
    finish('idle', null);
    if (currentThreadId) {
      try { await stopChat(currentThreadId, currentRunId); } catch { }
    }
  }, [finish]);

  const loadHistory = useCallback(async (targetThreadId: string) => {
    if (!targetThreadId) return;
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
    pendingTextRef.current = null;
    abortRef.current?.abort();
    streamControllerRef.current?.cancel('user_navigated');
    activeHistoryThreadIdRef.current = targetThreadId;
    setIsHistoryLoading(true);
    setHistoryError(null);
    setMessages([]);
    try {
      const historyItems = await fetchHistory(targetThreadId);
      if (activeHistoryThreadIdRef.current !== targetThreadId) return;
      const mappedMessages: Message[] = historyItems.map((item) => {
        const author = item.author === 'visitor' || item.author === 'user' ? 'visitor' : 'character';
        let toolCalls;
        if (typeof item.toolCalls === 'string') {
          try {
            const parsed = JSON.parse(item.toolCalls);
            if (Array.isArray(parsed)) toolCalls = parsed;
          } catch { }
        } else if (Array.isArray(item.toolCalls)) toolCalls = item.toolCalls;
        const validStatus: MessageStatus = ['interrupted', 'cancelled', 'error', 'streaming', 'pending'].includes(item.status || '') ? item.status as MessageStatus : 'completed';
        return {
          id: item.id || nextId(author),
          author,
          text: item.text || '',
          status: validStatus,
          toolCalls,
          interruptId: item.interruptId || undefined,
          interruptDecision: item.interruptDecision === 'yes' || item.interruptDecision === 'no' ? item.interruptDecision : undefined,
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
        sessionStorage.setItem(STORAGE_KEY_THREAD, targetThreadId);
        sessionStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(mappedMessages));
      } catch { }
    } catch (error) {
      if (activeHistoryThreadIdRef.current !== targetThreadId) return;
      setHistoryError(error instanceof Error ? error.message : 'Failed to load conversation history.');
      setIsHistoryLoading(false);
    }
  }, []);

  const startNewChat = useCallback(async () => {
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
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
      sessionStorage.removeItem(STORAGE_KEY_THREAD);
      sessionStorage.removeItem(STORAGE_KEY_MESSAGES);
    } catch { }
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
      try { sessionStorage.setItem(STORAGE_KEY_THREAD, newId); } catch { }
      return newId;
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Failed to initialize new conversation. Please try again.');
      setIsHistoryLoading(false);
      return null;
    }
  }, []);

  const retryHistory = useCallback(async () => {
    if (activeHistoryThreadIdRef.current) await loadHistory(activeHistoryThreadIdRef.current);
    else await startNewChat();
  }, [loadHistory, startNewChat]);

  return {
    messages,
    status,
    threadId,
    emotion,
    inFlight,
    notice,
    announcement,
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
