const logger = require('../utils/logger');
const { deployCommands } = require('../utils/deployCommands');
const modelManager = require('../services/modelManager');
const { startDreamCronJob } = require('../services/dreamEngine');
const { getDb } = require('../db/database');

module.exports = {
  name: 'ready',
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

    // 啟動身分組標註限制檢查排程 (Tag Limit Check)
    setInterval(async () => {
      try {
        const db = await getDb();
        const now = Date.now();
        // 找出已到期且需要解除限制的設定
        const records = await db.all('SELECT guild_id, tag_limit_role_id FROM guild_settings WHERE tag_disabled_until > 0 AND tag_disabled_until <= ?', [now]);
        
        for (const row of records) {
          const guild = client.guilds.cache.get(row.guild_id);
          if (guild) {
            const role = guild.roles.cache.get(row.tag_limit_role_id);
            if (role && !role.mentionable) {
              await role.setMentionable(true, 'Tag limit expired');
              logger.info(`伺服器 ${guild.name} 的保護身分組 ${role.name} 已過限制時間，重新開啟 mentionable。`);
            }
          }
          await db.run('UPDATE guild_settings SET tag_disabled_until = 0 WHERE guild_id = ?', [row.guild_id]);
        }
      } catch (err) {
        logger.error('[Tag Limit Background Task Error]', err);
      }
    }, 60000); // 每 1 分鐘檢查一次
  },
};
