const { chromium } = require('playwright');

async function testThrottling() {
  console.log('=== VERIFYING RENDER-LOOP THROTTLING & CALL RATES ===');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Instrument before any page script runs so the WebGL prototypes are patched
  // ahead of context creation. THREE is bundled and never exposed on window, so
  // everything measured here is observed through the WebGL API instead.
  await page.addInitScript(() => {
    window.__throttleStats = {
      r3fRenders: 0,
      bufferUploads: 0
    };

    for (const ctor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!ctor) continue;
      const proto = ctor.prototype;

      const origClear = proto.clear;
      proto.clear = function (...args) {
        window.__throttleStats.r3fRenders++;
        return origClear.apply(this, args);
      };

      // Dynamic geometry (the contrail ribbon re-uploads its position and color
      // attributes whenever it resamples) lands here.
      const origBufferSubData = proto.bufferSubData;
      proto.bufferSubData = function (...args) {
        window.__throttleStats.bufferUploads++;
        return origBufferSubData.apply(this, args);
      };
    }
  });

  await page.goto('http://localhost:3000/?v=8', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const instrumented = await page.evaluate(() => window.__throttleStats.r3fRenders > 0);
  if (!instrumented) {
    console.error('FAIL: no WebGL clear() calls observed; instrumentation did not attach.');
    await browser.close();
    process.exit(1);
  }

  async function sampleRate(label, actionFn, durationMs = 2000) {
    await page.evaluate(() => {
      window.__throttleStats.r3fRenders = 0;
      window.__throttleStats.bufferUploads = 0;
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
    const stats = await page.evaluate(() => ({ ...window.__throttleStats }));
    const renderRate = stats.r3fRenders / duration;
    const uploadRate = stats.bufferUploads / duration;
    console.log(
      `[${label.padEnd(20)}] Renders: ${renderRate.toFixed(1).padStart(5)} /s | ` +
      `Geometry uploads: ${uploadRate.toFixed(1).padStart(5)} /s (in ${duration.toFixed(2)}s)`
    );
    return { renderRate, uploadRate };
  }

  // 1. Idle rate
  const idle = await sampleRate('Hero Idle', null);

  // 2. Pointer move rate
  let x = 200, y = 200, dir = 1;
  const pointer = await sampleRate('Pointer Move', async () => {
    x += 15 * dir;
    if (x > 1000 || x < 200) dir *= -1;
    await page.mouse.move(x, y);
  });

  // 3. Offscreen rate
  await page.evaluate(() => window.scrollTo(0, 3000));
  await page.waitForTimeout(400);
  const offscreen = await sampleRate('Hero Offscreen', null);

  // 4. Tab Hidden rate
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hidden = await sampleRate('Tab Hidden', null);

  await browser.close();

  // NOTE ON BOUNDS: headless/software WebGL saturates the CPU well below the
  // 36/60 FPS targets, so a shortfall is a warning, not a failure. The caps,
  // liveness and sleep states must hold everywhere.
  const failures = [];
  const warnings = [];

  // Ambient target is 36 FPS; interactive is capped at 60 FPS.
  if (idle.renderRate > 45) failures.push(`idle ${idle.renderRate.toFixed(1)} /s exceeds the 45 FPS ceiling`);
  if (pointer.renderRate > 65) failures.push(`pointer-move ${pointer.renderRate.toFixed(1)} /s exceeds the 65 FPS ceiling`);
  // Liveness.
  if (idle.renderRate < 1) failures.push(`idle ${idle.renderRate.toFixed(1)} /s: the render loop is frozen while the hero is visible`);
  if (pointer.renderRate < 1) failures.push(`pointer-move ${pointer.renderRate.toFixed(1)} /s: the render loop is frozen while interacting`);
  // Sleep states must actually sleep.
  if (offscreen.renderRate > 2) failures.push(`offscreen ${offscreen.renderRate.toFixed(1)} /s should be ~0`);
  if (hidden.renderRate > 2) failures.push(`hidden tab ${hidden.renderRate.toFixed(1)} /s should be ~0`);
  // The contrail resamples at ~25 Hz and uploads two attributes per resample,
  // so uploads must stay within that budget and stop entirely when asleep.
  if (idle.uploadRate > 2 * 30) failures.push(`idle geometry uploads ${idle.uploadRate.toFixed(1)} /s exceed the ~25 Hz x 2 attribute budget`);
  if (offscreen.uploadRate > 2) failures.push(`offscreen geometry uploads ${offscreen.uploadRate.toFixed(1)} /s should be ~0`);

  if (idle.renderRate < 25) warnings.push(`idle ${idle.renderRate.toFixed(1)} /s is under the ~36 FPS target (GPU/CPU-bound environment, not a throttling defect)`);

  for (const w of warnings) console.warn(`WARN: ${w}`);

  if (failures.length) {
    console.error('FAIL:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log('=== TEST COMPLETE: all throttling bounds met ===');
}

testThrottling().catch((err) => {
  console.error('FAIL: harness error:', err);
  process.exit(1);
});
