const { SlashCommandBuilder } = require('discord.js');
const musicEngine = require('../services/musicEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('將目前的播放列表順序隨機打亂'),
    async execute(interaction) {
        const guildId = interaction.guild.id;
        
        const success = musicEngine.shuffleQueue(guildId);
        if (!success) {
            return interaction.reply({ content: '❌ 目前列表沒有足夠的歌曲來洗牌喔！', ephemeral: true });
        }

        await interaction.reply({ content: '🔀 播放列表已經成功大洗牌！' });
    },
};
