import next from 'eslint-config-next';
import coreWebVitals from 'eslint-config-next/core-web-vitals';

/**
 * The `boundaries` blocks below are not style rules. They are the physical enforcement of the
 * emotion seam described in specs/001-animated-character-chat/contracts/emotion-seam.md.
 *
 * The contract's own words: "a seam maintained by reviewer memory is a seam that closes within a
 * month". A cross-seam import must therefore fail `npm run lint`, not earn a review comment.
 *
 * The allow/forbid table this encodes:
 *   lib/character/**    may import lib/emotion, lib/ui/tokens   forbidden: lib/conversation, lib/server
 *   lib/conversation/** may import lib/emotion, lib/ui/*        forbidden: lib/character, lib/server
 *   lib/server/**       may import lib/emotion                 forbidden: components, lib/character, lib/conversation
 *   lib/emotion.ts      imports NOTHING, ever
 */

const seamMessage =
  'Emotion seam violation. The only vocabulary between conversation and character is the Emotion ' +
  'value in lib/emotion.ts. See contracts/emotion-seam.md before changing this rule.';

const config = [
  ...next,
  ...coreWebVitals,

  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'public/live2d/core/**', // vendored minified Cubism Core - not ours to lint
      'next-env.d.ts',
    ],
  },

  // lib/emotion.ts is the load-bearing file: it imports nothing, so it cannot drag anything
  // across the seam with it.
  {
    files: ['lib/emotion.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['*', '**/*'],
              message:
                'lib/emotion.ts must import nothing. Rule 4 of contracts/emotion-seam.md: the file ' +
                'has no dependencies, so it cannot drag anything across the seam with it.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['lib/character/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/conversation/*', '@/lib/server/*', '../conversation/*', '../server/*'],
              message: `${seamMessage} lib/character may not know that a message, a turn, or a provider exists.`,
            },
          ],
        },
      ],
    },
  },

  {
    files: ['lib/conversation/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/lib/character/*',
                '@/lib/server/*',
                '../character/*',
                '../server/*',
                '@/app/api/*',
                '../api/*',
              ],
              message: `${seamMessage} lib/conversation does not know whether a canvas, a still image, or nothing at all is on the other side, and does not import from app/api.`,
            },
          ],
        },
      ],
    },
  },
];

export default config;
