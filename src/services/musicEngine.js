const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus,
    entersState,
    StreamType
} = require('@discordjs/voice');
const play = require('play-dl');
const ytdlExec = require('youtube-dl-exec');
const logger = require('../utils/logger');
const fetch = require('node-fetch');
const spotifyInfo = require('spotify-url-info')(fetch);

// 每伺服器獨立的播放隊列狀態
// 格式: guildId => { connection, player, queue: [{ url, title, duration, spData, isSpotify }], current: null, textChannel: null }
const queues = new Map();

function getServerQueue(guildId) {
    if (!queues.has(guildId)) {
        queues.set(guildId, {
            connection: null,
            player: createAudioPlayer(),
            queue: [],
            current: null,
            textChannel: null,
            isPaused: false,
            loopMode: 0, // 0: Off, 1: Song, 2: Queue
            volume: 100, // 1-100
            playerMessage: null,
            playerInterval: null
        });

        const serverQueue = queues.get(guildId);
        
        serverQueue.player.on(AudioPlayerStatus.Idle, () => {
            logger.info(`[Music] 歌曲播放結束 (${guildId})`);
            
            // 處理循環邏輯
            if (serverQueue.current) {
                if (serverQueue.loopMode === 1) {
                    // 單曲循環：放回隊列最前面
                    serverQueue.queue.unshift(serverQueue.current);
                } else if (serverQueue.loopMode === 2) {
                    // 列表循環：放回隊列最後面
                    serverQueue.queue.push(serverQueue.current);
                }
            }
            
            serverQueue.current = null;
            playNext(guildId);
        });

        serverQueue.player.on('error', error => {
            logger.error(`[Music] Player Error (${guildId}):`, error.message);
            if (serverQueue.textChannel) {
                serverQueue.textChannel.send(`❌ 播放時發生錯誤，自動跳過該首歌曲。`);
            }
            serverQueue.current = null;
            playNext(guildId);
        });
    }
    return queues.get(guildId);
}

async function initSpotify() {
    try {
        if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
            await play.setToken({
                spotify: {
                    client_id: process.env.SPOTIFY_CLIENT_ID,
                    client_secret: process.env.SPOTIFY_CLIENT_SECRET,
                    market: 'TW',
                    refresh_token: ''
                }
            });
            logger.info('[Music] Spotify API token initialized via ENV (Market: TW).');
        } else {
            await play.setToken({
                spotify: {
                    client_id: await play.getFreeClientID(),
                    client_secret: '',
                    market: 'TW',
                    refresh_token: ''
                }
            });
            logger.info('[Music] Spotify API initialized with FREE Client ID (Market: TW).');
        }
    } catch (e) {
        logger.error('[Music] Failed to init Spotify token:', e.message);
    }
}

