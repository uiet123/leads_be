const { chromium } = require('playwright');
const { DEBUG } = require('../config');

// Helper to extract email using Regex
const extractEmail = (text) => {
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
  const matches = text.match(emailRegex);
  return matches ? matches[0].toLowerCase() : 'N/A';
};

/**
 * Scrapes Google Search for Instagram leads using a dork
 * @param {string} query The search query (e.g. "candles in india")
 * @returns {Array} Array of business objects
 */
async function scrapeInstagramLeads(query) {
  let browser;
  try {
    browser = await chromium.launch({ headless: !DEBUG });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    
    // Construct the Google Dork
    const dork = `site:instagram.com "${query}" "@gmail.com" OR "@yahoo.com" OR "@hotmail.com"`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(dork)}&num=100`;
    
    console.log(`Searching Google for Instagram leads: ${dork}`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    const businesses = [];
    const uniqueLinks = new Set();
    
    let hasNextPage = true;
    let pageCount = 0;
    
    while (hasNextPage && pageCount < 3) { // limit to 3 pages to avoid captchas
      pageCount++;
      console.log(`Extracting leads from page ${pageCount}...`);
      
      // Wait for search results
      await page.waitForSelector('div.g', { timeout: 10000 }).catch(() => {});
      
      // Extract all result blocks
      const results = await page.$$('div.g');
      
      for (const result of results) {
        try {
          const titleEl = await result.$('h3');
          const linkEl = await result.$('a');
          const snippetEl = await result.$('div.VwiC3b, div[style*="-webkit-line-clamp"]'); // Standard Google snippet classes
          
          if (!titleEl || !linkEl) continue;
          
          const title = await titleEl.innerText();
          const link = await linkEl.getAttribute('href');
          let snippet = '';
          if (snippetEl) {
            snippet = await snippetEl.innerText();
          }
          
          // Only process instagram links
          if (link && link.includes('instagram.com') && !uniqueLinks.has(link)) {
            uniqueLinks.add(link);
            
            // Clean up title (usually "Name (@username) • Instagram photos...")
            let cleanName = title.split('•')[0].split('-')[0].trim();
            const email = extractEmail(snippet);
            
            businesses.push({
              Name: cleanName,
              Rating: 'N/A', // Instagram doesn't have Google ratings
              Reviews: '0',
              Address: 'Instagram Profile',
              Phone: 'N/A', // Hard to extract reliably from snippet
              Website: link, // Use Instagram profile as website
              WebsiteStatus: 'HAS_WEBSITE', // It has a profile
              PrimaryEmail: email,
              Priority: email !== 'N/A' ? 'HIGH' : 'LOW'
            });
          }
        } catch (e) {
          // ignore parsing errors for individual blocks
        }
      }
      
      // Check for next page
      const nextButton = await page.$('a#pnnext');
      if (nextButton) {
        console.log("Navigating to next page...");
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
          nextButton.click(),
        ]);
        await page.waitForTimeout(2000); // polite delay
      } else {
        hasNextPage = false;
      }
    }

    console.log(`\n✅ Total Instagram leads extracted: ${businesses.length}\n`);
    
    if (!DEBUG) {
      await browser.close();
    }
    
    return businesses;
    
  } catch (error) {
    console.error("❌ Error running Instagram search automation:", error);
    if (browser && !DEBUG) await browser.close();
    throw error;
  }
}

module.exports = {
  scrapeInstagramLeads
};
