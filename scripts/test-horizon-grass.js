const { chromium } = require('playwright');

async function testHorizonGrass() {
  console.log('=== TESTING HORIZON GRASS FOREGROUND ===');
  const browser = await chromium.launch();

  const viewports = [
    { name: '375-mobile', width: 375, height: 667 },
    { name: '768-tablet', width: 768, height: 1024 },
    { name: '1440-laptop', width: 1440, height: 900 },
    { name: '1920-desktop', width: 1920, height: 1080 },
    { name: '2560-qhd', width: 2560, height: 1440 }
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Scroll to #contact / #horizon
    const section = await page.$('#contact');
    if (section) {
      await section.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await section.screenshot({ path: `qa-horizon-${vp.name}.png` });
      console.log(`✓ Captured Horizon section at ${vp.width}x${vp.height} -> qa-horizon-${vp.name}.png`);
    } else {
      console.error(`Could not find #contact section for ${vp.name}`);
    }
    await page.close();
  }

  // Test motion progression (0s, 2s, 4s) on 1920x1080
  const animPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await animPage.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  const animSection = await animPage.$('#contact');
  await animSection.scrollIntoViewIfNeeded();

  for (const sec of [0, 2, 4]) {
    await animPage.waitForTimeout(sec === 0 ? 300 : 2000);
    await animSection.screenshot({ path: `qa-horizon-sway-${sec}s.png` });
    console.log(`✓ Captured sway motion frame at ${sec}s -> qa-horizon-sway-${sec}s.png`);
  }

  // Test reduced motion
  await animPage.emulateMedia({ reducedMotion: 'reduce' });
  await animPage.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  const redSection = await animPage.$('#contact');
  await redSection.scrollIntoViewIfNeeded();
  await animPage.waitForTimeout(500);
  await redSection.screenshot({ path: `qa-horizon-reduced-motion.png` });
  console.log('✓ Captured reduced motion state -> qa-horizon-reduced-motion.png');

  await animPage.close();
  await browser.close();
  console.log('=== TEST COMPLETED SUCCESSFULLY ===');
}

testHorizonGrass();
