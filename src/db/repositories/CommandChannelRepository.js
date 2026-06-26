const BaseRepository = require('./BaseRepository');

class CommandChannelRepository extends BaseRepository {
  async getAllowed(guildId) {
    return await this.db.all(
      'SELECT channel_id FROM command_channels WHERE guild_id = ?',
      [guildId]
    );
  }

  async add(guildId, channelId) {
    return await this.db.run(
      'INSERT IGNORE INTO command_channels (guild_id, channel_id) VALUES (?, ?)',
      [guildId, channelId]
    );
  }

  async remove(guildId, channelId) {
    return await this.db.run(
      'DELETE FROM command_channels WHERE guild_id = ? AND channel_id = ?',
      [guildId, channelId]
    );
  }
}

module.exports = new CommandChannelRepository();
