import type { Emotion } from '@/lib/emotion';
import { EMOTION_LABELS } from './labels';

/**
 * EmotionPresentation - defines how one Emotion is mapped to Live2D rig assets (data-model.md).
 *
 * Each emotion corresponds to:
 * - motionGroup: The motion group in haru.model3.json
 * - motionIndex: Optional index in the group (undefined lets renderer pick/default)
 * - expression: The .exp3.json expression name to persist after motion ends
 * - label: Plain-word emotion name for aria-label (FR-038)
 */
export interface EmotionPresentation {
  motionGroup: string;
  motionIndex?: number;
  expression: string;
  label: string;
}

/**
 * The exhaustive emotion map derived from the Haru Live2D rig inventory (T011, FR-006, FR-007).
 *
 * Typed as Record<Emotion, EmotionPresentation> so missing any union member causes a compilation error.
 */
export const EMOTION_MAP: Record<Emotion, EmotionPresentation> = {
  neutral: {
    motionGroup: 'Tap',
    expression: 'Normal',
    label: EMOTION_LABELS.neutral,
  },
  happy: {
    motionGroup: 'Flick',
    expression: 'Smile',
    label: EMOTION_LABELS.happy,
  },
  sad: {
    motionGroup: 'Flick3',
    expression: 'Sad',
    label: EMOTION_LABELS.sad,
  },
  surprised: {
    motionGroup: 'FlickLeft',
    expression: 'Surprised',
    label: EMOTION_LABELS.surprised,
  },
  angry: {
    motionGroup: 'Shake',
    expression: 'Angry',
    label: EMOTION_LABELS.angry,
  },
  shy: {
    motionGroup: 'FlickRight',
    expression: 'Blushing',
    label: EMOTION_LABELS.shy,
  },
};
