/**
 * T073 - prove the credential and the persona never reach the browser (FR-025, FR-026).
 *
 * Greps the built client output for the things that must not be there. Run after `next build`; it is
 * wired into `npm run verify:bundle` and belongs in CI ahead of any deploy.
 *
 * This is a cheap check for an expensive mistake. `lib/server/**` is imported by nothing but the
 * route handler, which is what actually keeps the key out of the bundle - this asserts that the
 * arrangement still holds rather than trusting that it does.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CLIENT_DIRS = ['.next/static'];

/** Strings that must never appear in anything shipped to a browser. */
const FORBIDDEN = [
  // The persona, by its opening words and its cue instruction.
  { pattern: 'You are Aria', why: 'persona text (FR-026)' },
  { pattern: 'Append exactly one emotional cue', why: 'cue instruction (FR-026)' },
  // Provider identity and endpoint.
  { pattern: 'api.groq.com', why: 'provider endpoint' },
  { pattern: 'GROQ_API_KEY', why: 'credential variable name' },
  // Real credential shapes, in case one is ever inlined by accident.
  { pattern: 'gsk_', why: 'Groq key prefix (FR-025)' },
  { pattern: 'KV_REST_API_TOKEN', why: 'counter store token' },
];

/** Plus whatever the current environment actually holds, if anything. */
for (const name of ['GROQ_API_KEY', 'KV_REST_API_TOKEN']) {
  const value = process.env[name];
  if (value && value.length >= 8) {
    FORBIDDEN.push({ pattern: value, why: `live value of ${name} (FR-025)` });
  }
}

function filesUnder(dir) {
  let found = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found = found.concat(filesUnder(full));
    else found.push(full);
  }
  return found;
}

const files = CLIENT_DIRS.flatMap(filesUnder).filter((file) =>
  /\.(js|mjs|css|json|txt|map)$/.test(file),
);

if (files.length === 0) {
  console.error('verify:bundle - no client output found. Run `npm run build` first.');
  process.exit(2);
}

const violations = [];
for (const file of files) {
  const contents = readFileSync(file, 'utf8');
  for (const { pattern, why } of FORBIDDEN) {
    if (contents.includes(pattern)) {
      violations.push(`${file}: contains ${JSON.stringify(pattern)} - ${why}`);
    }
  }
}

if (violations.length > 0) {
  console.error(`verify:bundle FAILED - ${violations.length} violation(s):`);
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log(
  `verify:bundle OK - scanned ${files.length} client files, none contain the persona, ` +
    'the provider endpoint, or a credential.',
);
