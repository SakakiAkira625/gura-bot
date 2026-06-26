const logger = require('../utils/logger');
const knowledgeRepository = require('../db/repositories/KnowledgeRepository');
const userRepository = require('../db/repositories/UserRepository');
const memoryRepository = require('../db/repositories/MemoryRepository');
const { getEmbedding } = require('./embeddingService');
const { askNvidiaWithFallback } = require('./nvidiaService');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const SUMMARY_SYSTEM_PROMPT = {
  role: 'system',
  content: `
You are Gawr Gura's background Knowledge Patrol assistant.
You will be provided with a chronological chat log from a Discord channel.
Your task is to analyze the conversation and compile a comprehensive summary, distinguishing different users to extract their behaviors, preferences, and important memories.

You MUST output your response in Traditional Chinese (繁體中文) using the following structure:

1. **頻道對話綜觀 (General Overview)**:
   - 用 2-4 個項目符號，精確摘要這段時間內聊到的核心主題、討論的決定、或是群內發生的重要事件。

2. **使用者行為與特徵紀錄 (User Behaviors & Profiles)**:
   - 針對每個活躍的使用者（用他們的用戶名稱作為標題），用 1-2 句話簡要記錄他們說了什麼、有什麼想法、有何特別行為、喜好、或值得記錄的專屬記憶點。
   - **[用戶名稱]**: 摘要其討論內容與特徵。

3. **海馬迴記憶提取 (Memory Extraction)**:
   - 提取出可用於寫入使用者個人長期記憶（海馬迴）的關鍵事實或事實記憶點（例如：某人最近考完試、某人喜歡喝珍珠奶茶、某人正在開發一個專案）。
   - 必須將記憶點與其對應的 Discord 用戶 ID (格式為 [ID: xxx]) 綁定。
   - 輸出格式必須嚴格包覆在 ===MEMORIES=== 與 ===END_MEMORIES=== 標記中，每一行代表一條記憶點，格式為：\`[用戶ID]: [記憶內容]\`
   - 範例：
     ===MEMORIES===
     1234567890: 喜歡在半夜去吃拉麵。
     2345678901: 最近通過了駕照考試，感到很開心。
     ===END_MEMORIES===
   - 如果沒有任何值得記憶的事實，請在標記內保留空白，不要輸出任何記憶點。

請保持內容結構清晰、條理分明。不要以 Gura 的角色語氣回答（保持客觀整理即可），整體長度控制在 800 字內。
`.trim()
};

/**
 * 提取並向量化儲存使用者的長期記憶點
 */
async function extractAndStoreUserMemories(summary) {
  const match = summary.match(/===MEMORIES===\s*([\s\S]*?)\s*===END_MEMORIES===/i);
  if (!match) return;

  const memoryBlock = match[1].trim();
  if (!memoryBlock) return;

  const lines = memoryBlock.split('\n');
  for (const line of lines) {
    const parts = line.match(/^\s*(\d+)\s*:\s*(.+)$/);
    if (parts) {
      const userId = parts[1];
      const memoryText = parts[2].trim();

      if (userId && memoryText) {
        try {
          await userRepository.createIgnore(userId);
          const embedding = await getEmbedding(memoryText);
          await memoryRepository.add(userId, memoryText, embedding);
          logger.info(`[Guild Scanner] 成功為用戶 ${userId} 自動收錄長期記憶：${memoryText}`);
        } catch (err) {
          logger.error(`[Guild Scanner] 為用戶 ${userId} 收錄長期記憶失敗：`, err);
        }
      }
    }
  }
}

/**
 * 背景非同步掃描單一頻道全部歷史對話，並分段彙整
 */
