import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * T040, T041, T042, T114 - the external backend API contract from contracts/chat-api.md,
 * exercised over real HTTP against the mock backend fixture.
 *
 * Endpoints:
 * - POST /threads: creates a conversation thread, returns UUID string
 * - POST /chat: accepts { user_input, thread_id }, returns plain-text stream
 */

const BACKEND = 'http://127.0.0.1:4319';
const TEST_THREAD_ID = '550e8400-e29b-41d4-a716-446655440000';

/** A body the /chat endpoint should accept. */
function validBody(userInput = 'hello there', threadId = TEST_THREAD_ID) {
  return { user_input: userInput, thread_id: threadId };
}

async function resetBackend(request: APIRequestContext): Promise<void> {
  await request.post(`${BACKEND}/control/reset`);
}

async function presetQuota(request: APIRequestContext, count: number): Promise<void> {
  await request.post(`${BACKEND}/control/quota/${count}`);
}

async function setStoreDown(request: APIRequestContext, down: boolean): Promise<void> {
  await request.post(`${BACKEND}/control/store-down/${down ? 1 : 0}`);
}

async function setThreadFail(request: APIRequestContext, fail: boolean): Promise<void> {
  await request.post(`${BACKEND}/control/thread-fail/${fail ? 1 : 0}`);
}

test.beforeEach(async ({ request }) => {
  await resetBackend(request);
});

