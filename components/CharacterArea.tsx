'use client';

import StillCharacter from '@/components/StillCharacter';
import { copy } from '@/lib/ui/copy';
import { EMOTION_LABELS } from '@/lib/character/labels';
import type { Emotion } from '@/lib/emotion';

interface Props {
  /** The one value that crosses the seam (FR-020). */
  emotion: Emotion;
  /** The second and last item of seam vocabulary. */
  thinking: boolean;
}

/**
 * The character area.
 *
 * This is the presentation wrapper: it decides whether the animated renderer or the still image is on
 * screen, and it carries the text description of the character's current state (FR-038).
 *
 * It currently renders the still image unconditionally, because the animated renderer needs a
 * vendored Cubism model that is a license-gated manual download (tasks T010 to T012). The seam is
 * unaffected by that: this component receives one Emotion and one boolean and nothing else, so
 * swapping the still image for the renderer changes this file and lib/character/** only, which is
 * exactly the replaceability SC-012 asks to be demonstrable.
 */
export default function CharacterArea({ emotion, thinking }: Props) {
  const label = thinking ? 'thoughtful' : EMOTION_LABELS[emotion];

  return (
    <section className="character-area" aria-label="Character" data-thinking={thinking}>
      <StillCharacter emotion={emotion} label={label} />
      {thinking ? <p className="character-status">{copy.waiting}</p> : null}
    </section>
  );
}