async function scanChannel(channel, maxMessages = Infinity, onProgress) {
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

    // 1. 清除該頻道的舊有知識摘要
    await knowledgeRepository.clearKnowledge(channelId);
    await knowledgeRepository.updateScanStatus(channelId, guildId, null, 'scanning');

    let lastId = null;
    let totalFetched = 0;
    let accumulated = [];
    let segmentCount = 0;
    let newestMsgId = null;

    const segmentThreshold = 1000;

    // 2. 歷史對話抓取與分段處理迴圈
    while (totalFetched < maxMessages) {
      notifyProgress('scanning', `正在讀取歷史對話 (已讀取 ${totalFetched} 筆)...`);
      
      const options = { limit: 100 };
      if (lastId) {
        options.before = lastId;
      }

      const messages = await channel.messages.fetch(options);
      if (!messages || messages.size === 0) {
        break;
      }

      if (!newestMsgId) {
        newestMsgId = messages.first().id; // 記錄最新的一條訊息 ID
      }

      // 過濾出人類發言
      const userMsgs = messages.values().filter(m => !m.author.bot && m.content.trim().length > 0);
      accumulated.push(...userMsgs);

      lastId = messages.last().id;
      totalFetched += messages.size;

      // 檢查是否達到分段摘要門檻
      if (accumulated.length >= segmentThreshold) {
        segmentCount++;
        notifyProgress('scanning', `已讀取 ${totalFetched} 筆對話，正在彙整第 ${segmentCount} 段對話與成員特徵...`);
        
        // 取出前 1000 筆，並正序排列以供 LLM 分析
        const segment = accumulated.slice(0, segmentThreshold);
        accumulated = accumulated.slice(segmentThreshold);

        const chronologicalSegment = segment.slice().reverse();
        
        // 格式化對話
        const formattedLog = chronologicalSegment.map(m => {
          const timeStr = new Date(m.createdTimestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
          return `[${timeStr}] ${m.author.username} (ID: ${m.author.id}): ${m.content}`;
        }).join('\n');

        // 呼叫 LLM 摘要
        const summary = await askNvidiaWithFallback(formattedLog, [], SUMMARY_SYSTEM_PROMPT, 'CHAT');
        
        // 提取海馬迴記憶
        await extractAndStoreUserMemories(summary);

        // 清理記憶段落標籤後寫入知識庫
        const cleanSummary = summary.replace(/===MEMORIES===\s*[\s\S]*?\s*===END_MEMORIES===/i, '').trim();
        const startMsg = chronologicalSegment[0];
        const endMsg = chronologicalSegment[chronologicalSegment.length - 1];

        await knowledgeRepository.saveKnowledge(
          guildId,
          channelId,
          cleanSummary,
          startMsg.id,
          endMsg.id,
          chronologicalSegment.length,
          endMsg.createdTimestamp
        );

        logger.info(`[Guild Scanner] 頻道 ${channel.name} 第 ${segmentCount} 段海巡摘要儲存成功。`);
        
        // 擷取最新摘要的 snippet 用於即時面板展示
        const lines = cleanSummary.split('\n');
        const snippetLines = lines.slice(0, 5).filter(l => l.trim().startsWith('-') || l.trim().startsWith('*') || l.trim().includes('頻道對話綜觀'));
        const snippet = snippetLines.join(' ') || lines.slice(0, 2).join(' ');
        notifyProgress('scanning', `已生成 ${segmentCount} 段摘要`, snippet);

        // 呼叫 LLM 後間隔 3.5 秒保護限流
        await delay(3500);
      }

      if (messages.size < 100) {
        break;
      }

      // 抓取分頁間隔 2 秒保護 Discord API
      await delay(2000);
    }

    // 3. 處理剩餘未滿 1000 筆的對話
    if (accumulated.length > 0) {
      segmentCount++;
      notifyProgress('scanning', `對話抓取結束，正在彙整最後一段對話 (共 ${accumulated.length} 筆)...`);

      const chronologicalSegment = accumulated.slice().reverse();
      const formattedLog = chronologicalSegment.map(m => {
        const timeStr = new Date(m.createdTimestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
        return `[${timeStr}] ${m.author.username} (ID: ${m.author.id}): ${m.content}`;
      }).join('\n');

      const summary = await askNvidiaWithFallback(formattedLog, [], SUMMARY_SYSTEM_PROMPT, 'CHAT');
      await extractAndStoreUserMemories(summary);

      const cleanSummary = summary.replace(/===MEMORIES===\s*[\s\S]*?\s*===END_MEMORIES===/i, '').trim();
      const startMsg = chronologicalSegment[0];
      const endMsg = chronologicalSegment[chronologicalSegment.length - 1];

      await knowledgeRepository.saveKnowledge(
        guildId,
        channelId,
        cleanSummary,
        startMsg.id,
        endMsg.id,
        chronologicalSegment.length,
        endMsg.createdTimestamp
      );

      logger.info(`[Guild Scanner] 頻道 ${channel.name} 最後一筆海巡摘要儲存成功。`);

      const lines = cleanSummary.split('\n');
      const snippetLines = lines.slice(0, 5).filter(l => l.trim().startsWith('-') || l.trim().startsWith('*') || l.trim().includes('頻道對話綜觀'));
      const snippet = snippetLines.join(' ') || lines.slice(0, 2).join(' ');
      notifyProgress('completed', `海巡完成，共 ${segmentCount} 段摘要`, snippet);
    } else {
      notifyProgress('completed', `海巡完成，共 ${segmentCount} 段摘要`, '歷史對話已全數完成分析。');
    }

    // 4. 更新最終狀態
    await knowledgeRepository.updateScanStatus(channelId, guildId, newestMsgId || 'empty', 'completed');

  } catch (error) {
    logger.error(`[Guild Scanner] 頻道 ${channel.name} 掃描致命錯誤: `, error);
    await knowledgeRepository.updateScanStatus(channelId, guildId, null, 'failed').catch(() => {});
    notifyProgress('failed', `海巡失敗: ${error.message}`);
  }
}

/**
 * 依活躍度降序分批海巡多個頻道 (每批 3 頻道，間隔 15 秒冷卻)
 */
async function scanChannels(channels, maxMessages, onProgress) {
  channels.sort((a, b) => {
    const idA = a.lastMessageId || '0';
    const idB = b.lastMessageId || '0';
    return idB.localeCompare(idA);
  });

  const tierSize = 3;
  for (let idx = 0; idx < channels.length; idx++) {
    const channel = channels[idx];
    const currentTier = Math.floor(idx / tierSize) + 1;

    if (idx > 0 && idx % tierSize === 0) {
      if (typeof onProgress === 'function') {
        onProgress(channel.id, {
          status: 'scanning',
          info: `[活躍度梯隊 Tier ${currentTier}] 梯隊冷卻中... 15 秒後開始海巡下一梯隊。`
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

    if (idx < channels.length - 1 && (idx + 1) % tierSize !== 0) {
      await delay(2000);
    }
  }
}

function startScan(channels, maxMessages = Infinity, onProgress) {
  const channelArray = Array.isArray(channels) ? channels : [channels];
  scanChannels(channelArray, maxMessages, onProgress).catch(err => {
    logger.error('[Guild Scanner] 全面海巡任務致命異常:', err);
  });
}

module.exports = {
  startScan,
  scanChannel
};
