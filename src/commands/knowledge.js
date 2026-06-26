const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const knowledgeRepository = require('../db/repositories/KnowledgeRepository');
const commandChannelRepository = require('../db/repositories/CommandChannelRepository');
const guildScanner = require('../services/guildScanner');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('knowledge')
    .setDescription('管理並查詢伺服器的海巡知識庫')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels) // 限制有管理頻道權限者
    .addSubcommand(subcommand =>
      subcommand
        .setName('scan')
        .setDescription('對指定頻道進行背景海巡掃描，蒐集最近對話重點')
        .addStringOption(option =>
          option.setName('scope')
            .setDescription('海巡範圍 (單一頻道 或 整個伺服器)')
            .setRequired(true)
            .addChoices(
              { name: '僅當前/指定頻道 (Channel)', value: 'channel' },
              { name: '整個伺服器活躍頻道 (Guild)', value: 'guild' }
            ))
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('目標頻道 (僅在範圍為單一頻道時有效，預設為當前頻道)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('查看指定頻道的掃描狀態')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('目標頻道 (預設為當前頻道)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('check')
        .setDescription('預覽指定頻道的近期海巡摘要記錄')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('目標頻道 (預設為當前頻道)')
            .setRequired(false))),
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    
    if (!guildId) {
      return interaction.reply({ content: '❌ 抱歉啦，這個指令只能在伺服器裡面使用喔！', flags: MessageFlags.Ephemeral });
    }

    try {
      if (subcommand === 'scan') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const scope = interaction.options.getString('scope');
        let targetChannels = [];

        if (scope === 'guild') {
          // 取得白名單頻道
          const whitelisted = await commandChannelRepository.getAllowed(guildId);
          if (whitelisted.length > 0) {
            targetChannels = whitelisted
              .map(row => interaction.guild.channels.cache.get(row.channel_id))
              .filter(c => c && c.isTextBased() && c.viewable);
          } else {
            // 否則取前 5 個可存取的文字頻道
            targetChannels = Array.from(interaction.guild.channels.cache.values())
              .filter(c => c.isTextBased() && c.viewable)
              .slice(0, 5);
          }
        } else {
          // 單一頻道
          const channelOption = interaction.options.getChannel('channel');
          const targetChannel = channelOption || interaction.channel;
          
          if (!targetChannel.isTextBased()) {
            return interaction.followUp({ content: '❌ 只能對文字頻道進行海巡喔！' });
          }
          targetChannels = [targetChannel];
        }

        if (targetChannels.length === 0) {
          return interaction.followUp({ content: '❌ 找不到任何可海巡的文字頻道！' });
        }

        // 檢查是否有頻道正在掃描中
        const scanningChannels = [];
        for (const ch of targetChannels) {
          const status = await knowledgeRepository.getScanStatus(ch.id);
          if (status && status.status === 'scanning') {
            scanningChannels.push(ch.name);
          }
        }

        if (scanningChannels.length > 0) {
          return interaction.followUp({ content: `❌ 抱歉啦，以下頻道目前正處於海巡狀態，請等她們結束再叫我海巡喔：\n${scanningChannels.map(name => `#${name}`).join(', ')}` });
        }

        // 初始化頻道進度狀態
        const channelStates = {};
        targetChannels.forEach(ch => {
          channelStates[ch.id] = {
            name: ch.name,
            status: 'pending',
            info: '等待海巡開始...',
            snippet: ''
          };
        });

        // 渲染進度面板
        const renderProgress = () => {
          let completedCount = 0;
          let text = `🦈 **Gura 全面海巡任務開始！**\n\n`;
          
          targetChannels.forEach(ch => {
            const state = channelStates[ch.id];
            let icon = '⏳';
            if (state.status === 'scanning') {
              icon = '🔄';
            } else if (state.status === 'completed') {
              icon = '✅';
              completedCount++;
            } else if (state.status === 'failed') {
              icon = '❌';
              completedCount++;
            }
            
            text += `${icon} **#${state.name}**: ${state.info}\n`;
            if (state.snippet) {
              text += `   └ 💡 *焦點簡報：${state.snippet}*\n`;
            }
          });
          
          const percent = Math.round((completedCount / targetChannels.length) * 100);
          text += `\n**總進度：${percent}%**\n`;
          if (percent === 100) {
            text += `\n🎉 海巡任務圓滿結束！所有情報已寫入我的大腦（海巡知識庫），快來問我關於伺服器的事吧！A！`;
          } else {
            text += `Gura 正在海巡背景搜集情報中，請稍候... 🦈💨`;
          }
          return text;
        };

        // 發送初始進度面板
        await interaction.editReply({ content: renderProgress() });

        // 啟動背景多頻道掃描
        guildScanner.startScan(targetChannels, 1000, (channelId, state) => {
          if (channelStates[channelId]) {
            channelStates[channelId].status = state.status;
            channelStates[channelId].info = state.info;
            channelStates[channelId].snippet = state.snippet;
          }
          
          // 更新 Discord UI
          interaction.editReply({ content: renderProgress() }).catch(err => {
            logger.error('無法更新海巡進度面板：', err);
          });
        });

      } else if (subcommand === 'status') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const channelOption = interaction.options.getChannel('channel');
        const targetChannel = channelOption || interaction.channel;

        if (!targetChannel.isTextBased()) {
          return interaction.followUp({ content: '❌ 只能查詢文字頻道的狀態喔！' });
        }

        const scanStatus = await knowledgeRepository.getScanStatus(targetChannel.id);
        if (!scanStatus) {
          return interaction.followUp({ content: `Gura 還沒有海巡過 <#${targetChannel.id}> 喔！你可以用 \`/knowledge scan\` 啟動海巡。🦈` });
        }

        if (scanStatus.status === 'scanning') {
          return interaction.followUp({ content: `Gura 正在海巡 <#${targetChannel.id}> 中，請再等一下下！🦈💦` });
        } else if (scanStatus.status === 'completed') {
          const timeStr = new Date(scanStatus.updated_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
          return interaction.followUp({ content: `Gura 已經於 \`${timeStr}\` 幫你把 <#${targetChannel.id}> 海巡完畢囉！現在我可以回答關於這頻道的近況問題了！A！🦈✨` });
        } else {
          return interaction.followUp({ content: `嗚... Gura 剛才去海巡 <#${targetChannel.id}> 時好像迷路了，海巡失敗。請再試一次看看！🦈❌` });
        }

      } else if (subcommand === 'check') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const channelOption = interaction.options.getChannel('channel');
        const targetChannel = channelOption || interaction.channel;

        if (!targetChannel.isTextBased()) {
          return interaction.followUp({ content: '❌ 只能查詢文字頻道的摘要喔！' });
        }

        const records = await knowledgeRepository.getKnowledgeByChannel(targetChannel.id, 5);
        if (records.length === 0) {
          return interaction.followUp({ content: `這裡還沒有 <#${targetChannel.id}> 的海巡摘要喔！先用 \`/knowledge scan\` 讓我去搜集情報吧！🦈` });
        }

        let replyContent = `🦈 **<#${targetChannel.id}> 的海巡摘要記錄：**\n\n`;
        records.forEach((record, index) => {
          const timeStr = new Date(record.timestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
          replyContent += `**[記錄 #${index + 1} | ${timeStr}]**\n${record.summary}\n\n`;
        });

        if (replyContent.length > 2000) {
          replyContent = replyContent.slice(0, 1990) + '... (後面還有更多摘要)';
        }

        return interaction.followUp({ content: replyContent });
      }
    } catch (error) {
      logger.error(`執行 /knowledge ${subcommand} 失敗:`, error);
      try {
        await interaction.reply({ content: '❌ 哎呀！我的大腦好像又當機了，處理海巡指令時發生錯誤。', flags: MessageFlags.Ephemeral });
      } catch (e) {
        try {
          await interaction.followUp({ content: '❌ 哎呀！我的大腦好像又當機了，處理海巡指令時發生錯誤。' });
        } catch (e2) {}
      }
    }
  },
};
