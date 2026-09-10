'use client';

import { useState } from 'react';
import { copy } from '@/lib/ui/copy';
import type { Emotion } from '@/lib/emotion';

interface Props {
  /** Named so the description stays accurate even with no animation (FR-038). */
  emotion: Emotion;
  label: string;
}

/**
 * The still fallback (FR-012).
 *
 * Shown when the animated character cannot be displayed - a missing model file, a blocked request, no
 * WebGL - and used deliberately as the whole character layer while the conversation is built and
 * tested on its own.
 *
 * If the image itself is missing the text description stands in for it. FR-012 requires the rest of
 * the page to remain fully usable, and a broken-image icon beside a working conversation satisfies
 * the letter of that but not the point.
 */
export default function StillCharacter({ emotion, label }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const description = copy.characterDescription(label);

  if (imageFailed) {
    return (
      <div role="img" aria-label={description} data-emotion={emotion} data-still="text-only">
        <p className="character-status">{description}</p>
      </div>
    );
  }

  return (
    // next/image would add an optimizer round trip for one static local asset, and its error
    // handling does not expose the onError fallback this component depends on for FR-012.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/live2d/still.png"
      alt={description}
      data-emotion={emotion}
      data-still="image"
      onError={() => setImageFailed(true)}
    />
  );
}
