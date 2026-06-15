const db = require('../db/database');
const logger = require('../utils/logger');
const { getEmbedding } = require('./embeddingService');
const { askNvidiaWithFallback } = require('./nvidiaService');

/**
 * 計算兩個向量的餘弦相似度 (Cosine Similarity)
 */
function computeCosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 檢索與當前輸入最相關的記憶
 * @param {string} userId
 * @param {string} queryText
 * @param {number} topK 返回前幾筆
 * @param {number} threshold 相似度門檻
 * @returns {Promise<Array>} 相關的記憶字串陣列
 */
async function retrieveRelevantMemories(userId, queryText, topK = 3, threshold = 0.35) {
  try {
    const queryEmbedding = await getEmbedding(queryText);
    const pool = await db.getDb();
    const rows = await pool.all('SELECT summary, embedding FROM long_term_memories WHERE user_id = ?', [userId]);
    
    if (!rows || rows.length === 0) return [];

    const scoredMemories = rows.map(row => {
      // 確保從 JSON 轉回 Float Array
      const memoryEmbedding = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
      const score = computeCosineSimilarity(queryEmbedding, memoryEmbedding);
      return { summary: row.summary, score };
    });

    const relevant = scoredMemories
      .filter(m => m.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(m => m.summary);

    if (relevant.length > 0) {
      logger.info(`[海馬迴] 成功為使用者 ${userId} 喚醒 ${relevant.length} 筆長期記憶`);
    }

    return relevant;
  } catch (error) {
    logger.error(`[海馬迴檢索錯誤] ${error.message}`);
    return []; // 即使檢索失敗也不要干擾正常聊天
  }
}

/**
 * 定期檢查未總結的對話並存入海馬迴
 * @param {string} userId
 * @param {string} channelId
 */
async function summarizeAndStoreMemory(userId, channelId) {
  try {
    const pool = await db.getDb();
    
    // 取得尚未總結的對話 (僅計算該使用者的訊息量來當作觸發條件)
    const unsummarized = await pool.all(
      'SELECT id, role, content FROM history WHERE user_id = ? AND channel_id = ? AND is_summarized = 0 ORDER BY timestamp ASC',
      [userId, channelId]
    );

    // 每 5 則使用者的訊息觸發一次總結 (降低門檻讓記憶更快成型)
    if (unsummarized.length < 5) return;

    const idsToUpdate = unsummarized.map(r => r.id);
    
    // 取得頻道內最近的 20 筆對話，包含 Gura 的回覆，這樣 LLM 總結時才有上下文
    const recentHistory = await pool.all(
      'SELECT role, content FROM history WHERE channel_id = ? ORDER BY timestamp DESC LIMIT 20',
      [channelId]
    );
    const conversationText = recentHistory.reverse().map(r => `${r.role === 'user' ? '使用者' : 'Gura'}: ${r.content}`).join('\n');

    logger.info(`[海馬迴] 正在為使用者 ${userId} 壓縮 ${unsummarized.length} 筆對話記憶...`);

    // 嘗試從未壓縮的紀錄中提取發言者名稱 (因為格式為 [Username]: xxx)
    const userMessage = unsummarized.find(r => r.role === 'user');
    const nameMatch = userMessage ? userMessage.content.match(/^\[(.*?)\]:/) : null;
    const targetUsername = nameMatch ? nameMatch[1] : '該名使用者';

    const systemPrompt = {
      role: 'system',
      content: `你是一個專業的記憶整理員。請從以下的對話紀錄中，專注提取出特定使用者「${targetUsername}」的關鍵特徵，例如：喜好、習慣、最近發生的重要事件或狀態。
如果對話中包含這類資訊，請用簡短、客觀的條列式文字總結（例如：「${targetUsername} 喜歡吃披薩」、「${targetUsername} 正在準備期末考」）。
請「絕對不要」把對話中其他人的特徵混淆進來。
如果這段對話中，沒有任何關於「${targetUsername}」值得記憶的資訊，請完全且僅僅輸出「無特殊記憶點」五個字，不要包含任何標點符號或其他說明。`
    };

    const summary = await askNvidiaWithFallback(
      "請整理以下對話的記憶點：\n" + conversationText, 
      [], 
      systemPrompt, 
      'CHAT' // 使用 CHAT 類型的模型來總結
    );

    if (summary && !summary.includes('無特殊記憶點')) {
      const cleanedSummary = summary.trim();
      const embedding = await getEmbedding(cleanedSummary);
      
      await pool.run(
        'INSERT INTO long_term_memories (user_id, summary, embedding, timestamp) VALUES (?, ?, ?, ?)',
        [userId, cleanedSummary, JSON.stringify(embedding), Date.now()]
      );
      logger.info(`[海馬迴] 已成功儲存新記憶點: ${cleanedSummary.split('\n')[0].substring(0, 30)}...`);
    } else {
      logger.info(`[海馬迴] 對話中無特殊記憶點，跳過儲存。`);
    }

    // 將這些紀錄標記為已總結，無論是否有產生記憶點都要標記
    const placeholders = idsToUpdate.map(() => '?').join(',');
    await pool.run(`UPDATE history SET is_summarized = 1 WHERE id IN (${placeholders})`, idsToUpdate);
    
  } catch (error) {
    logger.error(`[海馬迴沉澱錯誤] ${error.message}`);
  }
}

module.exports = {
  retrieveRelevantMemories,
  summarizeAndStoreMemory
};
