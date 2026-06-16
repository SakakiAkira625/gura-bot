const { SlashCommandBuilder } = require('discord.js');
const musicEngine = require('../services/musicEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('讓機器人離開語音頻道並清空列表'),
    async execute(interaction) {
        const guildId = interaction.guild.id;

        const success = musicEngine.leaveChannel(guildId);
        if (!success) {
            return interaction.reply({ content: '❌ Gura 已經不在語音頻道裡了啦！', ephemeral: true });
        }

        await interaction.reply({ content: '👋 Gura 退房了！所有歌曲都已經清空，大家掰掰～' });
    },
};
