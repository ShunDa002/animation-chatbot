import { describe, expect, it } from 'vitest';
import { EMOTIONS, isEmotion, NEUTRAL, toEmotion } from '@/lib/emotion';

// Test obligations from contracts/emotion-seam.md.

describe('isEmotion', () => {
  it('accepts every member of the union', () => {
    for (const member of EMOTIONS) {
      expect(isEmotion(member), member).toBe(true);
    }
  });

  it.each([
    ['empty string', ''],
    ['wrong case', 'HAPPY'],
    ['near miss', 'joyful'],
    ['null', null],
    ['undefined', undefined],
    ['zero', 0],
    ['object', {}],
    ['array', []],
    ['trailing space', 'happy '],
    ['emotion-shaped cue', '[emotion:happy]'],
  ])('rejects %s', (_label, value) => {
    expect(isEmotion(value)).toBe(false);
  });
});

describe('toEmotion', () => {
  it('passes members through unchanged', () => {
    expect(toEmotion('sad')).toBe('sad');
  });

  it('falls back to neutral for anything else, and never throws (FR-019)', () => {
    for (const value of ['', 'ecstatic', null, undefined, 0, {}, []]) {
      expect(toEmotion(value)).toBe(NEUTRAL);
    }
  });
});

describe('the set itself', () => {
  it('holds 4 to 8 members, as FR-006 requires', () => {
    expect(EMOTIONS.length).toBeGreaterThanOrEqual(4);
    expect(EMOTIONS.length).toBeLessThanOrEqual(8);
  });

  it('includes a neutral default', () => {
    expect(EMOTIONS).toContain(NEUTRAL);
  });

  it('has no duplicates', () => {
    expect(new Set(EMOTIONS).size).toBe(EMOTIONS.length);
  });
});
