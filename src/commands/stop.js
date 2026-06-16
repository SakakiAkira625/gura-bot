const { SlashCommandBuilder } = require('discord.js');
const musicEngine = require('../services/musicEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('停止播放音樂並讓 Gura 離開語音頻道'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const success = musicEngine.stopMusic(guildId);
        
        if (success) {
            await interaction.reply('🛑 音樂已停止，Gura 要去吃鮭魚了，掰掰！');
        } else {
            await interaction.reply({ content: '❌ Gura 不在語音頻道裡面啦！', ephemeral: true });
        }
    },
};
