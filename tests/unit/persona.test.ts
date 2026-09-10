import { describe, expect, it } from 'vitest';
import { buildPersona, CUE_VOCABULARY } from '@/lib/server/persona';
import { EMOTIONS, isEmotion } from '@/lib/emotion';
import { EMOTION_LABELS, everyEmotionHasALabel } from '@/lib/character/labels';
import { parseCue } from '@/lib/conversation/cue';

/**
 * T060 - the vocabulary the model is told it may emit must match the vocabulary the system can
 * resolve, exactly.
 *
 * A name the model can emit but the map cannot resolve falls back to neutral silently. That is legal
 * under FR-019 but wasteful: the reply carried a real emotional intent and the character ignored it.
 * A name the map has but the model is never told about is dead weight in the rig.
 */

describe('the cue vocabulary matches the union', () => {
  it('offers exactly the members of the union, no more and no fewer', () => {
    expect([...CUE_VOCABULARY].sort()).toEqual([...EMOTIONS].sort());
  });

  it('names every member in the persona text the model actually receives', () => {
    const persona = buildPersona();
    for (const emotion of EMOTIONS) {
      expect(persona, `persona never mentions ${emotion}`).toContain(emotion);
    }
  });

  it('every name it offers is one isEmotion accepts', () => {
    for (const name of CUE_VOCABULARY) {
      expect(isEmotion(name), name).toBe(true);
    }
  });
});

describe('the persona instruction is the one the parser implements', () => {
  it('asks for the marker form the cue reader strips', () => {
    const persona = buildPersona();
    expect(persona).toContain('[emotion:NAME]');
  });

  it('gives an example that survives the real parser', () => {
    // The worked example in the persona is the model's clearest signal about the format, so it has
    // to be an example the parser actually accepts. If this fails, the persona is teaching a shape
    // the code rejects.
    const persona = buildPersona();
    const example = persona
      .split('\n')
      .find((line) => /\[emotion:[a-z]+\]/.test(line) && !line.includes('NAME'));

    expect(example, 'the persona has no concrete example').toBeTruthy();

    const parsed = parseCue(example!.trim());
    expect(parsed.emotion).not.toBe('neutral'); // the example uses a real, non-default emotion
    expect(parsed.text).not.toContain('[');
    expect(parsed.isEmpty).toBe(false);
  });

  it('tells the model the cue is last, since the parser only reads a trailing cue', () => {
    expect(buildPersona()).toMatch(/last thing in your reply/i);
  });
});

describe('the persona stays server-side', () => {
  it('carries no credential and no provider name', () => {
    const persona = buildPersona();
    expect(persona.toLowerCase()).not.toContain('groq');
    expect(persona.toLowerCase()).not.toContain('api key');
    expect(persona).not.toMatch(/gsk_/);
  });
});

describe('every emotion is announceable (FR-038)', () => {
  it('has a non-empty plain-word label', () => {
    expect(everyEmotionHasALabel()).toBe(true);
  });

  it('labels every union member', () => {
    for (const emotion of EMOTIONS) {
      expect(EMOTION_LABELS[emotion], emotion).toBeTruthy();
    }
  });

  it('gives distinct labels, so two states do not read identically to a screen reader', () => {
    const labels = EMOTIONS.map((emotion) => EMOTION_LABELS[emotion]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
