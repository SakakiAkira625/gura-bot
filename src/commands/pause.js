const { SlashCommandBuilder } = require('discord.js');
const musicEngine = require('../services/musicEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('暫停目前正在播放的歌曲'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const success = musicEngine.pauseMusic(guildId);
        
        if (success) {
            await interaction.reply('⏸️ 音樂已暫停！輸入 `/resume` 可以繼續播放。');
        } else {
            await interaction.reply({ content: '❌ 目前沒有音樂在播放，或是已經暫停了！', ephemeral: true });
        }
    },
};
