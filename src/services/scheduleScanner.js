const cron = require('node-cron');
const logger = require('../utils/logger');
const guildSettingsRepository = require('../db/repositories/GuildSettingsRepository');
const commandChannelRepository = require('../db/repositories/CommandChannelRepository');
const guildScanner = require('./guildScanner');

// 儲存作用中的 cron 任務 (guildId -> cronTask)
const activeJobs = new Map();

/**
 * 格式化定時任務的進度訊息
 */
function renderProgressText(targetChannels, channelStates) {
  let text = `🦈 **[Gura 定時海巡排程] 任務執行中...**\n\n`;
  let completedCount = 0;
  
  targetChannels.forEach(ch => {
    const state = channelStates[ch.id];
    let icon = '⏳';
    if (state.status === 'scanning') {
      icon = '🔄';
    } else if (state.status === 'completed') {
      icon = '✅';
      completedCount++;
    } else if (state.status === 'failed') {
      icon = '❌';
      completedCount++;
    }
    
    text += `${icon} **#${state.name}**: ${state.info}\n`;
    if (state.snippet) {
      text += `   └ 💡 *焦點簡報：${state.snippet}*\n`;
    }
  });

  const percent = Math.round((completedCount / targetChannels.length) * 100);
  text += `\n**總進度：${percent}%**\n`;
  if (percent === 100) {
    text += `\n🎉 定時海巡任務圓滿結束！我已經將新情報儲存，隨時等候大家的詢問囉！A！`;
  }
  return text;
}

/**
 * 為指定伺服器啟動海巡任務
 */
async function triggerGuildScan(guildId, client, excludeJson) {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      logger.warn(`[Schedule Scanner] 找不到伺服器 ${guildId}，跳過掃描。`);
      return;
    }

    logger.info(`[Schedule Scanner] 觸發伺服器 ${guild.name} (${guildId}) 的定時海巡排程...`);

    // 1. 取得目標文字頻道
    let textChannels = Array.from(guild.channels.cache.values())
      .filter(c => c.isTextBased() && c.viewable);

    // 2. 過濾排除頻道
    const excludedIds = JSON.parse(excludeJson || '[]');
    let targetChannels = textChannels.filter(c => !excludedIds.includes(c.id));

    // 限制最多掃描 5 個活躍文字頻道以防 rate limit
    // 先依最後發言 Snowflake ID 排序
    targetChannels.sort((a, b) => {
      const idA = a.lastMessageId || '0';
      const idB = b.lastMessageId || '0';
      return idB.localeCompare(idA);
    });
    targetChannels = targetChannels.slice(0, 5);

    if (targetChannels.length === 0) {
      logger.info(`[Schedule Scanner] 伺服器 ${guild.name} 無可掃描的文字頻道。`);
      return;
    }

    // 3. 尋找回報日誌頻道 (優先用 allowed 白名單第一個頻道，否則用 systemChannel)
    let logChannel = null;
    const allowed = await commandChannelRepository.getAllowed(guildId);
    if (allowed.length > 0) {
      logChannel = guild.channels.cache.get(allowed[0].channel_id);
    }
    if (!logChannel) {
      logChannel = guild.systemChannel;
    }

    // 4. 初始化進度追蹤
    const channelStates = {};
    targetChannels.forEach(ch => {
      channelStates[ch.id] = {
        name: ch.name,
        status: 'pending',
        info: '等待海巡開始...',
        snippet: ''
      };
    });

    let progressMsg = null;
    if (logChannel) {
      try {
        progressMsg = await logChannel.send(renderProgressText(targetChannels, channelStates));
      } catch (err) {
        logger.warn(`[Schedule Scanner] 無法在日誌頻道發送進度訊息: ${err.message}`);
      }
    }

    // 5. 啟動背景海巡
    guildScanner.startScan(targetChannels, 1000, (channelId, state) => {
      if (channelStates[channelId]) {
        channelStates[channelId].status = state.status;
        channelStates[channelId].info = state.info;
        channelStates[channelId].snippet = state.snippet;
      }

      if (progressMsg) {
        progressMsg.edit(renderProgressText(targetChannels, channelStates)).catch(() => {});
      }
    });

  } catch (error) {
    logger.error(`[Schedule Scanner] 執行定時海巡失敗 (Guild: ${guildId}):`, error);
  }
}

/**
 * 初始化載入所有伺服器的定時排程
 */
async function initialize(client) {
  logger.info('[Schedule Scanner] 正在載入各伺服器的定時海巡排程...');
  try {
    const records = await guildSettingsRepository.getAllSchedules();
    for (const row of records) {
      registerJob(row.guild_id, row.knowledge_cron, row.knowledge_exclude, client);
    }
    logger.info(`[Schedule Scanner] 載入完成，共掛載 ${records.length} 個定時海巡任務。`);
  } catch (err) {
    logger.error('[Schedule Scanner] 初始化排程時發生錯誤:', err);
  }
}

/**
 * 註冊單一伺服器的 Cron 定時任務
 */
function registerJob(guildId, cronExpression, excludeJson, client) {
  // 取消舊有任務
  if (activeJobs.has(guildId)) {
    activeJobs.get(guildId).stop();
    activeJobs.delete(guildId);
  }

  if (!cronExpression || cronExpression === 'disable') {
    return;
  }

  // 驗證 cron 語法是否合法
  if (!cron.validate(cronExpression)) {
    logger.error(`[Schedule Scanner] 無效的 Cron 語法: "${cronExpression}"，取消掛載。`);
    return;
  }

  const job = cron.schedule(cronExpression, async () => {
    // 定時任務觸發時，再次從資料庫抓取最新的排除名單
    let excludeListStr = excludeJson;
    try {
      const gs = await guildSettingsRepository.get(guildId);
      if (gs) excludeListStr = gs.knowledge_exclude;
    } catch (e) {}

    await triggerGuildScan(guildId, client, excludeListStr);
  }, {
    timezone: "Asia/Taipei"
  });

  activeJobs.set(guildId, job);
  logger.info(`[Schedule Scanner] 已成功為伺服器 ${guildId} 掛載定時海巡 (Cron: ${cronExpression})`);
}

/**
 * 動態更新定時排程 (指令異動時呼叫)
 */
async function updateSchedule(guildId, cronExpression, client) {
  try {
    // 獲取最新排除清單
    const gs = await guildSettingsRepository.get(guildId);
    const excludeJson = gs ? gs.knowledge_exclude : '[]';
    
    registerJob(guildId, cronExpression, excludeJson, client);
  } catch (err) {
    logger.error(`[Schedule Scanner] 動態更新排程失敗 (Guild: ${guildId}):`, err);
  }
}

module.exports = {
  initialize,
  updateSchedule,
  triggerGuildScan
};
