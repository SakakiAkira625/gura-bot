const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { generateDream } = require('../services/dreamEngine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trigger_dream')
    .setDescription('【管理員專用】強制觸發 Gura 的作夢程序 (供測試與除錯用)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const dreamLog = await generateDream();
      if (dreamLog) {
        await interaction.editReply(`✅ 已成功觸發作夢程序！Gura 今晚的夢境內容已儲存至資料庫，請在一般頻道對她說「早安」來測試。\n\n**夢境預覽**：\n${dreamLog}`);
      } else {
        await interaction.editReply(`❌ 觸發失敗：可能是海馬迴中還沒有足夠的記憶素材，請先和她聊天累積記憶。`);
      }
    } catch (error) {
      await interaction.editReply(`❌ 執行作夢程序時發生錯誤: ${error.message}`);
    }
  },
};
