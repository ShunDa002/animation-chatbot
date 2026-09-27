import { chromium } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

function checkUrl(url: string, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve((res.statusCode ?? 500) < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForUrl(url: string, maxWaitMs = 60000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await checkUrl(url)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  const rootDir = process.cwd();
  const outputPath = path.resolve(rootDir, 'public', 'live2d', 'still.png');
  const targetUrl = process.env.APP_URL || 'http://localhost:3000';
  const spawnedProcesses: ChildProcess[] = [];

  const cleanup = () => {
    for (const proc of spawnedProcesses) {
      try {
        proc.kill('SIGTERM');
      } catch {}
    }
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(1);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(1);
  });

  try {
    const isAppUp = await checkUrl(targetUrl);
    if (!isAppUp) {
      console.log('Target app not running. Starting mock backend and dev server...');

      // Start mock backend on 4319 if not up
      const backendUrl = 'http://127.0.0.1:4319/control/health';
      if (!(await checkUrl(backendUrl))) {
        console.log('Starting mock backend...');
        const backendProc = spawn(
          './node_modules/.bin/jiti',
          ['tests/fixtures/mock-backend.ts', '4319'],
          { cwd: rootDir, stdio: 'inherit' }
        );
        spawnedProcesses.push(backendProc);
        await waitForUrl(backendUrl, 15000);
      }

      // Start Next.js dev server on 3000
      console.log('Starting Next.js dev server on port 3000...');
      const devProc = spawn('npm', ['run', 'dev'], {
        cwd: rootDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          NEXT_PUBLIC_BACKEND_URL: 'http://127.0.0.1:4319',
        },
      });
      spawnedProcesses.push(devProc);

      console.log('Waiting for Next.js dev server at http://localhost:3000 ...');
      const ready = await waitForUrl('http://localhost:3000', 60000);
      if (!ready) {
        throw new Error('Next.js dev server failed to start within timeout');
      }
    }

    console.log(`Launching Playwright Chromium...`);
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-webgl',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });

    try {
      const context = await browser.newContext({
        viewport: { width: 1200, height: 900 },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();

      console.log(`Navigating to ${targetUrl}...`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

      console.log('Waiting for Live2D character handle to initialize...');
      await page.waitForFunction(
        () => {
          const handle = (window as any).__characterHandle;
          return Boolean(handle && handle.ready);
        },
        null,
        { timeout: 30000 }
      );

      console.log('Character ready. Waiting 2s for initial animation and physics to settle...');
      await page.waitForTimeout(2000);

      // Hide all UI overlays (chat panel, sidebar, top buttons) so the canvas is isolated
      await page.evaluate(() => {
        const selectors = [
          'section.chat-panel',
          '.chat-panel',
          'aside',
          'button[aria-label="Open sidebar"]',
          '.sm\\:hidden',
        ];
        for (const sel of selectors) {
          document.querySelectorAll(sel).forEach((el) => {
            (el as HTMLElement).style.display = 'none';
          });
        }
      });

      console.log('Extracting clean character canvas image...');
      const dataUrl = await page.evaluate(() => {
        const c = document.querySelector('canvas') as HTMLCanvasElement;
        return c ? c.toDataURL('image/png') : null;
      });

      let buffer: Buffer;
      if (dataUrl && dataUrl.startsWith('data:image/png;base64,')) {
        buffer = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
      } else {
        const canvas = page.locator('canvas').first();
        await canvas.waitFor({ state: 'visible', timeout: 10000 });
        buffer = await canvas.screenshot({
          type: 'png',
          omitBackground: true,
        });
      }

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, buffer);
      console.log(`Successfully generated still image: ${outputPath} (${buffer.length} bytes)`);
    } finally {
      await browser.close();
    }
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
