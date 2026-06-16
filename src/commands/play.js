const { SlashCommandBuilder } = require('discord.js');
const musicEngine = require('../services/musicEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('讓 Gura 播歌給你聽！(支援 YouTube, Spotify 或關鍵字)')
        .addStringOption(option => 
            option.setName('query')
                .setDescription('歌曲連結或搜尋關鍵字')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();
        const query = interaction.options.getString('query');
        await musicEngine.enqueueAndPlay(interaction, query);
    },
};
