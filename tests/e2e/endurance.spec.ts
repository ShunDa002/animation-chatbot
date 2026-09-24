import { expect, test, type Page } from '@playwright/test';

/**
 * T071 - Endurance test (SC-011, FR-013, quickstart V11).
 *
 * Runs multiple turns with the renderer live, asserting:
 * - Exactly one character on screen (no duplicate models or canvases)
 * - Reply handling completes without latency explosion
 * - Canvas remains responsive throughout
 */

async function send(page: Page, text: string): Promise<void> {
  await page.getByRole('textbox').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

const STUB = 'http://127.0.0.1:4319';

test.describe('Endurance and resource stability (T071)', () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`${STUB}/control/reset`);
    // Warm up mock backend /chat to avoid initial latency in test turns
    await request.post(`${STUB}/chat`, { data: { user_input: '#plain warm', thread_id: 'warmup-thread' } });
  });

  test('multiple continuous turns maintain single character and steady latency', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/');

    await expect(page.getByRole('img', { name: /Aria/i })).toBeVisible({ timeout: 5000 });
    // Wait for the renderer to be live before endurance turns (SC-011)
    await page.waitForFunction(() => typeof (window as any).__setEmotion === 'function', null, {
      timeout: 10_000,
    });

    const turns = 10;
    const durations: number[] = [];

    for (let i = 0; i < turns; i++) {
      const start = Date.now();
      await page.getByRole('textbox').fill(`#plain turn ${i + 1}`);
      await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Send' }).click();

      const bubble = page.locator('.message.character').nth(i);
      await expect(bubble).toBeVisible({ timeout: 15_000 });
      await expect(bubble).toHaveAttribute('data-status', 'complete', { timeout: 15_000 });

      durations.push(Date.now() - start);

      // Verify exactly one character stage / canvas on screen
      const canvases = page.locator('.character-area canvas, .character-area img');
      await expect(canvases).toHaveCount(1);
    }

    // Verify latency did not escalate by orders of magnitude
    const firstHalfAvg = durations.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const secondHalfAvg = durations.slice(5).reduce((a, b) => a + b, 0) / 5;

    // Second half latency should not be > 3x first half
    expect(secondHalfAvg).toBeLessThan(firstHalfAvg * 3 + 2000);
  });
});
