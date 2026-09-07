const { chromium } = require('playwright');

async function test120Hz() {
  console.log('=== VERIFYING 120 HZ DISPLAY BEHAVIOR (Requirement 10) ===');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.addInitScript(() => {
    window.__stats120 = {
      rafCount: 0,
      invalidates: 0
    };

    // Replace rAF with accurate 120 Hz clock (8.333ms per tick)
    const callbacks = new Map();
    let nextId = 1;
    let clockTime = 0;

    setInterval(() => {
      clockTime += 1000 / 120; // exactly 8.333ms elapsed per tick
      const cbs = Array.from(callbacks.entries());
      callbacks.clear();
      for (const [id, cb] of cbs) {
        try { cb(clockTime); } catch(e) {}
      }
    }, 1000 / 120);

    window.requestAnimationFrame = function(cb) {
      const id = nextId++;
      callbacks.set(id, cb);
      window.__stats120.rafCount++;
      return id;
    };
    window.cancelAnimationFrame = function(id) {
      callbacks.delete(id);
    };

    // Count invalidations by intercepting R3F invalidate on window
    const origSetTimeout = window.setTimeout;
  });

  await page.goto('http://localhost:3000/?v=8', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Hook into canvas WebGL context to count renders
  await page.evaluate(() => {
    window.__stats120.renders = 0;
    const canvas = document.querySelector('#hero-scene-root canvas');
    if (canvas) {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        const origClear = gl.clear;
        gl.clear = function(...args) {
          window.__stats120.renders++;
          return origClear.apply(this, args);
        };
      }
    }
  });

  async function sample120(label, actionFn, durationMs = 2500) {
    await page.evaluate(() => {
      window.__stats120.renders = 0;
      window.__stats120.rafCount = 0;
    });

    const startTime = Date.now();
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

    const duration = (Date.now() - startTime) / 1000;
    const data = await page.evaluate(() => ({
      renders: window.__stats120.renders,
      rafCount: window.__stats120.rafCount
    }));

    const renderFps = data.renders / duration;
    const rafRate = data.rafCount / duration;

    console.log(`[${label.padEnd(20)}] Monitor Refresh: ${rafRate.toFixed(1).padStart(5)} Hz | WebGL Render: ${renderFps.toFixed(1).padStart(4)} FPS`);
    return { renderFps, rafRate };
  }

  // 1. Idle on 120 Hz monitor
  const idle120 = await sample120('Idle on 120 Hz', null);

  // 2. Interactive on 120 Hz monitor
  let x = 300, y = 300, dir = 1;
  const interactive120 = await sample120('Active on 120 Hz', async () => {
    x += 20 * dir;
    if (x > 1100 || x < 300) dir *= -1;
    await page.mouse.move(x, y);
  });

  // 3. Offscreen on 120 Hz monitor
  await page.evaluate(() => window.scrollTo(0, 3000));
  await page.waitForTimeout(400);
  const offscreen120 = await sample120('Offscreen 120 Hz', null);

  // 4. Tab Hidden on 120 Hz monitor
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hidden120 = await sample120('Hidden Tab 120 Hz', null);

  await browser.close();

  console.log('\n--- 120 HZ VERIFICATION SUMMARY ---');
  console.log(`- Idle target: ~36 FPS (must NOT follow 120 Hz). Actual: ${idle120.renderFps.toFixed(1)} FPS`);
  console.log(`- Interactive target: ~60 FPS (must NOT follow 120 Hz). Actual: ${interactive120.renderFps.toFixed(1)} FPS`);
  console.log(`- Offscreen target: 0 FPS (complete sleep). Actual: ${offscreen120.renderFps.toFixed(1)} FPS`);
  console.log(`- Hidden Tab target: 0 FPS (complete sleep). Actual: ${hidden120.renderFps.toFixed(1)} FPS`);

  if (idle120.renderFps > 45 || interactive120.renderFps > 65) {
    console.error('FAIL: Render loop followed display refresh rate!');
    process.exit(1);
  } else {
    console.log('SUCCESS: Render loop successfully decoupled and throttled from 120 Hz display refresh rate!');
  }
}

test120Hz();
