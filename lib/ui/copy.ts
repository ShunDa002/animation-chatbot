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
  characterDescription: (label: string) => `REM, an animated character. She looks ${label}.`,

  /** Announced when the wait begins (FR-037). */
  thinking: 'REM is thinking about a reply.',
  /** Visible in the panel for the same state. */
  waiting: 'Thinking…',
  /** Visible and announced during the initial thread-creation phase on load (FR-045). */
  connecting: 'Connecting…',

  /** Announced once, whole, when the reply is complete (FR-036). */
  replyComplete: (text: string) => `REM replied: ${text}`,

  inputLabel: 'Message REM',
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
  replyInProgress: 'Wait for REM to finish replying before sending again.',

  /** Failures. No status codes, no provider names, no upstream text (FR-030, FR-004). */
  failedGeneric: 'Something went wrong reaching the character. Try sending again.',
  failedTimeout: 'That took too long. Try sending again.',
  failedEmpty: 'REM did not have anything to say to that. Try asking another way.',
  /** A reply that started and then stopped. What arrived stays on screen (spec Edge Cases). */
  failedStalled: 'REM stopped mid-sentence. You can send another message.',
  failedInterrupted: 'REM stopped mid-sentence. You can send another message.',
  replyCancelled: 'The reply was cancelled.',
  limited: 'The demo is temporarily limited. Please try again later.',
  failedSend: 'That message could not be sent.',
  /** Shown when thread creation fails on load (FR-045). Visitor reloads to reconnect. */
  backendUnavailable: 'Could not connect to the backend. Please reload the page to try again.',

  /** RAG Document Upload (FR-005, FR-043-FR-047, US9) */
  ragPanelTitle: 'Add knowledge document',
  ragScopeNotice: 'Documents added here are scoped to this conversation to improve answers.',
  ragPrivacyNotice: 'Do not upload private or unauthorized documents.',
  ragSupportedFormatsNotice: 'Supported formats: .pdf, .txt, .md, .docx (max 3 MB)',
  ragDropzonePrompt: 'Drag and drop a file here, or click to browse',
  ragBrowseLabel: 'Browse files',
  ragUploadActionLabel: 'Upload',
  ragReplaceActionLabel: 'Replace',
  ragRemoveActionLabel: 'Remove',
  ragRetryActionLabel: 'Retry',
  ragDismissActionLabel: 'Dismiss',
  ragClosePanelLabel: 'Close upload panel',
  ragStatusIdle: 'No document selected',
  ragStatusUploading: 'Uploading document…',
  ragStatusProcessing: 'Preparing document for use…',
  ragStatusReady: 'Document is ready. You can now ask questions about it.',
  ragStatusDuplicate: 'This document is already available in this conversation.',
  ragErrorNoFile: 'Select a document before uploading.',
  ragErrorEmptyFile: 'The selected file is empty. Choose a file with content.',
  ragErrorUnsupportedFormat: 'Unsupported file format. Choose a .pdf, .txt, .md, or .docx file.',
  ragErrorFileTooLarge: 'File exceeds the 3 MB limit. Choose a smaller file.',
  ragErrorNoConversation: 'Start or select an active conversation before uploading a document.',
  ragErrorUnreadableText: 'The document contains no readable text. Choose another file.',
  ragErrorNetwork: 'Network interrupted while uploading. Try again.',
  ragErrorServiceUnavailable: 'The upload service is temporarily unavailable. Try again shortly.',
  ragErrorGeneric: 'The document could not be processed. Try again or select another file.',
  ragUploadInProgressReason: 'Wait for the document upload to finish before sending a message.',
} as const;

export type CopyKey = keyof typeof copy;
