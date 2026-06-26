const { SlashCommandBuilder } = require('discord.js');
const userRepository = require('../db/repositories/UserRepository');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('查詢你與 Gura 的蝦蝦好感度與等級！ (Check your Shrimp Level)'),

  async execute(interaction) {
    await interaction.deferReply();

    const userId = interaction.user.id;
    try {
      const user = await userRepository.getById(userId);

      if (!user) {
        return interaction.editReply('🦐 a... 我對你還不太熟呢！多跟我聊天來增加好感度吧！');
      }

      const nextLevelXp = user.level * 100;
      const progress = Math.floor((user.xp / nextLevelXp) * 10);
      const progressBar = '🟦'.repeat(progress) + '⬜'.repeat(10 - progress);

      const replyMsg = `🔱 **${interaction.user.username} 的蝦蝦檔案** 🔱\n` +
                       `> **等級 (Level)**: ${user.level}\n` +
                       `> **好感度 (XP)**: ${user.xp} / ${nextLevelXp}\n` +
                       `> **進度**: [ ${progressBar} ]\n\n` +
                       `繼續跟我多聊聊吧！`;

      await interaction.editReply(replyMsg);
    } catch (error) {
      logger.error('Rank Command Error:', error);
      await interaction.editReply('❌ 查詢好感度時發生錯誤，請稍後再試。');
    }
  },
};
