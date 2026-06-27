const fs = require('fs');
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');
const { OUTPUT_DIR } = require('../config');

/**
 * Saves extracted businesses to a CSV file.
 * Automatically deduplicates and filters out invalid businesses.
 * 
 * @param {Array} businesses Array of business objects
 * @param {string} filePath Target CSV file path
 */
async function saveToCsv(businesses, filePath) {
  if (!businesses || businesses.length === 0) {
    console.log(`No businesses to save for ${filePath}.`);
    return;
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 1. Filter out invalid businesses (Missing Name)
  let validBusinesses = businesses.filter(b => b.Name && b.Name !== 'N/A' && b.Name !== 'Results');

  // 2. Remove duplicates based on Business Name and Address
  const seen = new Set();
  validBusinesses = validBusinesses.filter(b => {
    const key = `${b.Name}-${b.Address}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Configure CSV Writer
  const csvWriter = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: 'Name', title: 'Business Name' },
      { id: 'Rating', title: 'Rating' },
      { id: 'Reviews', title: 'Reviews' },
      { id: 'Address', title: 'Address' },
      { id: 'Phone', title: 'Phone Number' },
      { id: 'Website', title: 'Website' },
      { id: 'WebsiteStatus', title: 'Website Status' },
      { id: 'WebsiteHealth', title: 'Website Health' },
      { id: 'StatusCode', title: 'Status Code' },
      { id: 'LeadScore', title: 'Lead Score' },
      { id: 'Priority', title: 'Priority' },
      { id: 'PrimaryEmail', title: 'Primary Email' },
      { id: 'AllEmails', title: 'All Emails' },
      { id: 'EmailFound', title: 'Email Found' }
    ]
  });

  try {
    await csvWriter.writeRecords(validBusinesses);
    console.log(`✅ Successfully saved ${validBusinesses.length} records to ${filePath}`);
  } catch (error) {
    console.error(`❌ Error writing to ${filePath}:`, error);
  }
}

module.exports = {
  saveToCsv
};
