const axios = require('axios');
const https = require('https');

// Simple regex to catch standard email patterns
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const FAKE_EMAILS = [
  'example.com',
  'test@',
  'noreply@',
  'no-reply@',
  'dummy@',
  'admin@example.com',
  'email@',
  'yourname@',
  'john@'
];

// Configure axios for email scraping
const client = axios.create({
  timeout: 10000,
  maxRedirects: 3,
  httpsAgent: new https.Agent({ rejectUnauthorized: false }), // ignore SSL errors for scraping
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
  }
});

/**
 * Normalizes the URL.
 * @param {string} url 
 * @returns {string}
 */
function normalizeUrl(url) {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

/**
 * Extracts and filters valid emails from raw HTML text.
 * @param {string} text 
 * @returns {Array<string>}
 */
function extractEmailsFromText(text) {
  if (!text) return [];
  const matches = text.match(EMAIL_REGEX) || [];
  
  const valid = matches.filter(email => {
    const lower = email.toLowerCase();
    
    // Ignore common image/file extensions that look like domains
    if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || 
        lower.endsWith('.gif') || lower.endsWith('.webp') || lower.endsWith('.svg')) {
      return false;
    }
    
    // Filter fake/placeholder emails
    for (const fake of FAKE_EMAILS) {
      if (lower.includes(fake)) return false;
    }
    
    // Sentry errors
    if (lower.includes('sentry')) return false;

    return true;
  });

  return valid;
}

/**
 * Processes a single business to find emails.
 * @param {Object} business 
 * @returns {Object} Updated business with email fields
 */
async function discoverEmailsForBusiness(business) {
  const emails = new Set();
  const baseUrl = normalizeUrl(business.Website);
  
  const pathsToVisit = ['', '/contact', '/contact-us', '/about', '/about-us', '/team'];
  
  for (const path of pathsToVisit) {
    try {
      const targetUrl = baseUrl + path;
      const response = await client.get(targetUrl);
      const found = extractEmailsFromText(response.data);
      
      for (const email of found) {
        emails.add(email.toLowerCase());
      }
    } catch (error) {
      // Ignore 404s or connection issues on subpages
    }
  }

  const allEmails = Array.from(emails);
  const primaryEmail = allEmails.length > 0 ? allEmails[0] : 'N/A';
  
  return {
    ...business,
    PrimaryEmail: primaryEmail,
    AllEmails: allEmails.join(', '),
    EmailFound: allEmails.length > 0 ? 'YES' : 'NO'
  };
}

/**
 * Runs the email discovery with a concurrency limit.
 * @param {Array} businesses 
 * @param {number} concurrencyLimit 
 * @returns {Array} Updated businesses
 */
async function runEmailDiscovery(businesses, concurrencyLimit = 5) {
  const results = [...businesses];
  
  // Only process those with HAS_WEBSITE and LIVE health
  const queue = businesses.map((b, index) => ({ business: b, index }))
    .filter(item => item.business.WebsiteStatus === 'HAS_WEBSITE' && item.business.WebsiteHealth === 'LIVE');
  
  console.log(`\nStarting Email Discovery for ${queue.length} live websites (Concurrency: ${concurrencyLimit})...`);

  let activeCount = 0;
  let currentIndex = 0;

  return new Promise((resolve) => {
    if (queue.length === 0) {
      return resolve(results);
    }

    const processNext = async () => {
      if (currentIndex >= queue.length) {
        if (activeCount === 0) resolve(results);
        return;
      }

      const item = queue[currentIndex++];
      activeCount++;

      try {
        const updatedBusiness = await discoverEmailsForBusiness(item.business);
        results[item.index] = updatedBusiness;
      } catch (err) {
        // Fallback on error
        results[item.index] = {
          ...item.business,
          PrimaryEmail: 'N/A',
          AllEmails: '',
          EmailFound: 'NO'
        };
      }

      activeCount--;
      processNext();
    };

    const initialWorkers = Math.min(concurrencyLimit, queue.length);
    for (let i = 0; i < initialWorkers; i++) {
      processNext();
    }
  });
}

module.exports = {
  runEmailDiscovery
};
