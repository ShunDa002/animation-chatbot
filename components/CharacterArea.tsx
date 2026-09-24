'use client';

import dynamic from 'next/dynamic';
import StillCharacter from '@/components/StillCharacter';
import { copy } from '@/lib/ui/copy';
import type { Emotion } from '@/lib/emotion';

const CharacterStage = dynamic(() => import('@/components/CharacterStage'), {
  ssr: false,
  loading: () => <StillCharacter emotion="neutral" label="calm" />,
});

interface Props {
  /** The one value that crosses the seam (FR-020). */
  emotion: Emotion;
  /** The second and last item of seam vocabulary (FR-010, FR-020). */
  thinking: boolean;
  modelUrl?: string;
  className?: string;
}

/**
 * The character area presentation wrapper (FR-001).
 *
 * Renders:
 * - Animated CharacterStage via next/dynamic (ssr: false) with fallback to StillCharacter (FR-012)
 * - Full-screen height with corresponding width, centered in screen width
 */
export default function CharacterArea({
  emotion,
  thinking,
  modelUrl,
  className = '',
}: Props) {
  return (
    <section
      className={`character-area relative flex items-center justify-center w-full h-full overflow-hidden bg-transparent ${className}`}
      aria-label="Character"
      data-thinking={thinking}
    >
      <CharacterStage emotion={emotion} thinking={thinking} modelUrl={modelUrl} />
      {thinking ? (
        <p className="character-status absolute top-16 left-4 sm:top-4 sm:left-4 text-xs text-[var(--text-muted)] m-0 z-10 bg-[var(--surface)]/70 backdrop-blur-xs px-2.5 py-1 rounded-md border border-[var(--border)]/50">
          {copy.waiting}
        </p>
      ) : null}
    </section>
  );
}
