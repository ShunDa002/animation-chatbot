import type { Emotion } from '@/lib/emotion';
import { EMOTION_LABELS } from './labels';

/**
 * EmotionPresentation - defines how one Emotion is mapped to Live2D rig assets (data-model.md).
 *
 * Each emotion corresponds to:
 * - motionGroup: The motion group in 1024113.model3.json
 * - motionIndex: Optional index in the group (undefined lets renderer pick/default)
 * - expression: The .exp3.json expression name to persist after motion ends
 * - label: Plain-word emotion name for aria-label (FR-038)
 */
export interface EmotionPresentation {
  motionGroup: string;
  motionIndex?: number;
  expression?: string;
  label: string;
}

/**
 * The exhaustive emotion map derived from the 1024113 Live2D rig inventory (T011, FR-006, FR-007).
 *
 * Typed as Record<Emotion, EmotionPresentation> so missing any union member causes a compilation error.
 */
export const EMOTION_MAP: Record<Emotion, EmotionPresentation> = {
  neutral: {
    motionGroup: '',
    motionIndex: 14,
    label: EMOTION_LABELS.neutral,
  },
  happy: {
    motionGroup: '',
    motionIndex: 26,
    label: EMOTION_LABELS.happy,
  },
  sad: {
    motionGroup: '',
    motionIndex: 6,
    label: EMOTION_LABELS.sad,
  },
  surprised: {
    motionGroup: '',
    motionIndex: 9,
    label: EMOTION_LABELS.surprised,
  },
  angry: {
    motionGroup: '',
    motionIndex: 7,
    label: EMOTION_LABELS.angry,
  },
  shy: {
    motionGroup: '',
    motionIndex: 20,
    label: EMOTION_LABELS.shy,
  },
};

/**
 * Pool of neutral/subtle motion indices for the random idle sequence (FR-005, Phase 14).
 * Sourced from 1024113.model3.json motions:
 * - 0: 00_Puzzle_01 (subtle head tilt/curious)
 * - 2: 20_Expression_Smile_01 (subtle smile)
 * - 5: bound (subtle idle bounce)
 * - 8: 00_Doubt_01 (subtle curious/doubt)
 * - 13: 20_Expression_Eye_01 (subtle eye glance/blink)
 * - 14: 00_Wait_01 (standard wait/standing idle)
 * - 17: 20_Expression_Serious_01 (subtle calm/serious)
 * - 21: 00_Serious_01 (subtle posture adjustment)
 * - 27: 20_Expression_Puzzle_01 (subtle thought expression)
 * - 28: bound_down (subtle settle bounce)
 */
export const IDLE_MOTION_INDICES: readonly number[] = [0, 2, 5, 8, 13, 14, 17, 21, 27, 28];

/**
 * Strong emotional reaction motion indices that must NEVER be selected for the idle sequence (FR-005).
 * Sourced from 1024113.model3.json motions:
 * - 1: 20_Expression_Sad_01 (Sad)
 * - 4: 20_Expression_Upset_01 (Upset)
 * - 6: 00_Sad_01 (Sad)
 * - 7: 00_Anger_01 (Anger)
 * - 9: 00_Surprise_01 (Surprise)
 * - 10: 00_Excite_01 (Excite)
 * - 11: 20_Expression_Shame_01 (Shame)
 * - 15: 00_Anger_02 (Anger)
 * - 16: 20_Expression_Anger_01 (Anger)
 * - 20: 00_Shame_01 (Shame)
 * - 23: 00_Upset_01 (Upset)
 * - 25: 00_Cry_01 (Cry)
 * - 26: 00_Happy_01 (Happy)
 */
export const STRONG_EMOTION_MOTION_INDICES: readonly number[] = [
  1, 4, 6, 7, 9, 10, 11, 15, 16, 20, 23, 25, 26,
];

