import { EMOTIONS, type Emotion } from '@/lib/emotion';

/**
 * The plain-word name of each emotional state, for the character area's text description (FR-038).
 *
 * This is the character side of the seam, so it lives under lib/character/ - the conversation layer
 * never sees it. It is deliberately separate from lib/character/emotionMap.ts: the map needs the
 * rig's motion-group and expression names, which cannot be known until the model is vendored and
 * inventoried (T010 to T012), whereas a label is knowable now and FR-038 needs one today.
 *
 * Typed as Record<Emotion, string>, so adding a member to the union without labelling it fails the
 * build rather than announcing "undefined" to a screen reader.
 */
export const EMOTION_LABELS: Record<Emotion, string> = {
  neutral: 'calm',
  happy: 'happy',
  sad: 'sad',
  surprised: 'surprised',
  angry: 'annoyed',
  shy: 'shy',
};

/** Guard against a label being added as an empty string, which would announce nothing. */
export function everyEmotionHasALabel(): boolean {
  return EMOTIONS.every((emotion) => (EMOTION_LABELS[emotion] ?? '').trim().length > 0);
}
