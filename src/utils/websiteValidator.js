/**
 * A reusable utility to validate whether a given URL points to an actual
 * business website or a social media/profile link.
 */

// List of domains that do NOT count as a business website
const INVALID_DOMAINS = new Set([
  'instagram.com',
  'facebook.com',
  'm.facebook.com',
  'x.com',
  'twitter.com',
  'linkedin.com',
  'youtube.com',
  'youtu.be',
  'linktr.ee',
  'bio.site',
  'taplink.cc',
  'wa.me',
  'whatsapp.com',
  't.me',
  'telegram.me'
]);

/**
 * Checks if a given website URL is valid and does not belong to the invalid domains list.
 * 
 * @param {string} url The website URL to validate
 * @returns {boolean} True if the website is a valid business website, false otherwise
 */
function isBusinessWebsite(url) {
  if (!url || url === 'N/A' || url.trim() === '') {
    return false;
  }

  try {
    // Attempt to parse the URL, if it lacks http/https, prefix it to allow parsing
    const urlToParse = url.startsWith('http') ? url : `https://${url}`;
    const parsedUrl = new URL(urlToParse);
    
    // Get hostname and remove 'www.' prefix if it exists
    const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
    
    if (INVALID_DOMAINS.has(hostname)) {
      return false;
    }

    return true;
  } catch (error) {
    // If URL parsing fails, we fallback to simple string matching
    const urlLower = url.toLowerCase();
    for (const domain of INVALID_DOMAINS) {
      if (urlLower.includes(domain)) {
        return false;
      }
    }
    
    // If it didn't match invalid domains but couldn't be parsed, it might just be a domain string like 'example.com'
    // It's technically valid.
    return true;
  }
}

module.exports = {
  isBusinessWebsite,
  INVALID_DOMAINS
};
