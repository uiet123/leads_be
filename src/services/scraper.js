const { chromium } = require('playwright');
const { DEBUG, TARGET_RESULTS } = require('../config');

// Reusable locators
const locators = {
  searchBox: (page) => page.getByRole('combobox', { name: /search/i }).or(page.locator('#searchboxinput')),
  feed: (page) => page.locator('div[role="feed"]'),
  businessLinks: (page) => page.locator('a[href*="/maps/place/"]'),
  heading: (page) => page.locator('h1'),
  ratingAndReviews: (page) => page.locator('[role="img"][aria-label*="stars"]'),
  addressBtn: (page) => page.locator('button[data-item-id="address"]'),
  phoneBtn: (page) => page.locator('button[data-item-id^="phone:tel"]'),
  websiteBtn: (page) => page.locator('a[data-item-id="authority"]')
};

// Helper to safely extract and clean text
const extractText = async (elementLocator) => {
  try {
    const el = elementLocator.first();
    await el.waitFor({ state: 'attached', timeout: 3000 });
    const text = await el.innerText();
    
    const lines = text.split('\n').map(t => t.trim()).filter(t => t);
    if (lines.length === 0) return 'N/A';
    return lines.length > 1 ? lines.slice(1).join(', ') : lines[0];
  } catch (e) {
    return 'N/A';
  }
};

/**
 * Scrapes Google Maps for a given query
 * @param {string} query The search query
 * @returns {Array} Array of business objects
 */
async function scrapeGoogleMaps(query) {
  let browser;
  try {
    browser = await chromium.launch({ headless: !DEBUG });
    const page = await browser.newPage();
    
    await page.goto('https://maps.google.com', { waitUntil: 'domcontentloaded' });
    
    const searchBox = locators.searchBox(page);
    await searchBox.waitFor({ state: 'visible', timeout: 30000 });
    await searchBox.fill(query);
    await page.keyboard.press('Enter');
    
    const feed = locators.feed(page);
    await feed.waitFor({ state: 'visible', timeout: 30000 });
    console.log(`Searching for "${query}"...`);

    // 1. Scroll and collect unique URLs
    let uniqueUrls = new Set();
    let previousCount = 0;
    let retries = 0;

    console.log("Scrolling to load businesses...");
    while (uniqueUrls.size < TARGET_RESULTS) {
      const links = await locators.businessLinks(page).evaluateAll(els => els.map(e => e.href));
      links.forEach(link => uniqueUrls.add(link));
      
      console.log(`Collected ${uniqueUrls.size}/${TARGET_RESULTS} URLs...`);
      if (uniqueUrls.size >= TARGET_RESULTS) break;
      
      if (uniqueUrls.size === previousCount) {
        retries++;
        if (retries > 5) {
          console.log("No more new results found or reached end of list.");
          break;
        }
      } else {
        retries = 0;
      }
      previousCount = uniqueUrls.size;

      await feed.hover();
      await page.mouse.wheel(0, 10000);
      await page.waitForTimeout(2000);
    }

    const urlsToProcess = Array.from(uniqueUrls).slice(0, TARGET_RESULTS);
    console.log(`\nSuccessfully collected ${urlsToProcess.length} businesses. Extracting details...\n`);

    const businesses = [];

    // 2. Iterate through each URL and extract data
    for (let i = 0; i < urlsToProcess.length; i++) {
      const url = urlsToProcess[i];
      console.log(`Processing ${i + 1}/${urlsToProcess.length}...`);
      
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await locators.heading(page).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
      
      const name = await extractText(locators.heading(page));
      if (name === 'N/A' || name === 'Results') continue;

      let rating = 'N/A';
      let reviews = 'N/A';
      try {
        const ratingDiv = locators.ratingAndReviews(page).first();
        await ratingDiv.waitFor({ state: 'attached', timeout: 2000 });
        const ariaLabel = await ratingDiv.getAttribute('aria-label');
        if (ariaLabel) {
          const parts = ariaLabel.split(' ');
          rating = parts[0] || 'N/A';
          reviews = parts[2] || 'N/A';
        }
      } catch (e) {}

      const address = await extractText(locators.addressBtn(page));
      const phone = await extractText(locators.phoneBtn(page));
      const website = await extractText(locators.websiteBtn(page));

      businesses.push({
        Name: name,
        Rating: rating,
        Reviews: reviews,
        Address: address,
        Phone: phone,
        Website: website
      });
    }

    console.log(`\n✅ Total businesses extracted: ${businesses.length}\n`);
    
    if (!DEBUG) {
      await browser.close();
    } else {
      console.log("DEBUG mode enabled: Keeping browser open.");
    }
    
    return businesses;
    
  } catch (error) {
    console.error("❌ Error running automation:", error);
    if (browser && !DEBUG) await browser.close();
    throw error;
  }
}

module.exports = {
  scrapeGoogleMaps
};
