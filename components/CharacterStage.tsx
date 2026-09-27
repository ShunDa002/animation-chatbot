'use client';

import { useEffect, useRef, useState } from 'react';
import StillCharacter from '@/components/StillCharacter';
import { copy } from '@/lib/ui/copy';
import { EMOTION_LABELS } from '@/lib/character/labels';
import { isReducedMotionPreferred } from '@/lib/character/reducedMotion';
import { createCharacter, type CharacterHandle } from '@/lib/character/renderer';
import type { Emotion } from '@/lib/emotion';

interface Props {
  /** The one value that crosses the seam (FR-020). */
  emotion: Emotion;
  /** The second and last item of seam vocabulary (FR-010, FR-020). */
  thinking: boolean;
  /** Optional override for tests (defaults to Remu Cubism 2.1 model). */
  modelUrl?: string;
  /** Optional callback for unavailability testing. */
  onUnavailable?: () => void;
}

/**
 * CharacterStage - mounts the Live2D canvas and manages the renderer lifecycle (T032, T034, FR-013, D13).
 *
 * Client-only component loaded with next/dynamic { ssr: false }.
 * - Mounts createCharacter in useEffect and invokes destroy() on cleanup (safe under StrictMode double-invoke).
 * - Exposes window.__characterHandle, window.__setEmotion, and window.__setThinking for dev-console and tests.
 * - Displays StillCharacter fallback if WebGL or assets are unavailable (FR-012).
 * - Container carries role="img" with aria-label describing character & emotion (FR-038).
 */
export default function CharacterStage({
  emotion,
  thinking,
  modelUrl = '/live2d/model/rem.json',
  onUnavailable: onUnavailableProp,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<CharacterHandle | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [stageLabel, setStageLabel] = useState<string>(() => EMOTION_LABELS[emotion] || 'calm');

  // Ref tracking latest props for async resolution
  const latestProps = useRef({ emotion, thinking });
  useEffect(() => {
    latestProps.current = { emotion, thinking };
  }, [emotion, thinking]);

  // Initialize renderer on mount and teardown on unmount (FR-013)
  useEffect(() => {
    const controller = new AbortController();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = isReducedMotionPreferred();

    createCharacter({
      canvas,
      modelUrl,
      reducedMotion,
      signal: controller.signal,
      onUnavailable: () => {
        if (controller.signal.aborted) return;
        setUnavailable(true);
        onUnavailableProp?.();
      },
      onLabelChange: (label) => {
        if (controller.signal.aborted) return;
        setStageLabel(label);
      },
    }).then((handle) => {
      if (controller.signal.aborted) {
        handle.destroy();
        return;
      }
      handleRef.current = handle;

      // Sync initial/current props once handle is ready
      handle.setEmotion(latestProps.current.emotion);
      handle.setThinking(latestProps.current.thinking);

      // Dev-console handles for manual reaction triggers (T032, US1 verification)
      if (typeof window !== 'undefined') {
        (window as any).__characterHandle = handle;
        (window as any).__setEmotion = (e: Emotion) => {
          handle.setEmotion(e);
          setStageLabel(EMOTION_LABELS[e] || 'calm');
        };
        (window as any).__setThinking = (t: boolean) => handle.setThinking(t);
        (window as any).__setFocus = (x: number, y: number) => handle.setFocus(x, y);
      }
    });

    const onResize = () => {
      handleRef.current?.resize();
    };
    window.addEventListener('resize', onResize);

    // Document-level pointer tracking (FR-048, D17, T152)
    const onPointerMove = (event: PointerEvent) => {
      if (!handleRef.current?.ready) return;
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = (event.clientY / window.innerHeight) * 2 - 1;
      handleRef.current.setFocus(x, y);
    };

    const onPointerReset = () => {
      if (!handleRef.current?.ready) return;
      handleRef.current.setFocus(0, 0);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerReset);
    window.addEventListener('pointercancel', onPointerReset);
    window.addEventListener('pointerleave', onPointerReset);

    return () => {
      controller.abort();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerReset);
      window.removeEventListener('pointercancel', onPointerReset);
      window.removeEventListener('pointerleave', onPointerReset);

      if (handleRef.current) {
        handleRef.current.destroy();
        handleRef.current = null;
      }

      if (typeof window !== 'undefined') {
        delete (window as any).__characterHandle;
        delete (window as any).__setEmotion;
        delete (window as any).__setThinking;
        delete (window as any).__setFocus;
      }
    };
  }, [modelUrl, onUnavailableProp]);

  // Forward emotion changes across the seam
  useEffect(() => {
    if (handleRef.current && handleRef.current.ready) {
      handleRef.current.setEmotion(emotion);
    }
  }, [emotion]);

  // Forward thinking state across the seam
  useEffect(() => {
    if (handleRef.current && handleRef.current.ready) {
      handleRef.current.setThinking(thinking);
    }
  }, [thinking]);

  const effectiveLabel = thinking ? 'thoughtful' : (stageLabel || EMOTION_LABELS[emotion] || 'calm');
  const description = copy.characterDescription(effectiveLabel);

  if (unavailable) {
    return <StillCharacter emotion={emotion} label={effectiveLabel} />;
  }

  return (
    <div
      className="character-stage absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden"
      role="img"
      aria-label={description}
      data-emotion={emotion}
    >
      <canvas ref={canvasRef} className="w-full h-full object-contain block" />
    </div>
  );
}
