const { scrapeGoogleMaps } = require('./services/scraper');
const { scrapeInstagramLeads } = require('./services/googleSearchScraper');
const { saveToCsv } = require('./utils/csv');
const { enhanceLeads } = require('./utils/leadFilter');
const { validateHealth } = require('./services/websiteHealthChecker');
const { scoreAndSortLeads } = require('./utils/leadScorer');
const { runEmailDiscovery } = require('./services/emailDiscovery');
const { ALL_LEADS_CSV, NO_WEBSITE_CSV, WEBSITE_LEADS_CSV, PRIORITIZED_LEADS_CSV, EMAIL_LEADS_CSV } = require('./config');
const { getNeighborhoodsForCity } = require('./utils/neighborhoods');

async function main() {
  console.log("Lead Finder Started 🚀\n");

  let query = process.argv[2];
  let isInstagram = false;

  if (query === '--instagram') {
    isInstagram = true;
    query = process.argv[3];
  } else if (process.argv[3] === '--instagram') {
    isInstagram = true;
  }

  if (!query) {
    console.log("Backend is ready and listening for API triggers!");
    console.log("To run manually from terminal, provide a query: node src/index.js \"cafes in delhi\"");
    return;
  }

  try {
    // 1. Scrape data
    let businesses = [];
    
    if (isInstagram) {
      console.log("Running Instagram Scraper via Google Search...");
      businesses = await scrapeInstagramLeads(query);
    } else {
      const inIndex = query.toLowerCase().indexOf(" in ");
      
      if (inIndex !== -1) {
        const baseQuery = query.substring(0, inIndex).trim();
        const city = query.substring(inIndex + 4).trim();
        let neighborhoods = getNeighborhoodsForCity(city);
        if (process.env.LIMIT_NEIGHBORHOODS === 'true') {
          neighborhoods = neighborhoods.slice(0, 2);
        }
        
        if (neighborhoods.length > 0) {
          console.log(`Found ${neighborhoods.length} neighborhoods for ${city}. Initiating chunked scraping...`);
          const uniqueBusinesses = new Map();
          
          for (const nh of neighborhoods) {
            const chunkQuery = `${baseQuery} in ${nh}, ${city}`;
            console.log(`\n--- Scraping Chunk: ${chunkQuery} ---`);
            try {
              const chunkResults = await scrapeGoogleMaps(chunkQuery);
              chunkResults.forEach(b => {
                 const key = b.Phone !== 'N/A' ? b.Phone : `${b.Name}-${b.Address}`;
                 if (!uniqueBusinesses.has(key)) {
                   uniqueBusinesses.set(key, b);
                 }
              });
              // 3-second delay between chunks to avoid rate limiting
              await new Promise(r => setTimeout(r, 3000));
            } catch (err) {
              console.error(`Error scraping chunk ${chunkQuery}:`, err.message);
            }
          }
          businesses = Array.from(uniqueBusinesses.values());
        } else {
          businesses = await scrapeGoogleMaps(query);
        }
      } else {
        businesses = await scrapeGoogleMaps(query);
      }
    }

    // 2. Enhance and filter leads
    if (businesses && businesses.length > 0) {
      businesses = enhanceLeads(businesses);
      
      // 3. Validate Website Health for HAS_WEBSITE businesses
      businesses = await validateHealth(businesses, 5);
      
      // 4. Score and sort the leads
      businesses = scoreAndSortLeads(businesses);

      // 5. Discover Emails
      businesses = await runEmailDiscovery(businesses, 5);

      const noWebsiteLeads = businesses.filter(b => b.WebsiteStatus === 'NO_WEBSITE');
      const websiteLeads = businesses.filter(b => b.WebsiteStatus === 'HAS_WEBSITE');

      // Calculate health stats
      const live = websiteLeads.filter(b => b.WebsiteHealth === 'LIVE').length;
      const dead = websiteLeads.filter(b => b.WebsiteHealth === 'DEAD' || b.WebsiteHealth === 'SSL_ERROR').length;
      const redirected = websiteLeads.filter(b => b.WebsiteHealth === 'REDIRECTED').length;
      const timeout = websiteLeads.filter(b => b.WebsiteHealth === 'TIMEOUT').length;

      // Calculate Priority stats
      const highPriority = businesses.filter(b => b.Priority === 'HIGH').length;
      const mediumPriority = businesses.filter(b => b.Priority === 'MEDIUM').length;
      const lowPriority = businesses.filter(b => b.Priority === 'LOW').length;

      // Calculate Email stats
      const visitedForEmails = websiteLeads.filter(b => b.WebsiteHealth === 'LIVE').length;
      const emailsFoundCount = businesses.filter(b => b.EmailFound === 'YES').length;
      const noEmailFoundCount = visitedForEmails - emailsFoundCount;

      // 6. Display summary in console
      console.log("\n--- Extraction Summary ---");
      console.log(`Total Businesses Found       : ${businesses.length}`);
      console.log(`Businesses Without Website : ${noWebsiteLeads.length}`);
      console.log(`Businesses With Website    : ${websiteLeads.length}`);
      console.log(`  - Live Websites          : ${live}`);
      console.log(`  - Dead/SSL Error         : ${dead}`);
      console.log(`  - Redirected             : ${redirected}`);
      console.log(`  - Timeout                : ${timeout}`);
      console.log("--------------------------");
      console.log("--- Priority Breakdown ---");
      console.log(`High Priority Leads        : ${highPriority}`);
      console.log(`Medium Priority Leads      : ${mediumPriority}`);
      console.log(`Low Priority Leads         : ${lowPriority}`);
      console.log("--------------------------");
      console.log("--- Email Discovery Breakdown ---");
      console.log(`Websites Visited           : ${visitedForEmails}`);
      console.log(`Emails Found               : ${emailsFoundCount}`);
      console.log(`Websites Without Email     : ${noEmailFoundCount}`);
      console.log("---------------------------------\n");

      // Print first 10 for verification
      console.log("--- Top 10 Scored Leads Verification ---");
      businesses.slice(0, 10).forEach((b, i) => {
        console.log(`${i + 1}. [Score: ${b.LeadScore}] [Priority: ${b.Priority}] [Email: ${b.PrimaryEmail || 'N/A'}] ${b.Name}`);
      });
      console.log("----------------------------------------\n");

      // 7. Save to CSVs
      await saveToCsv(businesses, ALL_LEADS_CSV);
      await saveToCsv(noWebsiteLeads, NO_WEBSITE_CSV);
      await saveToCsv(websiteLeads, WEBSITE_LEADS_CSV);
      await saveToCsv(businesses, PRIORITIZED_LEADS_CSV); 
      await saveToCsv(businesses, EMAIL_LEADS_CSV); 
    } else {
      if (isInstagram) {
        console.log("⚠️ No Instagram leads were found. This usually means:");
        console.log("  1. Google blocked the search (CAPTCHA/rate limit)");
        console.log("  2. No Instagram profiles matched your query");
        console.log("  Tip: Try again after some time or use a different search term.");
      } else {
        console.log("No valid businesses were extracted.");
      }
      
      // Explicitly save empty arrays to overwrite any stale data from previous searches
      await saveToCsv([], ALL_LEADS_CSV);
      await saveToCsv([], NO_WEBSITE_CSV);
      await saveToCsv([], WEBSITE_LEADS_CSV);
      await saveToCsv([], PRIORITIZED_LEADS_CSV);
      await saveToCsv([], EMAIL_LEADS_CSV);
    }

  } catch (error) {
    console.error("Critical failure during Lead Finder execution:", error);
  }
}

main();
