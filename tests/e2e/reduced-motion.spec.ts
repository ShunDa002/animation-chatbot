import { expect, test } from '@playwright/test';

/**
 * T067 - quickstart V8, the part that is testable today.
 *
 * The preference is emulated BEFORE the page loads, which is the whole point of FR-035: no motion
 * may play before the preference is applied, so a check that sets it after load proves nothing.
 *
 * SCOPE NOTE. The renderer half of FR-014 - suppressing the Live2D model's idle motion, breath,
 * physics, and auto-blink - cannot be asserted until the Cubism model is vendored (T010 to T012,
 * blocked on a license-gated download). What is asserted here is everything the page itself
 * animates, plus the requirement that the conversation is entirely unaffected by the preference.
 */

// Emulated explicitly rather than through `test.use({ reducedMotion })`, which this Playwright
// version accepts without applying - the media query still reported "no preference" in the page, so
// the whole file was passing against a browser that had never been told anything. Calling
// emulateMedia BEFORE goto is also the literal shape of FR-035: the preference is in force for the
// whole visit including page load, so no motion can play before it is applied.
test.beforeEach(async ({ request, page }) => {
  await request.post('http://127.0.0.1:4319/control/reset');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
});

test('the preference is in force from the first paint (FR-035)', async ({ page }) => {
  const matched = await page.evaluate(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  expect(matched).toBe(true);
});

test('nothing on the page animates for a measurable duration', async ({ page }) => {
  await page.getByRole('textbox').fill('hello');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('.message.character').first()).toBeVisible();

  // Every animation and transition is reduced to effectively zero, so no element is mid-motion at
  // any point a visitor could perceive.
  const moving = await page.evaluate(() => {
    const offenders: string[] = [];
    for (const element of document.querySelectorAll('*')) {
      const style = getComputedStyle(element);
      const durations = [style.animationDuration, style.transitionDuration]
        .join(',')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      for (const duration of durations) {
        const seconds = duration.endsWith('ms')
          ? Number.parseFloat(duration) / 1000
          : Number.parseFloat(duration);
        if (Number.isFinite(seconds) && seconds > 0.05) {
          offenders.push(`${element.tagName}.${element.className} ${duration}`);
        }
      }
    }
    return offenders;
  });

  expect(moving, `still animating: ${moving.join(' | ')}`).toEqual([]);
});

test('the waiting indicator does not pulse', async ({ page }) => {
  await page.getByRole('textbox').fill('#delayed take your time');
  await page.getByRole('button', { name: 'Send' }).click();

  const indicator = page.locator('.waiting-indicator');
  await expect(indicator).toBeVisible();

  // It still says what it needs to say - the state is conveyed, just not through movement.
  await expect(indicator).toHaveText(/Thinking/);

  const pulse = await page.evaluate(() => {
    const node = document.querySelector('.waiting-indicator');
    if (!node) return null;
    return getComputedStyle(node, '::before').animationDuration;
  });
  expect(pulse === null || Number.parseFloat(pulse ?? '0') < 0.05).toBe(true);
});

test('the conversation is entirely unaffected by the preference (FR-014)', async ({ page }) => {
  await page.getByRole('textbox').fill('hello');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.locator('.message.character').first()).toHaveText(/Hello there\./);
  await expect(page.getByRole('log')).not.toContainText('[emotion');
});

test('emotional state is still conveyed, as a still description (FR-014, SC-008)', async ({
  page,
}) => {
  // The requirement is that emotion survives the loss of motion. With the renderer stubbed out by
  // the still image, this is the description changing per emotion - which is exactly the channel
  // FR-038 requires and which a reduced-motion visitor depends on.
  for (const [script, label] of [
    ['#emotion-happy good news', 'happy'],
    ['#emotion-sad bad news', 'sad'],
    ['#emotion-angry infuriating news', 'annoyed'],
  ] as const) {
    await page.getByRole('textbox').fill(script);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('img', { name: new RegExp(label, 'i') })).toBeVisible();
  }
});
