/**
 * NDJSON (Newline Delimited JSON) parser.
 * Buffers chunks, splits on newlines, parses complete JSON records, and flushes remaining content.
 * Per specs/002-streaming-response-arch/research.md R1
 */

export interface NdjsonParser {
  processText(text: string): void;
  flush(): void;
}

export function createNdjsonParser(onRecord: (parsed: unknown) => void): NdjsonParser {
  let buffer = '';

  const parseLine = (line: string): void => {
    const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (trimmed.trim().length === 0) {
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      onRecord(parsed);
    } catch (err) {
      console.warn('NDJSON parser: failed to parse line as JSON', { line: trimmed, error: err });
    }
  };

  return {
    processText(text: string): void {
      buffer += text;
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        parseLine(line);
      }
    },

    flush(): void {
      if (buffer.length > 0) {
        parseLine(buffer);
        buffer = '';
      }
    },
  };
}
