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

      // 檢查頻道限制 (管理員設定頻道權限的指令永遠放行)
      if (interaction.commandName !== 'allow_channel' && interaction.guildId) {
        const db = await getDb();
        // 取得該伺服器所有允許的頻道清單
        const allowedChannels = await db.all(
          'SELECT channel_id FROM command_channels WHERE guild_id = ?',
          [interaction.guildId]
        );

        if (allowedChannels.length > 0) {
          const isAllowed = allowedChannels.some(row => row.channel_id === interaction.channelId);
          if (!isAllowed) {
            return interaction.reply({
              content: '❌ 抱歉啦 Shaark！這個指令只能在指定的頻道使用喔！A！',
              flags: MessageFlags.Ephemeral
            });
          }
        }
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
