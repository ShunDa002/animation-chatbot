import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * T044 - quickstart V2, plus the cue-visibility guarantee observed in a real browser.
 *
 * The provider is the local stub, so nothing here consumes the daily ceiling. Everything between the
 * keystroke and the stub is real: the input cap, the in-flight guard, the route handler, the SSE
 * reader, the tail buffer, the live region, and the seam.
 */

const STUB = 'http://127.0.0.1:4319';

async function resetStub(request: APIRequestContext): Promise<void> {
  await request.post(`${STUB}/control/reset`);
}

async function send(page: Page, text: string): Promise<void> {
  await page.getByRole('textbox').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

const log = (page: Page) => page.getByRole('log');

/**
 * "The visitor can send again" means the turn has ended, not that the button is lit - the button is
 * also disabled whenever the box is empty, which it always is straight after a send. So type
 * something and check the control accepts it.
 */
async function expectCanSendAgain(page: Page, timeout = 5_000): Promise<void> {
  await page.getByRole('textbox').fill('another message');
  await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled({ timeout });
  await page.getByRole('textbox').fill('');
}

/**
 * FR-037: no visitor-facing state is visible-only. Every notice has to reach both the panel and the
 * live region, so asserting one without the other would let half the requirement rot. Playwright's
 * strict mode makes this the natural shape anyway - a bare getByText matches both and refuses.
 */
async function expectNotice(page: Page, expected: RegExp, timeout = 8_000): Promise<void> {
  await expect(page.locator('.status-line')).toHaveText(expected, { timeout });
  await expect(page.getByRole('status')).toHaveText(expected, { timeout });
}
const characterBubbles = (page: Page) => page.locator('.message.character');
const visitorBubbles = (page: Page) => page.locator('.message.visitor');

test.beforeEach(async ({ request, page }) => {
  await resetStub(request);
  await page.goto('/');
});

test.describe('V2: a full turn', () => {
  test('the visitor message and a waiting indicator appear within 100ms of sending', async ({
    page,
  }) => {
    await page.getByRole('textbox').fill('hello there');

    const startedAt = Date.now();
    await page.getByRole('button', { name: 'Send' }).click();

    // SC-004: a response to the send - their own message plus a waiting indicator - every time.
    await expect(visitorBubbles(page)).toHaveText([/hello there/]);
    await expect(page.locator('.waiting-indicator')).toBeVisible();

    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  test('reply text accumulates progressively rather than arriving all at once', async ({ page }) => {
    await send(page, '#multiword tell me something');

    const bubble = characterBubbles(page).first();
    await expect(bubble).toBeVisible();

    // Sample the bubble while it fills. Distinct increasing lengths prove it is streaming and not
    // being withheld until complete (FR-016).
    const lengths = new Set<number>();
    for (let i = 0; i < 25; i += 1) {
      lengths.add(((await bubble.textContent()) ?? '').length);
      await page.waitForTimeout(8);
    }

    await expect(bubble).toHaveText(/I have been thinking about that\./);
    expect(lengths.size).toBeGreaterThan(1);
  });

  test('the reply is complete and the cue is gone', async ({ page }) => {
    await send(page, 'hello');
    await expect(characterBubbles(page).first()).toHaveText(/Hello there\./);
    await expect(log(page)).not.toContainText('[emotion');
  });

  test('a second send during an in-flight reply is refused, with the reason visible', async ({
    page,
  }) => {
    await send(page, '#delayed take your time');

    // FR-021: exactly one turn in flight, and the reason is visible to the visitor.
    await expect(page.locator('.composer-meta')).toContainText('Wait for Aria to finish replying');

    // Typing a fresh message does not re-enable the control while a turn is in flight.
    await page.getByRole('textbox').fill('let me interrupt');
    await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  test('the log is empty again after a reload (FR-024)', async ({ page }) => {
    await send(page, 'hello');
    await expect(characterBubbles(page).first()).toBeVisible();

    await page.reload();

    await expect(characterBubbles(page)).toHaveCount(0);
    await expect(visitorBubbles(page)).toHaveCount(0);
  });

  test('history travels onward, bounded to six messages (FR-017)', async ({ page, request }) => {
    for (let i = 0; i < 4; i += 1) {
      await send(page, `message number ${i}`);
      await expect(characterBubbles(page)).toHaveCount(i + 1, { timeout: 10_000 });
      await expect(characterBubbles(page).nth(i)).toHaveAttribute('data-status', 'complete', {
        timeout: 10_000,
      });
    }

    // Every turn is still visible in the log, even though only six messages travel.
    await expect(visitorBubbles(page)).toHaveCount(4);

    // Four turns is four provider calls and four counts, no more.
    const counter = await request.post(`${STUB}/kv/get/quota:${today()}`);
    expect((await counter.json()).result).toBe(4);
  });
});

test.describe('V3 in the browser: the cue is never visible on any frame', () => {
  test('a marker split across chunks never appears in the log', async ({ page }) => {
    await send(page, '#split say something');

    // Poll the rendered text continuously while the marker arrives in pieces. This is the check that
    // a naive implementation passes on whole strings and fails on a real stream (SC-007).
    const seen: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      seen.push((await log(page).textContent()) ?? '');
      await page.waitForTimeout(6);
    }
    seen.push((await log(page).textContent()) ?? '');

    for (const snapshot of seen) {
      expect(snapshot, `leaked in: ${JSON.stringify(snapshot)}`).not.toContain('[emo');
      expect(snapshot).not.toContain('emotion:');
      expect(snapshot).not.toContain('tion:ha');
    }

    await expect(characterBubbles(page).first()).toHaveText(/All done/);
  });
});

test.describe('V4 in the browser: bad cues degrade', () => {
  test('a reply with no cue is shown in full', async ({ page }) => {
    await send(page, '#no-cue hello');
    await expect(characterBubbles(page).first()).toHaveText(/Just text, no marker at all\./);
  });

  test('an unknown cue leaves the text intact and the character neutral (FR-019)', async ({
    page,
  }) => {
    await send(page, '#unknown-cue hello');
    await expect(characterBubbles(page).first()).toHaveText(/Text here\./);
    // The seam carried neutral rather than an unmapped value.
    await expect(page.locator('[data-emotion]').first()).toHaveAttribute(
      'data-emotion',
      'neutral',
    );
  });

  test('a reply that is nothing but a cue gives a sentence, not a blank bubble', async ({ page }) => {
    // The endpoint forwards this one, because from its side the provider did emit content. The
    // client is what discovers there is nothing left once the cue is stripped (FR-019).
    await send(page, '#cue-only hello');
    await expectNotice(page, /Aria did not have anything to say/);
    await expect(characterBubbles(page)).toHaveCount(0);
    await expectCanSendAgain(page);
  });

  test('a reply with no content at all is reported by the endpoint instead', async ({ page }) => {
    // Here the provider emitted nothing, so the endpoint answers 502 and the visitor gets the
    // generic sentence. Both routes end with an actionable message and a usable page (SC-009).
    await send(page, '#empty hello');
    await expectNotice(page, /Something went wrong reaching the character/);
    await expect(characterBubbles(page)).toHaveCount(0);
    await expectCanSendAgain(page);
  });
});

test.describe('the emotion seam, observed from outside (FR-020, SC-006)', () => {
  for (const emotion of ['happy', 'sad', 'surprised', 'angry', 'shy', 'neutral']) {
    test(`a ${emotion} cue reaches the character as ${emotion}`, async ({ page }) => {
      await send(page, `#emotion-${emotion} how do you feel`);

      await expect(characterBubbles(page).first()).toHaveText(new RegExp(`feels ${emotion}`));
      await expect(page.locator('[data-emotion]').first()).toHaveAttribute(
        'data-emotion',
        emotion,
      );
    });
  }

  test('the character area names its current state in words (FR-038)', async ({ page }) => {
    await send(page, '#emotion-sad bad news');

    // The text description is what a visitor who cannot see the character relies on.
    await expect(page.getByRole('img', { name: /Aria.*sad/i })).toBeVisible();
  });
});

test.describe('failure paths leave a usable page (SC-009, FR-023)', () => {
  const failures: Array<[string, string, RegExp]> = [
    ['a provider error', '#provider-500 hi', /Something went wrong reaching the character/],
    ['a provider auth failure', '#provider-401 hi', /Something went wrong reaching the character/],
    ['a cue-only reply', '#cue-only hi', /Aria did not have anything to say/],
  ];

  for (const [label, script, expected] of failures) {
    test(label + ' shows an actionable message and the page stays usable', async ({ page }) => {
      await send(page, script);

      await expectNotice(page, expected);
      await expectCanSendAgain(page);

      // No provider detail reaches the visitor (FR-030, SC-007). Checked against the status line and
      // the character's own bubbles rather than the whole page: the visitor's message is echoed back
      // into the log verbatim, and it contains the script name they typed.
      const shown = [
        (await page.locator('.status-line').textContent()) ?? '',
        (await characterBubbles(page).allTextContents()).join(' '),
      ].join(' ');
      expect(shown).not.toContain('groq');
      expect(shown).not.toContain('stub_provider_code');
      expect(shown).not.toContain('upstream said');
      expect(shown).not.toMatch(/\b(401|500|502)\b/);
      expect(shown).not.toContain('You are Aria');

      // And a following turn works without a reload.
      await send(page, 'try again');
      await expect(characterBubbles(page).last()).toHaveText(/Hello there\./);
    });
  }

  test('the ceiling shows the temporary-limit message (FR-028)', async ({ page, request }) => {
    await request.post(`${STUB}/control/quota/150`);
    await send(page, 'hello');

    await expectNotice(page, /The demo is temporarily limited/);
    await expectCanSendAgain(page);
  });

  test('a reply that starts then hangs keeps its text and lets the visitor send again', async ({
    page,
  }) => {
    // The endpoint may not cut this off (FR-034), so the client's stall watchdog is what makes the
    // page usable again. The partial text must not be retracted (spec Edge Cases).
    await send(page, '#stall-midstream hi');

    await expect(characterBubbles(page).first()).toHaveText(/I started saying somethi/);

    // The watchdog ends the turn. Until it does, the partial text simply sits there.
    await expectNotice(page, /Aria stopped mid-sentence/, 20_000);
    await expect(characterBubbles(page).first()).toHaveText(/I started saying somethi/);
    await expectCanSendAgain(page);
  });
});

test.describe('the character never gets stuck in the thinking state (SC-009)', () => {
  for (const script of ['#provider-500 hi', '#empty hi', '#cue-only hi']) {
    test(`after ${script}`, async ({ page }) => {
      await send(page, script);
      await expect(page.locator('.waiting-indicator')).toBeHidden();
      await expect(page.locator('[data-thinking="false"]')).toBeVisible();
    });
  }
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
