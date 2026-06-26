const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const cron = require('node-cron');
const knowledgeRepository = require('../db/repositories/KnowledgeRepository');
const commandChannelRepository = require('../db/repositories/CommandChannelRepository');
const guildSettingsRepository = require('../db/repositories/GuildSettingsRepository');
const guildScanner = require('../services/guildScanner');
const scheduleScanner = require('../services/scheduleScanner');
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
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('exclude')
        .setDescription('管理海巡排除頻道名單')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('操作動作 (新增、移除或查看)')
            .setRequired(true)
            .addChoices(
              { name: '新增排除 (Add)', value: 'add' },
              { name: '移除排除 (Remove)', value: 'remove' },
              { name: '查看列表 (List)', value: 'list' }
            ))
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('目標頻道 (查看列表時可忽略)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('schedule')
        .setDescription('設定定時自動海巡排程 (Crontab 格式)')
        .addStringOption(option =>
          option.setName('cron')
            .setDescription('Cron 表達式 (例如 "0 4 * * 0" 代表每週日凌晨 4 點) 或輸入 "disable" 停用')
            .setRequired(true))),
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

        // 取得排除名單
        const gs = await guildSettingsRepository.get(guildId);
        const excludedIds = JSON.parse(gs && gs.knowledge_exclude ? gs.knowledge_exclude : '[]');

        if (scope === 'guild') {
          // 取得白名單頻道
          const whitelisted = await commandChannelRepository.getAllowed(guildId);
          if (whitelisted.length > 0) {
            targetChannels = whitelisted
              .map(row => interaction.guild.channels.cache.get(row.channel_id))
              .filter(c => c && c.isTextBased() && c.viewable);
          } else {
            // 否則取所有文字頻道
            targetChannels = Array.from(interaction.guild.channels.cache.values())
              .filter(c => c.isTextBased() && c.viewable);
          }
          
          // 過濾排除頻道
          targetChannels = targetChannels.filter(c => !excludedIds.includes(c.id));
          // 限制最多掃描 5 個活躍頻道
          targetChannels.sort((a, b) => {
            const idA = a.lastMessageId || '0';
            const idB = b.lastMessageId || '0';
            return idB.localeCompare(idA);
          });
          targetChannels = targetChannels.slice(0, 5);

        } else {
          // 單一頻道
          const channelOption = interaction.options.getChannel('channel');
          const targetChannel = channelOption || interaction.channel;
          
          if (!targetChannel.isTextBased()) {
            return interaction.followUp({ content: '❌ 只能對文字頻道進行海巡喔！' });
          }
          
          if (excludedIds.includes(targetChannel.id)) {
            return interaction.followUp({ content: `⚠️ 警告：<#${targetChannel.id}> 目前在海巡排除名單中，但因為你指定掃描此頻道，Gura 仍會執行海巡！` });
          }

          targetChannels = [targetChannel];
        }

        if (targetChannels.length === 0) {
          return interaction.followUp({ content: '❌ 找不到任何可海巡的文字頻道 (或已被排除名單全部過濾)！' });
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

      } else if (subcommand === 'exclude') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const action = interaction.options.getString('action');
        const targetChannel = interaction.options.getChannel('channel');

        const gs = await guildSettingsRepository.get(guildId);
        let excluded = JSON.parse(gs && gs.knowledge_exclude ? gs.knowledge_exclude : '[]');

        if (action === 'add') {
          if (!targetChannel) {
            return interaction.followUp({ content: '❌ 請指定要排除的文字頻道！' });
          }
          if (!targetChannel.isTextBased()) {
            return interaction.followUp({ content: '❌ 只能排除文字頻道喔！' });
          }
          if (!excluded.includes(targetChannel.id)) {
            excluded.push(targetChannel.id);
            await guildSettingsRepository.updateKnowledgeExclude(guildId, excluded);
          }
          return interaction.followUp({ content: `✅ 沒問題！我記住了，以後定時海巡或全面海巡時會自動跳過 <#${targetChannel.id}> 囉！A！` });

        } else if (action === 'remove') {
          if (!targetChannel) {
            return interaction.followUp({ content: '❌ 請指定要重新納入海巡的文字頻道！' });
          }
          excluded = excluded.filter(id => id !== targetChannel.id);
          await guildSettingsRepository.updateKnowledgeExclude(guildId, excluded);
          return interaction.followUp({ content: `✅ 了解！以後全面海巡時會重新將 <#${targetChannel.id}> 納入我的海巡路線囉！A！` });

        } else if (action === 'list') {
          if (excluded.length === 0) {
            return interaction.followUp({ content: '🦈 目前沒有任何頻道被排入海巡排除名單中喔！' });
          }
          const listStr = excluded.map(id => `<#${id}>`).join(', ');
          return interaction.followUp({ content: `🦈 **當前海巡排除頻道名單：**\n${listStr}` });
        }

      } else if (subcommand === 'schedule') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const cronStr = interaction.options.getString('cron').trim();

        if (cronStr !== 'disable' && !cron.validate(cronStr)) {
          return interaction.followUp({ content: '❌ 無效的 Crontab 語法！例如可以使用 `"0 4 * * 0"` 代表每週日凌晨 4 點定時海巡，或者輸入 `"disable"` 停用定時功能。' });
        }

        // 更新資料庫
        await guildSettingsRepository.updateKnowledgeCron(guildId, cronStr);
        // 動態重載記憶體內的 cron 任務
        await scheduleScanner.updateSchedule(guildId, cronStr, interaction.client);

        if (cronStr === 'disable') {
          return interaction.followUp({ content: '✅ 已經停用此伺服器的定時自動海巡排程囉！🦈' });
        } else {
          return interaction.followUp({ content: `✅ 設定成功！我已將本伺服器的定時自動海巡設定為 \`${cronStr}\`。時間一到我會自動巡邏！A！🦈✨` });
        }
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
