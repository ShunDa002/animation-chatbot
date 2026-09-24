import { expect, test } from '@playwright/test';

/**
 * T119 - Full-screen character, sidebar, and transparent chat overlay (FR-001, FR-003, D14).
 *
 * - Desktop (>= 640px): Sidebar on left with New Chat and past conversations; character area full-screen height;
 *   chat panel overlays the bottom 50% of the character area with transparent background.
 * - Mobile (< 640px): Sidebar is an off-canvas drawer toggled by a hamburger menu button.
 * - No horizontal scrollbar at any supported width (FR-003).
 */

test.describe('Layout and responsive behaviour (T119, FR-001, FR-003, D14)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('img', { name: /Aria/i })).toBeVisible({ timeout: 5000 });
  });

  test('Renders sidebar and character area with bottom 50% chat overlay on desktop (FR-001, D14)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const sidebar = page.locator('aside.sidebar');
    const characterArea = page.locator('.character-area');
    const chatPanel = page.locator('.chat-panel');

    await expect(sidebar).toBeVisible();
    await expect(page.getByRole('button', { name: /new chat/i })).toBeVisible();
    await expect(characterArea).toBeVisible();
    await expect(chatPanel).toBeVisible();

    const charBox = await characterArea.boundingBox();
    const chatBox = await chatPanel.boundingBox();

    expect(charBox).not.toBeNull();
    expect(chatBox).not.toBeNull();

    // Character area occupies full screen height
    expect(charBox!.height).toBeGreaterThanOrEqual(750);

    // Chat panel overlays the bottom 50% of the character area
    // Its top starts near the middle of the viewport / character area
    expect(chatBox!.y).toBeGreaterThanOrEqual(charBox!.y + charBox!.height * 0.4);
    // And its bottom reaches near the bottom of the character area / viewport
    expect(chatBox!.y + chatBox!.height).toBeGreaterThanOrEqual(charBox!.y + charBox!.height - 10);

    // Verify chat panel background has transparency
    const bgStyle = await chatPanel.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.backgroundColor;
    });
    // Should be rgba with alpha < 1 or transparent
    expect(bgStyle).toMatch(/(rgba\([^)]+,\s*(?:0?\.[0-9]+|0)\)|transparent)/);
  });

  test('Mobile (< 640px) hides sidebar in off-canvas drawer toggled by hamburger menu (FR-003)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 });

    const hamburgerBtn = page.getByRole('button', { name: /menu|open sidebar/i });
    const sidebar = page.locator('aside.sidebar');
    const characterArea = page.locator('.character-area');
    const chatPanel = page.locator('.chat-panel');

    // Hamburger button is visible on mobile
    await expect(hamburgerBtn).toBeVisible();

    // Character area and chat panel remain visible
    await expect(characterArea).toBeVisible();
    await expect(chatPanel).toBeVisible();

    // Verify no horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Click hamburger to open drawer
    await hamburgerBtn.click();
    await expect(sidebar).toBeVisible();
    await expect(page.getByRole('button', { name: /new chat/i })).toBeVisible();

    // Close the drawer
    const closeBtn = page.getByRole('button', { name: /close sidebar/i });
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      // Click backdrop if backdrop overlay exists
      await page.locator('.sidebar-backdrop').click();
    }
  });

  test('Responsive layout across breakpoints (640-1023px tablet, 1024-1279px laptop, >= 1280px desktop)', async ({
    page,
  }) => {
    // Tablet (768x1024)
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('aside.sidebar')).toBeVisible();
    await expect(page.locator('.character-area')).toBeVisible();
    await expect(page.locator('.chat-panel')).toBeVisible();

    // Small laptop (1100x800)
    await page.setViewportSize({ width: 1100, height: 800 });
    await expect(page.locator('aside.sidebar')).toBeVisible();
    await expect(page.locator('.character-area')).toBeVisible();
    await expect(page.locator('.chat-panel')).toBeVisible();

    // Desktop (1440x900)
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('aside.sidebar')).toBeVisible();
    await expect(page.locator('.character-area')).toBeVisible();
    await expect(page.locator('.chat-panel')).toBeVisible();

    // In all larger viewports, hamburger button should not be visible
    await expect(page.getByRole('button', { name: /menu|open sidebar/i })).not.toBeVisible();
  });
});
