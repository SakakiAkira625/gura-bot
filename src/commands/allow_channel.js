const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const commandChannelRepository = require('../db/repositories/CommandChannelRepository');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('allow_channel')
    .setDescription('設定允許 Gura 進行 AI 對話的文字頻道 (僅限管理員)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // 限制只有管理員可用
    .addStringOption(option =>
      option.setName('action')
        .setDescription('新增或移除')
        .setRequired(true)
        .addChoices(
          { name: '新增 (Add)', value: 'add' },
          { name: '移除 (Remove)', value: 'remove' }
        ))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('目標頻道')
        .setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // 這個指令的回覆預設為悄悄話

    const action = interaction.options.getString('action');
    const targetChannel = interaction.options.getChannel('channel');
    const guildId = interaction.guildId;

    if (!guildId) {
      return interaction.followUp({ content: '❌ 抱歉啦，這個指令只能在伺服器裡面使用喔！' });
    }

    try {
      if (action === 'add') {
        await commandChannelRepository.add(guildId, targetChannel.id);
        return interaction.followUp({ content: `✅ 沒問題！我記住了，以後大家可以在 <#${targetChannel.id}> 叫我執行指令囉！A！` });
      } else if (action === 'remove') {
        await commandChannelRepository.remove(guildId, targetChannel.id);
        return interaction.followUp({ content: `✅ 了解！以後我不會在 <#${targetChannel.id}> 理會指令囉！A！` });
      }
    } catch (error) {
      logger.error('修改頻道權限失敗', error);
      return interaction.followUp({ content: '❌ 哎呀！我的大腦好像又當機了，資料庫寫入失敗...' });
    }
  },
};
