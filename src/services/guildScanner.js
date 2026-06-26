const logger = require('../utils/logger');
const knowledgeRepository = require('../db/repositories/KnowledgeRepository');
const { askNvidiaWithFallback } = require('./nvidiaService');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const SUMMARY_SYSTEM_PROMPT = {
  role: 'system',
  content: `
You are Gawr Gura's background Knowledge Patrol assistant.
Analyze the following Discord chat log. Extract key topics, discussions, decisions, announcements, or interesting topics discussed by the users.
Summarize the main content in a concise, bullet-pointed format in Traditional Chinese (繁體中文).
Keep the summary informative but concise (about 3-5 bullet points).
Do NOT roleplay as Gura here, just output the clean summary as bullet points.
`.trim()
};

/**
 * 背景非同步掃描特定頻道
 * @param {TextChannel} channel Discord 頻道物件
 * @param {number} maxMessages 掃描上限訊息數 (預設 1000)
 */
async function scanChannel(channel, maxMessages = 1000) {
  const channelId = channel.id;
  const guildId = channel.guildId;
  
  try {
    logger.info(`[Guild Scanner] 開始背景掃描頻道: ${channel.name} (${channelId})`);
    
    // 1. 先標記狀態為掃描中
    await knowledgeRepository.updateScanStatus(channelId, guildId, null, 'scanning');

    // 2. 清除舊有知識摘要，準備寫入新數據
    await knowledgeRepository.clearKnowledge(channelId);
    
    // 3. 開始抓取歷史對話
    let lastId = null;
    let totalFetched = 0;
    let allMessages = [];
    
    while (totalFetched < maxMessages) {
      const options = { limit: 100 };
      if (lastId) {
        options.before = lastId;
      }
      
      const messages = await channel.messages.fetch(options);
      if (!messages || messages.size === 0) {
        break;
      }
      
      allMessages.push(...messages.values());
      lastId = messages.last().id;
      totalFetched += messages.size;
      
      if (messages.size < 100) {
        break;
      }
      
      // 延遲 2 秒以防 Discord API Rate Limit
      await delay(2000);
    }
    
    logger.info(`[Guild Scanner] 成功自頻道 ${channel.name} 抓取 ${allMessages.length} 筆歷史訊息，開始進行分組摘要處理...`);
    
    if (allMessages.length === 0) {
      await knowledgeRepository.updateScanStatus(channelId, guildId, null, 'completed');
      return;
    }
    
    // 4. 轉為時間正序 (舊的在前，新的在後)
    allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    
    // 5. 每 100 筆為一組進行摘要
    const chunkSize = 100;
    for (let i = 0; i < allMessages.length; i += chunkSize) {
      const chunk = allMessages.slice(i, i + chunkSize);
      
      // 過濾掉機器人發的訊息以防雜訊
      const userMessages = chunk.filter(m => !m.author.bot);
      if (userMessages.length === 0) {
        continue;
      }
      
      // 格式化訊息
      const formattedLog = userMessages.map(m => {
        const timeStr = new Date(m.createdTimestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
        return `[${timeStr}] ${m.author.username}: ${m.content}`;
      }).join('\n');
      
      // 呼叫 NVIDIA LLM
      try {
        const summary = await askNvidiaWithFallback(formattedLog, [], SUMMARY_SYSTEM_PROMPT, 'CHAT');
        
        // 儲存進資料庫
        const startMsg = chunk[0];
        const endMsg = chunk[chunk.length - 1];
        const timestamp = endMsg.createdTimestamp;
        
        await knowledgeRepository.saveKnowledge(
          guildId,
          channelId,
          summary.trim(),
          startMsg.id,
          endMsg.id,
          chunk.length,
          timestamp
        );
        
        logger.info(`[Guild Scanner] 成功處理分段摘要 (${i} - ${i + chunk.length})`);
      } catch (err) {
        logger.error(`[Guild Scanner] 分段摘要 LLM 請求失敗: `, err);
      }
      
      // 每呼叫一次 LLM 後延遲 3.5 秒保護 40 RPM
      await delay(3500);
    }
    
    // 6. 掃描完成
    const lastMessageId = allMessages[allMessages.length - 1].id;
    await knowledgeRepository.updateScanStatus(channelId, guildId, lastMessageId, 'completed');
    logger.info(`[Guild Scanner] 頻道 ${channel.name} (${channelId}) 掃描與知識儲存完成！`);
    
  } catch (error) {
    logger.error(`[Guild Scanner] 背景掃描時發生致命錯誤: `, error);
    await knowledgeRepository.updateScanStatus(channelId, guildId, null, 'failed').catch(() => {});
  }
}

/**
 * 啟動頻道海巡掃描的入口 (非同步執行，不阻塞)
 */
function startScan(channel, maxMessages = 1000) {
  // 不使用 await，直接在背景非同步執行
  scanChannel(channel, maxMessages).catch(err => {
    logger.error('[Guild Scanner] 背景掃描執行失敗: ', err);
  });
}

module.exports = {
  startScan
};
