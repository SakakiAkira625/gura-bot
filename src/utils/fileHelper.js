const axios = require('axios');
const logger = require('./logger');

/**
 * 從指定 URL 下載純文字類型的檔案 (txt, js, md, json 等)
 * @param {string} url - 檔案下載網址
 * @returns {Promise<string|null>} - 返回純文字內容或 null
 */
async function downloadTextFile(url) {
  try {
    const response = await axios.get(url, { responseType: 'text' });
    // 預防檔案過大，最多只截取前 5000 個字元，避免塞爆 Token
    const textData = response.data;
    if (typeof textData === 'string' && textData.length > 5000) {
      return textData.substring(0, 5000) + '\n\n...(檔案過大，後續已截斷)...';
    }
    return textData;
  } catch (error) {
    logger.error(`下載文字檔案失敗: ${url} - ${error.message}`);
    return null;
  }
}

module.exports = {
  downloadTextFile
};
