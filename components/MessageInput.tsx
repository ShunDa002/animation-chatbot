'use client';

import { useId, useState } from 'react';
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
  /** Optional conversation status. If 'connecting', sending is automatically disabled with copy.connecting. */
  status?: ConversationStatus;
}

/**
 * The composer (FR-022, FR-003, D13).
 *
 * The draft lives in this component's own state, which is what makes it survive a re-render of the
 * log above it (constitution III).
 */
export default function MessageInput({ onSend, disabled, disabledReason, status }: Props) {
  const [draft, setDraft] = useState('');
  const remaining = remainingCharacters(draft);
  const atLimit = atCharacterLimit(draft);
  const counterId = useId();
  const inputId = useId();

  const isConnecting = status === 'connecting';
  const effectiveDisabled = disabled || isConnecting;
  const effectiveReason = isConnecting ? copy.connecting : disabledReason;

  function submit(): void {
    if (effectiveDisabled || !isSendable(draft)) return;
    onSend(draft);
    setDraft('');
  }

  return (
    <form
      className="composer flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="composer-row flex gap-2 sm:gap-3 items-end">
        <label className="visually-hidden sr-only" htmlFor={inputId}>
          {copy.inputLabel}
        </label>
        <textarea
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
          rows={2}
          className="flex-1 min-h-[2.75rem] max-h-32 resize-y p-2.5 sm:px-3 sm:py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-white text-sm sm:text-base font-sans focus-visible:outline-2 focus-visible:outline-[var(--focus)] focus-visible:outline-offset-2 transition-colors placeholder:text-[var(--text-muted)]"
        />
        <button
          type="submit"
          disabled={effectiveDisabled || !isSendable(draft)}
          className="px-4 py-2.5 sm:px-5 sm:py-2 rounded-lg bg-[var(--accent)] text-[var(--on-accent)] font-semibold text-sm sm:text-base cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center justify-center min-w-[4.5rem] h-[2.75rem]"
        >
          {copy.sendLabel}
        </button>
      </div>

      <div className="composer-meta flex justify-between gap-3 text-xs text-[var(--text-muted)]">
        <span id={counterId} className={atLimit ? 'at-limit text-[var(--danger)] font-medium' : undefined}>
          {atLimit ? copy.atCharacterLimit : copy.charactersRemaining(remaining)}
        </span>
        {effectiveDisabled && effectiveReason ? <span>{effectiveReason}</span> : null}
      </div>
    </form>
  );
}
