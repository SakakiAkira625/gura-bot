const { askNvidia } = require('./nvidiaService');
const logger = require('../utils/logger');

// 我們使用小模型做意圖分類，速度快且省資源
const INTENT_MODEL = 'meta/llama-3.1-8b-instruct';

const INTENT_SYSTEM_PROMPT = {
  role: 'system',
  content: `
You are an Intent Classifier for a Discord bot named Gawr Gura.
Analyze the user's message and classify their intent into EXACTLY ONE of the following categories:

- CHAT: General conversation, roleplay, greetings, small talk, jokes, asking for opinions.
- WIKI_SEARCH: Asking for factual knowledge, definitions, history, "what is X", "who is X".
- CODE: Asking to write code, debug, explain code, create a script, or solve math puzzles.
- SERVER_QUERY: Asking about messages, conversations, summaries, or what was discussed in this server/guild or channel (e.g. "這伺服器最近在聊什麼？", "這頻道前幾天有討論什麼嗎？", "幫我彙整一下這個頻道的對話內容", "最近大家都在聊些什麼").

You must output ONLY the category name. Do NOT output any other text.
Examples:
User: "早安鯊鯊！" -> CHAT
User: "愛因斯坦是誰？" -> WIKI_SEARCH
User: "妳有辦法寫個簡單的貪食蛇嗎" -> CODE
User: "幫我除錯這段 Python" -> CODE
User: "今天晚餐吃什麼好？" -> CHAT
User: "這伺服器最近在聊什麼？" -> SERVER_QUERY
User: "幫我總結一下這個頻道的聊天紀錄" -> SERVER_QUERY
`.trim()
};

const KEYWORD_SYSTEM_PROMPT = {
  role: 'system',
  content: `
Extract the main search keyword or entity from the user's message for a Wikipedia search.
Output ONLY the keyword. Do not output anything else.
Example Input: 愛因斯坦是誰？
Example Output: 愛因斯坦
`.trim()
};

/**
 * 判斷使用者的意圖
 * @param {string} userPrompt 使用者的訊息
 * @returns {Promise<string>} 'CHAT' | 'WIKI_SEARCH' | 'CODE' | 'SERVER_QUERY'
 */
async function classifyIntent(userPrompt) {
  try {
    const rawIntent = await askNvidia(userPrompt, [], INTENT_SYSTEM_PROMPT, INTENT_MODEL, 0.1);
    const intent = rawIntent.trim().toUpperCase();
    
    if (['CHAT', 'WIKI_SEARCH', 'CODE', 'SERVER_QUERY'].includes(intent)) {
      return intent;
    }
    // Default fallback
    return 'CHAT';
  } catch (error) {
    logger.error('Intent Classification Error:', error.message);
    return 'CHAT'; // 發生錯誤時退回一般的聊天模式
  }
}

/**
 * 如果判定為 WIKI_SEARCH，提取要搜尋的關鍵字
 * @param {string} userPrompt 使用者的訊息
 * @returns {Promise<string>} 關鍵字
 */
async function extractWikiKeyword(userPrompt) {
  try {
    const keyword = await askNvidia(userPrompt, [], KEYWORD_SYSTEM_PROMPT, INTENT_MODEL, 0.1);
    return keyword.trim();
  } catch (error) {
    logger.error('Keyword Extraction Error:', error.message);
    return userPrompt; // 如果失敗就直接拿整句去搜
  }
}

module.exports = {
  classifyIntent,
  extractWikiKeyword
};
