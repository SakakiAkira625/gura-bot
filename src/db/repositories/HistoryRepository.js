const BaseRepository = require('./BaseRepository');

class HistoryRepository extends BaseRepository {
  async add(userId, channelId, role, content, timestamp = Date.now()) {
    return await this.db.run(
      'INSERT INTO history (user_id, channel_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)',
      [userId, channelId, role, content, timestamp]
    );
  }

  async getRecent(channelId, limit = 10) {
    return await this.db.all(
      'SELECT role, content, timestamp FROM history WHERE channel_id = ? ORDER BY timestamp DESC LIMIT ?',
      [channelId, limit]
    );
  }

  async getUnsummarized(userId, channelId) {
    return await this.db.all(
      'SELECT id, role, content FROM history WHERE user_id = ? AND channel_id = ? AND is_summarized = 0 ORDER BY timestamp ASC',
      [userId, channelId]
    );
  }

  async markAsSummarized(ids) {
    if (!ids || ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    return await this.db.run(
      `UPDATE history SET is_summarized = 1 WHERE id IN (${placeholders})`,
      ids
    );
  }
}

module.exports = new HistoryRepository();
