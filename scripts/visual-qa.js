const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OUTPUT_DIR = path.join(__dirname, '..', 'qa-results');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080, isMobile: false },
  { name: '1440x900', width: 1440, height: 900, isMobile: false },
  { name: '1366x768', width: 1366, height: 768, isMobile: false },
  { name: '390x844', width: 390, height: 844, isMobile: true }
];

async function runVisualQA() {
  console.log('=== STARTING FOCUSED VISUAL QA & PERFORMANCE PROFILE ===');
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    console.log(`\n--- Evaluating Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);

    // 1. Static Baseline Frame (WebGL script blocked)
    const staticContext = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile
    });
    const staticPage = await staticContext.newPage();
    await staticPage.route('**/hero-canvas.js', route => route.abort());
    await staticPage.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
    await staticPage.waitForTimeout(1000);
    const staticPath = path.join(OUTPUT_DIR, `${vp.name}-static.png`);
    await staticPage.screenshot({ path: staticPath });
    console.log(`✓ Static baseline saved: ${staticPath}`);
    await staticContext.close();

    // 2. WebGL 2.5D Rest Frame (scroll = 0, pointer at center)
    const webglContext = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile
    });
    const webglPage = await webglContext.newPage();
    await webglPage.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });

    // Wait for body.has-webgl class to confirm WebGL is mounted
    await webglPage.waitForFunction(() => document.body.classList.contains('has-webgl'), null, { timeout: 8000 });
    // Additional wait for Three.js textures to decode & upload
    await webglPage.waitForTimeout(1500);

    // Place cursor at center so parallax target is (0, 0)
    if (!vp.isMobile) {
      await webglPage.mouse.move(vp.width / 2, vp.height / 2);
      await webglPage.waitForTimeout(400);
    }

    const webglPath = path.join(OUTPUT_DIR, `${vp.name}-webgl-rest.png`);
    await webglPage.screenshot({ path: webglPath });
    console.log(`✓ WebGL rest frame saved: ${webglPath}`);

    // 3. Pointer Parallax checks (for desktops)
    if (!vp.isMobile) {
      // Move to left
      await webglPage.mouse.move(vp.width * 0.15, vp.height * 0.25);
      await webglPage.waitForTimeout(600);
      const leftPath = path.join(OUTPUT_DIR, `${vp.name}-parallax-left.png`);
      await webglPage.screenshot({ path: leftPath });

      // Move to right
      await webglPage.mouse.move(vp.width * 0.85, vp.height * 0.75);
      await webglPage.waitForTimeout(600);
      const rightPath = path.join(OUTPUT_DIR, `${vp.name}-parallax-right.png`);
      await webglPage.screenshot({ path: rightPath });
      console.log(`✓ Parallax extremes saved (left/right)`);
    }

    await webglContext.close();
  }

  // 4. Scroll Choreography & Pacing (1440x900)
  console.log('\n--- Evaluating Scroll Choreography & Section Transition ---');
  const scrollContext = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const scrollPage = await scrollContext.newPage();
  await scrollPage.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await scrollPage.waitForFunction(() => document.body.classList.contains('has-webgl'), null, { timeout: 8000 });
  await scrollPage.waitForTimeout(1000);

  const scrollPoints = [0.0, 0.25, 0.50, 0.65, 0.80, 1.0, 1.25];
  for (const sp of scrollPoints) {
    await scrollPage.evaluate(y => window.scrollTo(0, y), 900 * sp);
    await scrollPage.waitForTimeout(600);
    const spPath = path.join(OUTPUT_DIR, `scroll-${Math.round(sp * 100)}.png`);
    await scrollPage.screenshot({ path: spPath });
    console.log(`✓ Scroll ${(sp * 100).toFixed(0)}% captured`);
  }
  await scrollContext.close();

  // 5. Reduced Motion Verification
  console.log('\n--- Evaluating prefers-reduced-motion ---');
  const rmContext = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const rmPage = await rmContext.newPage();
  await rmPage.emulateMedia({ reducedMotion: 'reduce' });
  await rmPage.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await rmPage.waitForFunction(() => document.body.classList.contains('has-webgl'), null, { timeout: 8000 });
  await rmPage.waitForTimeout(1000);
  const rmPath = path.join(OUTPUT_DIR, `reduced-motion.png`);
  await rmPage.screenshot({ path: rmPath });
  console.log(`✓ Reduced motion screenshot saved`);
  await rmContext.close();

  // 6. ScrollTrigger Re-render & FPS Profiling
  console.log('\n--- Profiling Scroll State Updates & React Re-render Count ---');
  const perfContext = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const perfPage = await perfContext.newPage();
  await perfPage.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await perfPage.waitForFunction(() => document.body.classList.contains('has-webgl'), null, { timeout: 8000 });
  await perfPage.waitForTimeout(1000);

  const scrollPerf = await perfPage.evaluate(async () => {
    const initialAppRenders = window.__HERO_APP_RENDERS__ || 0;
    const initialWorldRenders = window.__HERO_WORLD_RENDERS__ || 0;

    return new Promise(resolve => {
      let frameCount = 0;
      let scrollEvents = 0;
      const startTime = performance.now();
      let lastTime = startTime;
      const frameDeltas = [];

      function onScroll() {
        scrollEvents++;
      }
      window.addEventListener('scroll', onScroll, { passive: true });

      const targetY = 900;
      const duration = 1500; // 1.5 seconds scroll scrub

      function frame(now) {
        frameCount++;
        frameDeltas.push(now - lastTime);
        lastTime = now;

        const elapsed = now - startTime;
        const p = Math.min(1, elapsed / duration);
        window.scrollTo(0, targetY * p);

        if (elapsed < duration) {
          requestAnimationFrame(frame);
        } else {
          window.removeEventListener('scroll', onScroll);
          const totalDuration = now - startTime;
          const finalAppRenders = window.__HERO_APP_RENDERS__ || 0;
          const finalWorldRenders = window.__HERO_WORLD_RENDERS__ || 0;

          const avgFps = Math.round((frameCount / totalDuration) * 1000);
          const longFrames = frameDeltas.filter(d => d > 33.33).length;
          resolve({
            avgFps,
            frameCount,
            scrollEvents,
            totalDuration: Math.round(totalDuration),
            longFrames,
            initialAppRenders,
            initialWorldRenders,
            finalAppRenders,
            finalWorldRenders,
            deltaAppRenders: finalAppRenders - initialAppRenders,
            deltaWorldRenders: finalWorldRenders - initialWorldRenders,
            maxDelta: Math.max(...frameDeltas).toFixed(2),
            minDelta: Math.min(...frameDeltas).toFixed(2)
          });
        }
      }
      requestAnimationFrame(frame);
    });
  });

  console.log('\n--- PERFORMANCE & RE-RENDER PROFILE RESULTS ---');
  console.log(JSON.stringify(scrollPerf, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'perf-results.json'), JSON.stringify(scrollPerf, null, 2));
  await perfContext.close();

  await browser.close();
  console.log('\n=== PLAYWRIGHT QA PASS COMPLETE. RUNNING PIXEL ANALYSIS... ===');

  // Run Python pixel analysis
  try {
    const pyOutput = execSync('python3 scripts/analyze-qa.py', { encoding: 'utf-8' });
    console.log(pyOutput);
  } catch (err) {
    console.error('Error running analyze-qa.py:', err.message);
  }
  console.log('=== VISUAL QA PASS COMPLETE ===');
}

runVisualQA().catch(err => {
  console.error(err);
  process.exit(1);
});
