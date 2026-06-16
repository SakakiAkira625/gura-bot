const { SlashCommandBuilder } = require('discord.js');
const musicEngine = require('../services/musicEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('恢復播放剛才暫停的歌曲'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const success = musicEngine.resumeMusic(guildId);
        
        if (success) {
            await interaction.reply('▶️ 音樂已恢復播放！');
        } else {
            await interaction.reply({ content: '❌ 目前沒有被暫停的音樂！', ephemeral: true });
        }
    },
};