test.describe('POST /threads (FR-043, FR-045)', () => {
  test('returns 200 OK with a non-empty UUID string', async ({ request }) => {
    const response = await request.post(`${BACKEND}/threads`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/plain');

    const threadId = (await response.text()).trim();
    expect(threadId).toBeTruthy();
    expect(threadId.length).toBeGreaterThanOrEqual(16);
  });

  test('returns non-200 failure when backend store is down (FR-045)', async ({ request }) => {
    await setThreadFail(request, true);
    try {
      const response = await request.post(`${BACKEND}/threads`);
      expect(response.status()).toBe(500);
    } finally {
      await setThreadFail(request, false);
    }
  });
});

test.describe('400: malformed requests to POST /chat are rejected (FR-029)', () => {
  const cases: Array<[string, unknown]> = [
    ['no user_input or thread_id', { hello: 'world' }],
    ['missing thread_id', { user_input: 'hello' }],
    ['missing user_input', { thread_id: TEST_THREAD_ID }],
    ['user_input is not a string', { user_input: 42, thread_id: TEST_THREAD_ID }],
    ['thread_id is not a string', { user_input: 'hi', thread_id: 1234 }],
    ['content of 301 characters', { user_input: 'x'.repeat(301), thread_id: TEST_THREAD_ID }],
    ['blank content', { user_input: '   ', thread_id: TEST_THREAD_ID }],
    ['empty thread_id', { user_input: 'hi', thread_id: '   ' }],
    ['body is an array', []],
    ['body is null', null],
  ];

  for (const [label, body] of cases) {
    test(label, async ({ request }) => {
      const response = await request.post(`${BACKEND}/chat`, { data: body ?? {} });
      expect(response.status()).toBe(400);

      const text = await response.text();
      expect(text).toBe('That message could not be sent.');

      // The provider was never contacted, so no count was consumed
      const counter = await request.post(`${BACKEND}/kv/get/quota:today`);
      expect((await counter.json()).result).toBeNull();
    });
  }

  test('unparseable JSON is a 400, not a 500', async ({ request }) => {
    const response = await request.post(`${BACKEND}/chat`, {
      headers: { 'content-type': 'application/json' },
      data: '{ this is not json',
    });
    expect(response.status()).toBe(400);
  });

  test('a 301-character message is refused while 300 is accepted', async ({ request }) => {
    const at = await request.post(`${BACKEND}/chat`, { data: validBody('x'.repeat(300)) });
    expect(at.status()).toBe(200);

    const over = await request.post(`${BACKEND}/chat`, { data: validBody('x'.repeat(301)) });
    expect(over.status()).toBe(400);
  });

  test('extra fields are ignored rather than rejected', async ({ request }) => {
    const response = await request.post(`${BACKEND}/chat`, {
      data: {
        ...validBody(),
        model: 'something-expensive',
        temperature: 2,
        visitorId: 'tracking-me',
      },
    });
    expect(response.status()).toBe(200);
  });
});

test.describe('429: the daily ceiling (FR-028, SC-013)', () => {
  test('the request at the ceiling is refused and provider is not contacted', async ({ request }) => {
    await presetQuota(request, 150);

    const response = await request.post(`${BACKEND}/chat`, { data: validBody() });
    expect(response.status()).toBe(429);
    expect(await response.text()).toContain('temporarily limited');
  });

  test('the count does not climb past the ceiling under repeated refusal', async ({ request }) => {
    await presetQuota(request, 150);

    for (let i = 0; i < 5; i += 1) {
      expect((await request.post(`${BACKEND}/chat`, { data: validBody() })).status()).toBe(429);
    }

    const counter = await request.post(`${BACKEND}/kv/get/quota:today`);
    expect((await counter.json()).result).toBe(150);
  });

  test('the 150th request is admitted and the 151st is not', async ({ request }) => {
    await presetQuota(request, 149);

    expect((await request.post(`${BACKEND}/chat`, { data: validBody() })).status()).toBe(200);
    expect((await request.post(`${BACKEND}/chat`, { data: validBody() })).status()).toBe(429);
  });

  test('an unreachable counter store returns 429 (fails closed)', async ({ request }) => {
    await setStoreDown(request, true);
    try {
      const response = await request.post(`${BACKEND}/chat`, { data: validBody() });
      expect(response.status()).toBe(429);
    } finally {
      await setStoreDown(request, false);
    }
  });
});

test.describe('502 and 504: provider failures (FR-030, FR-034)', () => {
  test('a provider error becomes a 502 with plain message', async ({ request }) => {
    const response = await request.post(`${BACKEND}/chat`, { data: validBody('#provider-500 hi') });
    expect(response.status()).toBe(502);

    const body = await response.text();
    expect(body).toBe('Something went wrong reaching the character. Try sending again.');
  });

  test('a provider auth failure is indistinguishable from other provider failures', async ({ request }) => {
    const unauthorized = await request.post(`${BACKEND}/chat`, { data: validBody('#provider-401 hi') });
    const errored = await request.post(`${BACKEND}/chat`, { data: validBody('#provider-500 hi') });

    expect(unauthorized.status()).toBe(502);
    expect(await unauthorized.text()).toBe(await errored.text());
  });

  test('an empty reply is a 502 rather than an empty 200', async ({ request }) => {
    const response = await request.post(`${BACKEND}/chat`, { data: validBody('#empty hi') });
    expect(response.status()).toBe(502);
  });

  test('a provider that never responds times out at ~20s with no retry', async ({ request }) => {
    const startedAt = Date.now();
    const response = await request.post(`${BACKEND}/chat`, {
      data: validBody('#hang hi'),
      timeout: 40_000,
    });
    const elapsed = Date.now() - startedAt;

    expect(response.status()).toBe(504);
    expect(await response.text()).toBe('That took too long. Try sending again.');

    expect(elapsed).toBeGreaterThan(18_000);
    expect(elapsed).toBeLessThan(28_000);

    const counter = await request.post(`${BACKEND}/kv/get/quota:today`);
    expect((await counter.json()).result).toBe(1);
  });

  test('a stream that begins and then dies keeps its text and does not 504', async ({ request }) => {
    const response = await request.post(`${BACKEND}/chat`, {
      data: validBody('#die-midstream hi'),
      timeout: 40_000,
    });

    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('I started saying somethi');
  });
});

test.describe('T042: nothing sensitive is ever in a response body (FR-030, SC-007)', () => {
  const probes = [
    '#provider-500 hi',
    '#provider-401 hi',
    '#empty hi',
    'hello there',
    '#no-cue hi',
  ];

  for (const probe of probes) {
    test(`no leak for ${probe}`, async ({ request }) => {
      const response = await request.post(`${BACKEND}/chat`, { data: validBody(probe) });
      const body = await response.text();

      expect(body).not.toContain('stub-key-4f3a9c-not-real');
      expect(body).not.toContain('You are Aria');
      expect(body).not.toContain('emotional cue');
      expect(body).not.toContain('groq');
      expect(body).not.toContain('Groq');
      expect(body).not.toContain('stub_provider_code');
      expect(body).not.toContain('upstream said');
      expect(body).not.toMatch(/\b(401|429|500|502)\b/);
      expect(body).not.toContain('at Object.');
    });
  }

  test('a 400 body says nothing about what was wrong', async ({ request }) => {
    const response = await request.post(`${BACKEND}/chat`, { data: {} });
    const body = await response.text();
    expect(body).toBe('That message could not be sent.');
  });
});

test.describe('200: the success shape (FR-027, FR-046)', () => {
  test('streams plain text with the cue still present for browser to strip', async ({ request }) => {
    const response = await request.post(`${BACKEND}/chat`, { data: validBody('hello') });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/x-ndjson');
    expect(response.headers()['cache-control']).toContain('no-store');

    const body = await response.text();
    expect(body).toContain('[emotion:happy]');
    expect(body).not.toContain('data:');
    expect(body).not.toContain('chat.completion.chunk');
  });

  test('consumes exactly one count per send (SC-009)', async ({ request }) => {
    await request.post(`${BACKEND}/chat`, { data: validBody('hello') });

    const counter = await request.post(`${BACKEND}/kv/get/quota:today`);
    expect((await counter.json()).result).toBe(1);
  });
});
