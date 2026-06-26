const logger = require('../utils/logger');
const { deployCommands } = require('../utils/deployCommands');
const modelManager = require('../services/modelManager');
const { startDreamCronJob } = require('../services/dreamEngine');
const dbManager = require('../db/DBManager');
const guildSettingsRepository = require('../db/repositories/GuildSettingsRepository');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    logger.info(`Gura 已上線：${client.user.tag}`);
    await deployCommands(client.user.id, process.env.DISCORD_TOKEN);
    
    // 初始化資料庫管理核心與連線
    await dbManager.initialize();

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

    // 啟動身分組標註限制檢查排程 (Tag Limit Check)
    setInterval(async () => {
      try {
        const now = Date.now();
        // 找出已到期且需要解除限制的設定
        const records = await guildSettingsRepository.getExpiredTagLimits(now);
        
        for (const row of records) {
          const guild = client.guilds.cache.get(row.guild_id);
          if (guild) {
            const role = guild.roles.cache.get(row.tag_limit_role_id);
            if (role && !role.mentionable) {
              await role.setMentionable(true, 'Tag limit expired');
              logger.info(`伺服器 ${guild.name} 的保護身分組 ${role.name} 已過限制時間，重新開啟 mentionable。`);
            }
          }
          await guildSettingsRepository.clearTagDisabled(row.guild_id);
        }
      } catch (err) {
        logger.error('[Tag Limit Background Task Error]', err);
      }
    }, 60000); // 每 1 分鐘檢查一次
  },
};
