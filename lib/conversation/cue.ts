import { NEUTRAL, toEmotion, type Emotion } from '@/lib/emotion';

/**
 * The emotional cue: a plain-text marker the model appends to every reply, stripped before the
 * visitor can see it (FR-018), and never displayed even for a single frame (SC-007).
 *
 * Format is `[emotion:<name>]` (research D6). A plain marker survives small models far better than
 * structured output, and its failure mode is a readable reply with a neutral character (FR-019)
 * rather than an unparseable response with nothing to show.
 *
 * ## Why a candidate-aware tail buffer rather than a fixed-size one
 *
 * The task described withholding the last N characters, N being the longest possible marker. That
 * works, but it withholds N characters of ordinary prose at every step too, so the visitor watches
 * the reply lag a fixed distance behind - and the last word of every reply arrives late.
 *
 * This holds back only text that could still *become* a marker: an unclosed `[` whose contents are
 * still a viable prefix of `[emotion:`. Ordinary prose is released immediately, `See note [1` is
 * released as soon as `1` rules it out, and a marker split across any number of chunk boundaries is
 * never shown. Same guarantee, no streaming lag.
 */

const OPEN = '[emotion:';
const MARKER = /\[emotion:([a-z]*)\]/gi;
/** A trailing marker, optionally followed by whitespace. Only this position drives the emotion. */
const TRAILING_MARKER = /\[emotion:([a-z]*)\]\s*$/i;

export interface CueResult {
  /** Display text, with every marker removed and trimmed of the gap one leaves behind. */
  text: string;
  /** Derived from a trailing marker only; NEUTRAL for missing, malformed, or unknown (FR-019). */
  emotion: Emotion;
  /** True when there is no text to display - an empty reply, or a reply that was only a cue. */
  isEmpty: boolean;
}

/**
 * How much of `raw`'s tail must be withheld because it could still become a marker.
 * Returns the index to cut at, or raw.length when nothing needs holding.
 */
function safeLength(raw: string): number {
  const lastOpen = raw.lastIndexOf('[');
  if (lastOpen === -1) return raw.length;
  // A bracket that already closed is not a candidate.
  if (raw.indexOf(']', lastOpen) !== -1) return raw.length;

  const tail = raw.slice(lastOpen);
  const lower = tail.toLowerCase();

  // Still typing out `[emotion:` itself.
  if (OPEN.startsWith(lower)) return lastOpen;
  // Past `[emotion:`, now typing the name. Letters only - anything else rules the marker out.
  if (lower.startsWith(OPEN) && /^[a-z]*$/.test(lower.slice(OPEN.length))) return lastOpen;

  return raw.length;
}

/** Strip every marker, then tidy the space the removal leaves behind. */
function strip(raw: string): string {
  return raw
    .replace(MARKER, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export interface CueReader {
  /** Feed the next chunk; returns the full text safe to display right now. */
  push(chunk: string): string;
  /** No more chunks. Returns the final display text and the emotion. */
  end(): CueResult;
  /** The text currently safe to display, without feeding anything. */
  visible(): string;
}

export function createCueReader(): CueReader {
  let raw = '';

  const visible = (): string => strip(raw.slice(0, safeLength(raw)));

  return {
    push(chunk: string): string {
      raw += chunk;
      return visible();
    },
    visible,
    end(): CueResult {
      const match = TRAILING_MARKER.exec(raw);
      const emotion = match ? toEmotion(match[1]?.toLowerCase()) : NEUTRAL;
      const text = strip(raw);
      return { text, emotion, isEmpty: text.length === 0 };
    },
  };
}

/** Whole-string convenience, for a reply that was not streamed. */
export function parseCue(reply: string): CueResult {
  const reader = createCueReader();
  reader.push(reply);
  return reader.end();
}
