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

  // Replace :emoji_name: in text with formatted discord custom emoji tag
  replaceEmojiNames(text) {
    if (!text || this.cache.size === 0) return text;

    // Matches :emoji_name: that isn't already inside <:name:id> or <a:name:id>
    return text.replace(/(?<!<a?):([a-zA-Z0-9_~]+):(?![\d]+>)/g, (match, emojiName) => {
      if (this.cache.has(emojiName)) {
        return this.cache.get(emojiName);
      }
      return match;
    });
  }

  // Generate prompt context string for AI to know available guild emojis
  getSystemPromptContext() {
    if (this.cache.size === 0) return '';
    const emojiNames = Array.from(this.cache.keys()).map(name => `:${name}:`).join(' ');
    return `\n\n【伺服器專屬表情符號】\n你可以在對話中自然地使用以下伺服器專屬表情符號來表達情緒與互動：\n${emojiNames}\n請在回應中適當加入這些表情符號（寫法如 :online: 或 :Gura_wink: 即可）。`;
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
