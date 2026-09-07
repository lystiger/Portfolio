const { chromium } = require('playwright');

async function runBenchmark(label, options = {}) {
  console.log(`\n========================================`);
  console.log(`RUNNING BENCHMARK: ${label}`);
  console.log(`========================================`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');

  // Inject WebGL, rAF, and optional 120 Hz monitor simulation
  await page.addInitScript((simulate120Hz) => {
    window.__metrics = {
      webglRenders: 0,
      rafCount: 0,
      contrailUpdates: 0,
      matrixUpdates: 0
    };

    if (simulate120Hz) {
      // Simulate 120 Hz display by scheduling rAF callbacks at 120 Hz (every 8.33ms)
      const callbacks = new Map();
      let nextId = 1;
      let lastTs = performance.now();

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
        window.__metrics.rafCount++;
        return id;
      };
      window.cancelAnimationFrame = function(id) {
        callbacks.delete(id);
      };
    } else {
      const origRaf = window.requestAnimationFrame;
      window.requestAnimationFrame = function(cb) {
        return origRaf.call(window, (ts) => {
          window.__metrics.rafCount++;
          cb(ts);
        });
      };
    }

    // Monitor WebGL clear/draw calls
    const countDraw = () => { window.__metrics.webglRenders++; };
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

  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500); // Wait for textures

  async function sampleScenario(scenarioName, actionFn, durationMs = 3000) {
    await page.evaluate(() => {
      window.__metrics.webglRenders = 0;
      window.__metrics.rafCount = 0;
    });

    const perfStart = await cdp.send('Performance.getMetrics');
    const getMetric = (metrics, name) => {
      const item = metrics.metrics.find(m => m.name === name);
      return item ? item.value : 0;
    };
    const taskStart = getMetric(perfStart, 'TaskDuration');
    const jsStart = getMetric(perfStart, 'ScriptDuration');
    const startTime = Date.now();

    let stopAction = false;
    let actionPromise = null;
    if (actionFn) {
      actionPromise = (async () => {
        while (!stopAction) {
          await actionFn();
          await page.waitForTimeout(16);
        }
      })();
    }

    await page.waitForTimeout(durationMs);
    stopAction = true;
    if (actionPromise) await actionPromise;

    const actualDuration = (Date.now() - startTime) / 1000;
    const perfEnd = await cdp.send('Performance.getMetrics');
    const taskEnd = getMetric(perfEnd, 'TaskDuration');
    const jsEnd = getMetric(perfEnd, 'ScriptDuration');

    const counts = await page.evaluate(() => ({
      webglRenders: window.__metrics.webglRenders,
      rafCount: window.__metrics.rafCount
    }));

    const webglFps = counts.webglRenders / actualDuration;
    const rafFps = counts.rafCount / actualDuration;
    const cpuTaskPct = ((taskEnd - taskStart) / actualDuration) * 100;
    const jsPct = ((jsEnd - jsStart) / actualDuration) * 100;

    console.log(`[${scenarioName}] Duration: ${actualDuration.toFixed(1)}s | WebGL FPS: ${webglFps.toFixed(1)} | rAF: ${rafFps.toFixed(1)}/s | CPU Task: ${cpuTaskPct.toFixed(1)}% | Script: ${jsPct.toFixed(1)}%`);
    return { scenario: scenarioName, webglFps, rafFps, cpuTaskPct, jsPct };
  }

  // 1. Hero Idle
  const idle = await sampleScenario('Hero Idle', null);

  // 2. Pointer Moving
  let px = 100, py = 100, dir = 1;
  const pointer = await sampleScenario('Pointer Moving', async () => {
    px += 15 * dir;
    py += 10 * dir;
    if (px > 1200 || px < 100) dir *= -1;
    await page.mouse.move(px, py);
  });

  // 3. Scrolling
  let scrollY = 0, scrollDir = 1;
  const scroll = await sampleScenario('Scrolling', async () => {
    scrollY += 10 * scrollDir;
    if (scrollY > 600 || scrollY <= 0) scrollDir *= -1;
    await page.evaluate(y => window.scrollTo(0, y), scrollY);
  });

  // 4. Hero Offscreen
  await page.evaluate(() => window.scrollTo(0, 3000));
  await page.waitForTimeout(500);
  const offscreen = await sampleScenario('Hero Offscreen', null);

  // Scroll back
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // 5. Tab Hidden
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hidden = await sampleScenario('Tab Hidden', null);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await browser.close();
  return { idle, pointer, scroll, offscreen, hidden };
}

(async () => {
  console.log('--- BASELINE BENCHMARKS ---');
  await runBenchmark('Baseline (Standard Display)');
  await runBenchmark('Baseline (120 Hz Simulated Display)', { simulate120Hz: true });
})();
