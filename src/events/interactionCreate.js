const { MessageFlags } = require('discord.js');
const logger = require('../utils/logger');
const wikiCommand = require('../commands/wiki');
const { franc } = require('franc');
const { detectChinese } = require('../utils/helpers');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (interaction.isButton()) {
      const musicEngine = require('../services/musicEngine');
      const guildId = interaction.guildId;
      
      try {
        if (interaction.customId === 'music_pause_play') {
          const status = musicEngine.getStatus(guildId);
          if (!status || !status.current) return interaction.reply({ content: '❌ 目前沒有音樂播放中。', ephemeral: true });
          
          if (status.isPaused) {
            musicEngine.resumeMusic(guildId);
            status.isPaused = false;
            await interaction.reply({ content: '▶️ 已恢復播放音樂。', ephemeral: true });
          } else {
            musicEngine.pauseMusic(guildId);
            status.isPaused = true;
            await interaction.reply({ content: '⏸️ 已暫停播放音樂。', ephemeral: true });
          }
        } else if (interaction.customId === 'music_skip') {
          if (musicEngine.skipSong(guildId)) {
            await interaction.reply({ content: '⏭️ 已跳過目前歌曲。', ephemeral: true });
          } else {
            await interaction.reply({ content: '❌ 無法跳過，或這是最後一首歌。', ephemeral: true });
          }
        } else if (interaction.customId === 'music_loop') {
          const status = musicEngine.getStatus(guildId);
          if (!status) return interaction.reply({ content: '❌ 目前沒有音樂播放中。', ephemeral: true });
          
          status.loopMode = (status.loopMode + 1) % 3;
          const modes = ['關閉', '單曲循環', '列表循環'];
          await interaction.reply({ content: `🔁 循環模式已切換為：**${modes[status.loopMode]}**`, ephemeral: true });
        } else if (interaction.customId === 'music_shuffle') {
          if (musicEngine.shuffleQueue(guildId)) {
            await interaction.reply({ content: '🔀 已打亂隊列順序！', ephemeral: true });
          } else {
            await interaction.reply({ content: '❌ 隊列中沒有足夠的歌曲來洗牌。', ephemeral: true });
          }
        } else if (interaction.customId === 'music_stop') {
          musicEngine.stopMusic(guildId);
          await interaction.reply({ content: '⏹️ 已停止播放並清空隊列。', ephemeral: true });
        }
      } catch (err) {
        logger.error('Button Interaction Error:', err);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    try {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) {
        logger.error(`找不到指令: ${interaction.commandName}`);
        return;
      }



      // 動態抓取第一個選項的值，不管使用者把選項命名成什麼
      const firstOption = interaction.options.data[0];
      const query = firstOption ? firstOption.value : '';
      const langCode = detectChinese(query) ? 'cmn' : franc(query || 'eng');
      
      await command.execute(interaction, query, langCode);
    } catch (error) {
      logger.error('Interaction Error:', error);
      const errorMsg = '抱歉啦，我的大腦剛剛短路了一下！';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMsg, flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.reply({ content: errorMsg, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  },
};
