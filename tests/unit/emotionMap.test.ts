import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { EMOTIONS, type Emotion } from '@/lib/emotion';
import {
  EMOTION_MAP,
  IDLE_MOTION_INDICES,
  STRONG_EMOTION_MOTION_INDICES,
  HAPPY_MOTION_INDICES,
  type EmotionPresentation,
} from '@/lib/character/emotionMap';
import { EMOTION_LABELS } from '@/lib/character/labels';

/**
 * T023 / T143 - Rig-inventory test obligation:
 * Read the vendored public/live2d/model/rem.json and assert every motionGroup
 * and .mtn file named in the emotion map actually exists in the model.
 */

const ROOT = join(import.meta.dirname, '..', '..');
const MODEL_DIR = join(ROOT, 'public', 'live2d', 'model');
const MODEL_FILE = join(MODEL_DIR, 'rem.json');

describe('Emotion Map matches rig inventory (T023, T143)', () => {
  it('covers every member of the Emotion union', () => {
    for (const emotion of EMOTIONS) {
      expect(EMOTION_MAP[emotion]).toBeDefined();
      const presentation: EmotionPresentation = EMOTION_MAP[emotion];
      expect(presentation.motionGroup).toBeTypeOf('string');
      if (presentation.expression !== undefined) {
        expect(presentation.expression).toBeTypeOf('string');
      }
      expect(presentation.label).toBe(EMOTION_LABELS[emotion]);
    }
  });

  it('every motionGroup and motion file exists in the vendored model manifest and on disk', () => {
    expect(existsSync(MODEL_FILE), `Model manifest not found at ${MODEL_FILE}`).toBe(true);

    const modelJson = JSON.parse(readFileSync(MODEL_FILE, 'utf8'));
    const motions = modelJson.motions || {};

    for (const [emotion, presentation] of Object.entries(EMOTION_MAP) as [Emotion, EmotionPresentation][]) {
      // 1. Motion group exists
      expect(
        motions[presentation.motionGroup],
        `Emotion "${emotion}" references motion group "${presentation.motionGroup}" which is missing from model manifest`
      ).toBeDefined();

      expect(
        Array.isArray(motions[presentation.motionGroup]) && motions[presentation.motionGroup].length > 0,
        `Motion group "${presentation.motionGroup}" has no motion files`
      ).toBe(true);

      if (presentation.motionIndex !== undefined) {
        const motionEntry = motions[presentation.motionGroup][presentation.motionIndex];
        expect(
          motionEntry,
          `Motion index ${presentation.motionIndex} does not exist in group "${presentation.motionGroup}"`
        ).toBeDefined();

        if (motionEntry?.file) {
          const mtnPath = join(MODEL_DIR, motionEntry.file);
          expect(
            existsSync(mtnPath),
            `Motion file ${motionEntry.file} does not exist on disk at ${mtnPath}`
          ).toBe(true);
        }
      }

      if (presentation.motionIndices !== undefined) {
        expect(presentation.motionIndices.length).toBeGreaterThan(0);
        for (const idx of presentation.motionIndices) {
          const motionEntry = motions[presentation.motionGroup][idx];
          expect(
            motionEntry,
            `Motion index ${idx} in motionIndices does not exist in group "${presentation.motionGroup}"`
          ).toBeDefined();

          if (motionEntry?.file) {
            const mtnPath = join(MODEL_DIR, motionEntry.file);
            expect(
              existsSync(mtnPath),
              `Motion file ${motionEntry.file} does not exist on disk at ${mtnPath}`
            ).toBe(true);
          }
        }
      }
    }
  });

  it('happy emotion defines multiple motions in HAPPY_MOTION_INDICES', () => {
    expect(HAPPY_MOTION_INDICES.length).toBeGreaterThan(1);
    expect(EMOTION_MAP.happy.motionIndices).toEqual(HAPPY_MOTION_INDICES);
    for (const happyIdx of HAPPY_MOTION_INDICES) {
      expect(IDLE_MOTION_INDICES).not.toContain(happyIdx);
      expect(STRONG_EMOTION_MOTION_INDICES).toContain(happyIdx);
    }
  });

  it('idle motion pool contains valid neutral motions and strictly excludes strong emotions (FR-005, Phase 14, Phase 16)', () => {
    const modelJson = JSON.parse(readFileSync(MODEL_FILE, 'utf8'));
    const talkMotions = modelJson.motions?.[EMOTION_MAP.neutral.motionGroup] || [];

    // All idle motions must exist in the model
    expect(IDLE_MOTION_INDICES.length).toBeGreaterThan(0);
    for (const index of IDLE_MOTION_INDICES) {
      expect(talkMotions[index], `Idle motion index ${index} missing in rem.json`).toBeDefined();
      if (talkMotions[index]?.file) {
        expect(existsSync(join(MODEL_DIR, talkMotions[index].file))).toBe(true);
      }
    }

    // Strong emotion indices must not overlap with idle motions
    for (const strongIndex of STRONG_EMOTION_MOTION_INDICES) {
      expect(
        IDLE_MOTION_INDICES,
        `Strong emotion index ${strongIndex} must not be present in IDLE_MOTION_INDICES`
      ).not.toContain(strongIndex);
    }

    // Explicitly verify angry and sad mapped emotions are excluded from idle
    expect(IDLE_MOTION_INDICES).not.toContain(EMOTION_MAP.angry.motionIndex);
    expect(IDLE_MOTION_INDICES).not.toContain(EMOTION_MAP.sad.motionIndex);
    expect(STRONG_EMOTION_MOTION_INDICES).toContain(EMOTION_MAP.angry.motionIndex);
    expect(STRONG_EMOTION_MOTION_INDICES).toContain(EMOTION_MAP.sad.motionIndex);
  });
});
