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
- CODE: Asking to write code, debug, explain code, or solve complex math/logic puzzles.

You must output ONLY the category name. Do NOT output any other text, punctuation, or explanation.
Example Output: CHAT
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
 * @returns {Promise<string>} 'CHAT' | 'WIKI_SEARCH' | 'CODE'
 */
async function classifyIntent(userPrompt) {
  try {
    const rawIntent = await askNvidia(userPrompt, [], INTENT_SYSTEM_PROMPT, INTENT_MODEL, 0.1);
    const intent = rawIntent.trim().toUpperCase();
    
    if (['CHAT', 'WIKI_SEARCH', 'CODE'].includes(intent)) {
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
