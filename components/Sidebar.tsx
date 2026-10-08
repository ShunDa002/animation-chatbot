'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { fetchConversations, type ConversationSummary } from '@/lib/conversation/useConversation';
import LoadingSkeleton from '@/components/LoadingSkeleton';

export interface ConversationItem {
  id: string;
  threadId?: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  date?: string;
}

export interface SidebarProps {
  /** Controlled open state for mobile off-canvas drawer (< 640px) */
  isOpen?: boolean;
  /** Callback to close the mobile drawer */
  onClose?: () => void;
  /** Controlled collapsed state for desktop sidebar (>= 640px) */
  isCollapsed?: boolean;
  /** Callback to toggle collapse on desktop */
  onToggleCollapse?: () => void;
  /** List of conversations to display (if provided, bypasses automatic fetch) */
  conversations?: ConversationItem[];
  /** Controlled loading state */
  isLoading?: boolean;
  /** Controlled error message */
  error?: string | null;
  /** Callback when retry button is clicked */
  onRetry?: () => void;
  /** Callback when "New Chat" button is clicked */
  onNewChat?: () => void;
  /** Callback when a conversation is selected */
  onSelectConversation?: (id: string, threadId?: string) => void;
  /** Currently active thread ID */
  activeThreadId?: string | null;
  /** Optional class name */
  className?: string;
}

function getDisplayDate(conv: ConversationItem): string {
  if (conv.date) return conv.date;
  const dateStr = conv.updatedAt || conv.createdAt;
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString();
}

/**
 * Sidebar component (T121, FR-001, FR-003, FR-027 to FR-031, US7).
 *
 * Provides navigation, "New Chat" trigger, and fetches/renders past conversations via GET /conversations.
 * Includes skeleton loader while loading, inline error with retry on failure, and "No conversations" on empty.
 * Conversations are sorted by date descending (latest at top).
 */
