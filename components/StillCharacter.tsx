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
 * The still fallback (FR-012, D13).
 *
 * Shown when the animated character cannot be displayed - a missing model file, a blocked request, no
 * WebGL.
 */
export default function StillCharacter({ emotion, label }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const description = copy.characterDescription(label);

  if (imageFailed) {
    return (
      <div
        className="flex items-center justify-center p-4 text-center w-full h-full"
        role="img"
        aria-label={description}
        data-emotion={emotion}
        data-still="text-only"
      >
        <p className="character-status text-xs sm:text-sm text-[var(--text-muted)] m-0">
          {description}
        </p>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/live2d/still.png"
      alt={description}
      data-emotion={emotion}
      data-still="image"
      className="block w-full h-full max-h-full object-contain select-none"
      onError={() => setImageFailed(true)}
    />
  );
}
