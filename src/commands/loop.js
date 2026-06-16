const { SlashCommandBuilder } = require('discord.js');
const musicEngine = require('../services/musicEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('設定音樂循環模式')
        .addStringOption(option => 
            option.setName('mode')
                .setDescription('選擇循環模式')
                .setRequired(true)
                .addChoices(
                    { name: '關閉 (Off)', value: '0' },
                    { name: '單曲循環 (Song)', value: '1' },
                    { name: '列表循環 (Queue)', value: '2' }
                )),
    async execute(interaction) {
        const guildId = interaction.guild.id;
        const modeStr = interaction.options.getString('mode');
        const mode = parseInt(modeStr);

        const success = musicEngine.setLoopMode(guildId, mode);
        if (!success) {
            return interaction.reply({ content: '❌ 目前沒有音樂播放中喔！', ephemeral: true });
        }

        const modeNames = ['關閉', '單曲循環', '列表循環'];
        await interaction.reply({ content: `🔁 循環模式已切換為：**${modeNames[mode]}**` });
    },
};
