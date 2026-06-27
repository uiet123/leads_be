/**
 * Scoring rules configuration.
 * Can be easily modified without changing the core logic.
 */
const SCORING_RULES = {
  BASE_SCORE: 30, // Base score to ensure max score is 100
  NO_WEBSITE: 50,
  WEBSITE_DEAD_OR_SSL_ERROR: 30,
  RATING_GTE_4: 10,
  REVIEWS_BETWEEN_10_AND_200: 5,
  PHONE_AVAILABLE: 5
};

/**
 * Parses rating to a float.
 * @param {string|number} rating 
 * @returns {number}
 */
function parseRating(rating) {
  if (typeof rating === 'number') return rating;
  if (!rating || rating === 'N/A') return 0;
  return parseFloat(rating) || 0;
}

/**
 * Parses reviews to an integer.
 * @param {string|number} reviews 
 * @returns {number}
 */
function parseReviews(reviews) {
  if (typeof reviews === 'number') return reviews;
  if (!reviews || reviews === 'N/A') return 0;
  // Remove commas (e.g. "1,234")
  return parseInt(reviews.replace(/,/g, ''), 10) || 0;
}

/**
 * Calculates a lead score for a given business based on predefined rules.
 * @param {Object} business 
 * @returns {number} The lead score (0-100)
 */
function calculateScore(business) {
  let score = SCORING_RULES.BASE_SCORE;

  // Rule: No Website
  if (business.WebsiteStatus === 'NO_WEBSITE') {
    score += SCORING_RULES.NO_WEBSITE;
  }

  // Rule: Website is DEAD or SSL_ERROR
  if (business.WebsiteHealth === 'DEAD' || business.WebsiteHealth === 'SSL_ERROR') {
    score += SCORING_RULES.WEBSITE_DEAD_OR_SSL_ERROR;
  }

  // Rule: Rating >= 4.0
  const ratingNum = parseRating(business.Rating);
  if (ratingNum >= 4.0) {
    score += SCORING_RULES.RATING_GTE_4;
  }

  // Rule: Reviews between 10 and 200
  const reviewsNum = parseReviews(business.Reviews);
  if (reviewsNum >= 10 && reviewsNum <= 200) {
    score += SCORING_RULES.REVIEWS_BETWEEN_10_AND_200;
  }

  // Rule: Phone Number available
  if (business.Phone && business.Phone !== 'N/A' && business.Phone.trim() !== '') {
    score += SCORING_RULES.PHONE_AVAILABLE;
  }

  // Cap at 100
  return Math.min(score, 100);
}

/**
 * Assigns a priority label based on the lead score.
 * @param {number} score 
 * @returns {string} Priority (HIGH, MEDIUM, LOW)
 */
function assignPriority(score) {
  if (score >= 90) return 'HIGH';
  if (score >= 70) return 'MEDIUM';
  return 'LOW';
}

/**
 * Enhances an array of businesses with Lead Score and Priority,
 * and sorts them from highest to lowest score.
 * @param {Array} businesses 
 * @returns {Array} Sorted and scored businesses
 */
function scoreAndSortLeads(businesses) {
  const scored = businesses.map(b => {
    const score = calculateScore(b);
    return {
      ...b,
      LeadScore: score,
      Priority: assignPriority(score)
    };
  });

  // Sort descending by LeadScore
  return scored.sort((a, b) => b.LeadScore - a.LeadScore);
}

module.exports = {
  scoreAndSortLeads,
  SCORING_RULES
};
