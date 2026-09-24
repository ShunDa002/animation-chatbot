/**
 * The conversation side of the character cap (FR-022), plus the shapes the log is made of.
 *
 * The number itself lives in lib/limits.ts, which imports nothing.
 */

import { MAX_INPUT_CHARACTERS } from '@/lib/limits';

export { MAX_INPUT_CHARACTERS };

export type MessageStatus = 'complete' | 'streaming' | 'failed';
export type MessageAuthor = 'visitor' | 'character';

export interface Message {
  id: string;
  author: MessageAuthor;
  /** Display text. The cue has already been stripped (FR-018). */
  text: string;
  status: MessageStatus;
}

/** How many characters the visitor may still type. Never negative. */
export function remainingCharacters(current: string): number {
  return Math.max(0, MAX_INPUT_CHARACTERS - current.length);
}

/** True when the draft has reached the cap. */
export function atCharacterLimit(current: string): boolean {
  return current.length >= MAX_INPUT_CHARACTERS;
}

/**
 * Clamp a draft to the cap. Used by the input's change handler so typing simply stops, rather than
 * the visitor writing 400 characters and losing 100 of them at send time (FR-022).
 */
export function clampInput(value: string): string {
  return value.length <= MAX_INPUT_CHARACTERS ? value : value.slice(0, MAX_INPUT_CHARACTERS);
}

/** A message worth sending: not blank once trimmed. */
export function isSendable(draft: string): boolean {
  return draft.trim().length > 0;
}
