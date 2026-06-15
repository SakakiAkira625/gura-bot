const { franc } = require('franc');
const { detectChinese } = require('../utils/helpers');
const { getSystemPromptByLang, getPersonaErrorReply } = require('../data/persona');
const { askNvidiaWithFallback } = require('../services/nvidiaService');
const { classifyIntent, extractWikiKeyword } = require('../services/intentEngine');
const { fetchWikiSummary } = require('../services/wikiService');
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

    const { mapLangCodeToWikiLang } = require('../utils/helpers');

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
      // 加入使用者名稱讓 Gura 可以識別是誰在說話
      const userPromptWithName = `[${message.author.username}]: ${userPrompt}`;

      // 讀取最近的 10 筆對話紀錄 (取得先前的歷史，不包含當前訊息)
      const rawHistory = await db.all('SELECT role, content FROM history WHERE channel_id = ? ORDER BY timestamp DESC LIMIT 10', [channelId]);
      const history = rawHistory.reverse(); // 將時間排序轉正

      // 儲存使用者的當前對話
      await db.run('INSERT INTO history (user_id, channel_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)', [userId, channelId, 'user', userPromptWithName, now]);

      const systemPrompt = getSystemPromptByLang(langCode);

      await message.channel.sendTyping();
      
      const reqStartTime = Date.now();
      const intent = await classifyIntent(userPrompt);
      logger.info(`[Intent Engine] User: ${message.author.username} | Intent: ${intent}`);

      let reply = '';
      if (intent === 'WIKI_SEARCH') {
        const keyword = await extractWikiKeyword(userPrompt);
        logger.info(`[Intent Engine] Wiki Keyword extracted: ${keyword}`);
        const wikiLang = mapLangCodeToWikiLang(langCode);
        const wikiData = await fetchWikiSummary(keyword, wikiLang);

        let wikiContextPrompt = systemPrompt;
        if (wikiData) {
          wikiContextPrompt = {
            role: 'system',
            content: `${systemPrompt.content}\n\n【維基百科搜尋結果】\n請根據以下資料，用Gura的語氣簡單向使用者說明：\n${wikiData}`
          };
        } else {
          wikiContextPrompt = {
            role: 'system',
            content: `${systemPrompt.content}\n\n【系統提示】找不到相關資料，請用Gura的語氣向使用者裝傻或抱怨找不到。`
          };
        }
        reply = await askNvidiaWithFallback(userPromptWithName, history, wikiContextPrompt, 'CHAT');
      } else if (intent === 'CODE') {
        reply = await askNvidiaWithFallback(userPromptWithName, history, systemPrompt, 'CODE');
      } else {
        reply = await askNvidiaWithFallback(userPromptWithName, history, systemPrompt, 'CHAT');
      }
      
      const reqEndTime = Date.now();
      const timeTaken = ((reqEndTime - reqStartTime) / 1000).toFixed(1);
      reply += `\n\n-# 回覆耗時: ${timeTaken} 秒`;

      // 儲存 Gura 的回覆 (機器人本身的 user_id)
      await db.run('INSERT INTO history (user_id, channel_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)', [message.client.user.id, channelId, 'assistant', reply, Date.now()]);
      
      logger.info(`[AI Response to ${message.author.username}]: ${reply}`);
      await message.reply(reply);
    } catch (error) {
      logger.error('Error handling message:', error.message);
      try {
        const errorReply = getPersonaErrorReply(langCode, error.status);
        await message.reply(errorReply);
      } catch(e) {}
    }
  },
};
