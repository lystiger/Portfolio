const { chromium } = require('playwright');

(async () => {
  console.log('--- STARTING PLAYWRIGHT E2E TEST ---');
  const browser = await chromium.launch();
  
  // 1. Desktop Context (1440x900)
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Checkpoint 1: Rest Frame
  await page.screenshot({ path: 'e2e-01-rest.png' });
  console.log('✓ Checkpoint 1: Rest frame captured (e2e-01-rest.png)');

  // Checkpoint 2: Pointer Parallax
  console.log('Testing pointer parallax...');
  await page.mouse.move(200, 250);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'e2e-02-pointer-left.png' });
  await page.mouse.move(1250, 650);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'e2e-02-pointer-right.png' });
  console.log('✓ Checkpoint 2: Pointer parallax captured (left/right)');

  // Checkpoint 3: Scroll Choreography
  console.log('Testing scroll choreography...');
  const totalScroll = 900;
  for (const p of [0.25, 0.50, 0.75, 1.0]) {
    await page.evaluate(y => window.scrollTo(0, y), totalScroll * p);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `e2e-03-scroll-${Math.round(p * 100)}.png` });
    console.log(`✓ Scroll ${Math.round(p * 100)}% captured`);
  }

  // Checkpoint 4: Benchmark FPS
  const fpsData = await page.evaluate(async () => {
    return new Promise(resolve => {
      let frames = 0;
      let start = performance.now();
      function step() {
        frames++;
        if (performance.now() - start < 1000) {
          requestAnimationFrame(step);
        } else {
          resolve({
            fps: Math.round(frames / ((performance.now() - start) / 1000)),
            duration: performance.now() - start
          });
        }
      }
      requestAnimationFrame(step);
    });
  });
  console.log('✓ Performance Benchmark FPS:', fpsData.fps);

  // Checkpoint 5: Reduced motion
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'e2e-04-reduced-motion.png' });
  console.log('✓ Checkpoint 5: Reduced motion captured (e2e-04-reduced-motion.png)');

  await context.close();

  // Checkpoint 6: Mobile Viewport (390x844)
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await mobilePage.waitForTimeout(2000);
  await mobilePage.screenshot({ path: 'e2e-05-mobile.png' });
  console.log('✓ Checkpoint 6: Mobile viewport captured (e2e-05-mobile.png)');
  await mobileContext.close();

  await browser.close();
  console.log('--- PLAYWRIGHT E2E TEST COMPLETED SUCCESSFULLY ---');
})();
