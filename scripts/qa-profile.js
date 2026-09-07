const { chromium } = require('playwright');

async function runProfile(label, options = {}) {
  console.log(`\n==================================================`);
  console.log(`PROFILING: ${label}`);
  console.log(`==================================================`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');

  // Track rendering metrics inside page context
  await page.addInitScript((simulate120Hz) => {
    window.__perf = {
      renders: 0,
      rafTicks: 0,
      matrixUpdates: 0,
      contrailUpdates: 0
    };

    if (simulate120Hz) {
      const callbacks = new Map();
      let nextId = 1;
      setInterval(() => {
        const now = performance.now();
        const cbs = Array.from(callbacks.entries());
        callbacks.clear();
        for (const [id, cb] of cbs) {
          try { cb(now); } catch(e) {}
        }
      }, 1000 / 120);

      window.requestAnimationFrame = function(cb) {
        const id = nextId++;
        callbacks.set(id, cb);
        window.__perf.rafTicks++;
        return id;
      };
      window.cancelAnimationFrame = function(id) {
        callbacks.delete(id);
      };
    } else {
      const origRaf = window.requestAnimationFrame;
      window.requestAnimationFrame = function(cb) {
        return origRaf.call(window, (ts) => {
          window.__perf.rafTicks++;
          cb(ts);
        });
      };
    }

    // Intercept WebGL clear / draw to count actual frames rendered by GPU
    const countDraw = () => { window.__perf.renders++; };
    const origClear = WebGLRenderingContext.prototype.clear;
    WebGLRenderingContext.prototype.clear = function(...args) {
      countDraw();
      return origClear.apply(this, args);
    };
    const origClear2 = WebGL2RenderingContext.prototype.clear;
    WebGL2RenderingContext.prototype.clear = function(...args) {
      countDraw();
      return origClear2.apply(this, args);
    };
  }, options.simulate120Hz || false);

  await page.goto('http://localhost:3000/?v=8', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  async function measure(name, actionFn, durationMs = 3000) {
    await page.evaluate(() => {
      window.__perf.renders = 0;
      window.__perf.rafTicks = 0;
    });

    const perfStart = await cdp.send('Performance.getMetrics');
    const getMetric = (metrics, metricName) => {
      const item = metrics.metrics.find(m => m.name === metricName);
      return item ? item.value : 0;
    };
    const taskStart = getMetric(perfStart, 'TaskDuration');
    const jsStart = getMetric(perfStart, 'ScriptDuration');
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

    const actualDuration = (performance.now() - startTime) / 1000;
    const perfEnd = await cdp.send('Performance.getMetrics');
    const taskEnd = getMetric(perfEnd, 'TaskDuration');
    const jsEnd = getMetric(perfEnd, 'ScriptDuration');

    const data = await page.evaluate(() => ({
      renders: window.__perf.renders,
      rafTicks: window.__perf.rafTicks
    }));

    const renderFps = data.renders / actualDuration;
    const rafFps = data.rafTicks / actualDuration;
    const cpuTaskPct = ((taskEnd - taskStart) / actualDuration) * 100;
    const jsPct = ((jsEnd - jsStart) / actualDuration) * 100;

    console.log(`[${name.padEnd(16)}] Renders: ${renderFps.toFixed(1).padStart(4)} FPS | rAF: ${rafFps.toFixed(1).padStart(5)}/s | CPU Task: ${cpuTaskPct.toFixed(1).padStart(5)}% | Script: ${jsPct.toFixed(1).padStart(4)}%`);
    return { name, renderFps, rafFps, cpuTaskPct, jsPct };
  }

  // 1. Hero Idle
  const idle = await measure('Hero Idle', null);

  // 2. Pointer Moving
  let mx = 100, my = 100, mDir = 1;
  const pointer = await measure('Pointer Moving', async () => {
    mx += 20 * mDir;
    my += 10 * mDir;
    if (mx > 1200 || mx < 100) mDir *= -1;
    await page.mouse.move(mx, my);
  });

  // 3. Scrolling
  let sy = 0, sDir = 1;
  const scroll = await measure('Scrolling', async () => {
    sy += 15 * sDir;
    if (sy > 600 || sy <= 0) sDir *= -1;
    await page.evaluate(y => window.scrollTo(0, y), sy);
  });

  // 4. Hero Offscreen (scrolled to story section)
  await page.evaluate(() => window.scrollTo(0, 3000));
  await page.waitForTimeout(600);
  const offscreen = await measure('Hero Offscreen', null);

  // Scroll back
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);

  // 5. Browser Tab Hidden
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(100);
  const hidden = await measure('Tab Hidden', null);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  // 6. Reduced Motion Idle
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://localhost:3000/?v=8', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const reducedMotionIdle = await measure('Reduced Motion', null);

  await browser.close();
  return { idle, pointer, scroll, offscreen, hidden, reducedMotionIdle };
}

(async () => {
  console.log('=== RUNNING POWER & PERFORMANCE QA SUITE ===');
  await runProfile('Standard Display (60 Hz Baseline)', { simulate120Hz: false });
  await runProfile('High Refresh Rate Display (120 Hz Simulation)', { simulate120Hz: true });
})();
