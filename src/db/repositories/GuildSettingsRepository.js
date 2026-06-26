const BaseRepository = require('./BaseRepository');

class GuildSettingsRepository extends BaseRepository {
  async get(guildId) {
    return await this.db.get(
      'SELECT reply_cooldown, tag_limit_role_id, tag_limit_hours, tag_disabled_until FROM guild_settings WHERE guild_id = ?',
      [guildId]
    );
  }

  async setReplyCooldown(guildId, seconds) {
    return await this.db.run(
      'INSERT INTO guild_settings (guild_id, reply_cooldown) VALUES (?, ?) ON DUPLICATE KEY UPDATE reply_cooldown = ?',
      [guildId, seconds, seconds]
    );
  }

  async setTagLimit(guildId, roleId, hours) {
    return await this.db.run(
      'INSERT INTO guild_settings (guild_id, tag_limit_role_id, tag_limit_hours, tag_disabled_until) VALUES (?, ?, ?, 0) ON DUPLICATE KEY UPDATE tag_limit_role_id = ?, tag_limit_hours = ?',
      [guildId, roleId, hours, roleId, hours]
    );
  }

  async removeTagLimit(guildId) {
    return await this.db.run(
      'UPDATE guild_settings SET tag_limit_role_id = NULL, tag_disabled_until = 0 WHERE guild_id = ?',
      [guildId]
    );
  }

  async updateTagDisabledUntil(guildId, time) {
    return await this.db.run(
      'UPDATE guild_settings SET tag_disabled_until = ? WHERE guild_id = ?',
      [time, guildId]
    );
  }

  async getExpiredTagLimits(now) {
    return await this.db.all(
      'SELECT guild_id, tag_limit_role_id FROM guild_settings WHERE tag_disabled_until > 0 AND tag_disabled_until <= ?',
      [now]
    );
  }

  async clearTagDisabled(guildId) {
    return await this.db.run(
      'UPDATE guild_settings SET tag_disabled_until = 0 WHERE guild_id = ?',
      [guildId]
    );
  }
}

module.exports = new GuildSettingsRepository();
