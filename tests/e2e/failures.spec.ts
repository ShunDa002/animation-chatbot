import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * T066 - Quickstart V7 failure matrix:
 * Asserting each failure leaves an actionable plain-language message, a page usable without reloading,
 * a character not stuck in thinking state, and provider allowance protected.
 */

const STUB = 'http://127.0.0.1:4319';

async function resetStub(request: APIRequestContext): Promise<void> {
  await request.post(`${STUB}/control/reset`);
}

async function send(page: Page, text: string): Promise<void> {
  await page.getByRole('textbox').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

test.describe('Failure matrix (T066, quickstart V7)', () => {
  test.beforeEach(async ({ request, page }) => {
    await resetStub(request);
    await page.goto('/');
    await expect(page.getByRole('img', { name: /Aria/i })).toBeVisible({ timeout: 5000 });
  });

  test('Provider returns 500: leaves plain message, character not stuck in thinking, sendable again', async ({
    page,
  }) => {
    await send(page, '#provider-500 hi');

    // Actionable plain message (FR-004, FR-030)
    await expect(page.locator('.status-line.error')).toContainText(
      'Something went wrong reaching the character. Try sending again.'
    );

    // Character is not stuck in thinking state (SC-009)
    await expect(page.getByRole('img', { name: /Aria.*thoughtful/i })).toBeHidden();
    await expect(page.getByRole('img', { name: /Aria.*calm/i })).toBeVisible();

    // No provider text / status code shown (FR-030)
    const characterTexts = await page.locator('.message.character').allTextContents();
    const statusText = (await page.locator('.status-line').textContent()) ?? '';
    const combined = characterTexts.join(' ') + statusText;
    expect(combined).not.toContain('500');
    expect(combined).not.toContain('Internal Server Error');

    // Page usable without reload (FR-023)
    const textbox = page.getByRole('textbox');
    await textbox.fill('try again');
    await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  test('Stream starts then stalls: partial text stays, sendable again (FR-034)', async ({ page }) => {
    test.setTimeout(25_000);
    await send(page, '#stall-midstream hi');

    // Partial text arrives
    await expect(page.locator('.message.character').first()).toContainText('I started saying somethi');

    // Stalled message appears after client stall watchdog
    await expect(page.locator('.status-line.error')).toBeVisible({ timeout: 15_000 });

    // Partial text was NOT retracted
    await expect(page.locator('.message.character').first()).toContainText('I started saying somethi');

    // Can send again without reloading
    const textbox = page.getByRole('textbox');
    await textbox.fill('hello next');
    await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  test('Broken modelUrl: Still image fallback shown, chat remains fully usable (FR-012)', async ({
    page,
  }) => {
    await page.route('**/rem.json', (route) => route.abort('failed'));
    await page.goto('/');

    const stillImg = page.locator('img[data-still="image"], [data-still="text-only"]');
    await expect(stillImg).toBeVisible({ timeout: 5000 });

    // Chat works fully
    await send(page, '#plain hello');
    await expect(page.locator('.message.character').first()).toBeVisible({ timeout: 5000 });
  });

  test('Counter at 150 limit: 429 returned with temporary-limit message (FR-028, SC-010)', async ({
    request,
    page,
  }) => {
    // Set counter to 150 on stub
    await request.post(`${STUB}/control/quota/150`);

    await send(page, 'hello at limit');

    await expect(page.locator('.status-line.error')).toContainText(
      'The demo is temporarily limited. Please try again later.'
    );

    // Character not stuck in thinking
    await expect(page.getByRole('img', { name: /Aria.*calm/i })).toBeVisible();
  });

  test('Thread creation failure on load: disables sending and shows connection notice (FR-045)', async ({
    request,
    page,
  }) => {
    await request.post(`${STUB}/control/thread-fail/1`);
    try {
      await page.goto('/');
      await expect(page.locator('.status-line.error')).toContainText(
        'Could not connect to the backend. Please reload the page to try again.'
      );
      await page.getByRole('textbox').fill('hello');
      await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
    } finally {
      await request.post(`${STUB}/control/thread-fail/0`);
    }
  });
});
