import { expect, test } from '@playwright/test';

/**
 * T025 - Quickstart V1: Character alive on arrival (US1 - MVP).
 *
 * 1. Open the page with the chat panel ignored.
 * 2. The character appears and an idle loop runs with no interaction within 3 seconds (SC-002).
 * 3. Trigger a reaction manually from the dev console handle (__setEmotion).
 * 4. The reaction plays and idle resumes; aria-label follows it (FR-005, FR-008, FR-038).
 * 5. A deliberately broken model URL falls back to StillCharacter and page stays usable (FR-012, R11).
 */

test.describe('Character stage alive on arrival (US1 - SC-002, FR-005, FR-012)', () => {
  test('character appears within 3 seconds and idles with no interaction', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');

    // Character area with img role is visible within 3 seconds
    const characterArea = page.getByRole('img', { name: /Aria/i });
    await expect(characterArea).toBeVisible({ timeout: 3000 });

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(3000);

    // Initial neutral state description
    await expect(characterArea).toHaveAttribute('aria-label', /Aria.*calm/i);
  });

  test('dev-console handle triggers reaction and updates aria-label', async ({ page }) => {
    await page.goto('/');

    // Wait for character stage to mount and expose window.__setEmotion
    await page.waitForFunction(() => typeof (window as any).__setEmotion === 'function', null, {
      timeout: 5000,
    });

    // Trigger reaction manually
    await page.evaluate(() => {
      (window as any).__setEmotion('happy');
    });

    // Aria-label follows reaction
    await expect(page.getByRole('img', { name: /Aria.*happy/i })).toBeVisible();

    // Trigger another reaction
    await page.evaluate(() => {
      (window as any).__setEmotion('surprised');
    });

    await expect(page.getByRole('img', { name: /Aria.*surprised/i })).toBeVisible();
  });

  test('broken model URL falls back to still image while conversation stays usable (FR-012, R11)', async ({
    page,
  }) => {
    // Intercept model3.json with a 404 to simulate broken modelUrl
    await page.route('**/haru.model3.json', (route) => route.abort('failed'));

    await page.goto('/');

    // Still image fallback is displayed
    const stillImage = page.locator('img[data-still="image"], [data-still="text-only"]');
    await expect(stillImage).toBeVisible({ timeout: 5000 });

    // The chat panel is still fully usable
    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
    await textbox.fill('hello world');
    await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  test('character model is scaled to fit so the head is visible in top ~30% of character area (FR-042, SC-002, T095)', async ({
    page,
  }) => {
    await page.goto('/');

    // Character area is visible
    const characterArea = page.getByRole('img', { name: /Aria/i });
    await expect(characterArea).toBeVisible({ timeout: 5000 });

    // Wait for character stage to mount and expose window.__characterHandle
    await page.waitForFunction(
      () => typeof (window as any).__characterHandle !== 'undefined' && (window as any).__characterHandle?.ready,
      null,
      { timeout: 10000 }
    );

    // Give the model a brief moment to finish its initial frame render
    await page.waitForTimeout(1000);

    // Capture screenshot of the character area
    const screenshotBuffer = await characterArea.screenshot();
    const base64 = screenshotBuffer.toString('base64');

    // Sample pixels in the top 30% of the character area (where the head and hair sit after centering
    // with the 0.85 breathing room factor, guarding against the cropping bug returning)
    const characterPixelCount = await page.evaluate(async (base64Img) => {
      return new Promise<number>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(0);
          ctx.drawImage(img, 0, 0);

          // Top 30% vertically, middle 60% horizontally (where head is positioned)
          const topHeight = Math.floor(img.height * 0.3);
          const startX = Math.floor(img.width * 0.2);
          const sampleWidth = Math.floor(img.width * 0.6);

          const imageData = ctx.getImageData(startX, 0, sampleWidth, topHeight);
          const data = imageData.data;

          // Corner pixel (0,0) represents the container surface/background color
          const cornerData = ctx.getImageData(0, 0, 1, 1).data;
          const [bgR, bgG, bgB] = [cornerData[0], cornerData[1], cornerData[2]];

          let characterPixels = 0;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
            // Non-background pixel threshold (with tolerance margin per Finding C1/D1)
            if (diff > 35) {
              characterPixels++;
            }
          }
          resolve(characterPixels);
        };
        img.src = `data:image/png;base64,${base64Img}`;
      });
    }, base64);

    // The upper region must have character pixels (head/hair),
    // proving the model is not cropped at the top.
    expect(characterPixelCount).toBeGreaterThan(100);
  });
});
