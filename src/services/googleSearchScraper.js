const axios = require('axios');
const { chromium } = require('playwright');
const { DEBUG, INSTAGRAM_MAX_PAGES, SERPER_API_KEY } = require('../config');

// Helper to extract emails using Regex
const extractEmails = (text) => {
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
  const matches = text.match(emailRegex);
  if (!matches) return [];
  // Filter out false positives
  return matches
    .map(e => e.toLowerCase())
    .filter(e => !e.includes('sentry') && !e.includes('example.com') && !e.includes('email.com'));
};

// Extract phone numbers from text
const extractPhone = (text) => {
  const phoneRegex = /(?:\+91[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?)?\d{5,10}/g;
  const matches = text.match(phoneRegex);
  if (!matches) return 'N/A';
  for (const m of matches) {
    const digits = m.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 13) return m.trim();
  }
  return 'N/A';
};

// Random delay to mimic human behavior
const randomDelay = (min = 1000, max = 3000) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(r => setTimeout(r, delay));
};

/**
 * Build a lead object from a search result's title + surrounding text.
 * Shared parsing logic so browser-scraped and API-fetched results are identical.
 */
function buildLeadFromText(href, rawName, blockText) {
  let name = rawName || '';

  // Extract username from title if it exists (e.g. "Name (@username)")
  const handleMatch = name.match(/\(@([^)]+)\)/);
  const titleHandle = handleMatch ? '@' + handleMatch[1].replace('@', '') : '';

  // Clean name
  name = name.split('•')[0].split('|')[0].split('-')[0].trim();
  name = name.replace(/\(@[^)]+\)/g, '').trim();
  name = name.replace(/Instagram.*$/i, '').trim();

  // Filter out garbage names like "Read more", "Call or WhatsApp", or just phone numbers
  const garbageNames = ['read more', 'call or whatsapp', 'call/whatsapp', 'call', 'whatsapp'];
  if (garbageNames.includes(name.toLowerCase()) || /^\+?\d[\d\s-]+$/.test(name)) {
    name = '';
  }

  // Extract username from multiple sources (priority order)
  let username = titleHandle;
  if (!username && blockText) {
    const igDotMatch = blockText.match(/Instagram\s*[·•]\s*([a-zA-Z0-9._]+)/i);
    if (igDotMatch && igDotMatch[1] && igDotMatch[1].length > 1) {
      username = '@' + igDotMatch[1];
    }
  }
  if (!username) {
    try {
      const urlObj = new URL(href);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0 && !['p', 'reel', 'tv', 'explore', 'tags', 'stories'].includes(pathParts[0].toLowerCase())) {
        username = '@' + pathParts[0];
      }
    } catch (e) { }
  }

  // Build final name: prefer "DisplayName (@username)" format
  if (!name || name.length < 2 || name === 'Instagram') {
    name = username || 'Instagram Profile';
  } else if (username && !name.includes(username)) {
    name = `${name} (${username})`;
  }

  if (name === 'Instagram Profile') return null;

  const emails = extractEmails(blockText);
  const email = emails.length > 0 ? emails[0] : 'N/A';
  const phone = extractPhone(blockText);

  return {
    Name: name,
    Rating: 'N/A',
    Reviews: '0',
    Address: 'Instagram Profile',
    Phone: phone,
    Website: href,
    WebsiteStatus: 'NO_WEBSITE',
    PrimaryEmail: email,
    AllEmails: emails.join(', '),
    EmailFound: email !== 'N/A' ? 'YES' : 'NO',
    Priority: email !== 'N/A' ? 'HIGH' : 'LOW',
    _username: username, // internal field for profile enrichment
  };
}

/**
 * Build multiple Google dork variations from a single user query to maximise
 * unique lead coverage. A "keyword in city" query is split into keyword + city;
 * each variation targets a different slice of Google's (capped) result set.
 * @param {string} query e.g. "clothing brand in surat"
 * @returns {string[]} deduped list of dorks, base dork first
 */
function buildDorks(query) {
  const inIdx = query.toLowerCase().indexOf(' in ');
  let keyword = query.trim();
  let city = '';
  if (inIdx !== -1) {
    keyword = query.substring(0, inIdx).trim();
    city = query.substring(inIdx + 4).trim();
  }

  const loc = city ? ` "${city}"` : '';
  const base = `site:instagram.com "${keyword}"${loc}`;

  const dorks = [
    base,                                    // exact-match keyword (+ city)
    `${base} "@gmail.com"`,                   // profiles exposing a gmail address
    `${base} "email"`,                        // bios that mention an email/contact
    `${base} "whatsapp"`,                     // bios with a WhatsApp contact
    // Looser, unquoted variant broadens recall beyond the exact phrase.
    city ? `site:instagram.com ${keyword} ${city}` : `site:instagram.com ${keyword}`,
  ];

  return [...new Set(dorks)];
}

