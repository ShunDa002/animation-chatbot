import React from 'react';

export interface LoadingSkeletonProps {
  variant?: 'chat' | 'sidebar' | 'default';
  isCollapsed?: boolean;
  className?: string;
  count?: number;
  'data-testid'?: string;
}

/**
 * Reusable LoadingSkeleton component (T001).
 * Supports variants for chat history loading, sidebar conversation list loading,
 * and generic skeleton blocks.
 */
export default function LoadingSkeleton({
  variant = 'default',
  isCollapsed = false,
  className = '',
  count = 4,
  'data-testid': testId,
}: LoadingSkeletonProps) {
  if (variant === 'chat') {
    return (
      <div
        data-testid={testId || 'chat-history-skeleton'}
        aria-busy="true"
        aria-label="Loading conversation history"
        className={`flex-1 overflow-hidden flex flex-col justify-end gap-3.5 p-4 min-h-0 ${className}`}
      >
        <div className="flex justify-end w-full animate-pulse">
          <div className="w-1/2 sm:w-1/3 h-12 bg-white/10 rounded-2xl" />
        </div>
        <div className="flex items-start gap-2.5 w-full animate-pulse">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/10 shrink-0 mt-1" />
          <div className="flex-1 max-w-[80%] space-y-2">
            <div className="h-14 bg-white/10 rounded-2xl" />
          </div>
        </div>
        <div className="flex justify-end w-full animate-pulse">
          <div className="w-2/5 sm:w-1/4 h-10 bg-white/10 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (variant === 'sidebar') {
    return (
      <div
        data-testid={testId || 'sidebar-skeleton'}
        aria-busy="true"
        aria-label="Loading conversations"
        className={`flex flex-col gap-1 p-1 ${className}`}
      >
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={`w-full flex items-center gap-2.5 p-2 rounded-lg animate-pulse ${
              isCollapsed ? 'justify-center' : ''
            }`}
          >
            <div className="w-4 h-4 rounded bg-slate-700/60 shrink-0" />
            {!isCollapsed && (
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-slate-700/60 rounded w-3/4" />
                <div className="h-2.5 bg-slate-700/40 rounded w-1/3" />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      data-testid={testId || 'loading-skeleton'}
      aria-busy="true"
      aria-label="Loading content"
      className={`animate-pulse space-y-2 ${className}`}
    >
      <div className="h-4 bg-white/10 rounded w-3/4" />
      <div className="h-4 bg-white/10 rounded w-1/2" />
    </div>
  );
}
