/**
 * The two caps, as bare numbers. Imports nothing, like lib/emotion.ts.
 *
 * These live outside every layer because both sides of the seam need them and neither may import the
 * other: the browser caps input at 300 so the limit is visible before sending (FR-022), and the
 * endpoint independently rejects anything longer because it may not trust the browser (FR-029). That
 * is defence in depth on purpose - but the two enforcement points must agree on the number, and a
 * server that accepted 300 while the input capped at 280 would be a silent bug. One declaration,
 * two enforcement points.
 *
 * Both numbers are settled decisions from the spec's clarification session, not tuning knobs.
 */

/** FR-022. Longest visitor message, in characters. */
export const MAX_INPUT_CHARACTERS = 300;

/** FR-017. Messages travelling onward with each new turn, visitor and character combined. */
export const HISTORY_WINDOW = 6;
