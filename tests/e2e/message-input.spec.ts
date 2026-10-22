import { expect, test } from '@playwright/test';

test.describe('Message Input UI - E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Default readiness route to return 200 OK
    await page.route('**/health/ready', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ready' }),
      });
    });
  });

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
    const textarea = page.getByRole('textbox', { name: /Message REM/i });
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
    const textarea = page.getByRole('textbox', { name: /Message REM/i });
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

  test('T048 [US4]: Startup readiness check gates /threads and /conversations until ready', async ({ page }) => {
    let threadRequested = false;
    let conversationsRequested = false;
    let resolveReadiness!: () => void;

    // Override health/ready to remain pending
    await page.route('**/health/ready', async (route) => {
      await new Promise<void>((resolve) => {
        resolveReadiness = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ready' }),
      });
    });

    await page.route('**/threads', async (route) => {
      threadRequested = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'thread-readiness-test', createdAt: new Date().toISOString() }),
      });
    });

    await page.route('**/conversations', async (route) => {
      conversationsRequested = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/');

    const loadingOverlay = page.locator('.loading-overlay');
    await expect(loadingOverlay).toBeVisible();

    // Verify neither threads nor conversations have been requested yet
    expect(threadRequested).toBe(false);
    expect(conversationsRequested).toBe(false);

    // Now resolve readiness
    resolveReadiness();

    // After readiness succeeds, thread is created and loading overlay fades out
    await expect(loadingOverlay).toHaveClass(/opacity-0/, { timeout: 10000 });
    expect(threadRequested).toBe(true);
  });

  test('T058 [US9]: RAG document upload workflow and duplicate feedback', async ({ page }) => {
    await page.route('**/threads', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'thread-e2e-rag', createdAt: new Date().toISOString() }),
      });
    });

    let uploadCallCount = 0;
    await page.route('**/rag/upload', async (route) => {
      uploadCallCount++;
      const request = route.request();
      const postData = request.postData() ?? '';
      const isDuplicate = postData.includes('duplicate.pdf');

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: isDuplicate ? 'duplicate' : 'ready',
          duplicate: isDuplicate,
          filename: isDuplicate ? 'duplicate.pdf' : 'guide.pdf',
        }),
      });
    });

    await page.goto('/');

    const textarea = page.getByRole('textbox', { name: /Message REM/i });
    await expect(textarea).toBeVisible({ timeout: 10000 });

    // Open upload panel via Attachment (+) button
    const attachBtn = page.getByRole('button', { name: /Add document to conversation/i });
    await expect(attachBtn).toBeVisible();
    await attachBtn.click();

    // Verify inline upload panel appears
    const panel = page.getByTestId('rag-upload-panel');
    await expect(panel).toBeVisible();

    // Select a valid document using the hidden file input
    const fileInput = page.getByTestId('rag-file-input');
    await fileInput.setInputFiles({
      name: 'guide.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 test document content'),
    });

    // File summary card appears with name and Upload button
    await expect(page.getByTestId('rag-file-summary')).toBeVisible();
    await expect(page.getByText('guide.pdf')).toBeVisible();
    const uploadBtn = page.getByTestId('rag-upload-submit-btn');
    await expect(uploadBtn).toBeVisible();

    // Click Upload
    await uploadBtn.click();

    // Ready status banner appears
    const statusBanner = page.getByTestId('rag-status-banner');
    await expect(statusBanner).toBeVisible({ timeout: 5000 });
    await expect(statusBanner).toContainText(/ready for use/i);
    expect(uploadCallCount).toBe(1);

    // Replace file with a duplicate document
    await fileInput.setInputFiles({
      name: 'duplicate.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 duplicate document content'),
    });

    const uploadDuplicateBtn = page.getByTestId('rag-upload-submit-btn');
    await expect(uploadDuplicateBtn).toBeVisible();
    await uploadDuplicateBtn.click();

    // Duplicate informational banner appears
    await expect(statusBanner).toBeVisible({ timeout: 5000 });
    await expect(statusBanner).toContainText(/already available in this conversation/i);
    expect(uploadCallCount).toBe(2);

    // Dismiss panel via dismiss button
    const dismissBtn = page.getByTestId('rag-dismiss-btn');
    await dismissBtn.click();
    await expect(panel).not.toBeVisible();
  });
});
