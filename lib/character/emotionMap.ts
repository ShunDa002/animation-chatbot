import type { Emotion } from '@/lib/emotion';
import { EMOTION_LABELS } from './labels';

/**
 * EmotionPresentation - defines how one Emotion is mapped to Live2D rig assets (data-model.md).
 *
 * Each emotion corresponds to:
 * - motionGroup: The motion group in rem.json ('talk')
 * - motionIndex: Index in the group
 * - expression: Optional expression (none for Cubism 2.1 Remu)
 * - label: Plain-word emotion name for aria-label (FR-038)
 */
export interface EmotionPresentation {
  motionGroup: string;
  motionIndex?: number;
  motionIndices?: readonly number[];
  expression?: string;
  label: string;
}

/**
 * Pools of motion indices for different emotions.
 * Sourced from rem.json "talk" motions.
 */
export const HAPPY_MOTION_INDICES: readonly number[] = [1, 12, 17, 23, 32, 34];
export const ANGRY_MOTION_INDICES: readonly number[] = [2, 6, 9, 14, 15, 22, 28];
export const SAD_MOTION_INDICES: readonly number[] = [5, 7, 24, 25];
export const SHY_MOTION_INDICES: readonly number[] = [8, 11, 19, 20, 27, 30];

/**
 * Resolves the motion index for a given presentation.
 * If the presentation defines multiple motionIndices, one is picked randomly.
 * Otherwise, the presentation's fixed motionIndex is returned.
 */
export function getMotionIndex(presentation: EmotionPresentation): number | undefined {
  if (presentation.motionIndices && presentation.motionIndices.length > 0) {
    const idx = Math.floor(Math.random() * presentation.motionIndices.length);
    return presentation.motionIndices[idx];
  }
  return presentation.motionIndex;
}

/**
 * The exhaustive emotion map derived from the Remu Live2D rig inventory (T145, FR-006, FR-007).
 *
 * Typed as Record<Emotion, EmotionPresentation> so missing any union member causes a compilation error.
 */
export const EMOTION_MAP: Record<Emotion, EmotionPresentation> = {
  neutral: {
    motionGroup: 'talk',
    motionIndex: 0,
    label: EMOTION_LABELS.neutral,
  },
  happy: {
    motionGroup: 'talk',
    motionIndices: HAPPY_MOTION_INDICES,
    get motionIndex(): number {
      const idx = Math.floor(Math.random() * HAPPY_MOTION_INDICES.length);
      return HAPPY_MOTION_INDICES[idx] ?? 1;
    },
    label: EMOTION_LABELS.happy,
  },
  sad: {
    motionGroup: 'talk',
    motionIndices: SAD_MOTION_INDICES,
    get motionIndex(): number {
      const idx = Math.floor(Math.random() * SAD_MOTION_INDICES.length);
      return SAD_MOTION_INDICES[idx] ?? 24;
    },
    label: EMOTION_LABELS.sad,
  },
  surprised: {
    motionGroup: 'talk',
    motionIndex: 5,
    label: EMOTION_LABELS.surprised,
  },
  angry: {
    motionGroup: 'talk',
    motionIndices: ANGRY_MOTION_INDICES,
    get motionIndex(): number {
      const idx = Math.floor(Math.random() * ANGRY_MOTION_INDICES.length);
      return ANGRY_MOTION_INDICES[idx] ?? 2;
    },
    label: EMOTION_LABELS.angry,
  },
  shy: {
    motionGroup: 'talk',
    motionIndices: SHY_MOTION_INDICES,
    get motionIndex(): number {
      const idx = Math.floor(Math.random() * SHY_MOTION_INDICES.length);
      return SHY_MOTION_INDICES[idx] ?? 23;
    },
    label: EMOTION_LABELS.shy,
  },
};

/**
 * Pool of neutral/subtle motion indices for the random idle sequence (FR-005, Phase 14, Phase 16).
 */
export const IDLE_MOTION_INDICES: readonly number[] = [0, 3, 4, 10, 13, 16, 18, 21, 26, 29, 31, 33];

/**
 * Strong emotional reaction motion indices that must NEVER be selected for the idle sequence (FR-005).
 */
export const STRONG_EMOTION_MOTION_INDICES: readonly number[] = [
  1, 2, 5, 6, 7, 8, 9, 11, 12, 14, 15, 17, 19, 20, 22, 23, 24, 25, 27, 28, 30, 32, 34,
];
