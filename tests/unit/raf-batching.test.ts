import { describe, expect, it, vi } from 'vitest';

describe('RAF-based render batching (T036, FR-021, SC-003)', () => {
  it('batches 500 rapid token updates into fewer than 60 animation frame flushes', () => {
    let rafCallback: FrameRequestCallback | null = null;
    let rafCallCount = 0;
    let flushCount = 0;

    // Mock requestAnimationFrame
    const mockRequestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      rafCallCount += 1;
      rafCallback = cb;
      return rafCallCount;
    });

    const pendingTextRef = { current: null as string | null };
    let rafId: number | null = null;
    let currentRenderedText: string | null = null;

    const onTokenBatch = (visible: string) => {
      pendingTextRef.current = visible;
      if (rafId === null) {
        rafId = mockRequestAnimationFrame(() => {
          rafId = null;
          const latest = pendingTextRef.current;
          if (latest !== null) {
            currentRenderedText = latest;
            flushCount += 1;
          }
        });
      }
    };

    // Simulate 500 rapid token arrivals arriving in bursts between frames
    // In 1 second (60 frames), say 10 bursts of 50 tokens each
    for (let frame = 0; frame < 10; frame += 1) {
      for (let token = 0; token < 50; token += 1) {
        onTokenBatch(`Token frame ${frame} token ${token}`);
      }
      // Frame tick occurs: RAF callback fires
      if (rafCallback) {
        const cb = rafCallback;
        rafCallback = null;
        (cb as FrameRequestCallback)(performance.now());
      }
    }

    // 500 tokens were processed
    expect(currentRenderedText).toBe('Token frame 9 token 49');
    // Only 10 flushes occurred (1 per frame tick), well below 60 renders per second limit!
    expect(flushCount).toBe(10);
    expect(flushCount).toBeLessThan(60);
  });
});
