const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getDb } = require('../db/database');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cooldown')
    .setDescription('管理與查詢 AI 回覆的冷卻時間')
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('查詢你目前的冷卻狀態')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('global')
        .setDescription('設定全伺服器的 AI 預設回覆冷卻時間 (管理員專用)')
        .addIntegerOption(option =>
          option.setName('seconds')
            .setDescription('冷卻時間 (秒)，設為 0 代表無冷卻')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('punish')
        .setDescription('強制讓某個使用者進入長效冷卻 (管理員專用)')
        .addUserOption(option =>
          option.setName('target')
            .setDescription('要懲罰的使用者')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('minutes')
            .setDescription('懲罰時間 (分鐘)')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('pardon')
        .setDescription('解除某個使用者的強制冷卻懲罰 (管理員專用)')
        .addUserOption(option =>
          option.setName('target')
            .setDescription('要解除懲罰的使用者')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const db = await getDb();
    const guildId = interaction.guildId;
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    try {
      if (subcommand === 'status') {
        const userId = interaction.user.id;
        const user = await db.get('SELECT last_reply_at, cooldown_until FROM users WHERE id = ?', [userId]);
        
        let settings = { reply_cooldown: 0 };
        if (guildId) {
          const res = await db.get('SELECT reply_cooldown FROM guild_settings WHERE guild_id = ?', [guildId]);
          if (res) settings = res;
        }

        const now = Date.now();
        const messages = [];

        if (user) {
          if (user.cooldown_until && user.cooldown_until > now) {
            const untilDate = new Date(user.cooldown_until).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
            messages.push(`🚨 **你目前正處於強制冷卻懲罰中！**\n解除時間：\`${untilDate}\``);
          } else {
            messages.push(`✅ 你目前沒有被懲罰。`);
          }

          if (settings.reply_cooldown > 0) {
            const lastReply = user.last_reply_at || 0;
            const timeSinceLastReply = Math.floor((now - lastReply) / 1000);
            const remainingGlobal = settings.reply_cooldown - timeSinceLastReply;
            if (remainingGlobal > 0) {
              messages.push(`⏳ **全域冷卻中：** 距離你能再次獲得 AI 回覆還有 \`${remainingGlobal}\` 秒。`);
            } else {
              messages.push(`🟢 全域冷卻已就緒，AI 可以隨時回覆你！`);
            }
          } else {
            messages.push(`🟢 本伺服器目前沒有設定全域冷卻。`);
          }
        } else {
          messages.push('🔍 目前資料庫中還沒有你的紀錄（你可能還沒跟 AI 互動過）。');
        }

        await interaction.reply({ content: messages.join('\n\n'), flags: 64 }); // Ephemeral reply
      }

      else if (subcommand === 'global') {
        if (!isAdmin) return interaction.reply({ content: '❌ 只有管理員可以使用此指令。', flags: 64 });
        if (!guildId) return interaction.reply({ content: '❌ 此指令只能在伺服器內使用。', flags: 64 });

        const seconds = interaction.options.getInteger('seconds');
        
        await db.run('INSERT INTO guild_settings (guild_id, reply_cooldown) VALUES (?, ?) ON DUPLICATE KEY UPDATE reply_cooldown = ?', [guildId, seconds, seconds]);
        await interaction.reply(`✅ 已將本伺服器的 AI 預設回覆冷卻時間設定為 **${seconds} 秒**。`);
      }

      else if (subcommand === 'punish') {
        if (!isAdmin) return interaction.reply({ content: '❌ 只有管理員可以使用此指令。', flags: 64 });

        const target = interaction.options.getUser('target');
        const minutes = interaction.options.getInteger('minutes');
        const cooldownUntil = Date.now() + (minutes * 60 * 1000);
        const untilDate = new Date(cooldownUntil).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

        // 確保使用者存在於 users 表格中
        await db.run('INSERT IGNORE INTO users (id) VALUES (?)', [target.id]);
        await db.run('UPDATE users SET cooldown_until = ? WHERE id = ?', [cooldownUntil, target.id]);

        await interaction.reply(`🚨 已對 ${target} 實施強制冷卻，直到 **${untilDate}** 為止機器人都不會理會他。`);
      }

      else if (subcommand === 'pardon') {
        if (!isAdmin) return interaction.reply({ content: '❌ 只有管理員可以使用此指令。', flags: 64 });

        const target = interaction.options.getUser('target');
        await db.run('UPDATE users SET cooldown_until = 0 WHERE id = ?', [target.id]);

        await interaction.reply(`✅ 已解除 ${target} 的強制冷卻懲罰。`);
      }

    } catch (error) {
      logger.error('[Cooldown Command Error]', error);
      await interaction.reply({ content: '執行指令時發生錯誤，請稍後再試。', flags: 64 });
    }
  },
};
