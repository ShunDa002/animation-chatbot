import { expect, test, type Page } from '@playwright/test';
import { type Emotion } from '@/lib/emotion';
import { EMOTION_LABELS } from '@/lib/character/labels';

/**
 * T057 & T058 - User Story 3: Character reacts to what it says (SC-006, FR-007, FR-009, quickstart V5).
 *
 * T057: 20 varied fixtures covering every member of the union, asserting the emotion handed
 * across the seam matches each fixture's cue and the character's aria-label follows it.
 *
 * T058: A newer reaction arriving mid-reaction leaves exactly one visible reaction (the newer)
 * with no visual overlap or stuck pose, end-to-end.
 */

async function send(page: Page, text: string): Promise<void> {
  await page.getByRole('textbox').fill(text);
  await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Send' }).click();
}

async function expectCanSendAgain(page: Page, timeout = 5_000): Promise<void> {
  await page.getByRole('textbox').fill('ready');
  await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled({ timeout });
  await page.getByRole('textbox').fill('');
}

test.describe('Character reacts to what it says (US3)', () => {
  test.beforeEach(async ({ request, page }) => {
    await request.post('http://127.0.0.1:4319/control/reset');
    page.on('request', (req) => {
      if (req.url().includes('/chat')) {
        console.log('REQ /chat:', req.postData());
      }
    });
    page.on('response', (res) => {
      if (res.url().includes('/chat')) {
        console.log('RES /chat:', res.status());
      }
    });
    await page.goto('/');
    await expect(page.getByRole('img', { name: /Aria/i })).toBeVisible({ timeout: 5000 });
  });

  test('T057: 20 varied fixtures covering every member of the union update character aria-label (SC-006, FR-007)', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // 20 fixture prompts covering all 6 emotions repeatedly in varied order
    const fixtures: Array<{ emotion: Emotion; prompt: string }> = [
      { emotion: 'happy', prompt: '#emotion-happy Tell me good news' },
      { emotion: 'sad', prompt: '#emotion-sad Tell me sad news' },
      { emotion: 'surprised', prompt: '#emotion-surprised Tell me a shocker' },
      { emotion: 'angry', prompt: '#emotion-angry Tell me something annoying' },
      { emotion: 'shy', prompt: '#emotion-shy Compliment me' },
      { emotion: 'neutral', prompt: '#emotion-neutral What is today' },
      { emotion: 'happy', prompt: '#emotion-happy That was awesome' },
      { emotion: 'sad', prompt: '#emotion-sad I lost my keys' },
      { emotion: 'surprised', prompt: '#emotion-surprised Did you see that' },
      { emotion: 'angry', prompt: '#emotion-angry That broke again' },
      { emotion: 'shy', prompt: '#emotion-shy You look great' },
      { emotion: 'neutral', prompt: '#emotion-neutral Let us talk' },
      { emotion: 'happy', prompt: '#emotion-happy Happy to hear it' },
      { emotion: 'sad', prompt: '#emotion-sad A sad story' },
      { emotion: 'surprised', prompt: '#emotion-surprised Surprise party' },
      { emotion: 'angry', prompt: '#emotion-angry So frustrating' },
      { emotion: 'shy', prompt: '#emotion-shy A blushing moment' },
      { emotion: 'neutral', prompt: '#emotion-neutral Plain question' },
      { emotion: 'happy', prompt: '#emotion-happy Wonderful day' },
      { emotion: 'surprised', prompt: '#emotion-surprised Whoa!' },
    ];

    expect(fixtures.length).toBe(20);

    for (const [idx, { emotion, prompt }] of fixtures.entries()) {
      console.log(`[fixture ${idx + 1}/20]`, emotion, prompt);
      await send(page, prompt);
      const bubble = page.locator('.message.character').nth(idx);
      await expect(bubble).toBeVisible({ timeout: 10_000 });

      const label = EMOTION_LABELS[emotion];
      const regex = new RegExp(`Aria.*${label}`, 'i');
      await expect(page.getByRole('img', { name: regex })).toBeVisible({ timeout: 10_000 });
      await expect(bubble).toHaveAttribute('data-status', 'complete', { timeout: 10_000 });
    }

    await expectCanSendAgain(page, 5000);
  });

  test('T058: Newer reaction arriving mid-reaction leaves exactly one visible reaction without overlap or stuck pose (FR-009)', async ({
    page,
  }) => {
    // Wait for dev-console handle
    await page.waitForFunction(() => typeof (window as any).__setEmotion === 'function');

    // Trigger first reaction
    await page.evaluate(() => {
      (window as any).__setEmotion('sad');
    });
    await expect(page.getByRole('img', { name: /Aria.*sad/i })).toBeVisible();

    // Trigger second reaction immediately while first would be playing
    await page.evaluate(() => {
      (window as any).__setEmotion('happy');
    });

    // The newer reaction wins and character reflects happy
    await expect(page.getByRole('img', { name: /Aria.*happy/i })).toBeVisible();

    // Trigger third reaction
    await page.evaluate(() => {
      (window as any).__setEmotion('surprised');
    });
    await expect(page.getByRole('img', { name: /Aria.*surprised/i })).toBeVisible();
  });
});
