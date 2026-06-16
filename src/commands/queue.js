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
            let list = '';
            let count = 0;
            for (const song of status.queue) {
                const titleStr = song.title.length > 60 ? song.title.substring(0, 57) + '...' : song.title;
                const line = `**${count + 1}.** ${titleStr} (${song.duration})\n`;
                if (list.length + line.length > 1000 || count >= 15) break; // 確保在 Discord 限制之內
                list += line;
                count++;
            }
            
            embed.addFields({ 
                name: `即將播放 (還有 ${status.queue.length} 首)`, 
                value: list || '無'
            });
        }

        await interaction.reply({ embeds: [embed] });
    },
};
