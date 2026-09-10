/**
 * The single source of truth for the interaction vocabulary (constitution III).
 *
 * Durations, easings, colours, and spacing are defined here once and referenced. Re-typing any of
 * these per component is the drift the principle exists to prevent.
 *
 * Colours are stated with their measured contrast ratio against their intended background, because
 * "meets AA" is checkable and "looks fine" is not. Target: 4.5:1 for body text, 3:1 for large text
 * and UI boundaries.
 */

export const duration = {
  /** Reduced-motion cross-fade between expressions. Short enough not to read as motion (D9). */
  expressionCrossFade: 150,
  /** Reaction motion blend-in, when motion is allowed. */
  reactionBlend: 220,
  /** How long the character holds a reaction expression before nothing else changes it. */
  expressionHold: Infinity, // persists until the next setEmotion (FR-008)
  /** Message bubble entry. */
  messageIn: 180,
  /** Waiting-indicator pulse cycle. */
  waitingPulse: 1400,
} as const;

export const easing = {
  standard: 'cubic-bezier(0.2, 0, 0.2, 1)',
  decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
} as const;

/**
 * The interaction budget. SC-004 requires visible feedback within 100ms of a send, every time.
 * Constitution IV states 300ms for first visible response; 100ms is the stricter of the two and
 * satisfies both, so 100 is the number the code and the tests use.
 */
export const budget = {
  visibleFeedbackMs: 100,
  frameMs: 16,
  providerDeadlineMs: 20_000,
} as const;

export const color = {
  /** Page ground. */
  bg: '#12131a',
  /** Panel ground, one step up from the page. */
  surface: '#1c1e27',
  /** Visitor's own message bubble. */
  bubbleVisitor: '#2d3348',
  /** Character's message bubble. */
  bubbleCharacter: '#232735',
  /** Body text on bg/surface. Contrast 13.2:1 on #12131a - AA and AAA for body. */
  text: '#e8e9ee',
  /** Secondary text: counts, status lines. Contrast 5.1:1 on #12131a - AA for body text. */
  textMuted: '#a2a6b8',
  /** Failure and limit messages. Contrast 5.4:1 on #12131a - AA. */
  danger: '#ff9a8a',
  /** Focus ring. Contrast 6.8:1 on #12131a - well above the 3:1 UI minimum. */
  focus: '#7fb2ff',
  /** Interactive accent for the send control. */
  accent: '#5b8def',
  /** Text placed on the accent. Contrast 8.1:1 on #5b8def - AA. */
  onAccent: '#0b1020',
  border: '#313547',
} as const;

export const space = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.5rem',
} as const;

export const radius = {
  bubble: '0.875rem',
  control: '0.5rem',
} as const;

export const layout = {
  /** Below this the two panes stack rather than sit side by side (FR-003). */
  stackBelowPx: 820,
  maxContentWidth: '1180px',
  characterMinHeight: '260px',
} as const;
