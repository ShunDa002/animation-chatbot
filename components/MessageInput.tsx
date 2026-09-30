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

interface Props {
  onSend(draft: string): void;
  /** True while a turn is in flight or connecting. Sending is refused, with the reason visible (FR-021, FR-045). */
  disabled: boolean;
  /** Why sending is refused, when it is. */
  disabledReason?: string | null;
}

const MODEL_OPTIONS = [
  'gpt-oss-20b',
  'nemotron-3.5',
  'qwen3.8-27b',
] as const;

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * The composer (FR-022, FR-003, D13).
 *
 * The draft lives in this component's own state, which is what makes it survive a re-render of the
 * log above it (constitution III).
 */
export default function MessageInput({ onSend, disabled, disabledReason }: Props) {
  const [draft, setDraft] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>(MODEL_OPTIONS[0]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const remaining = remainingCharacters(draft);
  const atLimit = atCharacterLimit(draft);
  const counterId = useId();
  const inputId = useId();

  const effectiveReason = disabledReason;

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
    if (disabled || !isSendable(draft)) return;
    onSend(draft);
    setDraft('');
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
            onChange={(event) => setDraft(clampInput(event.target.value))}
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

            {/* Send button */}
            <button
              type="submit"
              aria-label={copy.sendLabel}
              disabled={disabled || !isSendable(draft)}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center shrink-0 shadow-sm"
            >
              <span className="sr-only">{copy.sendLabel}</span>
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="composer-meta flex justify-between gap-3 text-xs text-[var(--text-muted)]">
        <span id={counterId} className={atLimit ? 'at-limit text-[var(--danger)] font-medium' : undefined}>
          {atLimit ? copy.atCharacterLimit : copy.charactersRemaining(remaining)}
        </span>
        {disabled && effectiveReason ? <span>{effectiveReason}</span> : null}
      </div>
    </form>
  );
}