/**
 * Fetch Instagram leads via the Serper.dev Google Search API.
 * Reliable and complete: no CAPTCHA and returns the full organic result set
 * Google exposes for the query (paginated until Google runs out of results).
 * @param {string} dork The full Google query (e.g. site:instagram.com "dentists" "delhi")
 * @returns {Array} Array of business objects
 */
async function fetchInstagramLeadsViaSerper(dorks) {
  const businesses = [];
  const uniqueLinks = new Set();

  console.log(`Using Serper.dev API for Google search (${dorks.length} query variations)...`);

  for (const dork of dorks) {
    console.log(`\n🔎 Dork: ${dork}`);

    for (let pageNum = 1; pageNum <= INSTAGRAM_MAX_PAGES; pageNum++) {
      let organic = [];
      let apiMessage = '';
      try {
        const resp = await axios.post(
          'https://google.serper.dev/search',
          // num must stay <= 10: Serper's free plan rejects num > 10 with
          // "Query pattern not allowed for free accounts" (empty result set).
          // Volume comes from paginating up to INSTAGRAM_MAX_PAGES instead.
          { q: dork, gl: 'in', hl: 'en', num: 10, page: pageNum },
          {
            headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
            timeout: 30000,
          }
        );
        organic = (resp.data && resp.data.organic) || [];
        apiMessage = (resp.data && resp.data.message) || '';
      } catch (e) {
        const status = e.response ? e.response.status : e.message;
        console.log(`  ⚠️ Serper request failed on page ${pageNum}: ${status}`);
        break;
      }

      // Serper returns HTTP 200 with a `message` (and no results) when the
      // query/plan is rejected — surface it instead of silently reporting zero.
      if (organic.length === 0) {
        if (apiMessage) {
          console.log(`  ⚠️ Serper: ${apiMessage} — skipping this dork.`);
        } else {
          console.log(`  No more results after page ${pageNum - 1}. Google has no further results.`);
        }
        break;
      }

      let newOnPage = 0;
      for (const item of organic) {
        const href = item.link || '';
        if (!href.includes('instagram.com/') || uniqueLinks.has(href)) continue;
        if (href.includes('/explore/')) continue;
        uniqueLinks.add(href);
        newOnPage++;

        const title = item.title || '';
        const snippet = item.snippet || '';
        const blockText = `${title}\n${snippet}`;

        const lead = buildLeadFromText(href, title, blockText);
        if (lead) {
          businesses.push(lead);
        }
      }
      console.log(`  page ${pageNum}: +${newOnPage} new links (running total: ${businesses.length} leads)`);
    }
  }

  return businesses;
}

/**
 * Scrapes Google Search for Instagram leads using a dork.
 * Uses Serper.dev when SERPER_API_KEY is set (reliable/complete); otherwise
 * falls back to a stealth-browser scrape of Google.
 * @param {string} query The search query (e.g. "clothing brand in surat")
 * @returns {Array} Array of business objects
 */
