import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aria - animated character chat',
  description:
    'A rigged 2D character that reacts to what it says. Type a message and watch her respond.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/*
          The Cubism Core runtime is not published to npm, so it is vendored into public/ and loaded
          as a global. `beforeInteractive` is load-bearing, not a performance choice: both PixiJS and
          pixi-live2d-display touch window at module scope, and the renderer asserts
          window.Live2DCubismCore before it initialises. This strategy is what guarantees the global
          exists before hydration (research D2, D3).

          If the file is absent, the renderer calls onUnavailable and the still image is shown - the
          page stays fully usable (FR-012).
        */}
        <Script src="/live2d/core/live2dcubismcore.min.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
