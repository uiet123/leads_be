const { isBusinessWebsite } = require('./websiteValidator');

/**
 * Classifies a lead based on its website availability.
 * @param {Object} business 
 * @returns {string} The website status (NO_WEBSITE, HAS_WEBSITE)
 */
function determineLeadType(business) {
  if (isBusinessWebsite(business.Website)) {
    return 'HAS_WEBSITE';
  }
  return 'NO_WEBSITE';
}

/**
 * Enhances an array of businesses with their Website Status.
 * @param {Array} businesses 
 * @returns {Array} Array of enhanced businesses
 */
function enhanceLeads(businesses) {
  return businesses.map(b => ({
    ...b,
    WebsiteStatus: determineLeadType(b)
  }));
}

module.exports = {
  determineLeadType,
  enhanceLeads
};
