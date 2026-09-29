import { describe, expect, it, vi } from 'vitest';
import { createNdjsonParser } from '@/lib/conversation/ndjson-parser';

describe('NDJSON parser', () => {
  it('parses a single record in one chunk', () => {
    const records: unknown[] = [];
    const parser = createNdjsonParser((record) => records.push(record));

    parser.processText('{"type":"start","thread_id":"t1"}\n');
    expect(records).toEqual([{ type: 'start', thread_id: 't1' }]);
  });

  it('parses a record split across 3 chunks', () => {
    const records: unknown[] = [];
    const parser = createNdjsonParser((record) => records.push(record));

    parser.processText('{"type":');
    expect(records).toHaveLength(0);

    parser.processText('"token","content"');
    expect(records).toHaveLength(0);

    parser.processText(':"hello"}\n');
    expect(records).toEqual([{ type: 'token', content: 'hello' }]);
  });

  it('parses 3 records arriving in a single chunk', () => {
    const records: unknown[] = [];
    const parser = createNdjsonParser((record) => records.push(record));

    parser.processText('{"type":"start"}\n{"type":"token","content":"a"}\n{"type":"done"}\n');
    expect(records).toEqual([
      { type: 'start' },
      { type: 'token', content: 'a' },
      { type: 'done' },
    ]);
  });

  it('ignores blank lines and whitespace lines', () => {
    const records: unknown[] = [];
    const parser = createNdjsonParser((record) => records.push(record));

    parser.processText('\n\n  \n{"type":"done"}\n\n');
    expect(records).toEqual([{ type: 'done' }]);
  });

  it('handles \\r\\n (CRLF) line endings', () => {
    const records: unknown[] = [];
    const parser = createNdjsonParser((record) => records.push(record));

    parser.processText('{"type":"heartbeat"}\r\n{"type":"done"}\r\n');
    expect(records).toEqual([
      { type: 'heartbeat' },
      { type: 'done' },
    ]);
  });

  it('parses final record without trailing newline on flush()', () => {
    const records: unknown[] = [];
    const parser = createNdjsonParser((record) => records.push(record));

    parser.processText('{"type":"token","content":"tail"}');
    expect(records).toHaveLength(0);

    parser.flush();
    expect(records).toEqual([{ type: 'token', content: 'tail' }]);
  });

  it('logs warning and skips invalid JSON on newline-terminated line without throwing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const records: unknown[] = [];
    const parser = createNdjsonParser((record) => records.push(record));

    parser.processText('not-valid-json\n{"type":"done"}\n');
    expect(warnSpy).toHaveBeenCalled();
    expect(records).toEqual([{ type: 'done' }]);

    warnSpy.mockRestore();
  });

  it('produces no callbacks on empty string input', () => {
    const records: unknown[] = [];
    const parser = createNdjsonParser((record) => records.push(record));

    parser.processText('');
    parser.flush();
    expect(records).toHaveLength(0);
  });

  it('logs warning and skips invalid JSON on flush() without throwing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const records: unknown[] = [];
    const parser = createNdjsonParser((record) => records.push(record));

    parser.processText('invalid-trailing');
    parser.flush();
    expect(warnSpy).toHaveBeenCalled();
    expect(records).toHaveLength(0);

    warnSpy.mockRestore();
  });
});