async function enqueueAndPlay(interaction, query) {
    const guildId = interaction.guild.id;
    const serverQueue = getServerQueue(guildId);
    serverQueue.textChannel = interaction.channel;

    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
        return interaction.editReply('❌ 你必須先加入一個語音頻道！');
    }

    if (!serverQueue.connection) {
        try {
            logger.info(`[Music] 嘗試加入語音頻道: ${voiceChannel.id} (Guild: ${guildId})`);
            serverQueue.connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guildId,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                selfDeaf: true,
                selfMute: false
            });
            logger.info(`[Music] 成功發送 joinVoiceChannel 請求`);

            serverQueue.connection.on(VoiceConnectionStatus.Signalling, () => {
                logger.info(`[Music] Voice connection state: Signalling`);
            });
            serverQueue.connection.on(VoiceConnectionStatus.Connecting, () => {
                logger.info(`[Music] Voice connection state: Connecting`);
            });
            serverQueue.connection.on(VoiceConnectionStatus.Ready, () => {
                logger.info(`[Music] Voice connection state: Ready`);
            });

            serverQueue.connection.on(VoiceConnectionStatus.Disconnected, async () => {
                logger.warn(`[Music] Voice connection state: Disconnected`);
                try {
                    await Promise.race([
                        entersState(serverQueue.connection, VoiceConnectionStatus.Signalling, 5_000),
                        entersState(serverQueue.connection, VoiceConnectionStatus.Connecting, 5_000),
                    ]);
                } catch (error) {
                    logger.error(`[Music] Voice connection failed to reconnect, destroying...`);
                    serverQueue.connection.destroy();
                    queues.delete(guildId);
                }
            });

            serverQueue.connection.subscribe(serverQueue.player);
        } catch (e) {
            logger.error(`[Music] joinVoiceChannel throw error:`, e);
            queues.delete(guildId);
            return interaction.editReply(`❌ 無法連接語音頻道: ${e.message}`);
        }
    }

    try {
        let songInfo = [];
        const spValidate = play.sp_validate(query);

        if (spValidate === 'track' || spValidate === 'playlist' || spValidate === 'album') {
            const tracks = await spotifyInfo.getTracks(query);
            if (!tracks || tracks.length === 0) throw new Error('無法解析 Spotify 連結。');

            for (const track of tracks) {
                const durationInSec = Math.floor(track.duration / 1000);
                songInfo.push({
                    title: `${track.name} - ${track.artist}`,
                    url: null, // Lazy loading
                    duration: `${Math.floor(durationInSec / 60)}:${(durationInSec % 60).toString().padStart(2, '0')}`,
                    durationInSec: durationInSec,
                    isSpotify: true,
                    spSearchStr: `${track.name} ${track.artist}`
                });
            }

            if (tracks.length > 1) {
                const details = await spotifyInfo.getPreview(query).catch(() => ({ title: '播放清單' }));
                await interaction.editReply(`🎵 已將歌單 **${details.title}** 中的 ${tracks.length} 首歌曲加入隊列！`);
            } else {
                await interaction.editReply(`🎵 已加入隊列：**${songInfo[0].title}**`);
            }
        } 
        else if (play.yt_validate(query) === 'video') {
            const ytInfo = await play.video_info(query);
            songInfo.push({
                title: ytInfo.video_details.title,
                url: ytInfo.video_details.url,
                duration: ytInfo.video_details.durationRaw,
                durationInSec: ytInfo.video_details.durationInSec,
                isSpotify: false
            });
            await interaction.editReply(`🎵 已加入隊列：**${songInfo[0].title}** (${songInfo[0].duration})`);
        } 
        else if (play.yt_validate(query) === 'playlist') {
            const playlist = await ytdlExec(query, {
                dumpSingleJson: true,
                flatPlaylist: true
            });
            const videos = playlist.entries || [];
            
            for (const video of videos) {
                if (video.title && video.title !== '[Deleted video]' && video.title !== '[Private video]') {
                    const durationInSec = video.duration || 0;
                    songInfo.push({
                        title: video.title,
                        url: video.url,
                        duration: `${Math.floor(durationInSec / 60)}:${(durationInSec % 60).toString().padStart(2, '0')}`,
                        durationInSec: durationInSec,
                        isSpotify: false
                    });
                }
            }
            if (videos.length > 0) {
                await interaction.editReply(`🎵 已將 YouTube 播放清單 **${playlist.title}** 中的 ${videos.length} 首歌曲加入隊列！`);
            } else {
                throw new Error('無法解析該播放清單，或該清單為空/私人清單。');
            }
        }
        else {
            // Keyword search
            const ytRes = await play.search(query, { limit: 1 });
            if (!ytRes || ytRes.length === 0) throw new Error('找不到相關歌曲');
            songInfo.push({
                title: ytRes[0].title,
                url: ytRes[0].url,
                duration: ytRes[0].durationRaw,
                durationInSec: ytRes[0].durationInSec,
                isSpotify: false
            });
            await interaction.editReply(`🎵 已加入隊列：**${songInfo[0].title}** (${songInfo[0].duration})`);
        }

        serverQueue.queue.push(...songInfo);

        if (!serverQueue.current) {
            playNext(guildId);
        }

    } catch (error) {
        logger.error('[Music] Play error:', error);
        return interaction.editReply(`❌ 解析歌曲時發生錯誤：${error.message}`);
    }
}

