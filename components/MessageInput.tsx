'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  atCharacterLimit,
  clampInput,
  isSendable,
  MAX_INPUT_CHARACTERS,
  remainingCharacters,
} from '@/lib/conversation/limits';
import { copy } from '@/lib/ui/copy';
import type { ConversationStatus } from '@/lib/conversation/useConversation';

export interface MessageInputProps {
  /** Callback invoked when the user submits a message via Enter key or Send button. */
  onSubmit?: (text: string) => void;
  /** Legacy alias for onSubmit. */
  onSend?: (draft: string) => void;
  /** If true, disables the text area and all actions. */
  disabled?: boolean;
  /** Why sending is refused, when it is. */
  disabledReason?: string | null;
  /** If true, places the input in a waiting state where the send button is disabled but text input remains enabled. */
  isWaitingForResponse?: boolean;
  /** Current conversation status. */
  status?: ConversationStatus;
  /** Optional callback when stop button is clicked during waiting. */
  onStop?: () => void;
}

export type Props = MessageInputProps;

const MODEL_OPTIONS = [
  'openai/gpt-oss-20b',
  'nvidia/nemotron-3.5-lightning:free',
  'qwen/qwen3.8-27b:free',
] as const;

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export const STORAGE_KEY_DRAFT = 'chat_input_draft';

/**
 * The composer (FR-022, FR-003, D13).
 *
 * The draft lives in this component's own state, which is what makes it survive a re-render of the
 * log above it (constitution III). It is also cached in sessionStorage so unsubmitted drafts
 * survive page reloads (FR-024).
 */
