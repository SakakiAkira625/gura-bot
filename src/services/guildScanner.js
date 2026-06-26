const logger = require('../utils/logger');
const knowledgeRepository = require('../db/repositories/KnowledgeRepository');
const { askNvidiaWithFallback } = require('./nvidiaService');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const SUMMARY_SYSTEM_PROMPT = {
  role: 'system',
  content: `
You are Gawr Gura's background Knowledge Patrol assistant.
You will be provided with a complete chronological chat log from a Discord channel.
Your task is to thoroughly analyze the entire chat log and compile a comprehensive summary of the conversations.
Specifically, you MUST output the summary in Traditional Chinese (繁體中文) using the following structure:

1. **頻道對話綜觀 (General Overview)**:
   - 用 2-4 個項目符號，精確摘要這段時間內聊到的核心主題、討論的決定、或是群內發生的重要事件。

2. **使用者行為與特徵紀錄 (User Behaviors & Profiles)**:
   - 識別這段對話中活躍的發言者。
   - 針對每個活躍的使用者（用他們的用戶名稱作為標題），用 1-2 句話簡要記錄他們說了什麼、有什麼想法、有何特別行為、喜好、或值得記錄的專屬記憶點。
   格式為：
   - **[用戶名稱]**: 摘要其討論內容、偏好與重要記憶點。

請保持內容結構清晰、條理分明。不要以 Gura 的角色語氣回答（保持客觀整理即可），整體長度控制在 500-800 字內。
`.trim()
};

/**
 * 背景非同步掃描單一頻道，並透過回呼回報詳細進度與摘要片段
 * @param {TextChannel} channel Discord 頻道物件
 * @param {number} maxMessages 掃描上限訊息數
 * @param {Function} onProgress 進度更新回呼 (channelId, state)
 */
