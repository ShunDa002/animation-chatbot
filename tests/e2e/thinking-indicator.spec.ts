import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * T130 - Thinking indicator in chat panel (FR-014, FR-040, D14).
 *
 * - Thinking indicator appears in the chat panel (MessageLog) when status is waiting (FR-040)
 * - Speech bubble overlay is completely removed from the UI
 * - Thinking indicator is replaced by the streaming reply text inside the chat panel
 * - Thinking indicator clears on error and does not leave stuck poses or stray bubbles
 */

const STUB = 'http://127.0.0.1:4319';

async function resetStub(request: APIRequestContext): Promise<void> {
  await request.post(`${STUB}/control/reset`);
}

async function send(page: Page, text: string): Promise<void> {
  await page.getByRole('textbox').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

test.describe('Chat panel thinking indicator (T130, FR-014, FR-040)', () => {
  test.beforeEach(async ({ request, page }) => {
    await resetStub(request);
    await page.goto('/');
    await expect(page.getByRole('img', { name: /Aria/i })).toBeVisible({ timeout: 5000 });
  });

  test('Shows thinking dots in chat panel during wait and does not render a speech bubble (FR-040)', async ({ page }) => {
    const bubble = page.locator('[data-testid="speech-bubble"]');
    const log = page.locator('.message-log');
    const thinkingDots = page.locator('.message-log [data-testid="thinking-dots"]');

    // Speech bubble overlay is completely absent from the DOM
    await expect(bubble).toHaveCount(0);
    // Thinking dots not visible before send
    await expect(thinkingDots).toBeHidden();

    // Send with delay to verify thinking state
    await send(page, '#delayed please wait');

    // Shows thinking dots in the message log while waiting
    await expect(thinkingDots).toBeVisible({ timeout: 2000 });
    // Verify speech bubble overlay is still non-existent
    await expect(bubble).toHaveCount(0);

    // Once streaming begins (~5s), thinking dots are replaced by streaming reply in the message log
    await expect(page.locator('.message.character')).toContainText(/Took a while|Hello/i, { timeout: 15_000 });
    await expect(thinkingDots).toBeHidden({ timeout: 5000 });
  });

  test('Thinking indicator clears when next turn streams and maintains history in chat panel', async ({ page }) => {
    const bubble = page.locator('[data-testid="speech-bubble"]');
    const thinkingDots = page.locator('.message-log [data-testid="thinking-dots"]');

    // 1. Send first message and wait for full reply in the chat panel
    await send(page, 'hello there');
    await expect(page.locator('.message.character').first()).toBeVisible({ timeout: 5000 });
    await expect(bubble).toHaveCount(0);

    // 2. Send second turn with delay: thinking dots appear in chat panel
    await send(page, '#delayed second question');
    await expect(thinkingDots).toBeVisible({ timeout: 2000 });
    await expect(bubble).toHaveCount(0);

    // 3. New reply text arrives in the chat panel and thinking dots disappear
    await expect(page.locator('.message.character').nth(1)).toContainText(/Took a while|Hello/i, { timeout: 15_000 });
    await expect(thinkingDots).toBeHidden({ timeout: 5000 });
  });

  test('Thinking indicator clears on error and never creates speech bubble overlay', async ({ page }) => {
    const bubble = page.locator('[data-testid="speech-bubble"]');
    const thinkingDots = page.locator('.message-log [data-testid="thinking-dots"]');

    // Send request that triggers provider 500 failure
    await send(page, '#provider-500 fail please');

    // Error status appears in the chat panel
    await expect(page.locator('.status-line.error')).toBeVisible({ timeout: 5000 });

    // Thinking dots must be hidden/cleared
    await expect(thinkingDots).toBeHidden();
    // Speech bubble must not exist
    await expect(bubble).toHaveCount(0);
  });
});
