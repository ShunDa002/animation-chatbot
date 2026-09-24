'use client';

import React from 'react';

export interface MockConversationListItem {
  id: string;
  title: string;
  date: string;
}

export const DEFAULT_MOCK_CONVERSATIONS: MockConversationListItem[] = [
  { id: 'mock-1', title: 'Catching up with Aria', date: 'Today' },
  { id: 'mock-2', title: 'Live2D Animation Basics', date: 'Yesterday' },
  { id: 'mock-3', title: 'Emotional Seams & State', date: '3 days ago' },
  { id: 'mock-4', title: 'Creative Character Backstory', date: 'Last week' },
];

export interface SidebarProps {
  /** Controlled open state for mobile off-canvas drawer (< 640px) */
  isOpen?: boolean;
  /** Callback to close the mobile drawer */
  onClose?: () => void;
  /** Controlled collapsed state for desktop sidebar (>= 640px) */
  isCollapsed?: boolean;
  /** Callback to toggle collapse on desktop */
  onToggleCollapse?: () => void;
  /** List of conversations to display */
  conversations?: MockConversationListItem[];
  /** Callback when "New Chat" button is clicked */
  onNewChat?: () => void;
  /** Callback when a conversation is selected */
  onSelectConversation?: (id: string) => void;
  /** Optional class name */
  className?: string;
}

/**
 * Sidebar component (T121, FR-001, FR-003, D14).
 *
 * Provides navigation, a "New Chat" trigger, and mock historical conversation items.
 * Responsive:
 * - Desktop/Tablet (>= 640px): Sidebar on the left, collapsible.
 * - Mobile (< 640px): Off-canvas drawer sliding in from left with a dark backdrop.
 */
export default function Sidebar({
  isOpen = false,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
  conversations = DEFAULT_MOCK_CONVERSATIONS,
  onNewChat,
  onSelectConversation,
  className = '',
}: SidebarProps) {
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
        className={`sidebar fixed inset-y-0 left-0 z-50 flex flex-col h-full bg-[var(--surface)] border-r border-[var(--border)] transition-all duration-300 ease-in-out sm:static sm:z-20 ${
          isOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'
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
                className={`w-4 h-4 transition-transform duration-200 ${
                  isCollapsed ? 'rotate-180' : ''
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
            className={`w-full flex items-center justify-center gap-2 bg-[var(--accent)] hover:opacity-90 active:scale-[0.98] text-[var(--on-accent)] font-medium text-sm rounded-xl py-2.5 transition-all shadow-sm cursor-pointer ${
              isCollapsed ? 'px-2' : 'px-4'
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

        {/* Past conversations list */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {!isCollapsed && (
            <p className="px-2 py-1 text-xs font-medium text-[var(--text-muted)] tracking-wider uppercase">
              Recent Chats
            </p>
          )}

          <ul
            className="flex flex-col gap-1 list-none p-0 m-0"
            aria-label="Past conversations"
          >
            {conversations.map((conv) => (
              <li key={conv.id}>
                <button
                  type="button"
                  onClick={() => onSelectConversation?.(conv.id)}
                  className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-colors hover:bg-[var(--bubble-visitor)]/60 group cursor-pointer ${
                    isCollapsed ? 'justify-center' : ''
                  }`}
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
                        {conv.date}
                      </p>
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer info */}
        {!isCollapsed && (
          <div className="p-3 border-t border-[var(--border)] text-[11px] text-[var(--text-muted)]">
            <span>Live2D Haru Model</span>
          </div>
        )}
      </aside>
    </>
  );
}
