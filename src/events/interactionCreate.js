const { MessageFlags } = require('discord.js');
const logger = require('../utils/logger');
const wikiCommand = require('../commands/wiki');
const { franc } = require('franc');
const { detectChinese } = require('../utils/helpers');
const { getDb } = require('../db/database');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    try {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) {
        logger.error(`找不到指令: ${interaction.commandName}`);
        return;
      }



      // 動態抓取第一個選項的值，不管使用者把選項命名成什麼
      const firstOption = interaction.options.data[0];
      const query = firstOption ? firstOption.value : '';
      const langCode = detectChinese(query) ? 'cmn' : franc(query || 'eng');
      
      await command.execute(interaction, query, langCode);
    } catch (error) {
      logger.error('Interaction Error:', error);
      const errorMsg = '抱歉啦，我的大腦剛剛短路了一下！';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMsg, flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.reply({ content: errorMsg, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  },
};
