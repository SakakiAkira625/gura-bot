const logger = require('../utils/logger');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    logger.info(`Gura 已上線：${client.user.tag}`);
  },
};
