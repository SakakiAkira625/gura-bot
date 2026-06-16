const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const musicEngine = require('../services/musicEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('顯示目前的播放隊列 (歌單)'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const status = musicEngine.getStatus(guildId);
        
        if (!status || (!status.current && status.queue.length === 0)) {
            return interaction.reply({ content: '📭 目前沒有歌曲在排隊喔！', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎶 Gura 的播放隊列');

        if (status.current) {
            embed.addFields({ name: '▶️ 正在播放', value: `**${status.current.title}** (${status.current.duration})` });
        }

        if (status.queue.length > 0) {
            // 只顯示前 10 首避免訊息過長
            const list = status.queue.slice(0, 10).map((song, index) => {
                return `**${index + 1}.** ${song.title} (${song.duration})`;
            }).join('\n');
            
            embed.addFields({ 
                name: `即將播放 (還有 ${status.queue.length} 首)`, 
                value: list 
            });
        }

        await interaction.reply({ embeds: [embed] });
    },
};
