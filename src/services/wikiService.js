const wiki = require('wikijs').default;
const logger = require('../utils/logger');

async function fetchWikiSummary(query, lang = 'en') {
  try {
    const page = await wiki({ apiUrl: `https://${lang}.wikipedia.org/w/api.php` }).page(query);
    const summary = await page.summary();
    return summary.slice(0, 1000); // 截斷以避免過長
  } catch (error) {
    logger.error(`Wiki Search Error [${query}]:`, error.message);
    return null;
  }
}

module.exports = { fetchWikiSummary };
