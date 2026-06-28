const fs = require('fs');
const path = pathManager = require('path');
const logger = require('../utils/logger');

const dataDir = pathManager.join(__dirname, '..', 'data');
const emojisFilePath = pathManager.join(dataDir, 'emojis.json');

class EmojiManager {
  constructor() {
    this.cache = new Map();
    this.loadFromFile();
  }

  // Load emojis from JSON file into cache
  loadFromFile() {
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(emojisFilePath)) {
        const rawData = fs.readFileSync(emojisFilePath, 'utf8');
        const json = JSON.parse(rawData);
        this.cache.clear();
        for (const [key, value] of Object.entries(json)) {
          this.cache.set(key, value);
        }
        logger.info(`[EmojiManager] 成功從檔案加載 ${this.cache.size} 個自訂表情。`);
      }
    } catch (error) {
      logger.error(`[EmojiManager] 加載表情快取檔案失敗: ${error.message}`);
    }
  }

  // Save cache to JSON file
  saveToFile() {
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const obj = {};
      for (const [key, value] of this.cache.entries()) {
        obj[key] = value;
      }

      fs.writeFileSync(emojisFilePath, JSON.stringify(obj, null, 2), 'utf8');
      logger.info(`[EmojiManager] 成功將 ${this.cache.size} 個自訂表情持久化至 emojis.json。`);
    } catch (error) {
      logger.error(`[EmojiManager] 儲存表情快取檔案失敗: ${error.message}`);
    }
  }

  // Synchronize all emojis from connected Discord Guilds
  async syncEmojis(client) {
    if (!client || !client.guilds) {
      logger.warn('[EmojiManager] 無法同步表情: Client 未準備就緒或無 Guilds 權限。');
      return;
    }

    try {
      let count = 0;
      client.guilds.cache.forEach((guild) => {
        guild.emojis.cache.forEach((emoji) => {
          // Format: animated <a:name:id>, static <:name:id>
          const formattedEmoji = emoji.animated
            ? `<a:${emoji.name}:${emoji.id}>`
            : `<:${emoji.name}:${emoji.id}>`;
          
          this.cache.set(emoji.name, formattedEmoji);
          count++;
        });
      });

      this.saveToFile();
      logger.info(`[EmojiManager] 全伺服器表情同步完成，共收集與更新 ${count} 個表情（獨立項目: ${this.cache.size}）。`);
    } catch (error) {
      logger.error(`[EmojiManager] 同步伺服器表情遭遇錯誤: ${error.message}`);
    }
  }

  // Get formatted emoji string by name, or return fallback
  getEmoji(name, fallback = '') {
    if (this.cache.has(name)) {
      return this.cache.get(name);
    }
    return fallback;
  }

  // Get list of all cached emojis
  getAllEmojis() {
    const obj = {};
    for (const [key, value] of this.cache.entries()) {
      obj[key] = value;
    }
    return obj;
  }
}

module.exports = new EmojiManager();
