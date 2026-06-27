const axios = require('axios');
const https = require('https');

// Create a custom https agent to allow rejecting unauthorized only if we want to, 
// but we want to catch SSL errors.
const httpsAgent = new https.Agent({
  rejectUnauthorized: true, // We want to catch SSL errors
});

// Configure axios defaults for our health checker
const client = axios.create({
  timeout: 15000,
  maxRedirects: 5,
  httpsAgent,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  }
});

/**
 * Normalizes a URL to ensure it has a protocol.
 * @param {string} url 
 * @returns {string} Normalized URL
 */
function normalizeUrl(url) {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  return normalized;
}

/**
 * Checks the health of a single website.
 * @param {string} rawUrl 
 * @returns {Object} { health, statusCode, finalUrl }
 */
async function checkWebsite(rawUrl) {
  const url = normalizeUrl(rawUrl);
  
  try {
    const response = await client.get(url);
    const finalUrl = response.request?.res?.responseUrl || url;
    const statusCode = response.status;
    
    // Check if it was redirected
    const initialHost = new URL(url).hostname.replace(/^www\./, '');
    const finalHost = new URL(finalUrl).hostname.replace(/^www\./, '');
    
    let health = 'LIVE';
    if (initialHost !== finalHost && finalUrl !== url) {
      health = 'REDIRECTED';
    }

    return { health, statusCode, finalUrl };

  } catch (error) {
    let health = 'DEAD';
    let statusCode = error.response ? error.response.status : 'N/A';

    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      health = 'TIMEOUT';
    } else if (error.code && (error.code.includes('CERT') || error.code.includes('SSL'))) {
      health = 'SSL_ERROR';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      health = 'DEAD';
    }

    return { health, statusCode, finalUrl: url };
  }
}

/**
 * Validates a list of businesses with concurrency control.
 * Only validates businesses with WebsiteStatus === 'HAS_WEBSITE'.
 * 
 * @param {Array} businesses 
 * @param {number} concurrencyLimit 
 * @returns {Array} Updated array of businesses
 */
async function validateHealth(businesses, concurrencyLimit = 5) {
  const results = [...businesses];
  const queue = businesses.map((b, index) => ({ business: b, index })).filter(item => item.business.WebsiteStatus === 'HAS_WEBSITE');
  
  console.log(`\nStarting website health checks for ${queue.length} businesses (Concurrency: ${concurrencyLimit})...`);

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
        const { health, statusCode, finalUrl } = await checkWebsite(item.business.Website);
        results[item.index] = {
          ...results[item.index],
          WebsiteHealth: health,
          StatusCode: statusCode,
          Website: finalUrl // Update with final URL if redirected
        };
      } catch (err) {
        results[item.index] = {
          ...results[item.index],
          WebsiteHealth: 'DEAD',
          StatusCode: 'N/A'
        };
      }

      activeCount--;
      processNext();
    };

    // Start initial workers
    const initialWorkers = Math.min(concurrencyLimit, queue.length);
    for (let i = 0; i < initialWorkers; i++) {
      processNext();
    }
  });
}

module.exports = {
  validateHealth,
  checkWebsite
};
