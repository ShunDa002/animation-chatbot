import '@testing-library/react';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Constitution II: tests must be deterministic - no reliance on wall-clock time, network access, or
// random seeds unless the seed is fixed and the clock is injected. Anything that needs a clock takes
// one as a parameter; nothing here reaches the network.

afterEach(() => {
  cleanup();
});

// jsdom does not implement matchMedia, which lib/character/reducedMotion.ts reads before the first
// frame. Default to "no preference" so a test that cares must say so explicitly.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
