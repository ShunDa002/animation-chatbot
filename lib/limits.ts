/**
 * The input cap, as a bare number. Imports nothing, like lib/emotion.ts.
 *
 * This lives outside every layer because both sides of the seam need it: the browser caps input
 * at 300 so the limit is visible before sending (FR-022).
 */

/** FR-022. Longest visitor message, in characters. */
export const MAX_INPUT_CHARACTERS = 300;
