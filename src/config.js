require('dotenv').config();
const path = require('path');

module.exports = {
  DEBUG: process.env.DEBUG === 'true',
  OUTPUT_DIR: path.join(__dirname, '..', 'output'),
  ALL_LEADS_CSV: path.join(__dirname, '..', 'output', 'all-leads.csv'),
  NO_WEBSITE_CSV: path.join(__dirname, '..', 'output', 'no-website-leads.csv'),
  WEBSITE_LEADS_CSV: path.join(__dirname, '..', 'output', 'website-leads.csv'),
  PRIORITIZED_LEADS_CSV: path.join(__dirname, '..', 'output', 'prioritized-leads.csv'),
  EMAIL_LEADS_CSV: path.join(__dirname, '..', 'output', 'email-leads.csv'),
  TARGET_RESULTS: parseInt(process.env.TARGET_RESULTS || '250', 10),
  // Max Google result pages to crawl for Instagram leads (~10 results/page).
  // Higher = more leads but slower and higher CAPTCHA/block risk.
  INSTAGRAM_MAX_PAGES: parseInt(process.env.INSTAGRAM_MAX_PAGES || '15', 10),
  // Serper.dev API key. When set, Instagram lead search uses the Serper Google
  // Search API (reliable, no CAPTCHA, complete result set) instead of the
  // browser scraper. Get a free key at https://serper.dev.
  SERPER_API_KEY: process.env.SERPER_API_KEY || '',
};
