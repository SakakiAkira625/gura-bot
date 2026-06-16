const { SlashCommandBuilder } = require('discord.js');
const musicEngine = require('../services/musicEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('清空目前播放列表中的所有等待歌曲'),
    async execute(interaction) {
        const guildId = interaction.guild.id;

        const success = musicEngine.clearQueue(guildId);
        if (!success) {
            return interaction.reply({ content: '❌ 目前沒有建立播放列表喔！', ephemeral: true });
        }

        await interaction.reply({ content: '🧹 播放列表已經完全清空（正在播放的歌曲將繼續播放）。' });
    },
};
