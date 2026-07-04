const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
  });

  const page = await context.newPage();
  
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // Step 1: Visit Google homepage first
  console.log('1. Visiting Google homepage...');
  await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'debug-step1-homepage.png', fullPage: true });
  console.log('  Screenshot: debug-step1-homepage.png');

  // Step 2: Handle consent
  try {
    const consent = await page.$('button:has-text("Accept all"), button:has-text("I agree"), #L2AGLb');
    if (consent) {
      console.log('2. Found consent button, clicking...');
      await consent.click();
      await page.waitForTimeout(2000);
    } else {
      console.log('2. No consent button found');
    }
  } catch (e) {
    console.log('2. No consent page');
  }

  // Step 3: Type search into the search box instead of navigating directly  
  console.log('3. Typing search query...');
  const searchBox = await page.$('textarea[name="q"], input[name="q"]');
  if (searchBox) {
    await searchBox.click();
    await page.waitForTimeout(500);
    await searchBox.type('site:instagram.com clothing brand in surat "@gmail.com"', { delay: 50 });
    await page.waitForTimeout(1000);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
  } else {
    console.log('  Search box not found, navigating directly...');
    await page.goto('https://www.google.com/search?q=' + encodeURIComponent('site:instagram.com clothing brand in surat "@gmail.com"'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
  }

  await page.screenshot({ path: 'debug-step2-results.png', fullPage: true });
  console.log('  Screenshot: debug-step2-results.png');

  // Step 4: Check what we got
  const bodyText = await page.innerText('body').catch(() => '');
  console.log('\n4. Page content analysis:');
  console.log('  URL:', page.url());
  console.log('  Has CAPTCHA:', bodyText.includes('unusual traffic') || bodyText.includes("aren't a robot"));
  console.log('  Has results (div.g):', (await page.$$('div.g')).length);
  console.log('  First 500 chars:', bodyText.substring(0, 500));

  await browser.close();
  console.log('\nDone!');
})();
