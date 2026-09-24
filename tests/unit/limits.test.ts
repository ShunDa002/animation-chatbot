import { describe, expect, it } from 'vitest';
import {
  atCharacterLimit,
  clampInput,
  isSendable,
  MAX_INPUT_CHARACTERS,
  remainingCharacters,
} from '@/lib/conversation/limits';

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
