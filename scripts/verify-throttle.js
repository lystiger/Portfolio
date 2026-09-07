const { chromium } = require('playwright');

async function testThrottling() {
  console.log('=== VERIFYING RENDER-LOOP THROTTLING & CALL RATES ===');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Expose instrumentation
  await page.addInitScript(() => {
    window.__throttleStats = {
      r3fRenders: 0,
      contrailGeoUpdates: 0,
      cameraMatrixUpdates: 0,
    };

    // Instrument THREE.OrthographicCamera.prototype.updateProjectionMatrix
    const origProj = window.THREE ? window.THREE.OrthographicCamera.prototype.updateProjectionMatrix : null;
  });

  await page.goto('http://localhost:3000/?v=8', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // Hook into camera and R3F
  await page.evaluate(() => {
    const origProj = Object.getPrototypeOf(window).THREE?.OrthographicCamera?.prototype?.updateProjectionMatrix;
    // We can also instrument THREE via scene traversal if THREE isn't on window
    const rootEl = document.getElementById('hero-scene-root');
    const canvas = rootEl?.querySelector('canvas');
    if (canvas) {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        const origClear = gl.clear;
        gl.clear = function(...args) {
          window.__throttleStats.r3fRenders++;
          return origClear.apply(this, args);
        };
      }
    }
  });

  async function sampleRate(label, actionFn, durationMs = 2000) {
    await page.evaluate(() => {
      window.__throttleStats.r3fRenders = 0;
    });

    const startTime = performance.now();
    let stop = false;
    let actionPromise = null;
    if (actionFn) {
      actionPromise = (async () => {
        while (!stop) {
          await actionFn();
          await page.waitForTimeout(16);
        }
      })();
    }

    await page.waitForTimeout(durationMs);
    stop = true;
    if (actionPromise) await actionPromise;

    const duration = (performance.now() - startTime) / 1000;
    const renders = await page.evaluate(() => window.__throttleStats.r3fRenders);
    const rate = renders / duration;
    console.log(`[${label.padEnd(20)}] Actual Rate: ${rate.toFixed(1)} /s (in ${duration.toFixed(2)}s)`);
    return rate;
  }

  // 1. Idle rate
  const idleRate = await sampleRate('Hero Idle', null);

  // 2. Pointer move rate
  let x = 200, y = 200, dir = 1;
  const pointerRate = await sampleRate('Pointer Move', async () => {
    x += 15 * dir;
    if (x > 1000 || x < 200) dir *= -1;
    await page.mouse.move(x, y);
  });

  // 3. Offscreen rate
  await page.evaluate(() => window.scrollTo(0, 3000));
  await page.waitForTimeout(400);
  const offscreenRate = await sampleRate('Hero Offscreen', null);

  // 4. Tab Hidden rate
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenRate = await sampleRate('Tab Hidden', null);

  await browser.close();
  console.log('=== TEST COMPLETE ===');
}

testThrottling();
