const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const musicEngine = require('../services/musicEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('顯示目前正在播放的歌曲詳細資訊'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const status = musicEngine.getStatus(guildId);
        
        if (!status || !status.current) {
            return interaction.reply({ content: '📭 目前沒有歌曲在播放喔！', ephemeral: true });
        }

        const currentSong = status.current;
        let elapsedStr = "0:00";
        let progressStr = "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬";
        
        if (status.player && status.player.state.playbackDuration > 0) {
            const elapsed = Math.floor(status.player.state.playbackDuration / 1000);
            elapsedStr = `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`;
            
            if (currentSong.durationInSec && currentSong.durationInSec > 0) {
                const percent = Math.min(Math.max(elapsed / currentSong.durationInSec, 0), 1);
                const barLength = 20;
                const pos = Math.round(barLength * percent);
                const bar = "▬".repeat(pos) + "🔘" + "▬".repeat(barLength - pos - 1);
                progressStr = bar;
            }
        }

        const embed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle('🎶 現在正在播放')
            .setDescription(`**${currentSong.title}**\n\n\`${elapsedStr} ${progressStr} ${currentSong.duration}\``)
            .addFields(
                { name: '來源', value: currentSong.isSpotify ? 'Spotify' : 'YouTube', inline: true },
            );

        if (status.current.url) {
            embed.setURL(status.current.url);
        }

        await interaction.reply({ embeds: [embed] });
    },
};
