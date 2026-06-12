const { franc } = require('franc');
const { detectChinese } = require('../utils/helpers');
const { getSystemPromptByLang } = require('../data/persona');
const { askGroq } = require('../services/groqService');
const wikiCommand = require('../commands/wiki');
const logger = require('../utils/logger');

const conversationHistory = new Map();
const MAX_HISTORY_LENGTH = 50; // 防範 Memory Leak

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;

    const userPrompt = message.content.trim();
    if (userPrompt.includes(':')) return;

    // Handle Commands
    if (userPrompt.startsWith('/查詢wiki ')) {
      const q = userPrompt.slice(8).trim();
      return wikiCommand.execute(message, q);
    }

    // Handle Chat
    const channelId = message.channel.id;
    if (!conversationHistory.has(channelId)) {
      conversationHistory.set(channelId, []);
    }
    const history = conversationHistory.get(channelId);

    history.push({ role: 'user', content: userPrompt });

    // Enforce max history length to avoid memory leak
    if (history.length > MAX_HISTORY_LENGTH) {
      // Remove oldest messages, keeping only the recent ones
      history.splice(0, history.length - MAX_HISTORY_LENGTH);
    }

    const langCode = detectChinese(userPrompt) ? 'cmn' : franc(userPrompt);
    const systemPrompt = getSystemPromptByLang(langCode);

    try {
      await message.channel.sendTyping();
      // We send only the last 10 messages for context to the LLM to save tokens
      const reply = await askGroq(userPrompt, history.slice(-10), systemPrompt);

      history.push({ role: 'assistant', content: reply });
      await message.reply(reply);
    } catch (error) {
      logger.error('Error handling message:', error.message);
      // Optional fallback message handled gracefully
      try {
         await message.reply('抱歉啦，我的大腦剛剛短路了一下，請再說一次！');
      } catch(e) {}
    }
  },
};
