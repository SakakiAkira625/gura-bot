const logger = require('../utils/logger');
const { deployCommands } = require('../utils/deployCommands');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    logger.info(`Gura 已上線：${client.user.tag}`);
    await deployCommands(client.user.id, process.env.DISCORD_TOKEN);
  },
};
