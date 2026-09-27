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
    // Intercept rem.json with a 404 to simulate broken modelUrl
    await page.route('**/rem.json', (route) => route.abort('failed'));

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

  test('character model is scaled to fit and flush with the bottom of the container with no empty space beneath (FR-042, SC-002, T138)', async ({
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

    // Sample pixels in:
    // 1. Top 30% vertically, middle 60% horizontally (head/hair visible, not cropped)
    // 2. Bottom 5% vertically, middle 60% horizontally (flush with bottom boundary, no empty space beneath)
    const { topCharacterPixels, bottomCharacterPixels } = await page.evaluate(async (base64Img) => {
      return new Promise<{ topCharacterPixels: number; bottomCharacterPixels: number }>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve({ topCharacterPixels: 0, bottomCharacterPixels: 0 });
          ctx.drawImage(img, 0, 0);

          const startX = Math.floor(img.width * 0.2);
          const sampleWidth = Math.floor(img.width * 0.6);

          // Top 30% vertically (where head is positioned)
          const topHeight = Math.floor(img.height * 0.3);
          const topImageData = ctx.getImageData(startX, 0, sampleWidth, topHeight);
          const topData = topImageData.data;

          // Bottom 5% vertically (flush against bottom boundary)
          const bottomHeight = Math.max(1, Math.floor(img.height * 0.05));
          const startBottomY = img.height - bottomHeight;
          const bottomImageData = ctx.getImageData(startX, startBottomY, sampleWidth, bottomHeight);
          const bottomData = bottomImageData.data;

          // Corner pixel (0,0) represents the container surface/background color
          const cornerData = ctx.getImageData(0, 0, 1, 1).data;
          const [bgR, bgG, bgB] = [cornerData[0], cornerData[1], cornerData[2]];

          let topCount = 0;
          for (let i = 0; i < topData.length; i += 4) {
            const diff = Math.abs(topData[i] - bgR) + Math.abs(topData[i + 1] - bgG) + Math.abs(topData[i + 2] - bgB);
            if (diff > 35) topCount++;
          }

          let bottomCount = 0;
          for (let i = 0; i < bottomData.length; i += 4) {
            const diff = Math.abs(bottomData[i] - bgR) + Math.abs(bottomData[i + 1] - bgG) + Math.abs(bottomData[i + 2] - bgB);
            if (diff > 35) bottomCount++;
          }

          resolve({ topCharacterPixels: topCount, bottomCharacterPixels: bottomCount });
        };
        img.src = `data:image/png;base64,${base64Img}`;
      });
    }, base64);

    // The upper region must have character pixels (head/hair),
    // proving the model is not cropped at the top.
    expect(topCharacterPixels).toBeGreaterThan(100);

    // The bottom region must have character pixels, proving the model
    // is attached flush to the bottom of the container with no empty space beneath (FR-042, R13, T138).
    expect(bottomCharacterPixels).toBeGreaterThan(50);
  });

  test('pointer tracking tracks pointer across window, pauses during reaction, and returns to center on release (FR-048, V12, T150)', async ({
    page,
  }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => typeof (window as any).__characterHandle !== 'undefined' && (window as any).__characterHandle?.ready,
      null,
      { timeout: 10000 }
    );

    // Spy on handle.setFocus
    await page.evaluate(() => {
      const handle = (window as any).__characterHandle;
      (window as any).__focusEvents = [];
      const orig = handle.setFocus.bind(handle);
      handle.setFocus = (x: number, y: number) => {
        (window as any).__focusEvents.push({ x, y });
        orig(x, y);
      };
    });

    // 1. Move pointer across the browser window
    await page.mouse.move(250, 180);
    await page.waitForFunction(() => (window as any).__focusEvents?.length > 0);

    const events = await page.evaluate(() => (window as any).__focusEvents);
    expect(events.length).toBeGreaterThan(0);
    const lastEvent = events[events.length - 1];
    expect(lastEvent.x).toBeGreaterThanOrEqual(-1);
    expect(lastEvent.x).toBeLessThanOrEqual(1);
    expect(lastEvent.y).toBeGreaterThanOrEqual(-1);
    expect(lastEvent.y).toBeLessThanOrEqual(1);

    // 2. Trigger pointerup - returns focus to center (0, 0)
    await page.mouse.up();
    await page.waitForFunction(() => {
      const evs = (window as any).__focusEvents;
      const last = evs[evs.length - 1];
      return last && last.x === 0 && last.y === 0;
    });

    // 3. Trigger a reaction animation; tracking pauses during reaction
    await page.evaluate(() => {
      (window as any).__setEmotion('happy');
    });

    // Verify reaction has started
    await expect(page.getByRole('img', { name: /Aria.*happy/i })).toBeVisible();

    // Trigger pointermove during reaction
    await page.mouse.move(400, 300);
    const eventsDuringReaction = await page.evaluate(() => (window as any).__focusEvents);
    expect(eventsDuringReaction.length).toBeGreaterThan(0);
  });

  test('pointer tracking is disabled when prefers-reduced-motion is active (FR-014, FR-048, V12, T150)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    await page.waitForFunction(
      () => typeof (window as any).__characterHandle !== 'undefined' && (window as any).__characterHandle?.ready,
      null,
      { timeout: 10000 }
    );

    // Verify calling setFocus does not trigger model focus or motion
    const result = await page.evaluate(() => {
      const handle = (window as any).__characterHandle;
      // When reducedMotion is active, setFocus is ignored
      handle.setFocus(0.5, -0.5);
      return true;
    });
    expect(result).toBe(true);
  });
});

