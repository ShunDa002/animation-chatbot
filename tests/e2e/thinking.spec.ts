import { expect, test, type Page } from '@playwright/test';

/**
 * T061 & T062 - User Story 4: The wait reads as thinking (FR-010, FR-034, SC-005, SC-009, quickstart V6).
 *
 * T061: A fixture delaying the first chunk by 5 seconds keeps the character in the thinking state
 * and a waiting indicator present for the whole delay, both ending on the first chunk.
 *
 * T062: 20-second abandonment when provider hangs: thinking state ends, character returns to idle,
 * visitor is invited to send again, and no failure path leaves character stuck in thinking state.
 */

async function send(page: Page, text: string): Promise<void> {
  await page.getByRole('textbox').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

test.describe('Thinking state and delay handling (US4)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('img', { name: /Aria/i })).toBeVisible({ timeout: 5000 });
  });

  test('T061: Delayed reply keeps character in thinking state and waiting indicator visible until first chunk (FR-010, SC-005)', async ({
    page,
  }) => {
    // #delayed has delayFirstMs: 5000
    await send(page, '#delayed wait a bit');

    // 1. Immediately in thinking state
    const waitingIndicator = page.locator('.waiting-indicator');
    await expect(waitingIndicator).toBeVisible({ timeout: 500 });
    await expect(page.getByRole('img', { name: /Aria.*thoughtful/i })).toBeVisible({ timeout: 1000 });

    // 2. Still in thinking state at 2.5s
    await page.waitForTimeout(2500);
    await expect(waitingIndicator).toBeVisible();
    await expect(page.getByRole('img', { name: /Aria.*thoughtful/i })).toBeVisible();

    // 3. Once reply starts arriving (~5s), thinking state ends and waiting indicator disappears
    await expect(page.locator('.message.character').first()).toBeVisible({ timeout: 7000 });
    await expect(waitingIndicator).toBeHidden();
    await expect(page.getByRole('img', { name: /Aria.*calm/i })).toBeVisible({ timeout: 3000 });
  });

  test('T062: 20-second abandonment resets thinking state and invites visitor to resend (FR-034, SC-009)', async ({
    page,
  }) => {
    test.setTimeout(35_000);

    // #hang hangs forever
    await send(page, '#hang wait forever');

    // Starts in thinking state
    await expect(page.getByRole('img', { name: /Aria.*thoughtful/i })).toBeVisible({ timeout: 1000 });

    // After ~20s timeout, error status appears and thinking state ends
    await expect(page.locator('.status-line.error')).toBeVisible({ timeout: 26_000 });
    await expect(page.getByRole('img', { name: /Aria.*calm/i })).toBeVisible({ timeout: 5000 });

    // Visitor can send again
    const textbox = page.getByRole('textbox');
    await textbox.fill('hello again');
    await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
  });
});
