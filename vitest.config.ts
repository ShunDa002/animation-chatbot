import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/component/**/*.test.tsx', 'tests/components/**/*.test.tsx'],
    // tests/e2e is Playwright's. Vitest must not try to run it.
    exclude: ['tests/e2e/**', 'node_modules/**'],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
