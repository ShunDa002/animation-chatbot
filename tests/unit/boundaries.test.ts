import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * T016 - a second net under the lint rule in eslint.config.mjs.
 *
 * The lint rule is the primary enforcement, but a lint config is one `// eslint-disable` away from
 * being advisory. This test reads the source and cannot be silenced from inside the file it judges.
 *
 * The allow/forbid table is contracts/emotion-seam.md's, verbatim.
 */

const ROOT = join(import.meta.dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  let found: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return []; // directory not created yet - a missing layer cannot violate the seam
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found = found.concat(sourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

function importsOf(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const specifiers: string[] = [];
  const pattern = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(src)) !== null) {
    if (match[1]) specifiers.push(match[1]);
  }
  return specifiers;
}

interface Layer {
  name: string;
  dir: string;
  forbidden: RegExp[];
}

const LAYERS: Layer[] = [
  {
    name: 'lib/character',
    dir: join(ROOT, 'lib', 'character'),
    forbidden: [/lib\/conversation/, /lib\/server/, /\.\.\/conversation/, /\.\.\/server/],
  },
  {
    name: 'lib/conversation',
    dir: join(ROOT, 'lib', 'conversation'),
    forbidden: [/lib\/character/, /lib\/server/, /\.\.\/character/, /\.\.\/server/],
  },
  {
    name: 'lib/server',
    dir: join(ROOT, 'lib', 'server'),
    forbidden: [/lib\/character/, /lib\/conversation/, /components\//, /lib\/ui/],
  },
];

describe('the emotion seam holds', () => {
  it.each(LAYERS.map((l) => [l.name, l] as const))('%s reaches across nothing', (_name, layer) => {
    const offences: string[] = [];
    for (const file of sourceFiles(layer.dir)) {
      for (const specifier of importsOf(file)) {
        if (layer.forbidden.some((pattern) => pattern.test(specifier))) {
          offences.push(`${file.replace(ROOT, '')} imports ${specifier}`);
        }
      }
    }
    expect(offences, offences.join('\n')).toEqual([]);
  });

  it('lib/emotion.ts imports nothing at all (emotion-seam rule 4)', () => {
    const specifiers = importsOf(join(ROOT, 'lib', 'emotion.ts'));
    expect(specifiers, `lib/emotion.ts must have no dependencies, found: ${specifiers}`).toEqual([]);
  });

  it('lib/server is imported only by the route handler, keeping the key out of the client bundle', () => {
    const clientDirs = [join(ROOT, 'components'), join(ROOT, 'lib', 'conversation')];
    const offences: string[] = [];
    for (const dir of clientDirs) {
      for (const file of sourceFiles(dir)) {
        for (const specifier of importsOf(file)) {
          if (/lib\/server/.test(specifier)) {
            offences.push(`${file.replace(ROOT, '')} imports ${specifier}`);
          }
        }
      }
    }
    expect(offences, offences.join('\n')).toEqual([]);
  });
});
