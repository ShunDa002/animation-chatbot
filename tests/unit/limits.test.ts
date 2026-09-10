import { describe, expect, it } from 'vitest';
import {
  atCharacterLimit,
  clampInput,
  HISTORY_WINDOW,
  isSendable,
  MAX_INPUT_CHARACTERS,
  outboundHistory,
  remainingCharacters,
  type Message,
} from '@/lib/conversation/limits';

function message(partial: Partial<Message> & Pick<Message, 'author' | 'text'>): Message {
  return { id: partial.text.slice(0, 8), status: 'complete', ...partial };
}

describe('the 300-character input cap (FR-022)', () => {
  it('is 300', () => {
    expect(MAX_INPUT_CHARACTERS).toBe(300);
  });

  it('reports what is left, and never goes negative', () => {
    expect(remainingCharacters('')).toBe(300);
    expect(remainingCharacters('abc')).toBe(297);
    expect(remainingCharacters('x'.repeat(300))).toBe(0);
    expect(remainingCharacters('x'.repeat(400))).toBe(0);
  });

  it('knows when the cap is reached', () => {
    expect(atCharacterLimit('x'.repeat(299))).toBe(false);
    expect(atCharacterLimit('x'.repeat(300))).toBe(true);
  });

  it('stops input at the cap rather than truncating silently at send', () => {
    expect(clampInput('x'.repeat(305))).toHaveLength(300);
    expect(clampInput('short')).toBe('short');
  });

  it('refuses a blank or whitespace-only draft', () => {
    expect(isSendable('')).toBe(false);
    expect(isSendable('   \n ')).toBe(false);
    expect(isSendable(' hi ')).toBe(true);
  });
});

describe('the 6-message history window (FR-017)', () => {
  it('is 6', () => {
    expect(HISTORY_WINDOW).toBe(6);
  });

  it('sends only the most recent six, visitor and character combined', () => {
    const messages: Message[] = Array.from({ length: 10 }, (_, i) =>
      message({ author: i % 2 === 0 ? 'visitor' : 'character', text: `m${i}` }),
    );

    const outbound = outboundHistory(messages);

    expect(outbound).toHaveLength(6);
    expect(outbound.map((m) => m.content)).toEqual(['m4', 'm5', 'm6', 'm7', 'm8', 'm9']);
  });

  it('maps authors to provider roles', () => {
    const outbound = outboundHistory([
      message({ author: 'visitor', text: 'hello' }),
      message({ author: 'character', text: 'hi' }),
    ]);
    expect(outbound).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]);
  });

  it('drops messages that are still streaming or failed', () => {
    const outbound = outboundHistory([
      message({ author: 'visitor', text: 'kept' }),
      message({ author: 'character', text: 'half a rep', status: 'streaming' }),
      message({ author: 'character', text: '', status: 'failed' }),
    ]);
    expect(outbound.map((m) => m.content)).toEqual(['kept']);
  });

  it('drops empty text, so a failed turn cannot travel as a blank message', () => {
    const outbound = outboundHistory([
      message({ author: 'visitor', text: 'real' }),
      message({ author: 'character', text: '   ' }),
    ]);
    expect(outbound.map((m) => m.content)).toEqual(['real']);
  });

  it('handles an empty log', () => {
    expect(outboundHistory([])).toEqual([]);
  });

  it('never exceeds the window even when every message is complete', () => {
    const messages = Array.from({ length: 200 }, (_, i) =>
      message({ author: 'visitor', text: `m${i}` }),
    );
    expect(outboundHistory(messages).length).toBeLessThanOrEqual(HISTORY_WINDOW);
  });
});
