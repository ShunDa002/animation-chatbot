/**
 * T007a - the HTTP stub the whole e2e suite runs against.
 *
 * Why a real server rather than Playwright's page.route(): the fetches under test are made by the
 * Next route handler on the server, not by the page, and page.route() cannot see those. Pointing
 * GROQ_BASE_URL and KV_REST_API_URL at a local server intercepts at the genuine HTTP boundary, which
 * is what the constitution asks for - the route handler, the stream reader, the cue stripper, and
 * the quota check all run for real, with only the far side replaced.
 *
 * Serves two shapes:
 *   POST /v1/chat/completions       OpenAI-shaped SSE; script chosen from the last user message
 *   POST /kv/<command>/<args...>    Upstash REST-shaped counter, replying {"result": N}
 *
 * Plus a control surface used only by tests that need to preset the counter:
 *   POST /control/quota/<n>         set the counter for today's key
 *   POST /control/store-down/<0|1>  make the counter store unreachable (fail-closed test)
 *   POST /control/reset             clear everything
 *
 * Run: node tests/fixtures/stub-server.ts [port]   (Node 20+ strips the types; 24 does it natively)
 */

import { createServer, type ServerResponse, type IncomingMessage } from 'node:http';
import { resolveScript, type ProviderScript } from './scripts.ts';

const PORT = Number(process.argv[2] ?? process.env.STUB_PORT ?? 4319);

let quotaStore = new Map<string, number>();
let storeDown = false;

function todayKey(): string {
  return `quota:${new Date().toISOString().slice(0, 10)}`;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const parts: Buffer[] = [];
  for await (const chunk of req) parts.push(chunk as Buffer);
  return Buffer.concat(parts).toString('utf8');
}

function sseFrame(delta: string): string {
  return `data: ${JSON.stringify({
    id: 'stub',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
  })}\n\n`;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function handleCompletions(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  let parsed: { messages?: Array<{ role?: string; content?: string }> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    json(res, 400, { error: { message: 'stub: unparseable body' } });
    return;
  }

  const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const script: ProviderScript = resolveScript(String(lastUser?.content ?? ''));

  if (script.errorStatus) {
    // Deliberately verbose provider error text. FR-030 forbids any of this reaching the browser, so
    // the assertions in T042 have something real to catch if the route handler ever leaks.
    json(res, script.errorStatus, {
      error: {
        message: `stub provider failure: upstream said ${script.errorStatus}`,
        type: 'stub_error',
        code: 'stub_provider_code',
        provider: 'groq-stub',
      },
    });
    return;
  }

  if (script.hangForever) {
    // Never write, never end. The route handler's own deadline must fire (FR-034).
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    return;
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  if (script.delayFirstMs) await sleep(script.delayFirstMs);

  for (const chunk of script.chunks) {
    if (res.writableEnded) return;
    res.write(sseFrame(chunk));
    await sleep(script.gapMs ?? 5);
  }

  if (script.dieAfterMs !== undefined) {
    await sleep(script.dieAfterMs);
    res.destroy(); // connection dropped mid-reply, no clean end
    return;
  }

  if (script.stallAfterChunks) return; // text sent, connection deliberately held open

  res.write('data: [DONE]\n\n');
  res.end();
}

/**
 * The Upstash SDK auto-pipelines: it POSTs `[["incr","key"],...]` to `{base}/pipeline` and expects
 * `[{"result":N},...]` back. Both that shape and the path-based single-command shape are real parts
 * of the REST API, so the stub speaks both rather than the client being reconfigured to suit it.
 */
async function handlePipeline(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (storeDown) {
    res.destroy();
    return;
  }

  let commands: unknown;
  try {
    commands = JSON.parse(await readBody(req));
  } catch {
    json(res, 400, { error: 'stub: unparseable pipeline body' });
    return;
  }

  if (!Array.isArray(commands)) {
    json(res, 400, { error: 'stub: pipeline body is not an array' });
    return;
  }

  const results = commands.map((command) => {
    const parts = (Array.isArray(command) ? command : []).map((part) => String(part));
    return { result: runCommand(parts) };
  });

  json(res, 200, results);
}

/** One Redis command against the in-memory counter. Returns whatever that command replies with. */
function runCommand(parts: string[]): number | string | null {
  const command = (parts[0] ?? '').toLowerCase();
  const key = parts[1] ?? '';

  switch (command) {
    case 'incr': {
      const next = (quotaStore.get(key) ?? 0) + 1;
      quotaStore.set(key, next);
      return next;
    }
    case 'decr': {
      const next = (quotaStore.get(key) ?? 0) - 1;
      quotaStore.set(key, next);
      return next;
    }
    case 'get':
      return quotaStore.get(key) ?? null;
    case 'set':
      quotaStore.set(key, Number(parts[2] ?? 0));
      return 'OK';
    case 'expire':
    case 'pexpire':
      return 1;
    case 'ttl':
      return 86_400;
    default:
      return null;
  }
}

function handleKv(res: ServerResponse, segments: string[]): void {
  if (storeDown) {
    // What an unreachable store looks like from the client's side. quota.ts must fail CLOSED.
    res.destroy();
    return;
  }

  const command = (segments[0] ?? '').toLowerCase();
  const key = segments[1] ?? '';

  switch (command) {
    case 'incr': {
      const next = (quotaStore.get(key) ?? 0) + 1;
      quotaStore.set(key, next);
      json(res, 200, { result: next });
      return;
    }
    case 'decr': {
      const next = (quotaStore.get(key) ?? 0) - 1;
      quotaStore.set(key, next);
      json(res, 200, { result: next });
      return;
    }
    case 'get':
      json(res, 200, { result: quotaStore.get(key) ?? null });
      return;
    case 'set':
      quotaStore.set(key, Number(segments[2] ?? 0));
      json(res, 200, { result: 'OK' });
      return;
    case 'expire':
    case 'pexpire':
      json(res, 200, { result: 1 });
      return;
    case 'ttl':
      json(res, 200, { result: 86_400 });
      return;
    default:
      json(res, 200, { result: null });
      return;
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments[0] === 'control') {
    switch (segments[1]) {
      case 'quota': {
        const count = Number(segments[2] ?? 0);
        quotaStore.set(todayKey(), count);
        json(res, 200, { ok: true, key: todayKey(), count });
        return;
      }
      case 'store-down':
        storeDown = segments[2] === '1';
        json(res, 200, { ok: true, storeDown });
        return;
      case 'reset':
        quotaStore = new Map();
        storeDown = false;
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

  if (segments.at(-1) === 'completions') {
    void handleCompletions(req, res);
    return;
  }
  if (segments[0] === 'kv') {
    if (segments[1] === 'pipeline') {
      void handlePipeline(req, res);
      return;
    }
    handleKv(res, segments.slice(1));
    return;
  }

  json(res, 404, { error: `stub: no route for ${url.pathname}` });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[stub] provider + counter listening on http://127.0.0.1:${PORT}`);
});
