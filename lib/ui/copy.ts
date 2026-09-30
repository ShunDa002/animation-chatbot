/**
 * Every word the visitor can read, in one place (constitution III: copy tone defined once and
 * referenced, never re-typed per component).
 *
 * FR-004: plain language the visitor can act on, and no provider names, error codes, or diagnostic
 * text. The wording here is what both the chat panel and the live region use, so the visible message
 * and the announced message cannot drift apart (FR-037).
 */

export const copy = {
  /** Character area, before anything has happened. */
  characterLoading: 'Bringing the character to life…',
  /** Shown in place of the canvas when the animated character cannot be displayed (FR-012). */
  characterUnavailable: 'Showing a still picture of the character.',

  /** The character area's text description. Completed by the emotion label (FR-038). */
  characterDescription: (label: string) => `Aria, an animated character. She looks ${label}.`,

  /** Announced when the wait begins (FR-037). */
  thinking: 'Aria is thinking about a reply.',
  /** Visible in the panel for the same state. */
  waiting: 'Thinking…',
  /** Visible and announced during the initial thread-creation phase on load (FR-045). */
  connecting: 'Connecting…',

  /** Announced once, whole, when the reply is complete (FR-036). */
  replyComplete: (text: string) => `Aria replied: ${text}`,

  inputLabel: 'Message Aria',
  inputPlaceholder: 'Say something…',
  sendLabel: 'Send',
  attachmentLabel: 'Add attachment',
  modelSelectLabel: 'Select model',
  voiceInputLabel: 'Voice input',
  stopLabel: 'Stop generating',
  /** Remaining-character affordance. The cap is visible before sending, not enforced at send. */
  charactersRemaining: (remaining: number) =>
    remaining === 1 ? '1 character left' : `${remaining} characters left`,
  atCharacterLimit: 'That is as long as a message can be.',

  /** Why sending is refused while a turn is in flight (FR-021). */
  replyInProgress: 'Wait for Aria to finish replying before sending again.',

  /** Failures. No status codes, no provider names, no upstream text (FR-030, FR-004). */
  failedGeneric: 'Something went wrong reaching the character. Try sending again.',
  failedTimeout: 'That took too long. Try sending again.',
  failedEmpty: 'Aria did not have anything to say to that. Try asking another way.',
  /** A reply that started and then stopped. What arrived stays on screen (spec Edge Cases). */
  failedStalled: 'Aria stopped mid-sentence. You can send another message.',
  failedInterrupted: 'Aria stopped mid-sentence. You can send another message.',
  replyCancelled: 'The reply was cancelled.',
  limited: 'The demo is temporarily limited. Please try again later.',
  failedSend: 'That message could not be sent.',
  /** Shown when thread creation fails on load (FR-045). Visitor reloads to reconnect. */
  backendUnavailable: 'Could not connect to the backend. Please reload the page to try again.',

  /** Rig attribution, required by the sample model's license (research D4). */
  attributionPrefix: 'Character model:',
} as const;

export type CopyKey = keyof typeof copy;
