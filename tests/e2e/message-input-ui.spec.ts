import { expect, test } from '@playwright/test';

test.describe('Message Input UI Redesign (quickstart.md & 60fps performance validation)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('textbox', { name: /Message Aria/i })).toBeVisible({ timeout: 10000 });
  });

  test('Scenario 1: Single-Line Pill Validation', async ({ page }) => {
    const composerBox = page.locator('.composer-box');
    await expect(composerBox).toBeVisible();

    // Verify pill geometry class
    const boxClass = await composerBox.getAttribute('class');
    expect(boxClass).toContain('rounded-full');

    // Verify all 5 controls are present inline
    await expect(page.getByRole('button', { name: /Add attachment/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Message Aria/i })).toBeVisible();
    await expect(page.getByRole('combobox', { name: /Select model/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Voice input/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Send/i })).toBeVisible();
  });

  test('Scenario 2: Auto-Expansion and Layout Morphing Validation with 60fps frame trace', async ({ page }) => {
    const composerBox = page.locator('.composer-box');
    const textarea = page.getByRole('textbox', { name: /Message Aria/i });

    // Wait for initial render/textures to settle before measuring animation transition
    await page.waitForTimeout(500);

    // Performance profiling: Measure frame durations during CSS transition
    const perfProfile = await page.evaluate(async () => {
      const frameDurations: number[] = [];
      let lastTime: number | null = null;
      let keepRunning = true;

      function recordFrame(now: number) {
        if (lastTime !== null) {
          frameDurations.push(now - lastTime);
        }
        lastTime = now;
        if (keepRunning) {
          requestAnimationFrame(recordFrame);
        }
      }

      requestAnimationFrame(recordFrame);

      // Trigger multi-line expansion by dispatching typing events with React's native setter
      const inputEl = document.querySelector('textarea') as HTMLTextAreaElement;
      inputEl.focus();

      // Simulate multi-line entry with React value setter
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      nativeSetter?.call(inputEl, 'First line of message\nSecond line of message');
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));

      // Wait 300ms for CSS transition animation to complete
      await new Promise((resolve) => setTimeout(resolve, 300));
      keepRunning = false;

      // Find max consecutive frames below 30fps (> 33.3ms) per Constitution IV (no sustained drop)
      let consecutiveSlow = 0;
      let maxConsecutiveSlow = 0;
      for (const d of frameDurations) {
        if (d > 33.33) {
          consecutiveSlow++;
          maxConsecutiveSlow = Math.max(maxConsecutiveSlow, consecutiveSlow);
        } else {
          consecutiveSlow = 0;
        }
      }

      const avgFrameTime = frameDurations.reduce((a, b) => a + b, 0) / (frameDurations.length || 1);

      return {
        totalFrames: frameDurations.length,
        avgFrameTime,
        maxConsecutiveSlow,
      };
    });

    console.log('Performance frame trace profile:', perfProfile);
    // Performance target: Constitution IV (no sustained drop below 30fps)
    expect(perfProfile.maxConsecutiveSlow).toBeLessThanOrEqual(1);
    // Average frame duration should be within smooth animation range (< 25ms, targeting 16.6ms)
    expect(perfProfile.avgFrameTime).toBeLessThan(25);

    // Verify container morphed into card
    await expect(composerBox).toHaveAttribute('data-multiline', 'true');
    const boxClass = await composerBox.getAttribute('class');
    expect(boxClass).toContain('rounded-2xl');

    // Verify attachment button at bottom-left and others at bottom-right
    const leftActions = page.locator('.composer-actions-left');
    const rightActions = page.locator('.composer-actions-right');
    await expect(leftActions.getByRole('button', { name: /Add attachment/i })).toBeVisible();
    await expect(rightActions.getByRole('combobox', { name: /Select model/i })).toBeVisible();
    await expect(rightActions.getByRole('button', { name: /Voice input/i })).toBeVisible();
    await expect(rightActions.getByRole('button', { name: /Send/i })).toBeVisible();
  });

  test('Scenario 3: Maximum Height Validation (5 lines max)', async ({ page }) => {
    const textarea = page.getByRole('textbox', { name: /Message Aria/i });

    // Fill with 15 lines to exceed the ~200px height limit
    await textarea.fill('Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10\nLine 11\nLine 12\nLine 13\nLine 14\nLine 15');

    // Height should be capped around 200px (12.5rem)
    const height = await textarea.evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeLessThanOrEqual(210);

    // Scrollbar must be available
    const hasScroll = await textarea.evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(hasScroll).toBe(true);

    const box = await page.locator('.composer-box').boundingBox();
    const viewport = page.viewportSize();
    console.log('DEBUG COMPOSER BOX:', box, 'VIEWPORT:', viewport);
    await page.screenshot({ path: 'test-results/debug-screenshot.png' });
  });

  test('Scenario 4: Submission Validation', async ({ page }) => {
    const textarea = page.getByRole('textbox', { name: /Message Aria/i });

    await textarea.fill('Hello Aria');
    // Press Enter to submit
    await textarea.press('Enter');

    // Input must be cleared
    await expect(textarea).toHaveValue('');

    // Textarea must remain enabled
    await expect(textarea).toBeEnabled();

    // Button transitions to disabled during waiting/streaming
    const sendButton = page.getByRole('button', { name: 'Send' });
    await expect(sendButton).toBeDisabled();
  });

  test('Scenario 5: Expands upwards without overflowing below the screen', async ({ page }) => {
    const composerBox = page.locator('.composer-box');
    const textarea = page.getByRole('textbox', { name: /Message Aria/i });
    const viewport = page.viewportSize()!;

    // In single-line mode, record initial box bounds
    const initialBox = (await composerBox.boundingBox())!;

    // Type multi-line text
    await textarea.fill('According to the latest available real-time data:\nCurrent AQI (US): 80\nAir quality category: Moderate\nMain pollutant: PM2.5 (fine particulate matter)');

    const expandedBox = (await composerBox.boundingBox())!;
    const expandedBottom = expandedBox.y + expandedBox.height;

    // 1. Top of message input MUST move upwards (y coordinate decreases)
    expect(expandedBox.y).toBeLessThan(initialBox.y);

    // 2. Height must increase
    expect(expandedBox.height).toBeGreaterThan(initialBox.height);

    // 3. Entire message input must stay completely within viewport bounds (never overflowing bottom)
    expect(expandedBox.y).toBeGreaterThanOrEqual(0);
    expect(expandedBottom).toBeLessThan(viewport.height);

    // 4. Action controls (send button, voice, attachment) must remain fully visible on-screen
    const sendButton = page.getByRole('button', { name: /Send/i });
    await expect(sendButton).toBeVisible();
    const sendBox = (await sendButton.boundingBox())!;
    expect(sendBox.y + sendBox.height).toBeLessThan(viewport.height);
  });
});
