/**
 * THE SEAM. This file imports nothing, and nothing in it may ever import anything.
 *
 * It is the entire vocabulary between the conversation layer and the character layer: one string
 * from a closed set, one default, one type guard. Both sides import it and neither owns it, which is
 * what stops either side dragging the other across.
 *
 * Contract: specs/001-animated-character-chat/contracts/emotion-seam.md
 * Enforced by: the no-restricted-imports blocks in eslint.config.mjs, and tests/unit/boundaries.test.ts
 *
 * PROVISIONAL MEMBERSHIP (FR-006). This set is research D4's provisional working set, not a derived
 * one. FR-006 requires the members to come from an inventory of what the chosen rig can actually
 * express, and that inventory (task T011, contracts/rig-inventory.md) cannot be done until the
 * Cubism sample model is vendored - a license-gated manual download. Two members may well not
 * survive it: `shy` and `surprised` are the likeliest to lack a distinct expression file, and
 * rig-inventory's rule is that a candidate with a motion but no distinct expression does not enter
 * the set.
 *
 * Finalising the set after T011 is a two-file change - this union and lib/character/emotionMap.ts -
 * plus the cue vocabulary in lib/server/persona.ts. The map is typed Record<Emotion, ...>, so
 * forgetting the second file fails the build rather than the demo.
 */

export type Emotion = 'neutral' | 'happy' | 'sad' | 'surprised' | 'angry' | 'shy';

/** The default, and the fallback for every failure path (FR-019). */
export const NEUTRAL: Emotion = 'neutral';

/**
 * Every member, in one place, so callers can iterate the set without re-typing it.
 * Declared with a satisfies clause so it cannot drift from the union above.
 */
export const EMOTIONS = [
  'neutral',
  'happy',
  'sad',
  'surprised',
  'angry',
  'shy',
] as const satisfies readonly Emotion[];

/**
 * The only entrance. Any string arriving from the model, a URL, a fixture, or a log is either
 * accepted here or becomes NEUTRAL. There is no third path (FR-019, emotion-seam rule 5).
 */
export function isEmotion(value: unknown): value is Emotion {
  return typeof value === 'string' && (EMOTIONS as readonly string[]).includes(value);
}

/** Convenience for the failure paths: never throws, never returns undefined. */
export function toEmotion(value: unknown): Emotion {
  return isEmotion(value) ? value : NEUTRAL;
}
