import { describe, expect, it } from 'vitest';
import { createCueReader } from '@/lib/conversation/cue';
import { NEUTRAL } from '@/lib/emotion';
import { SCRIPTS } from '@/tests/fixtures/scripts';

/**
 * T036 / T037 - quickstart V3 and V4.
 *
 * V3 is the single most valuable check in this feature. FR-016 streams text while FR-018 forbids the
 * cue ever being visible, so the marker has to be withheld while it is still ambiguous. A naive
 * implementation that strips a complete marker passes every whole-string test and then shows the
 * visitor `[emo` for one frame on a real stream. SC-007 counts that as a failure.
 */

/** Feed chunks through the reader, capturing the visible text after every single chunk. */
function stream(chunks: string[]): { snapshots: string[]; final: ReturnType<typeof finish> } {
  const reader = createCueReader();
  const snapshots: string[] = [];
  for (const chunk of chunks) {
    snapshots.push(reader.push(chunk));
  }
  const final = reader.end();
  snapshots.push(final.text);
  return { snapshots, final };
}

function finish() {
  return createCueReader().end();
}

describe('V3: the cue is never visible, on any frame', () => {
  it('withholds a marker split across chunk boundaries', () => {
    const { snapshots, final } = stream(SCRIPTS.split!.chunks);

    for (const snapshot of snapshots) {
      expect(snapshot, `leaked marker fragment in: ${JSON.stringify(snapshot)}`).not.toMatch(/\[/);
      expect(snapshot).not.toMatch(/emo/);
      expect(snapshot).not.toMatch(/tion:/);
    }

    expect(final.text).toBe('All done');
    expect(final.emotion).toBe('happy');
  });

  it.each([
    ['one character at a time', 'Hi there. [emotion:sad]'.split('')],
    ['marker in its own chunk', ['Hi there.', ' [emotion:sad]']],
    ['bracket alone', ['Hi there.', ' [', 'emotion:sad]']],
    ['closing bracket alone', ['Hi there. [emotion:sad', ']']],
    ['name split', ['Hi there. [emotion:s', 'a', 'd]']],
  ])('never shows a fragment when the marker arrives %s', (_label, chunks) => {
    const { snapshots, final } = stream(chunks);
    for (const snapshot of snapshots) {
      expect(snapshot, JSON.stringify(snapshot)).not.toContain('[');
      expect(snapshot).not.toContain('emotion');
    }
    expect(final.text).toBe('Hi there.');
    expect(final.emotion).toBe('sad');
  });

  it('releases text promptly rather than holding it hostage', () => {
    // Ordinary prose must not be withheld waiting for a marker that may never come. Anything
    // withheld has to be a live marker candidate, nothing more.
    const reader = createCueReader();
    expect(reader.push('Hello there, how are you?')).toBe('Hello there, how are you?');
  });

  it('does not withhold a bracket that cannot begin a marker', () => {
    const reader = createCueReader();
    expect(reader.push('See note [1')).toBe('See note [1');
    expect(reader.push('2] for detail.')).toBe('See note [12] for detail.');
  });

  it('withholds an ambiguous bracket, then releases it once it is ruled out', () => {
    const reader = createCueReader();
    // "[emo" could still become "[emotion:happy]", so it must be held back. The trailing space is
    // trimmed too, which is why the marker never leaves a visible gap behind it.
    expect(reader.push('Wait [emo')).toBe('Wait');
    // "[emoji" cannot, so it is released.
    expect(reader.push('ji] time')).toBe('Wait [emoji] time');
  });
});

describe('V4: bad cues degrade, never break', () => {
  it('shows the whole reply when there is no marker at all', () => {
    const { final } = stream(SCRIPTS['no-cue']!.chunks);
    expect(final.text).toBe('Just text, no marker at all.');
    expect(final.emotion).toBe(NEUTRAL);
    expect(final.isEmpty).toBe(false);
  });

  it('falls back to neutral for an emotion outside the set, keeping the text', () => {
    const { final } = stream(SCRIPTS['unknown-cue']!.chunks);
    expect(final.text).toBe('Text here.');
    expect(final.emotion).toBe(NEUTRAL);
  });

  it('falls back to neutral for an empty cue name, keeping the text', () => {
    const { final } = stream(SCRIPTS['empty-cue']!.chunks);
    expect(final.text).toBe('Text here.');
    expect(final.emotion).toBe(NEUTRAL);
  });

  it('drives the reaction only from the trailing cue, and shows no markup from either', () => {
    // spec Edge Cases: a cue mid-reply leaves the displayed text unaffected and does not drive the
    // reaction. SC-007 additionally forbids any markup being visible, so the mid-reply marker is
    // stripped from display while contributing nothing to the emotion.
    const { snapshots, final } = stream(SCRIPTS['cue-midway']!.chunks);
    for (const snapshot of snapshots) expect(snapshot).not.toContain('[emotion');
    expect(final.text).toBe('Start and then more text.');
    expect(final.emotion).toBe('happy');
  });

  it('reports an empty reply rather than displaying nothing at all', () => {
    const { final } = stream(SCRIPTS.empty!.chunks);
    expect(final.text).toBe('');
    expect(final.isEmpty).toBe(true);
    expect(final.emotion).toBe(NEUTRAL);
  });

  it('reports a cue-only reply as empty, with the cue still stripped', () => {
    const { final } = stream(SCRIPTS['cue-only']!.chunks);
    expect(final.text).toBe('');
    expect(final.isEmpty).toBe(true);
    // The cue was well formed, so it is honoured even though there is no text to show.
    expect(final.emotion).toBe('happy');
  });

  it('never throws, for any of the awkward inputs', () => {
    const awkward = [
      [''],
      ['['],
      ['[emotion:'],
      ['[emotion:]'],
      ['[emotion'],
      [']'],
      ['[emotion:happy][emotion:sad]'],
      ['[EMOTION:HAPPY]'],
      ['   '],
    ];
    for (const chunks of awkward) {
      expect(() => stream(chunks), JSON.stringify(chunks)).not.toThrow();
    }
  });

  it('accepts an upper-case cue name, since a model will not be consistent about case', () => {
    const { final } = stream(['Fine.', ' [EMOTION:HAPPY]']);
    expect(final.text).toBe('Fine.');
    expect(final.emotion).toBe('happy');
  });

  it('takes the last cue when a model emits more than one at the end', () => {
    const { final } = stream(['Fine. [emotion:sad] [emotion:happy]']);
    expect(final.text).toBe('Fine.');
    expect(final.emotion).toBe('happy');
  });
});

describe('trailing whitespace', () => {
  it('does not leave the gap where the marker used to be', () => {
    const { final } = stream(['All good.', ' [emotion:happy]']);
    expect(final.text).toBe('All good.');
  });
});
