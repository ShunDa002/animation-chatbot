import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { EMOTIONS, type Emotion } from '@/lib/emotion';
import {
  EMOTION_MAP,
  IDLE_MOTION_INDICES,
  STRONG_EMOTION_MOTION_INDICES,
  type EmotionPresentation,
} from '@/lib/character/emotionMap';
import { EMOTION_LABELS } from '@/lib/character/labels';

/**
 * T023 - Rig-inventory test obligation:
 * Read the vendored public/live2d/model/*.model3.json and assert every motionGroup
 * and expression named in the emotion map actually exists in the model.
 */

const ROOT = join(import.meta.dirname, '..', '..');
const MODEL_DIR = join(ROOT, 'public', 'live2d', 'model');
const MODEL_FILE = join(MODEL_DIR, '1024113.model3.json');

describe('Emotion Map matches rig inventory (T023)', () => {
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

  it('every motionGroup and expression exists in the vendored model manifest', () => {
    expect(existsSync(MODEL_FILE), `Model manifest not found at ${MODEL_FILE}`).toBe(true);

    const modelJson = JSON.parse(readFileSync(MODEL_FILE, 'utf8'));
    const motions = modelJson.FileReferences?.Motions || {};
    const expressionsList = modelJson.FileReferences?.Expressions || [];
    const expressionNames = new Set(expressionsList.map((e: { Name: string }) => e.Name));

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
        expect(
          motions[presentation.motionGroup][presentation.motionIndex],
          `Motion index ${presentation.motionIndex} does not exist in group "${presentation.motionGroup}"`
        ).toBeDefined();
      }

      // 2. Expression exists in manifest or on disk (only if specified)
      if (presentation.expression) {
        const expFile = join(MODEL_DIR, 'expressions', `${presentation.expression}.exp3.json`);
        const existsInManifest = expressionNames.has(presentation.expression);
        const existsOnDisk = existsSync(expFile);

        expect(
          existsInManifest || existsOnDisk,
          `Expression "${presentation.expression}" for emotion "${emotion}" not found in manifest or on disk at ${expFile}`
        ).toBe(true);
      }
    }
  });

  it('idle motion pool contains valid neutral motions and strictly excludes strong emotions (FR-005, Phase 14)', () => {
    const modelJson = JSON.parse(readFileSync(MODEL_FILE, 'utf8'));
    const rootMotions = modelJson.FileReferences?.Motions?.[''] || [];

    // All idle motions must exist in the model
    expect(IDLE_MOTION_INDICES.length).toBeGreaterThan(0);
    for (const index of IDLE_MOTION_INDICES) {
      expect(rootMotions[index], `Idle motion index ${index} missing in model3.json`).toBeDefined();
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

