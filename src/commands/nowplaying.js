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

        // 建立 UI 與進度條更新的函數
        const generatePlayerUI = () => {
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
                    const bar = "▬".repeat(pos) + "🔘" + "▬".repeat(Math.max(0, barLength - pos - 1));
                    progressStr = bar;
                }
            }

            const modes = ['關閉', '單曲循環', '列表循環'];

            const embed = new EmbedBuilder()
                .setColor('#1DB954')
                .setTitle('🎶 現在正在播放')
                .setDescription(`**${currentSong.title}**\n\n\`${elapsedStr} ${progressStr} ${currentSong.duration}\``)
                .addFields(
                    { name: '來源', value: currentSong.isSpotify ? 'Spotify' : 'YouTube', inline: true },
                    { name: '循環模式', value: modes[status.loopMode], inline: true },
                    { name: '音量', value: `${status.volume}%`, inline: true }
                );

            if (currentSong.url) {
                embed.setURL(currentSong.url);
            }

            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('music_pause_play')
                        .setLabel(status.isPaused ? '▶️ 播放' : '⏸️ 暫停')
                        .setStyle(status.isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('music_skip')
                        .setLabel('⏭️ 跳過')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('music_loop')
                        .setLabel('🔁 循環')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('music_shuffle')
                        .setLabel('🔀 洗牌')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('music_stop')
                        .setLabel('⏹️ 停止')
                        .setStyle(ButtonStyle.Danger)
                );

            return { embeds: [embed], components: [row] };
        };

        const initialUI = generatePlayerUI();
        await interaction.reply({ ...initialUI, fetchReply: true });
        
        try {
            const replyMessage = await interaction.fetchReply();
            
            // 清除之前的計時器
            if (status.playerInterval) {
                clearInterval(status.playerInterval);
            }
            
            status.playerMessage = replyMessage;
            
            // 設定定時更新
            status.playerInterval = setInterval(async () => {
                const currentStatus = musicEngine.getStatus(guildId);
                // 檢查是否還有在播，或是訊息是否已經被刪除了
                if (!currentStatus || !currentStatus.current || !currentStatus.playerMessage) {
                    clearInterval(currentStatus?.playerInterval);
                    return;
                }
                
                try {
                    await currentStatus.playerMessage.edit(generatePlayerUI());
                } catch (e) {
                    // 如果被使用者手動刪除了訊息，或者因為其他權限錯誤
                    clearInterval(currentStatus.playerInterval);
                    currentStatus.playerMessage = null;
                }
            }, 5000); // 每 5 秒更新一次
            
        } catch (e) {
            console.error('[Music] 無法啟動進度條更新:', e);
        }
    },
};
