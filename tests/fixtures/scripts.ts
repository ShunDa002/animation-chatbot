/**
 * T007a - the scripted provider streams every test in this feature runs against.
 *
 * The provider is never real in the automated suite (research D11), so none of these consume the
 * 150/day ceiling. T074 is the one deliberate exception: SC-006 measures the real model's cue
 * compliance, which no fixture can.
 *
 * A script is a list of text chunks plus optional timing and failure behaviour. The chunks are the
 * *content deltas* a provider would emit, not SSE frames - the stub server wraps them in the
 * OpenAI-shaped envelope, and the route handler unwraps them again, so both sides of that framing
 * run for real in every test.
 *
 * Selection is by message content: a visitor message beginning `#<script-name>` picks that script.
 * That keeps selection race-free when specs run in parallel, with no control-channel plumbing and
 * no state on the stub.
 */

export const CUE_PREFIX = '[emotion:';
export const CUE_SUFFIX = ']';

/** Longest marker the tail buffer must be able to withhold. See cue.ts and D6. */
export function markerFor(name: string): string {
  return `${CUE_PREFIX}${name}${CUE_SUFFIX}`;
}

export interface ProviderScript {
  /** Content deltas, in order. */
  chunks: string[];
  /** Milliseconds to wait before the first chunk. Default 0. */
  delayFirstMs?: number;
  /** Milliseconds between chunks. Default 5 - fast, but still genuinely streamed. */
  gapMs?: number;
  /** Hang forever without sending anything. Exercises the 20s timeout (FR-034). */
  hangForever?: boolean;
  /** Send the chunks, then hold the connection open without closing it (spec Edge Cases). */
  stallAfterChunks?: boolean;
  /** Send the chunks, wait this long, then drop the connection - a provider dying mid-stream. */
  dieAfterMs?: number;
  /** Respond with this HTTP status and no stream at all (FR-030). */
  errorStatus?: number;
}

/**
 * The marker split across chunk boundaries. This is quickstart V3 - the single most valuable check
 * in the feature, and the one a naive implementation passes by accident and a real stream fails.
 */
const SPLIT_MARKER: ProviderScript = {
  chunks: ['All ', 'done', ' [emo', 'tion:ha', 'ppy]'],
};

export const SCRIPTS: Record<string, ProviderScript> = {
  // --- the happy path -------------------------------------------------------
  plain: { chunks: ['Hello ', 'there.', ' [emotion:happy]'], delayFirstMs: 40 },
  multiword: {
    chunks: ['I ', 'have ', 'been ', 'thinking ', 'about ', 'that.', ' [emotion:neutral]'],
  },

  // --- cue handling (V3, V4) ------------------------------------------------
  split: SPLIT_MARKER,
  'no-cue': { chunks: ['Just ', 'text, ', 'no marker at all.'] },
  'unknown-cue': { chunks: ['Text here.', ' [emotion:ecstatic]'] },
  'empty-cue': { chunks: ['Text here.', ' [emotion:]'] },
  'cue-midway': { chunks: ['Start [emotion:sad] and then more text.', ' [emotion:happy]'] },
  'cue-only': { chunks: ['[emotion:happy]'] },
  empty: { chunks: [] },

  // --- timing (V6) ----------------------------------------------------------
  delayed: { chunks: ['Took ', 'a ', 'while.', ' [emotion:neutral]'], delayFirstMs: 5_000 },
  hang: { chunks: [], hangForever: true },
  // A provider that dies mid-stream: text arrived, then the connection dropped. The partial reply
  // must stay visible and the turn must end cleanly (spec Edge Cases).
  'die-midstream': { chunks: ['I started saying somethi'], dieAfterMs: 300 },
  // A provider that hangs mid-stream forever. The server may not cut this off (FR-034), so the
  // client's stall watchdog is the only thing that lets the visitor send again.
  'stall-midstream': { chunks: ['I started saying somethi'], stallAfterChunks: true },

  // --- failure (V7) ---------------------------------------------------------
  'provider-500': { chunks: [], errorStatus: 500 },
  'provider-401': { chunks: [], errorStatus: 401 },
  'provider-429': { chunks: [], errorStatus: 429 },
};

/** One script per union member, built on demand so this file needs no import of lib/emotion. */
export function scriptForEmotion(name: string): ProviderScript {
  return { chunks: [`A reply that feels ${name}.`, ` ${markerFor(name)}`] };
}

/** The script name encoded in a visitor message, or null for the default. */
export function scriptNameFromMessage(content: string): string | null {
  const match = /^#([a-z0-9-]+)/i.exec(content.trim());
  return match ? (match[1] ?? null) : null;
}

export function resolveScript(content: string): ProviderScript {
  const name = scriptNameFromMessage(content);
  if (!name) return SCRIPTS.plain!;
  const known = SCRIPTS[name];
  if (known) return known;
  // `#emotion-happy` style: one script per union member without enumerating them here.
  const asEmotion = /^emotion-(.+)$/.exec(name);
  if (asEmotion?.[1]) return scriptForEmotion(asEmotion[1]);
  return SCRIPTS.plain!;
}