async function scanChannel(channel, maxMessages, onProgress) {
  const channelId = channel.id;
  const guildId = channel.guildId;

  const notifyProgress = (status, info, snippet = '') => {
    if (typeof onProgress === 'function') {
      onProgress(channelId, { status, info, snippet });
    }
  };

  try {
    logger.info(`[Guild Scanner] 開始背景掃描頻道: ${channel.name} (${channelId})`);
    notifyProgress('scanning', '準備開始海巡並清理舊日誌...');

    // 1. 清除舊有知識摘要
    await knowledgeRepository.clearKnowledge(channelId);
    await knowledgeRepository.updateScanStatus(channelId, guildId, null, 'scanning');

    // 2. 開始分頁抓取歷史對話
    let lastId = null;
    let totalFetched = 0;
    let allMessages = [];

    while (totalFetched < maxMessages) {
      notifyProgress('scanning', `正在讀取歷史對話 (${totalFetched}/${maxMessages} 筆)...`);
      
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

      // 延遲 2 秒以防 Discord API 限流
      await delay(2000);
    }

    notifyProgress('scanning', `讀取完成，共 ${allMessages.length} 筆對話，正在過濾與拼接...`);

    // 3. 過濾機器人訊息並正序排列
    const userMessages = allMessages
      .filter(m => !m.author.bot && m.content.trim().length > 0)
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    if (userMessages.length === 0) {
      await knowledgeRepository.updateScanStatus(channelId, guildId, null, 'completed');
      notifyProgress('completed', '海巡完成 (此頻道近期無人類對話)', '查無人類對話紀錄。');
      return;
    }

    notifyProgress('scanning', '正在調用大上下文模型進行全面分析與成員特徵彙整...');

    // 4. 格式化對話日誌
    const formattedLog = userMessages.map(m => {
      const timeStr = new Date(m.createdTimestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
      return `[${timeStr}] ${m.author.username}: ${m.content}`;
    }).join('\n');

    // 5. 調用 LLM 一口氣分析並摘要
    const summary = await askNvidiaWithFallback(formattedLog, [], SUMMARY_SYSTEM_PROMPT, 'CHAT');

    // 6. 儲存至資料庫
    const startMsg = userMessages[0];
    const endMsg = userMessages[userMessages.length - 1];
    const timestamp = endMsg.createdTimestamp;

    await knowledgeRepository.saveKnowledge(
      guildId,
      channelId,
      summary.trim(),
      startMsg.id,
      endMsg.id,
      userMessages.length,
      timestamp
    );

    await knowledgeRepository.updateScanStatus(channelId, guildId, endMsg.id, 'completed');
    logger.info(`[Guild Scanner] 頻道 ${channel.name} 掃描與知識儲存完成！`);

    // 擷取前幾行作為即時摘要簡報
    const lines = summary.trim().split('\n');
    // 取「頻道對話綜觀」底下的前 2 個重點作為 snippet
    const snippetLines = lines.slice(0, 5).filter(l => l.trim().startsWith('-') || l.trim().startsWith('*') || l.trim().includes('頻道對話綜觀'));
    const snippet = snippetLines.join(' ') || lines.slice(0, 2).join(' ');

    notifyProgress('completed', '海巡完成', snippet);

  } catch (error) {
    logger.error(`[Guild Scanner] 頻道 ${channel.name} 背景掃描時發生錯誤: `, error);
    await knowledgeRepository.updateScanStatus(channelId, guildId, null, 'failed').catch(() => {});
    notifyProgress('failed', `掃描失敗: ${error.message}`);
  }
}

/**
 * 依序掃描多個頻道，並透過回呼通知總體與單一進度。
 * 自動依據最後發言 Snowflake ID 降序排列，劃分高、中、低活躍度梯隊批次掃描。
 * @param {Array<TextChannel>} channels 頻道物件陣列
 * @param {number} maxMessages 每個頻道的掃描上限
 * @param {Function} onProgress 總進度回呼
 */
async function scanChannels(channels, maxMessages, onProgress) {
  // 1. 依據 lastMessageId (Snowflake ID) 降序排序，最活躍的在最前面
  channels.sort((a, b) => {
    const idA = a.lastMessageId || '0';
    const idB = b.lastMessageId || '0';
    return idB.localeCompare(idA);
  });

  const tierSize = 3; // 每 3 個頻道為一個活躍度梯隊
  for (let idx = 0; idx < channels.length; idx++) {
    const channel = channels[idx];
    const currentTier = Math.floor(idx / tierSize) + 1;

    // 梯隊邊界，除了第一個梯隊外，其餘梯隊開始前進行 15 秒冷卻，避免 NVIDIA NIM 40 RPM 限流
    if (idx > 0 && idx % tierSize === 0) {
      if (typeof onProgress === 'function') {
        onProgress(channel.id, {
          status: 'scanning',
          info: `[活躍度梯隊 Tier ${currentTier}] 梯隊間隔冷卻中... 15 秒後開始海巡下一個活躍度梯隊。`
        });
      }
      await delay(15000);
    }

    await scanChannel(channel, maxMessages, (channelId, state) => {
      if (typeof onProgress === 'function') {
        const enrichedInfo = `[Tier ${currentTier}] ${state.info}`;
        onProgress(channelId, { status: state.status, info: enrichedInfo, snippet: state.snippet }, idx, channels.length);
      }
    });

    // 同一梯隊內的頻道掃描間隔 2 秒
    if (idx < channels.length - 1 && (idx + 1) % tierSize !== 0) {
      await delay(2000);
    }
  }
}

/**
 * 啟動全面海巡掃描的非同步進入點
 */
function startScan(channels, maxMessages, onProgress) {
  const channelArray = Array.isArray(channels) ? channels : [channels];
  scanChannels(channelArray, maxMessages, onProgress).catch(err => {
    logger.error('[Guild Scanner] 全面海巡任務發生致命異常:', err);
  });
}

module.exports = {
  startScan,
  scanChannel
};
