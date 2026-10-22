import { describe, expect, it } from 'vitest';
import {
  atCharacterLimit,
  clampInput,
  isSendable,
  MAX_INPUT_CHARACTERS,
  remainingCharacters,
  MAX_RAG_FILE_BYTES,
  ALLOWED_RAG_EXTENSIONS,
  formatFileSize,
  getRagFileExtension,
  validateRagFile,
} from '@/lib/conversation/limits';
import { copy } from '@/lib/ui/copy';

describe('the 300-character input cap (FR-022)', () => {
  it('is 300', () => {
    expect(MAX_INPUT_CHARACTERS).toBe(300);
  });

  it('reports what is left, and never goes negative', () => {
    expect(remainingCharacters('')).toBe(300);
    expect(remainingCharacters('abc')).toBe(297);
    expect(remainingCharacters('x'.repeat(300))).toBe(0);
    expect(remainingCharacters('x'.repeat(400))).toBe(0);
  });

  it('knows when the cap is reached', () => {
    expect(atCharacterLimit('x'.repeat(299))).toBe(false);
    expect(atCharacterLimit('x'.repeat(300))).toBe(true);
  });

  it('stops input at the cap rather than truncating silently at send', () => {
    expect(clampInput('x'.repeat(305))).toHaveLength(300);
    expect(clampInput('short')).toBe('short');
  });

  it('refuses a blank or whitespace-only draft', () => {
    expect(isSendable('')).toBe(false);
    expect(isSendable('   \n ')).toBe(false);
    expect(isSendable(' hi ')).toBe(true);
  });
});

describe('RAG document file validation (FR-043, US9)', () => {
  it('defines MAX_RAG_FILE_BYTES as 3 MB and ALLOWED_RAG_EXTENSIONS for .pdf, .txt, .md, .docx', () => {
    expect(MAX_RAG_FILE_BYTES).toBe(3 * 1024 * 1024);
    expect(ALLOWED_RAG_EXTENSIONS).toEqual(['.pdf', '.txt', '.md', '.docx']);
  });

  it('formats byte sizes into readable strings', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3 MB');
  });

  it('extracts lowercased file extension correctly', () => {
    expect(getRagFileExtension('notes.PDF')).toBe('.pdf');
    expect(getRagFileExtension('archive.tar.gz')).toBe('.gz');
    expect(getRagFileExtension('noextension')).toBe('');
  });

  it('rejects validation when no file is provided', () => {
    const result = validateRagFile(null, 'thread-123');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe(copy.ragErrorNoFile);
    }
  });

  it('rejects validation when threadId is explicitly null or empty', () => {
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    const resultNull = validateRagFile(file, null);
    expect(resultNull.valid).toBe(false);
    if (!resultNull.valid) {
      expect(resultNull.error).toBe(copy.ragErrorNoConversation);
    }

    const resultEmpty = validateRagFile(file, '');
    expect(resultEmpty.valid).toBe(false);
    if (!resultEmpty.valid) {
      expect(resultEmpty.error).toBe(copy.ragErrorNoConversation);
    }
  });

  it('rejects empty (0-byte) files', () => {
    const emptyFile = new File([], 'empty.txt', { type: 'text/plain' });
    const result = validateRagFile(emptyFile, 'thread-123');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe(copy.ragErrorEmptyFile);
    }
  });

  it('rejects unsupported file formats', () => {
    const badFile = new File(['test'], 'script.py', { type: 'text/x-python' });
    const result = validateRagFile(badFile, 'thread-123');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe(copy.ragErrorUnsupportedFormat);
    }
  });

  it('rejects files larger than 3 MB', () => {
    const oversizeBytes = new Uint8Array(3 * 1024 * 1024 + 1);
    const largeFile = new File([oversizeBytes], 'large.pdf', { type: 'application/pdf' });
    const result = validateRagFile(largeFile, 'thread-123');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe(copy.ragErrorFileTooLarge);
    }
  });

  it('accepts valid supported files up to 3 MB', () => {
    for (const ext of ['.pdf', '.txt', '.md', '.docx']) {
      const validFile = new File(['valid content'], `doc${ext}`);
      const result = validateRagFile(validFile, 'thread-123');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.extension).toBe(ext);
        expect(result.sizeFormatted).toBeTruthy();
      }
    }
  });
});
