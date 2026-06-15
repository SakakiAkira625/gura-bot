const logger = require('../utils/logger');
const { deployCommands } = require('../utils/deployCommands');
const modelManager = require('../services/modelManager');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    logger.info(`Gura 已上線：${client.user.tag}`);
    await deployCommands(client.user.id, process.env.DISCORD_TOKEN);
    
    // 同步模型清單並做初步測試
    await modelManager.syncModels();
  },
};
