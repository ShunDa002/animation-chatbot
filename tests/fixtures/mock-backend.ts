/**
 * Mock external FastAPI backend server for E2E testing (T115, D15, FR-047).
 *
 * Implements the contract defined in specs/001-animated-character-chat/contracts/chat-api.md:
 * - POST /threads -> returns a UUID string
 * - POST /chat    -> accepts { user_input, thread_id }, streams plain text response
 * - CORS headers on all responses so browser can call directly
 * - Scripted streams from tests/fixtures/scripts.ts
 * - Control endpoints for quota, resets, and fault injection
 *
 * Run: node tests/fixtures/mock-backend.ts [port]
 */

import { createServer, type ServerResponse, type IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolveScript, type ProviderScript } from './scripts.ts';

const PORT = Number(process.argv[2] ?? process.env.BACKEND_PORT ?? 4319);

let quotaCount = 0;
let storeDown = false;
let threadFail = false;

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function json(res: ServerResponse, status: number, body: unknown): void {
  setCorsHeaders(res);
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function text(res: ServerResponse, status: number, body: string): void {
  setCorsHeaders(res);
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const parts: Buffer[] = [];
  for await (const chunk of req) parts.push(chunk as Buffer);
  return Buffer.concat(parts).toString('utf8');
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function handleThreads(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (threadFail || storeDown) {
    text(res, 500, 'Internal Server Error');
    return;
  }

  const threadId = randomUUID();
  text(res, 200, threadId);
}

async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let raw = '';
  try {
    raw = await readBody(req);
  } catch {
    text(res, 400, 'That message could not be sent.');
    return;
  }

  let parsed: { user_input?: unknown; thread_id?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    text(res, 400, 'That message could not be sent.');
    return;
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    typeof parsed.user_input !== 'string' ||
    typeof parsed.thread_id !== 'string'
  ) {
    text(res, 400, 'That message could not be sent.');
    return;
  }

  const userInput = parsed.user_input;
  const threadId = parsed.thread_id.trim();

  if (threadId.length === 0 || userInput.trim().length === 0 || userInput.length > 300) {
    text(res, 400, 'That message could not be sent.');
    return;
  }

  // Quota check (FR-028, SC-010)
  if (storeDown) {
    text(res, 429, 'The demo is temporarily limited. Please try again later.');
    return;
  }

  if (quotaCount >= 150) {
    text(res, 429, 'The demo is temporarily limited. Please try again later.');
    return;
  }

  // Consume 1 quota on admission
  quotaCount += 1;

  const script: ProviderScript = resolveScript(userInput);

  if (script.errorStatus) {
    if (script.errorStatus === 429) {
      text(res, 429, 'The demo is temporarily limited. Please try again later.');
      return;
    }
    text(res, 502, 'Something went wrong reaching the character. Try sending again.');
    return;
  }

  if (script.hangForever) {
    // 20s timeout simulation (FR-034)
    await sleep(20_000);
    text(res, 504, 'That took too long. Try sending again.');
    return;
  }

  if (script.chunks.length === 0) {
    // Empty reply
    text(res, 502, 'Something went wrong reaching the character. Try sending again.');
    return;
  }

  // NDJSON streaming response (FR-046, specs/002-streaming-response-arch)
  setCorsHeaders(res);
  res.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'transfer-encoding': 'chunked',
    'cache-control': 'no-store',
    connection: 'close',
  });

  if (script.delayFirstMs) {
    await sleep(script.delayFirstMs);
  }

  res.write(JSON.stringify({ type: 'start', thread_id: threadId }) + '\n');

  for (const chunk of script.chunks) {
    if (res.writableEnded) return;
    res.write(JSON.stringify({ type: 'token', content: chunk }) + '\n');
    await sleep(script.gapMs ?? 5);
  }

  if (script.dieAfterMs !== undefined) {
    await sleep(script.dieAfterMs);
    res.end();
    return;
  }

  if (script.stallAfterChunks) {
    return; // hold connection open
  }

  res.write(JSON.stringify({ type: 'done' }) + '\n');
  res.end();
}

const server = createServer((req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments[0] === 'control') {
    switch (segments[1]) {
      case 'quota': {
        quotaCount = Number(segments[2] ?? 0);
        json(res, 200, { ok: true, count: quotaCount });
        return;
      }
      case 'store-down':
        storeDown = segments[2] === '1';
        json(res, 200, { ok: true, storeDown });
        return;
      case 'thread-fail':
        threadFail = segments[2] === '1';
        json(res, 200, { ok: true, threadFail });
        return;
      case 'reset':
        quotaCount = 0;
        storeDown = false;
        threadFail = false;
        json(res, 200, { ok: true });
        return;
      case 'health':
        json(res, 200, { ok: true });
        return;
      default:
        json(res, 404, { error: 'unknown control path' });
        return;
    }
  }

  // Backward-compatible quota reader for existing tests
  if (segments[0] === 'kv') {
    json(res, 200, { result: quotaCount > 0 ? quotaCount : null });
    return;
  }

  if (segments[0] === 'threads') {
    void handleThreads(req, res);
    return;
  }

  if (segments[0] === 'chat') {
    void handleChat(req, res);
    return;
  }

  json(res, 404, { error: `mock-backend: no route for ${url.pathname}` });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-backend] FastAPI mock listening on http://127.0.0.1:${PORT}`);
});
