const BaseRepository = require('./BaseRepository');

class KnowledgeRepository extends BaseRepository {
  /**
   * 取得指定頻道的掃描狀態
   * @param {string} channelId 
   */
  async getScanStatus(channelId) {
    return await this.db.get(
      'SELECT * FROM knowledge_scans WHERE channel_id = ?',
      [channelId]
    );
  }

  /**
   * 更新或插入頻道的掃描狀態
   * @param {string} channelId 
   * @param {string} guildId 
   * @param {string|null} lastScannedMsgId 
   * @param {string} status 
   */
  async updateScanStatus(channelId, guildId, lastScannedMsgId, status) {
    const now = Date.now();
    return await this.db.run(
      `INSERT INTO knowledge_scans (channel_id, guild_id, last_scanned_message_id, status, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         last_scanned_message_id = VALUES(last_scanned_message_id),
         status = VALUES(status),
         updated_at = VALUES(updated_at)`,
      [channelId, guildId, lastScannedMsgId, status, now]
    );
  }

  /**
   * 儲存單次掃描區間的對話摘要
   * @param {string} guildId 
   * @param {string} channelId 
   * @param {string} summary 
   * @param {string} startMsgId 
   * @param {string} endMsgId 
   * @param {number} msgCount 
   * @param {number} timestamp 
   */
  async saveKnowledge(guildId, channelId, summary, startMsgId, endMsgId, msgCount, timestamp) {
    return await this.db.run(
      `INSERT INTO guild_knowledge (guild_id, channel_id, summary, start_message_id, end_message_id, message_count, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [guildId, channelId, summary, startMsgId, endMsgId, msgCount, timestamp]
    );
  }

  /**
   * 取得該伺服器的近期海巡摘要
   * @param {string} guildId 
   * @param {number} limit 
   */
  async getKnowledgeByGuild(guildId, limit = 10) {
    return await this.db.all(
      `SELECT gk.*
       FROM guild_knowledge gk
       INNER JOIN (
         SELECT channel_id, MAX(timestamp) as max_ts
         FROM guild_knowledge
         WHERE guild_id = ?
         GROUP BY channel_id
       ) latest ON gk.channel_id = latest.channel_id AND gk.timestamp = latest.max_ts
       ORDER BY gk.timestamp DESC
       LIMIT ?`,
      [guildId, limit]
    );
  }

  /**
   * 取得特定頻道的近期海巡摘要
   * @param {string} channelId 
   * @param {number} limit 
   */
  async getKnowledgeByChannel(channelId, limit = 10) {
    return await this.db.all(
      'SELECT * FROM guild_knowledge WHERE channel_id = ? ORDER BY timestamp DESC LIMIT ?',
      [channelId, limit]
    );
  }

  /**
   * 清除特定頻道的現有海巡知識
   * @param {string} channelId 
   */
  async clearKnowledge(channelId) {
    return await this.db.run(
      'DELETE FROM guild_knowledge WHERE channel_id = ?',
      [channelId]
    );
  }
}

module.exports = new KnowledgeRepository();
