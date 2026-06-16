const { SlashCommandBuilder } = require('discord.js');
const musicEngine = require('../services/musicEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('從播放列表中移除一首特定的歌曲')
        .addIntegerOption(option => 
            option.setName('index')
                .setDescription('要移除的歌曲編號 (可透過 /queue 查看)')
                .setRequired(true)),
    async execute(interaction) {
        const guildId = interaction.guild.id;
        const index = interaction.options.getInteger('index') - 1; // 使用者輸入 1-based，轉換為 0-based

        const success = musicEngine.removeFromQueue(guildId, index);
        if (!success) {
            return interaction.reply({ content: '❌ 找不到這首歌曲。請確認你輸入的編號是正確的。', ephemeral: true });
        }

        await interaction.reply({ content: `🗑️ 已成功從列表中移除第 **${index + 1}** 首歌曲！` });
    },
};
