const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const guildSettingsRepository = require('../db/repositories/GuildSettingsRepository');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('taglimit')
    .setDescription('管理身分組標註限制系統')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('設定要保護的身分組與限制時數')
        .addRoleOption(option =>
          option.setName('target')
            .setDescription('選擇要保護的身分組')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('hours')
            .setDescription('觸發後要關閉標註幾個小時')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('關閉並移除保護設定')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('查詢目前設定與倒數計時')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (!guildId) return interaction.reply({ content: '❌ 此指令只能在伺服器內使用。', flags: 64 });

    try {
      if (subcommand === 'set') {
        const role = interaction.options.getRole('target');
        const hours = interaction.options.getInteger('hours');
        
        await guildSettingsRepository.setTagLimit(guildId, role.id, hours);
        
        await interaction.reply(`✅ 已將 ${role} 設為受保護身分組。若有人（非管理員）標註此身分組，該身分組將自動關閉標註功能 **${hours} 小時**。`);
      }
      
      else if (subcommand === 'remove') {
        await guildSettingsRepository.removeTagLimit(guildId);
        await interaction.reply('✅ 已關閉並移除身分組保護功能。');
      }
      
      else if (subcommand === 'status') {
        const gs = await guildSettingsRepository.get(guildId);
        
        if (!gs || !gs.tag_limit_role_id) {
          return interaction.reply({ content: '本伺服器尚未啟用身分組標註限制功能。', flags: 64 });
        }

        const role = interaction.guild.roles.cache.get(gs.tag_limit_role_id);
        const roleName = role ? role.name : '未知身分組';
        const now = Date.now();
        
        let msg = `🛡️ **身分組保護狀態**\n受保護身分組: <@&${gs.tag_limit_role_id}> (${roleName})\n限制時間: **${gs.tag_limit_hours} 小時**\n`;

        if (gs.tag_disabled_until > now) {
          const untilDate = new Date(gs.tag_disabled_until).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
          msg += `\n🚨 **當前觸發中**：此身分組已被暫時禁止標註，直到 \`${untilDate}\` 才會自動恢復。`;
        } else {
          msg += `\n🟢 目前正常，允許標註中。`;
        }
        
        await interaction.reply({ content: msg, flags: 64 });
      }

    } catch (error) {
      logger.error('[TagLimit Command Error]', error);
      await interaction.reply({ content: '執行指令時發生錯誤，請稍後再試。', flags: 64 });
    }
  },
};
