// Checks the depth hero (hero-depth.js) against a local server on :3000.
//   python3 -m http.server 3000 & node scripts/verify-hero-depth.js
// Exits non-zero on the first failed check. Screenshots go to $OUT or ./.
const { chromium } = require('playwright');
const path = require('path');

const URL = 'http://localhost:3000/';
const OUT = process.env.OUT || '.';
const THREE_RE = /three@[\d.]+\/build\/three/;
let failed = 0;

function check(ok, msg) {
  console.log((ok ? 'PASS ' : 'FAIL ') + msg);
  if (!ok) failed++;
}

async function open(browser, opts) {
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  const errors = [];
  const threeRequests = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => { if (THREE_RE.test(r.url())) threeRequests.push(r.url()); });
  await page.goto(URL, { waitUntil: 'load' });
  return { context, page, errors, threeRequests };
}

const ready = (page) => page.waitForSelector('#home canvas.hero-depth.is-ready', { timeout: 15000 })
  .then(() => true, () => false);

// Mean absolute difference between two PNG buffers of the hero, 0..255.
async function meanDiff(page, a, b) {
  return page.evaluate(async ([a, b]) => {
    const img = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
    const [ia, ib] = await Promise.all([img(a), img(b)]);
    const c = document.createElement('canvas');
    c.width = ia.width; c.height = ia.height;
    const x = c.getContext('2d');
    x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
    x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
    let s = 0;
    for (let i = 0; i < da.length; i += 4) s += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
    return s / (da.length / 4) / 3;
  }, ['data:image/png;base64,' + a.toString('base64'), 'data:image/png;base64,' + b.toString('base64')]);
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  // Desktop: canvas mounts, frames like the <img>, responds to the pointer.
  {
    const { context, page, errors, threeRequests } = await open(browser, { viewport: { width: 1440, height: 900 } });
    check(await ready(page), 'desktop: canvas mounted and drew its first frame');
    check(threeRequests.length > 0, 'desktop: three.js requested');
    const clip = { x: 0, y: 0, width: 1440, height: 900 };

    await page.mouse.move(720, 450);
    await page.waitForTimeout(2500);
    const centre = await page.screenshot({ clip });
    await page.screenshot({ path: path.join(OUT, 'depth-desktop-rest.png'), clip });

    await page.evaluate(() => { document.querySelector('.hero-depth').style.visibility = 'hidden'; });
    const still = await page.screenshot({ clip });
    await page.evaluate(() => { document.querySelector('.hero-depth').style.visibility = ''; });
    const framing = await meanDiff(page, centre, still);
    check(framing < 12, `desktop: canvas frames like the still plate (mean diff ${framing.toFixed(2)} < 12)`);

    await page.mouse.move(60, 60);
    await page.waitForTimeout(2500);
    const moved = await page.screenshot({ clip });
    await page.screenshot({ path: path.join(OUT, 'depth-desktop-pointer.png'), clip });
    const parallax = await meanDiff(page, centre, moved);
    check(parallax > 1, `desktop: pointer shifts the layers (mean diff ${parallax.toFixed(2)} > 1)`);

    // The host may swap #home wholesale; the canvas must follow it.
    await page.evaluate(() => {
      const home = document.getElementById('home');
      const fresh = home.cloneNode(true);
      fresh.querySelectorAll('.hero-depth').forEach((c) => c.remove());
      home.replaceWith(fresh);
    });
    await page.waitForTimeout(500);
    check(await page.$('#home .hero-media > canvas.hero-depth.is-ready') !== null, 'desktop: canvas remounts after #home is swapped');

    check(errors.length === 0, 'desktop: no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await context.close();
  }

  // Phone: nothing loads, the letterboxed still shows.
  {
    const { context, page, errors, threeRequests } = await open(browser, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    await page.waitForTimeout(3000);
    check(threeRequests.length === 0, 'phone: three.js never requested');
    check(await page.$('canvas.hero-depth') === null, 'phone: no canvas');
    await page.screenshot({ path: path.join(OUT, 'depth-phone.png') });
    check(errors.length === 0, 'phone: no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await context.close();
  }

  // Reduced motion on desktop: nothing loads.
  {
    const { context, page, threeRequests } = await open(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await page.waitForTimeout(3000);
    check(threeRequests.length === 0, 'reduced motion: three.js never requested');
    check(await page.$('canvas.hero-depth') === null, 'reduced motion: no canvas');
    await context.close();
  }

  await browser.close();
  console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
  process.exit(failed ? 1 : 0);
})();
