import { expect, test, type Page } from '@playwright/test';

/**
 * T068 - keyboard reachability, labelling, contrast, and no sideways scrolling.
 *
 * The screen-reader half of SC-014 is a recorded manual pass (T069): no automated check can tell you
 * whether a reply was heard as one coherent utterance. What is automatable is asserted here.
 */

test.beforeEach(async ({ request, page }) => {
  await request.post('http://127.0.0.1:4319/control/reset');
  await page.goto('/');
  // Wait for initial thread connection to complete (FR-043, FR-045)
  await expect(page.locator('.connecting-indicator')).toHaveCount(0, { timeout: 10_000 });
});

test.describe('keyboard only (FR-003, SC-014)', () => {
  test('a full turn can be completed without a mouse', async ({ page }) => {
    // Tab to the textbox, type, and send with Enter. No click anywhere in this test.
    await page.keyboard.press('Tab');

    let guard = 0;
    while (guard < 10) {
      const focused = await page.evaluate(() => document.activeElement?.tagName ?? '');
      if (focused === 'TEXTAREA') break;
      await page.keyboard.press('Tab');
      guard += 1;
    }

    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('TEXTAREA');

    await page.keyboard.type('hello from the keyboard');
    await page.keyboard.press('Enter');

    await expect(page.locator('.message.visitor')).toHaveText([/hello from the keyboard/]);
    await expect(page.locator('.message.character').first()).toHaveText(/Hello there\./);
  });

  test('the send control is reachable by Tab once there is something to send', async ({ page }) => {
    // A draft first: the control is disabled while the box is empty, and a disabled button is
    // correctly skipped by Tab. Focusing it with nothing to send would be the bug, not this.
    await page.getByRole('textbox').fill('something to send');
    await page.getByRole('textbox').focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BUTTON');
  });

  test('every interactive control has an accessible name', async ({ page }) => {
    const unnamed = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('button, textarea, input, a[href]')];
      return nodes
        .filter((node) => {
          const aria = node.getAttribute('aria-label');
          const labelled = node.getAttribute('aria-labelledby');
          const id = node.getAttribute('id');
          const hasLabelFor = id ? !!document.querySelector(`label[for="${id}"]`) : false;
          const text = (node.textContent ?? '').trim();
          return !aria && !labelled && !hasLabelFor && text === '';
        })
        .map((node) => node.outerHTML.slice(0, 80));
    });

    expect(unnamed, `unlabelled controls: ${unnamed.join(' | ')}`).toEqual([]);
  });

  test('focus is visible when a control is focused by keyboard', async ({ page }) => {
    await page.getByRole('textbox').focus();
    const outline = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return null;
      const style = getComputedStyle(active);
      return { width: style.outlineWidth, style: style.outlineStyle };
    });
    expect(outline?.style).not.toBe('none');
  });
});

test.describe('the character area is described in words (FR-038)', () => {
  test('names the character and its state before any conversation', async ({ page }) => {
    await expect(page.getByRole('img', { name: /Aria/i })).toBeVisible();
  });

  test('the description follows the emotion across the seam', async ({ page }) => {
    await page.getByRole('textbox').fill('#emotion-happy good news');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('img', { name: /Aria.*happy/i })).toBeVisible();
  });
});

test.describe('contrast meets WCAG AA (constitution III)', () => {
  // Ratios are computed from the rendered colours rather than trusted from lib/ui/tokens.ts, so a
  // stylesheet that drifts from the tokens is caught rather than assumed correct.
  const targets: Array<[string, string, number]> = [
    ['body text', 'body', 4.5],
    ['secondary text', '.composer-meta span', 4.5],
    ['send control', '.composer button', 4.5],
  ];

  for (const [label, selector, minimum] of targets) {
    test(`${label} is at least ${minimum}:1`, async ({ page }) => {
      const ratio = await contrastOf(page, selector);
      expect(ratio, `${label} measured ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(minimum);
    });
  }

  test('the failure message is readable, not just red', async ({ page }) => {
    await page.getByRole('textbox').fill('#provider-500 hi');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.locator('.status-line.error')).toBeVisible();
    await expect(page.locator('.status-line.error')).toHaveCSS('color', 'rgb(255, 154, 138)');

    const ratio = await contrastOf(page, '.status-line.error');
    expect(ratio, `failure text measured ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe('layout (FR-003)', () => {
  for (const width of [1280, 900, 640, 380]) {
    test(`no sideways page scrolling at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.getByRole('textbox').fill('a message long enough to wrap on a narrow screen');

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `overflowed by ${overflow}px`).toBeLessThanOrEqual(1);
    });
  }

  test('both panes stay usable when stacked', async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 800 });
    await expect(page.getByRole('img', { name: /Aria/i })).toBeVisible();
    await expect(page.getByRole('textbox')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  });
});

/** Contrast ratio of an element's own colour against the nearest painted background behind it. */
async function contrastOf(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const parse = (value: string): [number, number, number] => {
      const parts = value.match(/[\d.]+/g) ?? ['0', '0', '0'];
      return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
    };

    const luminance = ([r, g, b]: [number, number, number]): number => {
      const channel = (c: number): number => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };

    const element = document.querySelector(sel);
    if (!element) throw new Error(`no element for ${sel}`);

    const foreground = parse(getComputedStyle(element).color);

    // Walk up until something actually paints a background.
    let node: Element | null = element;
    let background: [number, number, number] = [0, 0, 0];
    while (node) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && !bg.includes('rgba(0, 0, 0, 0)') && bg !== 'transparent') {
        background = parse(bg);
        break;
      }
      node = node.parentElement;
    }

    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    return (lighter + 0.05) / (darker + 0.05);
  }, selector);
}
