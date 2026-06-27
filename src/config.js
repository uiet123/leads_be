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
  TARGET_RESULTS: parseInt(process.env.TARGET_RESULTS || '50', 10),
};
