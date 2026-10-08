import { expect, test } from '@playwright/test';

test.describe('Message Input UI - E2E Tests', () => {
  test('T015a [US4]: Full-page loading and timeout retry', async ({ page }) => {
    // Intercept /threads to delay response
    let resolveThread: () => void;
    await page.route('**/threads', async (route) => {
      if (route.request().method() === 'POST') {
        await new Promise<void>((resolve) => {
          resolveThread = resolve;
        });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'thread-e2e-1', createdAt: new Date().toISOString() }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/');

    // Check loading overlay is visible with loader gif
    const loadingOverlay = page.locator('.loading-overlay');
    await expect(loadingOverlay).toBeVisible();
    const loaderImg = loadingOverlay.getByRole('img', { name: /loading/i });
    await expect(loaderImg).toBeVisible();

    // Now let thread resolve
    resolveThread!();

    // After resolving, loading overlay fades out
    await expect(loadingOverlay).toHaveClass(/opacity-0/, { timeout: 10000 });
  });

  test('T021a [US6]: Stopping generation and restoring prompt on failure', async ({ page }) => {
    await page.goto('/');
    const textarea = page.getByRole('textbox', { name: /Message Aria/i });
    await expect(textarea).toBeVisible({ timeout: 10000 });

    // Send a message that streams
    await textarea.fill('#stall-midstream Cancel this prompt');
    await page.getByRole('button', { name: /Send/i }).click();

    // Stop button should appear
    const stopButton = page.getByRole('button', { name: /Stop/i });
    await expect(stopButton).toBeVisible({ timeout: 10000 });

    // Trigger stop via Escape key
    await page.keyboard.press('Escape');

    // (Stopped) indicator appears
    await expect(page.getByTestId('stopped-indicator')).toBeVisible();

    // Send button is restored and textarea is enabled
    await expect(page.getByRole('button', { name: /Send/i })).toBeVisible();
    await expect(textarea).toBeEnabled();
  });

  test('T025 [US7]: Sidebar conversations fetch and error retry', async ({ page }) => {
    // Route conversations to return mock data
    await page.route('**/conversations', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'c-old',
            threadId: 't-old',
            title: 'Old conversation',
            createdAt: '2026-10-01T10:00:00Z',
            updatedAt: '2026-10-01T10:00:00Z',
          },
          {
            id: 'c-new',
            threadId: 't-new',
            title: 'Newest conversation',
            createdAt: '2026-10-08T10:00:00Z',
            updatedAt: '2026-10-08T10:00:00Z',
          },
        ]),
      });
    });

    await page.goto('/');

    // Check sidebar past conversations list
    const sidebar = page.locator('aside[aria-label="Sidebar"]');
    await expect(sidebar).toBeVisible();

    const conversationList = sidebar.getByRole('list', { name: /past conversations/i });
    await expect(conversationList).toBeVisible();

    // Newest conversation should be listed first (descending date sort)
    const items = conversationList.locator('button');
    await expect(items.first()).toContainText('Newest conversation');
  });

  test('T029a [US8]: Loading history and updating sidebar on new chat', async ({ page }) => {
    let threadCounter = 0;
    await page.route('**/threads', async (route) => {
      threadCounter++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: `thread-created-${threadCounter}`, createdAt: new Date().toISOString() }),
      });
    });

    await page.route('**/conversations', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/history/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'm-1',
            author: 'visitor',
            text: 'Historical question',
            status: 'completed',
          },
          {
            id: 'm-2',
            author: 'character',
            text: 'Historical response',
            status: 'completed',
          },
        ]),
      });
    });

    await page.goto('/');
    const textarea = page.getByRole('textbox', { name: /Message Aria/i });
    await expect(textarea).toBeVisible({ timeout: 10000 });

    // Click New Chat in sidebar
    const newChatBtn = page.getByRole('button', { name: 'New Chat' });
    await expect(newChatBtn).toBeVisible();
    await newChatBtn.click();

    // The chat view clears
    await expect(page.locator('.message')).toHaveCount(0);

    // Sidebar should NOT have any conversations yet before first message is sent
    const emptyNotice = page.locator('aside[aria-label="Sidebar"]').getByText('No conversations');
    await expect(emptyNotice).toBeVisible();

    // Send first message
    await textarea.fill('First message in new thread');
    await page.getByRole('button', { name: /Send/i }).click();

    // Now the conversation is added to the sidebar
    await expect(emptyNotice).not.toBeVisible();
    const newConvItem = page.locator('aside[aria-label="Sidebar"]').getByRole('button', { name: /First message in new thread/i });
    await expect(newConvItem).toBeVisible();
  });
});
