const { franc } = require('franc');
const { detectChinese } = require('../utils/helpers');
const { getSystemPromptByLang } = require('../data/persona');
const { askGroq } = require('../services/groqService');
const logger = require('../utils/logger');
const { getMessage } = require('../utils/i18n');
const { getDb } = require('../db/database');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;

    const userPrompt = message.content.trim();
    if (userPrompt.includes(':')) return;

    // Detect language early
    const langCode = detectChinese(userPrompt) ? 'cmn' : franc(userPrompt);

    // Handle Commands (Legacy Text Command)
    if (userPrompt.startsWith('/查詢wiki ')) {
      const q = userPrompt.slice(8).trim();
      const command = message.client.commands.get('wiki');
      if (command) return command.executeText(message, q, langCode);
      return;
    }

    const db = await getDb();
    const userId = message.author.id;
    const channelId = message.channel.id;
    const now = Date.now();

    // 🌟 功能一：好感度與等級系統 (Shrimp Level System)
    try {
      let user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
      
      if (!user) {
        await db.run('INSERT INTO users (id, xp, level, last_message_at) VALUES (?, 0, 1, ?)', [userId, now]);
        user = { id: userId, xp: 0, level: 1, last_message_at: now };
      }

      // 60秒冷卻時間，避免洗頻刷經驗
      if (now - user.last_message_at > 60000) {
        const gainedXp = Math.floor(Math.random() * 11) + 15; // 獲得 15~25 XP
        let newXp = user.xp + gainedXp;
        let newLevel = user.level;
        const xpNeeded = newLevel * 100;

        if (newXp >= xpNeeded) {
          newLevel += 1;
          newXp -= xpNeeded;
          await message.channel.send(`🎉 <@${userId}> 的蝦蝦好感度提升到了等級 **${newLevel}**！a... 謝謝你的陪伴！`);
        }

        await db.run('UPDATE users SET xp = ?, level = ?, last_message_at = ? WHERE id = ?', [newXp, newLevel, now, userId]);
      }
    } catch (err) {
      logger.error('更新使用者等級失敗', err);
    }

    // 🌟 功能二：對話記憶永久化 (Persistent Memory)
    try {
      // 儲存使用者的對話
      await db.run('INSERT INTO history (channel_id, role, content, timestamp) VALUES (?, ?, ?, ?)', [channelId, 'user', userPrompt, now]);

      // 讀取最近的 10 筆對話紀錄
      const rawHistory = await db.all('SELECT role, content FROM history WHERE channel_id = ? ORDER BY timestamp DESC LIMIT 10', [channelId]);
      const history = rawHistory.reverse(); // 將時間排序轉正

      const systemPrompt = getSystemPromptByLang(langCode);

      await message.channel.sendTyping();
      const reply = await askGroq(userPrompt, history, systemPrompt);

      // 儲存 Gura 的回覆
      await db.run('INSERT INTO history (channel_id, role, content, timestamp) VALUES (?, ?, ?, ?)', [channelId, 'assistant', reply, Date.now()]);
      
      await message.reply(reply);
    } catch (error) {
      logger.error('Error handling message:', error.message);
      try {
         await message.reply(getMessage(langCode, 'error'));
      } catch(e) {}
    }
  },
};