export default function MessageInput({
  onSubmit,
  onSend,
  disabled = false,
  disabledReason,
  isWaitingForResponse = false,
  status,
  onStop,
}: Props) {
  const [draft, setDraft] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const cached = sessionStorage.getItem(STORAGE_KEY_DRAFT);
        if (cached) {
          return clampInput(cached);
        }
      }
    } catch {
      // Ignore sessionStorage access errors
    }
    return '';
  });
  const [selectedModel, setSelectedModel] = useState<string>(MODEL_OPTIONS[0]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMountedRef = useRef(false);
  const remaining = remainingCharacters(draft);
  const atLimit = atCharacterLimit(draft);
  const counterId = useId();
  const inputId = useId();

  // Sync draft to sessionStorage on update
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        if (draft) {
          sessionStorage.setItem(STORAGE_KEY_DRAFT, draft);
        } else {
          sessionStorage.removeItem(STORAGE_KEY_DRAFT);
        }
      }
    } catch {
      // Ignore sessionStorage quota or access errors
    }
  }, [draft]);

  const handleDraftChange = (value: string) => {
    const clamped = clampInput(value);
    setDraft(clamped);
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        if (clamped) {
          sessionStorage.setItem(STORAGE_KEY_DRAFT, clamped);
        } else {
          sessionStorage.removeItem(STORAGE_KEY_DRAFT);
        }
      }
    } catch {
      // Ignore sessionStorage access errors
    }
  };

  const isConnecting = status === 'connecting';
  const effectiveReason = disabledReason ?? (isConnecting ? copy.connecting : null);

  const isMultiline = draft.includes('\n') || draft.length > 36;

  useIsomorphicLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (!isMultiline) {
      textarea.style.height = '1.5rem';
      return;
    }

    // Reset height to auto to compute scrollHeight accurately
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;

    if (scrollHeight > 0) {
      textarea.style.height = `${Math.min(Math.max(scrollHeight, 40), 120)}px`;
    }
  }, [draft, isMultiline]);

  function submit(): void {
    const handleSend = onSubmit ?? onSend;
    if (disabled || isWaitingForResponse || isConnecting || !isSendable(draft) || !handleSend) return;
    handleSend(draft);
    setDraft('');
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        sessionStorage.removeItem(STORAGE_KEY_DRAFT);
      }
    } catch {
      // Ignore sessionStorage access errors
    }
  }

  return (
    <form
      className="composer flex flex-col gap-1.5 shrink-0 mt-auto justify-end w-full"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div
        className={`composer-box relative flex ${isMultiline
          ? 'flex-col gap-2 p-3 rounded-2xl'
          : 'flex-row items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:py-2 rounded-full'
          } bg-[#181a24] border border-[#2d3142] shadow-lg transition-all duration-200`}
        data-multiline={isMultiline ? 'true' : 'false'}
      >
        <div className={`composer-text-zone flex-1 min-w-0 ${isMultiline ? 'order-1 w-full' : 'order-2'}`}>
          <label className="visually-hidden sr-only" htmlFor={inputId}>
            {copy.inputLabel}
          </label>
          <textarea
            ref={textareaRef}
            id={inputId}
            value={draft}
            placeholder={copy.inputPlaceholder}
            aria-describedby={counterId}
            // The cap stops input rather than truncating at send (FR-022).
            maxLength={MAX_INPUT_CHARACTERS}
            onChange={(event) => handleDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            className="w-full bg-transparent border-0 border-none text-white text-sm sm:text-base font-sans resize-none outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus-visible:ring-0 focus:border-0 focus:border-transparent focus-visible:border-transparent placeholder:text-[var(--text-muted)] py-1 px-1 min-h-[1.5rem] max-h-[7.5rem] overflow-y-auto shadow-none focus:shadow-none"
            style={{ outline: 'none', border: 'none', boxShadow: 'none' }}
          />
        </div>

        {/* Footer / actions wrapper */}
        <div
          className={`composer-footer ${isMultiline
            ? 'order-2 flex items-center justify-between w-full pt-1 border-t border-[#2d3142]/40'
            : 'contents'
            }`}
        >
          {/* Attachment button zone */}
          <div className={`composer-actions-left flex items-center ${isMultiline ? '' : 'order-1 shrink-0'}`}>
            <button
              type="button"
              aria-label={copy.attachmentLabel}
              className="p-1.5 sm:p-2 rounded-full text-[var(--text-muted)] hover:text-white hover:bg-[var(--bubble-visitor)]/60 transition-colors cursor-pointer shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {/* Controls zone */}
          <div className={`composer-actions-right flex items-center gap-1.5 sm:gap-2 ${isMultiline ? '' : 'order-3 shrink-0'}`}>
            {/* Model Selector dropdown */}
            <div className="relative shrink-0">
              <select
                aria-label={copy.modelSelectLabel}
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="text-xs bg-transparent hover:bg-[#232736] border-0 border-none text-white rounded-full px-2.5 py-1 cursor-pointer focus:outline-none focus:ring-0 transition-colors"
                style={{ outline: 'none', border: 'none' }}
              >
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt} value={opt} className="bg-[#181a24] text-white">
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* Voice Input button */}
            <button
              type="button"
              aria-label={copy.voiceInputLabel}
              className="p-1.5 sm:p-2 rounded-full text-[var(--text-muted)] hover:text-white hover:bg-[var(--bubble-visitor)]/60 transition-colors cursor-pointer shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </button>

            {/* Stop button (if onStop and waiting) or Send button */}
            {onStop && (status === 'waiting' || isWaitingForResponse) ? (
              <button
                type="button"
                aria-label={copy.stopLabel}
                onClick={onStop}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer transition-all flex items-center justify-center shrink-0 shadow-sm"
              >
                <span className="sr-only">{copy.stopLabel}</span>
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="5" y="5" width="14" height="14" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                aria-label={copy.sendLabel}
                disabled={disabled || isWaitingForResponse || isConnecting || !isSendable(draft)}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center shrink-0 shadow-sm"
              >
                <span className="sr-only">{copy.sendLabel}</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="composer-meta flex justify-between gap-3 text-xs text-[var(--text-muted)]">
        <span id={counterId} className={atLimit ? 'at-limit text-[var(--danger)] font-medium' : undefined}>
          {atLimit ? copy.atCharacterLimit : copy.charactersRemaining(remaining)}
        </span>
        {(disabled || isConnecting) && effectiveReason ? <span>{effectiveReason}</span> : null}
      </div>
    </form>
  );
}
