const logger = require('../utils/logger');
const { deployCommands } = require('../utils/deployCommands');
const modelManager = require('../services/modelManager');
const { startDreamCronJob } = require('../services/dreamEngine');
const { getDb } = require('../db/database');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    logger.info(`Gura 已上線：${client.user.tag}`);
    await deployCommands(client.user.id, process.env.DISCORD_TOKEN);
    
    // 預熱資料庫連線 (避免第一次指令超時)
    await getDb();

    // 同步模型清單並做初步測試
    await modelManager.syncModels();

    // 啟動深夜作夢引擎排程
    startDreamCronJob();

    // 啟動每週模型背景掃描排程
    const { scheduleScanning } = require('../services/modelScanner');
    scheduleScanning();

    // 初始化 Spotify 授權
    const musicEngine = require('../services/musicEngine');
    await musicEngine.initSpotify();
  },
};
