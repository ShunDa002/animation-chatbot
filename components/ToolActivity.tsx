'use client';

import React from 'react';
import type { ToolCallRecord } from '@/lib/conversation/stream-types';

interface ToolActivityProps {
  toolCalls: readonly ToolCallRecord[] | ToolCallRecord[];
}

/**
 * Format JSON objects or raw strings with 2-space indentation.
 * Falls back to raw string if parsing fails during streaming.
 */
function formatJson(parsedValue: unknown, rawString?: string): string {
  if (parsedValue !== null && parsedValue !== undefined) {
    if (typeof parsedValue === 'string') {
      try {
        const parsed = JSON.parse(parsedValue);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return parsedValue;
      }
    }
    try {
      return JSON.stringify(parsedValue, null, 2);
    } catch {
      return String(parsedValue);
    }
  }

  if (rawString !== undefined && rawString !== null) {
    const trimmed = rawString.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return rawString;
      }
    }
    return rawString;
  }

  return '';
}

/**
 * Lightweight JSON tokenizer for syntax highlighting without external dependencies.
 */
function highlightJson(text: string): React.ReactNode {
  if (!text) return null;

  const tokenRegex =
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|[{}[\],:])/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('"') && token.endsWith(':')) {
      elements.push(
        <span key={key++} className="text-sky-300 font-medium">
          {token}
        </span>,
      );
    } else if (token.startsWith('"')) {
      elements.push(
        <span key={key++} className="text-emerald-300">
          {token}
        </span>,
      );
    } else if (token === 'true' || token === 'false') {
      elements.push(
        <span key={key++} className="text-amber-300">
          {token}
        </span>,
      );
    } else if (token === 'null') {
      elements.push(
        <span key={key++} className="text-rose-300">
          {token}
        </span>,
      );
    } else if (/^-?\d/.test(token)) {
      elements.push(
        <span key={key++} className="text-purple-300">
          {token}
        </span>,
      );
    } else {
      elements.push(token);
    }
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements.length > 0 ? elements : text;
}

/**
 * ToolActivity (FR-027, FR-028, FR-029, FR-030, US9, T031)
 *
 * Collapsible accordion for tool activity rendered at the top of the assistant message.
 * - Starts closed by default.
 * - Title adapts: `Using "{toolName}"...` during generation, `Tool failed` on error, or `Tool finished` on success.
 * - Renders arguments and results in syntax-highlighted, pretty-printed code blocks.
 */
export default function ToolActivity({ toolCalls }: ToolActivityProps) {
  if (!toolCalls || toolCalls.length === 0) {
    return null;
  }

  // Pick the latest/current active tool being called
  const generatingTool = [...toolCalls].reverse().find(
    (tc) => tc.status === 'generating_args' || tc.status === 'preparing',
  );
  const hasFailed = toolCalls.some(
    (tc) => tc.status === 'failed' || Boolean(tc.error),
  );

  let title = 'Tool finished';
  if (generatingTool) {
    const name = generatingTool.toolName || 'tool';
    title = `Using "${name}"...`;
  } else if (hasFailed) {
    title = 'Tool failed';
  }

  const borderClass = hasFailed
    ? 'border-red-500/60 bg-red-950/20'
    : generatingTool
      ? 'border-[var(--accent)]/40 bg-[var(--surface)]/50'
      : 'border-white/10 bg-black/20 hover:border-white/20';

  return (
    <details
      className={`tool-activity group rounded-xl border p-2.5 my-2 transition-colors ${borderClass}`}
      data-testid="tool-activity"
    >
      <summary
        className="cursor-pointer select-none font-medium flex items-center justify-between text-xs sm:text-sm text-slate-300 hover:text-white outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus)] list-none [&::-webkit-details-marker]:hidden"
        data-testid="tool-activity-summary"
      >
        <div className="flex items-center gap-2">
          {generatingTool ? (
            <span
              className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse"
              aria-hidden="true"
            />
          ) : hasFailed ? (
            <svg
              className="w-3.5 h-3.5 text-red-400 flex-shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ) : (
            <svg
              className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          <span>{title}</span>
        </div>

        <svg
          className="w-3.5 h-3.5 text-slate-400 transition-transform duration-200 group-open:rotate-180"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </summary>

      <div
        className="tool-activity-content mt-2.5 pt-2.5 border-t border-white/10 space-y-3"
        data-testid="tool-activity-content"
      >
        {toolCalls.map((tc, idx) => {
          const formattedArgs = formatJson(tc.parsedArgs, tc.argsAccumulator);
          const formattedResult =
            tc.result !== null && tc.result !== undefined
              ? formatJson(tc.result)
              : null;
          const isCurrentActive =
            tc.status === 'generating_args' || tc.status === 'preparing';

          return (
            <div
              key={tc.id || idx}
              className={`tool-call-item rounded-lg p-2.5 space-y-2 border transition-colors ${
                tc.status === 'failed' || tc.error
                  ? 'bg-red-950/20 border-red-500/30'
                  : isCurrentActive
                    ? 'bg-[var(--surface)]/70 border-[var(--accent)]/30'
                    : 'bg-black/30 border-white/5'
              }`}
              data-testid="tool-call-item"
            >
              {/* Always display the tool name and status */}
              <div className="tool-call-header flex items-center justify-between gap-2 border-b border-white/5 pb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <span className="text-[var(--accent)] font-mono text-[0.7rem] px-1 py-0.5 rounded bg-white/5">
                    #{idx + 1}
                  </span>
                  <span className="text-white font-medium">
                    {tc.toolName || 'tool'}
                  </span>
                </div>
                <div className="text-[0.65rem] uppercase tracking-wider font-semibold">
                  {isCurrentActive ? (
                    <span className="text-[var(--accent)] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                      Running
                    </span>
                  ) : tc.status === 'failed' || tc.error ? (
                    <span className="text-red-400">Failed</span>
                  ) : (
                    <span className="text-emerald-400">Completed</span>
                  )}
                </div>
              </div>

              <div className="tool-call-args">
                <div className="text-[0.65rem] sm:text-[0.7rem] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Arguments
                </div>
                <pre
                  className="p-2 rounded bg-black/40 border border-white/5 font-mono text-xs overflow-x-auto text-slate-200 whitespace-pre-wrap break-all"
                  data-testid="tool-args"
                >
                  <code>{highlightJson(formattedArgs)}</code>
                </pre>
              </div>

              {formattedResult !== null && (
                <div className="tool-call-result">
                  <div className="text-[0.65rem] sm:text-[0.7rem] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                    Result
                  </div>
                  <pre
                    className="p-2 rounded bg-black/40 border border-white/5 font-mono text-xs overflow-x-auto text-emerald-300/90 whitespace-pre-wrap break-all"
                    data-testid="tool-result"
                  >
                    <code>{highlightJson(formattedResult)}</code>
                  </pre>
                </div>
              )}

              {tc.error && (
                <div className="tool-call-error">
                  <div className="text-[0.65rem] sm:text-[0.7rem] uppercase tracking-wider text-red-400 font-semibold mb-1">
                    Error
                  </div>
                  <pre
                    className="p-2 rounded bg-red-950/30 border border-red-500/20 font-mono text-xs overflow-x-auto text-red-300 whitespace-pre-wrap break-all"
                    data-testid="tool-error"
                  >
                    <code>{tc.error}</code>
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}