async function playNext(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue) return;

    if (serverQueue.queue.length === 0) {
        setTimeout(() => {
            const sq = queues.get(guildId);
            if (sq && sq.queue.length === 0 && !sq.current) {
                if (sq.connection) sq.connection.destroy();
                queues.delete(guildId);
                if (sq.textChannel) sq.textChannel.send('🎶 歌曲播放完畢，Gura 要去吃鮭魚了，掰掰！');
            }
        }, 30000);
        return;
    }

    const song = serverQueue.queue.shift();
    serverQueue.current = song;

    try {
        // Lazy Loading: Resolve Spotify to YouTube URL just in time
        if (song.isSpotify && !song.url) {
            const ytRes = await play.search(song.spSearchStr, { limit: 1 });
            if (!ytRes || ytRes.length === 0) throw new Error('找不到對應的 YouTube 影片');
            song.url = ytRes[0].url;
            song.durationInSec = ytRes[0].durationInSec;
        }

        // 取得真實的音訊串流 (使用 yt-dlp 原生管線來繞過 GCP 與簽名演算法封鎖)
        const streamProcess = ytdlExec.exec(song.url, {
            output: '-',
            quiet: true,
            format: 'bestaudio/best',
            limitRate: '5M', // 提高下載速率上限以應對高音質
            noWarnings: true,
            noCallHome: true
        }, { stdio: ['ignore', 'pipe', 'ignore'] });

        streamProcess.on('error', err => logger.error(`[Music Engine] yt-dlp child process error for ${song.title}: ${err.message}`));

        const resource = createAudioResource(streamProcess.stdout, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true
        });
        resource.volume.setVolumeLogarithmic(serverQueue.volume / 100);

        serverQueue.player.play(resource);
        
        if (serverQueue.textChannel) {
            try {
            await serverQueue.textChannel.send(`▶️ 正在播放：**${song.title}** (${song.duration})`);
        } catch (e) {
            logger.warn(`無法發送播放訊息，可能缺乏權限: ${e.message}`);
        }
        }
    } catch (e) {
        logger.error(`[Music] Stream Error for ${song.title}:`, e);
        if (serverQueue.textChannel) {
            serverQueue.textChannel.send(`❌ 播放 **${song.title}** 時發生錯誤，跳過。`);
        }
        playNext(guildId);
    }
}

function skipSong(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue || !serverQueue.current) return false;
    serverQueue.player.stop(); // Triggers Idle -> next song
    return true;
}

function stopMusic(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue) return false;
    serverQueue.queue = [];
    serverQueue.player.stop();
    if (serverQueue.connection) serverQueue.connection.destroy();
    queues.delete(guildId);
    return true;
}

function pauseMusic(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue || !serverQueue.current) return false;
    return serverQueue.player.pause();
}

function resumeMusic(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue || !serverQueue.current) return false;
    return serverQueue.player.unpause();
}

function getStatus(guildId) {
    return queues.get(guildId);
}

function shuffleQueue(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue || serverQueue.queue.length <= 1) return false;
    for (let i = serverQueue.queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [serverQueue.queue[i], serverQueue.queue[j]] = [serverQueue.queue[j], serverQueue.queue[i]];
    }
    return true;
}

function removeFromQueue(guildId, index) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue || index < 0 || index >= serverQueue.queue.length) return false;
    serverQueue.queue.splice(index, 1);
    return true;
}

function clearQueue(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue) return false;
    serverQueue.queue = [];
    return true;
}

function setVolume(guildId, volume) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue) return false;
    serverQueue.volume = Math.max(1, Math.min(100, volume));
    if (serverQueue.player && serverQueue.player._state && serverQueue.player._state.resource) {
        const resource = serverQueue.player._state.resource;
        if (resource.volume) {
            resource.volume.setVolumeLogarithmic(serverQueue.volume / 100);
        }
    }
    return true;
}

function setLoopMode(guildId, mode) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue) return false;
    serverQueue.loopMode = mode;
    return true;
}

function leaveChannel(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue) return false;
    if (serverQueue.playerInterval) clearInterval(serverQueue.playerInterval);
    serverQueue.player.stop();
    if (serverQueue.connection) serverQueue.connection.destroy();
    queues.delete(guildId);
    return true;
}

module.exports = {
    initSpotify,
    enqueueAndPlay,
    playNext,
    skipSong,
    stopMusic,
    pauseMusic,
    resumeMusic,
    getStatus,
    shuffleQueue,
    removeFromQueue,
    clearQueue,
    setVolume,
    setLoopMode,
    leaveChannel
};