async function scrapeInstagramLeads(query) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: !DEBUG,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
      timezoneId: 'Asia/Kolkata',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    const page = await context.newPage();

    // Remove the webdriver flag
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {} };
    });

    // Build several dork variations. Each one is capped by Google at a few
    // hundred results, but each surfaces a DIFFERENT slice, so merging their
    // deduped results yields far more unique leads than any single query.
    const dorks = buildDorks(query);
    const dork = dorks[0]; // base dork used by the browser fallback below
    console.log(`Searching Google for Instagram leads (${dorks.length} variations):`);
    dorks.forEach((d) => console.log(`  • ${d}`));

    let businesses = [];

    if (SERPER_API_KEY) {
      // ---- Preferred path: Serper.dev SERP API (reliable, no CAPTCHA, full set) ----
      businesses = await fetchInstagramLeadsViaSerper(dorks);
      console.log(`\n✅ Total Instagram leads via Serper: ${businesses.length}`);
    } else {
      // ---- Fallback path: scrape Google directly via a stealth browser ----

      // Step 1: Visit Google homepage to get cookies
      await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await randomDelay(1500, 2500);

      // Step 2: Handle consent page if present
      try {
        const consent = await page.$('button:has-text("Accept all"), button:has-text("I agree"), #L2AGLb');
        if (consent) {
          console.log('Handling Google consent page...');
          await consent.click();
          await randomDelay(1000, 2000);
        }
      } catch (e) { /* no consent page */ }

      // Step 3: Type into search box like a human (avoids bot detection vs direct URL)
      const searchBox = await page.$('textarea[name="q"], input[name="q"]');
      if (searchBox) {
        await searchBox.click();
        await randomDelay(300, 600);
        await searchBox.type(dork, { delay: 30 + Math.random() * 40 }); // random typing speed
        await randomDelay(500, 1000);
        await page.keyboard.press('Enter');
      } else {
        // Fallback: direct navigation
        await page.goto(`https://www.google.com/search?q=${encodeURIComponent(dork)}&num=100&filter=0`, { waitUntil: 'domcontentloaded' });
      }

      await randomDelay(3000, 5000);

      // Force Google to include "omitted similar results" (filter=0). By default
      // Google collapses most site: results after ~3-5 pages and drops the Next
      // button, which is why crawls stall early. filter=0 unlocks the full set.
      try {
        const currentUrl = page.url();
        if (currentUrl.includes('/search') && !currentUrl.includes('filter=0')) {
          const sep = currentUrl.includes('?') ? '&' : '?';
          console.log('Re-running with filter=0 to include omitted similar results...');
          await page.goto(`${currentUrl}${sep}filter=0`, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await randomDelay(2500, 4000);
        }
      } catch (e) {
        console.log('Could not apply filter=0, continuing with default results.');
      }

      const uniqueLinks = new Set();

      let hasNextPage = true;
      let pageCount = 0;

      while (hasNextPage && pageCount < INSTAGRAM_MAX_PAGES) {
        pageCount++;
        console.log(`Extracting leads from page ${pageCount}/${INSTAGRAM_MAX_PAGES}...`);

        // Check for CAPTCHA
        const pageText = await page.innerText('body').catch(() => '');
        if (pageText.includes('unusual traffic') || pageText.includes("aren't a robot")) {
          console.log('⚠️ Google CAPTCHA detected! Cannot extract results. Try again later or use a different IP.');
          hasNextPage = false;
          break;
        }

        // Strategy: Instead of relying on div.g, find ALL links on the page that go to Instagram
        // and extract surrounding text for email/name/phone data
        const allLinks = await page.$$('a[href*="instagram.com"]');
        console.log(`Found ${allLinks.length} Instagram links on page ${pageCount}`);

        if (allLinks.length === 0) {
          console.log('⚠️ No Instagram links found on this page.');
          // Check if there are any search results at all
          const bodyText = pageText.substring(0, 200);
          console.log(`  Page preview: ${bodyText}`);
          hasNextPage = false;
          break;
        }

        for (const linkEl of allLinks) {
          try {
            const href = await linkEl.getAttribute('href');
            if (!href || !href.includes('instagram.com/') || uniqueLinks.has(href)) continue;
            // Skip google tracking links and non-profile URLs
            if (href.includes('google.com') || href.includes('webcache') || href.includes('/explore/')) continue;

            uniqueLinks.add(href);

            // Get the parent container to extract surrounding text
            // Walk up the DOM to find the result container
            const parentBlock = await linkEl.evaluateHandle(el => {
              // Walk up until we find a reasonably sized parent block
              let parent = el.parentElement;
              for (let i = 0; i < 8; i++) {
                if (parent && parent.parentElement) {
                  parent = parent.parentElement;
                  // Stop if we hit a container that has enough text content
                  if (parent.innerText && parent.innerText.length > 50) break;
                }
              }
              return parent;
            });

            const blockText = await parentBlock.evaluate(el => el ? el.innerText : '').catch(() => '');

            // Extract name from link text or block heading
            let name = '';
            // Try getting name from the link's h3 or nearby heading
            const h3 = await linkEl.$('h3');
            if (h3) {
              name = await h3.innerText().catch(() => '');
            }
            if (!name) {
              // Try the link's own text
              name = await linkEl.innerText().catch(() => '');
            }
            if (!name && blockText) {
              // Use first line of block text
              name = blockText.split('\n')[0];
            }

            // Extract username from title if it exists (e.g. "Name (@username)")
            const handleMatch = name.match(/\(@([^)]+)\)/);
            const titleHandle = handleMatch ? '@' + handleMatch[1].replace('@', '') : '';

            // Clean name
            name = name.split('•')[0].split('|')[0].split('-')[0].trim();
            name = name.replace(/\(@[^)]+\)/g, '').trim();
            name = name.replace(/Instagram.*$/i, '').trim();

            // Filter out garbage names like "Read more", "Call or WhatsApp", or just phone numbers
            const garbageNames = ['read more', 'call or whatsapp', 'call/whatsapp', 'call', 'whatsapp'];
            if (garbageNames.includes(name.toLowerCase()) || /^\+?\d[\d\s-]+$/.test(name)) {
              name = '';
            }

            // Extract username from multiple sources (priority order)
            let username = titleHandle;

            // Source 2: Look for "Instagram · username" pattern in block text (Google shows this for every result)
            if (!username && blockText) {
              const igDotMatch = blockText.match(/Instagram\s*[·•]\s*([a-zA-Z0-9._]+)/i);
              if (igDotMatch && igDotMatch[1] && igDotMatch[1].length > 1) {
                username = '@' + igDotMatch[1];
              }
            }

            // Source 3: Extract from URL path (only works for profile links, not /p/ or /reel/)
            if (!username) {
              try {
                const urlObj = new URL(href);
                const pathParts = urlObj.pathname.split('/').filter(Boolean);
                if (pathParts.length > 0 && !['p', 'reel', 'tv', 'explore', 'tags', 'stories'].includes(pathParts[0].toLowerCase())) {
                  username = '@' + pathParts[0];
                }
              } catch (e) { }
            }

            // Build final name: prefer "DisplayName (@username)" format
            if (!name || name.length < 2 || name === 'Instagram') {
              // No good display name, just use username
              name = username || 'Instagram Profile';
            } else if (username && !name.includes(username)) {
              // Has both display name and username
              name = `${name} (${username})`;
            }

            if (name === 'Instagram Profile') continue;

            const emails = extractEmails(blockText);
            const email = emails.length > 0 ? emails[0] : 'N/A';
            const phone = extractPhone(blockText);

            businesses.push({
              Name: name,
              Rating: 'N/A',
              Reviews: '0',
              Address: 'Instagram Profile',
              Phone: phone,
              Website: href,
              WebsiteStatus: 'NO_WEBSITE',
              PrimaryEmail: email,
              AllEmails: emails.join(', '),
              EmailFound: email !== 'N/A' ? 'YES' : 'NO',
              Priority: email !== 'N/A' ? 'HIGH' : 'LOW',
              _username: username // internal field for profile enrichment
            });

            console.log(`  ✓ ${name} | Email: ${email} | Phone: ${phone}`);
          } catch (e) {
            // ignore individual extraction errors
          }
        }

        // Try to go to next page
        await randomDelay(2000, 4000);
        const nextButton = await page.$('a#pnnext, a[aria-label="Next"], a:has-text("Next")');
        if (nextButton && pageCount < INSTAGRAM_MAX_PAGES) {
          console.log("Navigating to next page...");
          try {
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
              nextButton.click(),
            ]);
            await randomDelay(3000, 5000);
          } catch (e) {
            console.log('Failed to navigate to next page:', e.message);
            hasNextPage = false;
          }
        } else {
          hasNextPage = false;
        }
      }

      console.log(`\n✅ Total Instagram leads extracted: ${businesses.length}`);
    } // end fallback browser-scrape path

    // ============================================================
    // Phase 2: Visit Instagram profiles to enrich data from bio
    // ============================================================
    if (businesses.length > 0) {
      console.log(`\n🔍 Enriching leads by visiting Instagram profiles...\n`);

      // Get unique usernames to visit
      const usernameMap = new Map(); // username -> array of business indices
      businesses.forEach((biz, idx) => {
        const uname = biz._username;
        if (uname) {
          const cleanUsername = uname.replace('@', '');
          if (!usernameMap.has(cleanUsername)) {
            usernameMap.set(cleanUsername, []);
          }
          usernameMap.get(cleanUsername).push(idx);
        }
      });

      const uniqueUsernames = [...usernameMap.keys()];
      console.log(`Found ${uniqueUsernames.length} unique profiles to visit`);

      let enrichedCount = 0;
      for (let i = 0; i < uniqueUsernames.length; i++) {
        const uname = uniqueUsernames[i];
        const profileUrl = `https://www.instagram.com/${uname}/`;

        try {
          console.log(`  [${i + 1}/${uniqueUsernames.length}] Visiting @${uname}...`);

          // Open profile in a new page to avoid losing Google search context
          const profilePage = await context.newPage();
          await profilePage.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await randomDelay(2000, 3000);

          // Extract bio data from the page
          let bioPhone = 'N/A';
          let bioWebsite = 'N/A';
          let bioEmail = 'N/A';
          let bioText = '';

          // Method 1: Extract from meta description (works without login)
          const metaDesc = await profilePage.$eval('meta[property="og:description"]', el => el.content).catch(() => '');
          const metaTitle = await profilePage.$eval('meta[property="og:title"]', el => el.content).catch(() => '');

          // Method 2: Try to get bio text from page content
          try {
            // Instagram renders bio in a span inside the profile header
            const pageText = await profilePage.innerText('body').catch(() => '');
            bioText = pageText;
          } catch (e) { }

          // Combine all text sources for extraction
          const allProfileText = `${metaDesc} ${metaTitle} ${bioText}`;

          // Extract phone from bio
          const profilePhone = extractPhone(allProfileText);
          if (profilePhone !== 'N/A') bioPhone = profilePhone;

          // Extract email from bio
          const profileEmails = extractEmails(allProfileText);
          if (profileEmails.length > 0) bioEmail = profileEmails[0];

          // Extract external website link from the profile page
          try {
            // Instagram external links are in anchor tags with specific patterns
            const externalLink = await profilePage.$$eval('a[href]', (links) => {
              for (const link of links) {
                const href = link.href || '';
                // Instagram wraps external URLs through l.instagram.com redirector
                if (href.includes('l.instagram.com/') || href.includes('linktr.ee') || href.includes('linkin.bio')) {
                  // Try to extract the actual URL from the redirect
                  try {
                    const url = new URL(href);
                    const redirectUrl = url.searchParams.get('u');
                    if (redirectUrl) return redirectUrl;
                  } catch (e) { }
                  return href;
                }
                // Direct external links (not instagram.com, not facebook.com internal)
                if (!href.includes('instagram.com') && !href.includes('facebook.com') &&
                  !href.includes('cdninstagram') && !href.includes('fbcdn') &&
                  href.startsWith('http') && !href.includes('about.instagram.com')) {
                  return href;
                }
              }
              return null;
            }).catch(() => null);

            if (externalLink) bioWebsite = externalLink;
          } catch (e) { }

          // Also try extracting website URLs from the visible bio text
          if (bioWebsite === 'N/A') {
            const urlMatch = allProfileText.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?(?:\/[^\s]*)?)/g);
            if (urlMatch) {
              for (const u of urlMatch) {
                if (!u.includes('instagram.com') && !u.includes('facebook.com') && !u.includes('cdninstagram')) {
                  bioWebsite = u.startsWith('http') ? u : `https://${u}`;
                  break;
                }
              }
            }
          }

          await profilePage.close();

          // Update all business entries that share this username
          const indices = usernameMap.get(uname);
          for (const idx of indices) {
            if (bioPhone !== 'N/A' && businesses[idx].Phone === 'N/A') {
              businesses[idx].Phone = bioPhone;
            }
            if (bioEmail !== 'N/A' && businesses[idx].PrimaryEmail === 'N/A') {
              businesses[idx].PrimaryEmail = bioEmail;
              businesses[idx].EmailFound = 'YES';
              businesses[idx].Priority = 'HIGH';
              if (businesses[idx].AllEmails) {
                businesses[idx].AllEmails = bioEmail + (businesses[idx].AllEmails ? ', ' + businesses[idx].AllEmails : '');
              } else {
                businesses[idx].AllEmails = bioEmail;
              }
            }
            if (bioWebsite !== 'N/A') {
              businesses[idx].Website = bioWebsite;
              businesses[idx].WebsiteStatus = 'HAS_WEBSITE';
            }
            // Keep the Instagram profile link as Address for reference
            businesses[idx].Address = `instagram.com/${uname}`;
          }

          const details = [];
          if (bioPhone !== 'N/A') details.push(`📞 ${bioPhone}`);
          if (bioEmail !== 'N/A') details.push(`📧 ${bioEmail}`);
          if (bioWebsite !== 'N/A') details.push(`🌐 Website found`);
          if (details.length > 0) {
            console.log(`    Found: ${details.join(' | ')}`);
            enrichedCount++;
          } else {
            console.log(`    No contact details in bio`);
          }

          // Polite delay between profile visits
          await randomDelay(1500, 3000);

        } catch (e) {
          console.log(`    ⚠️ Failed to visit @${uname}: ${e.message}`);
        }
      }

      console.log(`\n✅ Enriched ${enrichedCount}/${uniqueUsernames.length} profiles with contact details\n`);
    }

    // Clean up internal fields
    businesses.forEach(b => delete b._username);

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
