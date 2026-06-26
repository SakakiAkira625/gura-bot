const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const knowledgeRepository = require('../db/repositories/KnowledgeRepository');
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
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('目標頻道 (預設為當前頻道)')
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

    const channelOption = interaction.options.getChannel('channel');
    const targetChannel = channelOption || interaction.channel;

    // 檢查是否為文字頻道
    if (!targetChannel.isTextBased()) {
      return interaction.reply({ content: '❌ 只能對文字頻道進行海巡喔！', flags: MessageFlags.Ephemeral });
    }

    try {
      if (subcommand === 'scan') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const scanStatus = await knowledgeRepository.getScanStatus(targetChannel.id);
        if (scanStatus && scanStatus.status === 'scanning') {
          return interaction.followUp({ content: `❌ 頻道 <#${targetChannel.id}> 目前正在海巡中，請不要重複叫我做事啦！🦈` });
        }

        // 開始背景掃描
        guildScanner.startScan(targetChannel);
        return interaction.followUp({ content: `✅ 收到！Gura 現在要去海巡 <#${targetChannel.id}> 囉！這需要花一點時間，你可以稍後用 \`/knowledge status\` 查看進度喔！🦈💨` });

      } else if (subcommand === 'status') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
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
        
        const records = await knowledgeRepository.getKnowledgeByChannel(targetChannel.id, 5);
        if (records.length === 0) {
          return interaction.followUp({ content: `這裡還沒有 <#${targetChannel.id}> 的海巡摘要喔！先用 \`/knowledge scan\` 讓我去搜集情報吧！🦈` });
        }

        let replyContent = `🦈 **<#${targetChannel.id}> 的海巡摘要記錄：**\n\n`;
        records.forEach((record, index) => {
          const timeStr = new Date(record.timestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
          replyContent += `**[記錄 #${index + 1} | ${timeStr}]**\n${record.summary}\n\n`;
        });

        // 確保不超過 2000 限制
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