export default function Sidebar({
  isOpen = false,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
  conversations: controlledConversations,
  isLoading: controlledLoading,
  error: controlledError,
  onRetry: onRetryProp,
  onNewChat,
  onSelectConversation,
  activeThreadId,
  className = '',
}: SidebarProps) {
  const [internalConversations, setInternalConversations] = useState<ConversationItem[]>([]);
  const [internalLoading, setInternalLoading] = useState<boolean>(() => controlledConversations === undefined);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  // Fetch dynamic conversations from GET /conversations if not provided via props
  useEffect(() => {
    if (controlledConversations !== undefined) {
      return;
    }

    const abortController = new AbortController();

    async function load() {
      try {
        const data = await fetchConversations(abortController.signal);
        setInternalConversations(data);
        setInternalLoading(false);
      } catch (err) {
        if (abortController.signal.aborted) return;
        const msg = err instanceof Error ? err.message : 'Failed to load conversations.';
        setInternalError(msg);
        setInternalLoading(false);
      }
    }

    void load();

    return () => {
      abortController.abort();
    };
  }, [controlledConversations, retryTrigger]);

  // Listen for newly created conversation on first message sent (FR-038, T030a)
  useEffect(() => {
    const handleNewConv = (e: Event) => {
      const customEvent = e as CustomEvent<ConversationItem>;
      if (customEvent.detail) {
        setInternalConversations((prev) => {
          if (
            prev.some(
              (c) =>
                c.id === customEvent.detail.id ||
                c.threadId === customEvent.detail.threadId
            )
          ) {
            return prev;
          }
          return [customEvent.detail, ...prev];
        });
      }
    };

    window.addEventListener('chat:new-conversation', handleNewConv);
    return () => {
      window.removeEventListener('chat:new-conversation', handleNewConv);
    };
  }, []);

  const handleRetry = () => {
    setInternalLoading(true);
    setInternalError(null);
    onRetryProp?.();
    setRetryTrigger((prev) => prev + 1);
  };

  const effectiveLoading = controlledLoading !== undefined ? controlledLoading : (controlledConversations !== undefined ? false : internalLoading);
  const effectiveError = controlledError !== undefined ? controlledError : (controlledConversations !== undefined ? null : internalError);
  const effectiveList = controlledConversations !== undefined ? controlledConversations : internalConversations;

  // Sort conversations by date in descending order (latest top - FR-028)
  const sortedConversations = useMemo(() => {
    return [...effectiveList].sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || a.date || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || b.date || 0).getTime();
      return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
    });
  }, [effectiveList]);

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isOpen && (
        <div
          className="sidebar-backdrop fixed inset-0 bg-black/60 backdrop-blur-xs z-40 sm:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`sidebar fixed inset-y-0 left-0 z-50 flex flex-col h-full bg-[var(--surface)] border-r border-[var(--border)] transition-all duration-300 ease-in-out sm:static sm:z-20 ${isOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'
          } ${isCollapsed ? 'sm:w-16' : 'w-72 sm:w-64 md:w-72'} ${className}`}
        aria-label="Sidebar"
      >
        {/* Header: App title + close / collapse controls */}
        <div className="flex items-center justify-between p-3.5 border-b border-[var(--border)] min-h-[56px]">
          {!isCollapsed ? (
            <div className="flex items-center gap-2 overflow-hidden">
              <span
                className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] shrink-0"
                aria-hidden="true"
              />
              <span className="font-semibold text-sm sm:text-base text-[var(--text)] tracking-tight truncate">
                Aria
              </span>
            </div>
          ) : (
            <div className="w-full flex justify-center">
              <span
                className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]"
                aria-hidden="true"
              />
            </div>
          )}

          <div className="flex items-center gap-1">
            {/* Desktop collapse/expand button */}
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden sm:inline-flex p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bubble-visitor)]/60 transition-colors cursor-pointer"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${isCollapsed ? 'rotate-180' : ''
                  }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                />
              </svg>
            </button>

            {/* Mobile close drawer button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close sidebar"
              className="sm:hidden p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bubble-visitor)]/60 transition-colors cursor-pointer"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Action button: New Chat */}
        <div className="p-3">
          <button
            type="button"
            onClick={onNewChat}
            className={`w-full flex items-center justify-center gap-2 bg-[var(--accent)] hover:opacity-90 active:scale-[0.98] text-[var(--on-accent)] font-medium text-sm rounded-xl py-2.5 transition-all shadow-sm cursor-pointer ${isCollapsed ? 'px-2' : 'px-4'
              }`}
            aria-label="New Chat"
            title="New Chat"
          >
            <svg
              className="w-4 h-4 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            {!isCollapsed && <span>New Chat</span>}
          </button>
        </div>

        {/* Past conversations list container */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {!isCollapsed && (
            <p className="px-2 py-1 text-xs font-medium text-[var(--text-muted)] tracking-wider uppercase">
              Recent Chats
            </p>
          )}

          {/* Loading state: Skeleton loader (FR-029) */}
          {effectiveLoading ? (
            <LoadingSkeleton
              variant="sidebar"
              isCollapsed={isCollapsed}
              data-testid="sidebar-skeleton"
            />
          ) : effectiveError ? (
            /* Error state: inline error with Retry button (FR-030) */
            <div className="p-3 my-2 rounded-lg bg-rose-950/40 border border-rose-800/60 text-center flex flex-col items-center gap-2">
              <p className="text-xs text-rose-300 font-medium m-0">
                {effectiveError}
              </p>
              <button
                type="button"
                onClick={handleRetry}
                className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-medium transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : sortedConversations.length === 0 ? (
            /* Empty state: simple text with no buttons (FR-031) */
            <div className="p-4 text-center">
              <p className="text-xs text-[var(--text-muted)] m-0">No conversations</p>
            </div>
          ) : (
            /* Success state: list sorted by date descending (FR-028) */
            <ul
              className="flex flex-col gap-1 list-none p-0 m-0"
              aria-label="Past conversations"
            >
              {sortedConversations.map((conv) => {
                const isSelected = Boolean(
                  activeThreadId && (conv.threadId === activeThreadId || conv.id === activeThreadId)
                );
                return (
                  <li key={conv.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (conv.threadId && conv.threadId !== conv.id) {
                          onSelectConversation?.(conv.id, conv.threadId);
                        } else {
                          onSelectConversation?.(conv.id);
                        }
                      }}
                      className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-colors hover:bg-[var(--bubble-visitor)]/60 group cursor-pointer ${isSelected ? 'bg-[var(--bubble-visitor)]/80 text-[var(--accent)] font-semibold shadow-xs' : ''
                        } ${isCollapsed ? 'justify-center' : ''
                        }`}
                      aria-current={isSelected ? 'true' : undefined}
                      title={conv.title}
                    >
                      <svg
                        className="w-4 h-4 text-[var(--text-muted)] shrink-0 group-hover:text-[var(--text)] transition-colors"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.8}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                      {!isCollapsed && (
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-medium text-[var(--text)] truncate m-0">
                            {conv.title}
                          </p>
                          <p className="text-[11px] text-[var(--text-muted)] m-0">
                            {getDisplayDate(conv)}
                          </p>
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer info */}
        {!isCollapsed && (
          <div className="p-3 border-t border-[var(--border)] text-[11px] text-[var(--text-muted)]">
            <span>Live2D Model (Remu)</span>
          </div>
        )}
      </aside>
    </>
  );
}
