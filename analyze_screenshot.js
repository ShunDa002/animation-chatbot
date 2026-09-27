const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  let connected = false;
  for (let i = 0; i < 20; i++) {
    try {
      await page.goto('http://localhost:3000', { timeout: 3000 });
      connected = true;
      break;
    } catch(e) {
      await page.waitForTimeout(1000);
    }
  }
  if (!connected) throw new Error('server not ready');
  
  // Wait for character to be ready
  await page.waitForFunction(
    () => typeof window.__characterHandle !== 'undefined' && window.__characterHandle.ready,
    null,
    { timeout: 10000 }
  );
  await page.waitForTimeout(2000); // Wait for textures to load
  
  // Hide chat panel
  await page.evaluate(() => {
    const chatPanel = document.querySelector('.chat-panel');
    if (chatPanel) chatPanel.style.display = 'none';
  });
  
  const bottomMargin = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    
    const imgData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imgData.data;
    
    let lowestY = 0;
    for (let y = tempCanvas.height - 1; y >= 0; y--) {
      let foundPixel = false;
      for (let x = 0; x < tempCanvas.width; x++) {
        const i = (y * tempCanvas.width + x) * 4;
        const a = data[i+3];
        if (a > 10) {
          foundPixel = true;
          break;
        }
      }
      if (foundPixel) {
        lowestY = y;
        break;
      }
    }
    
    return tempCanvas.height - 1 - lowestY;
  });
  
  console.log(`Bottom Margin is: ${bottomMargin} pixels`);
  await browser.close();
})();
