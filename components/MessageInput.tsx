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

interface Props {
  onSend(draft: string): void;
  /** True while a turn is in flight. Sending is refused, with the reason visible (FR-021). */
  disabled: boolean;
  /** Why sending is refused, when it is. */
  disabledReason?: string | null;
}

/**
 * The composer (FR-022, FR-003).
 *
 * The draft lives in this component's own state, which is what makes it survive a re-render of the
 * log above it - constitution III requires in-progress input to survive re-render, not only chat
 * history and scroll position. Nothing lifts the draft into the conversation state, so a streaming
 * reply cannot disturb what the visitor is typing.
 */
export default function MessageInput({ onSend, disabled, disabledReason }: Props) {
  const [draft, setDraft] = useState('');
  const remaining = remainingCharacters(draft);
  const atLimit = atCharacterLimit(draft);
  const counterId = useId();
  const inputId = useId();

  function submit(): void {
    if (disabled || !isSendable(draft)) return;
    onSend(draft);
    setDraft('');
  }

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="composer-row">
        <label className="visually-hidden" htmlFor={inputId}>
          {copy.inputLabel}
        </label>
        <textarea
          id={inputId}
          value={draft}
          placeholder={copy.inputPlaceholder}
          aria-describedby={counterId}
          // The cap stops input rather than truncating at send, so the visitor never writes 400
          // characters and silently loses 100 (FR-022).
          maxLength={MAX_INPUT_CHARACTERS}
          onChange={(event) => setDraft(clampInput(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          rows={2}
        />
        <button type="submit" disabled={disabled || !isSendable(draft)}>
          {copy.sendLabel}
        </button>
      </div>

      <div className="composer-meta">
        <span id={counterId} className={atLimit ? 'at-limit' : undefined}>
          {atLimit ? copy.atCharacterLimit : copy.charactersRemaining(remaining)}
        </span>
        {disabled && disabledReason ? <span>{disabledReason}</span> : null}
      </div>
    </form>
  );
}
