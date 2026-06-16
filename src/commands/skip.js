const { SlashCommandBuilder } = require('discord.js');
const musicEngine = require('../services/musicEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('跳過當前正在播放的歌曲'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const success = musicEngine.skipSong(guildId);
        
        if (success) {
            await interaction.reply('⏭️ 已跳過當前歌曲！');
        } else {
            await interaction.reply({ content: '❌ 沒東西可以跳過啊，笨蛋！', ephemeral: true });
        }
    },
};
