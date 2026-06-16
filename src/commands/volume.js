const { SlashCommandBuilder } = require('discord.js');
const musicEngine = require('../services/musicEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('調整音樂播放音量')
        .addIntegerOption(option => 
            option.setName('level')
                .setDescription('音量大小 (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)),
    async execute(interaction) {
        const guildId = interaction.guild.id;
        const volume = interaction.options.getInteger('level');

        const success = musicEngine.setVolume(guildId, volume);
        if (!success) {
            return interaction.reply({ content: '❌ 目前沒有音樂播放中喔！', ephemeral: true });
        }

        await interaction.reply({ content: `🔊 音量已調整為 **${volume}%**` });
    },
};
