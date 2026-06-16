const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus,
    entersState
} = require('@discordjs/voice');
const play = require('play-dl');
const logger = require('../utils/logger');

// 每伺服器獨立的播放隊列狀態
// 格式: guildId => { connection, player, queue: [{ url, title, duration, ... }], current: null }
const queues = new Map();

/**
 * 取得或初始化伺服器的播放狀態
 */
function getServerQueue(guildId) {
    if (!queues.has(guildId)) {
        queues.set(guildId, {
            connection: null,
            player: createAudioPlayer(),
            queue: [],
            current: null,
            textChannel: null
        });

        const serverQueue = queues.get(guildId);
        
        // 監聽播放器狀態
        serverQueue.player.on(AudioPlayerStatus.Idle, () => {
            logger.info(`[Music] 歌曲播放結束 (${guildId})`);
            serverQueue.current = null;
            playNext(guildId);
        });

        serverQueue.player.on('error', error => {
            logger.error(`[Music] Player Error (${guildId}):`, error.message);
            serverQueue.current = null;
            playNext(guildId);
        });
    }
    return queues.get(guildId);
}

/**
 * 授權 Spotify API (如果環境變數有提供)
 */
async function initSpotify() {
    if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
        try {
            await play.setToken({
                spotify: {
                    client_id: process.env.SPOTIFY_CLIENT_ID,
                    client_secret: process.env.SPOTIFY_CLIENT_SECRET,
                    market: 'US',
                    refresh_token: '', // play-dl 會自動處理 client credentials flow
                }
            });
            logger.info('[Music] Spotify API token initialized successfully.');
        } catch (e) {
            logger.error('[Music] Failed to init Spotify token:', e.message);
        }
    } else {
        logger.warn('[Music] No SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET provided. Spotify links might not work.');
    }
}

/**
 * 將歌曲加入隊列並嘗試播放
 */
async function enqueueAndPlay(interaction, query) {
    const guildId = interaction.guild.id;
    const serverQueue = getServerQueue(guildId);
    serverQueue.textChannel = interaction.channel;

    // 連線到語音頻道 (User 要求的 deafen = true, mute = false)
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
        return interaction.editReply('❌ 你必須先加入一個語音頻道！');
    }

    if (!serverQueue.connection) {
        try {
            serverQueue.connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guildId,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                selfDeaf: true,
                selfMute: false
            });

            serverQueue.connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
                try {
                    await Promise.race([
                        entersState(serverQueue.connection, VoiceConnectionStatus.Signalling, 5_000),
                        entersState(serverQueue.connection, VoiceConnectionStatus.Connecting, 5_000),
                    ]);
                } catch (error) {
                    serverQueue.connection.destroy();
                    queues.delete(guildId);
                }
            });

            serverQueue.connection.subscribe(serverQueue.player);
        } catch (e) {
            queues.delete(guildId);
            return interaction.editReply(`❌ 無法連接語音頻道: ${e.message}`);
        }
    }

    try {
        let songInfo = [];

        // 判斷是否為 Spotify 連結
        if (play.sp_validate(query) === 'track') {
            if (play.is_expired()) {
                await play.refreshToken();
            }
            const spData = await play.spotify(query);
            const searchStr = `${spData.name} ${spData.artists.map(a => a.name).join(' ')}`;
            const ytRes = await play.search(searchStr, { limit: 1 });
            if (!ytRes || ytRes.length === 0) throw new Error('找不到對應的 YouTube 影片');
            
            songInfo.push({
                title: spData.name,
                url: ytRes[0].url,
                duration: ytRes[0].durationRaw
            });
        } 
        // 判斷是否為 YouTube 連結
        else if (play.yt_validate(query) === 'video') {
            const ytInfo = await play.video_info(query);
            songInfo.push({
                title: ytInfo.video_details.title,
                url: ytInfo.video_details.url,
                duration: ytInfo.video_details.durationRaw
            });
        } 
        // 其他視為關鍵字搜尋
        else {
            const ytRes = await play.search(query, { limit: 1 });
            if (!ytRes || ytRes.length === 0) throw new Error('找不到相關歌曲');
            songInfo.push({
                title: ytRes[0].title,
                url: ytRes[0].url,
                duration: ytRes[0].durationRaw
            });
        }

        serverQueue.queue.push(...songInfo);

        if (songInfo.length === 1) {
            await interaction.editReply(`🎵 已加入隊列：**${songInfo[0].title}** (${songInfo[0].duration})`);
        } else {
            await interaction.editReply(`🎵 已加入隊列：多首歌曲`);
        }

        // 如果目前沒有正在播放，就開始播
        if (!serverQueue.current) {
            playNext(guildId);
        }

    } catch (error) {
        logger.error('[Music] Play error:', error);
        return interaction.editReply(`❌ 解析歌曲時發生錯誤：${error.message}`);
    }
}

/**
 * 播放下一首歌
 */
async function playNext(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue) return;

    if (serverQueue.queue.length === 0) {
        // 如果沒有歌了，延遲 30 秒後若還是沒有歌就離開
        setTimeout(() => {
            const sq = queues.get(guildId);
            if (sq && sq.queue.length === 0 && !sq.current) {
                if (sq.connection) {
                    sq.connection.destroy();
                }
                queues.delete(guildId);
                if (sq.textChannel) {
                    sq.textChannel.send('🎶 歌曲播放完畢，Gura 要去吃鮭魚了，掰掰！');
                }
            }
        }, 30000);
        return;
    }

    // 拿出第一首
    const song = serverQueue.queue.shift();
    serverQueue.current = song;

    try {
        const stream = await play.stream(song.url);
        const resource = createAudioResource(stream.stream, { inputType: stream.type });
        serverQueue.player.play(resource);
        
        if (serverQueue.textChannel) {
            serverQueue.textChannel.send(`▶️ 正在播放：**${song.title}** (${song.duration})`);
        }
    } catch (e) {
        logger.error(`[Music] Stream Error for ${song.title}:`, e);
        if (serverQueue.textChannel) {
            serverQueue.textChannel.send(`❌ 播放 **${song.title}** 時發生錯誤，跳過。`);
        }
        playNext(guildId);
    }
}

/**
 * 跳過當前歌曲
 */
function skipSong(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue || !serverQueue.current) return false;
    serverQueue.player.stop(); // 觸發 Idle 事件自動播下一首
    return true;
}

/**
 * 停止播放並離開
 */
function stopMusic(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue) return false;
    
    serverQueue.queue = [];
    serverQueue.player.stop();
    if (serverQueue.connection) {
        serverQueue.connection.destroy();
    }
    queues.delete(guildId);
    return true;
}

/**
 * 取得當前播放狀態
 */
function getStatus(guildId) {
    return queues.get(guildId);
}

module.exports = {
    initSpotify,
    enqueueAndPlay,
    playNext,
    skipSong,
    stopMusic,
    getStatus
};
