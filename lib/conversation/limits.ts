/**
 * The conversation side of the character cap (FR-022), plus the shapes the log is made of.
 *
 * The number itself lives in lib/limits.ts, which imports nothing.
 */

import { MAX_INPUT_CHARACTERS } from '@/lib/limits';
import { copy } from '@/lib/ui/copy';
import type { ToolCallRecord } from './stream-types';

export { MAX_INPUT_CHARACTERS };

export type MessageStatus =
  | 'pending'
  | 'streaming'
  | 'completed'
  | 'cancelled'
  | 'interrupted'
  | 'error';

export type MessageAuthor = 'visitor' | 'character';

export type InterruptDecision = 'yes' | 'no' | boolean | Record<string, unknown>;

export interface Message {
  id: string;
  author: MessageAuthor;
  /** Display text. The cue has already been stripped (FR-018). */
  text: string;
  status: MessageStatus;
  toolCalls?: ToolCallRecord[];
  interruptId?: string;
  interruptDecision?: InterruptDecision;
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

/** RAG Document Upload constraints (FR-043, US9) */
export const MAX_RAG_FILE_BYTES = 3 * 1024 * 1024; // 3 MB
export const ALLOWED_RAG_EXTENSIONS = ['.pdf', '.txt', '.md', '.docx'] as const;
export type AllowedRagExtension = (typeof ALLOWED_RAG_EXTENSIONS)[number];

export type RagUploadStatus =
  | 'idle'
  | 'selected'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'already_added'
  | 'failed';

export interface ThreadRagUploadState {
  status: RagUploadStatus;
  file: File | null;
  fileName: string | null;
  fileTypeLabel: string | null;
  fileSizeBytes: number | null;
  progress: number | null;
  statusMessage: string | null;
  originalFilename?: string | null;
}

export type RagFileValidationResult =
  | {
      valid: true;
      file: File;
      extension: string;
      sizeFormatted: string;
    }
  | {
      valid: false;
      error: string;
      file?: File;
    };

/** Formats byte sizes into human-readable strings (e.g. 500 B, 1.2 KB, 3 MB). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    const formatted = kb % 1 === 0 ? kb.toFixed(0) : kb.toFixed(1);
    return `${formatted} KB`;
  }
  const mb = bytes / (1024 * 1024);
  const formatted = mb % 1 === 0 ? mb.toFixed(0) : mb.toFixed(1);
  return `${formatted} MB`;
}

/** Extracts normalized file extension with dot (e.g. '.pdf'). */
export function getRagFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) return '';
  return fileName.slice(lastDot).toLowerCase();
}

/** Validates a file against RAG document upload constraints (FR-043). */
export function validateRagFile(
  file: File | null | undefined,
  threadId?: string | null,
): RagFileValidationResult {
  if (threadId === null || threadId === '') {
    return {
      valid: false,
      error: copy.ragErrorNoConversation,
    };
  }

  if (!file) {
    return {
      valid: false,
      error: copy.ragErrorNoFile,
    };
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: copy.ragErrorEmptyFile,
      file,
    };
  }

  const ext = getRagFileExtension(file.name);
  if (!ALLOWED_RAG_EXTENSIONS.includes(ext as AllowedRagExtension)) {
    return {
      valid: false,
      error: copy.ragErrorUnsupportedFormat,
      file,
    };
  }

  if (file.size > MAX_RAG_FILE_BYTES) {
    return {
      valid: false,
      error: copy.ragErrorFileTooLarge,
      file,
    };
  }

  return {
    valid: true,
    file,
    extension: ext,
    sizeFormatted: formatFileSize(file.size),
  };
}
