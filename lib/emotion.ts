/**
 * THE SEAM. This file imports nothing, and nothing in it may ever import anything.
 */

export type Emotion = 'neutral' | 'happy' | 'sad' | 'surprised' | 'angry' | 'shy';

/** The default, and the fallback for every failure path (FR-019). */
export const NEUTRAL: Emotion = 'neutral';

/** Every member, in one place, kept in sync with the Emotion union. */
export const EMOTIONS = [
  'neutral',
  'happy',
  'sad',
  'surprised',
  'angry',
  'shy',
] as const satisfies readonly Emotion[];

/** Accept only members of the closed emotion vocabulary. */
export function isEmotion(value: unknown): value is Emotion {
  return typeof value === 'string' && (EMOTIONS as readonly string[]).includes(value);
}

/** Convert unknown input to a valid emotion without throwing. */
export function toEmotion(value: unknown): Emotion {
  return isEmotion(value) ? value : NEUTRAL;
}
