const BaseRepository = require('./BaseRepository');

class UserRepository extends BaseRepository {
  async getById(id) {
    return await this.db.get('SELECT * FROM users WHERE id = ?', [id]);
  }

  async create(id, now = Date.now()) {
    await this.db.run(
      'INSERT INTO users (id, xp, level, last_message_at) VALUES (?, 0, 1, ?)',
      [id, now]
    );
    return { id, xp: 0, level: 1, last_message_at: now, last_reply_at: 0, cooldown_until: 0 };
  }

  async createIgnore(id) {
    return await this.db.run('INSERT IGNORE INTO users (id) VALUES (?)', [id]);
  }

  async updateXpAndLevel(id, xp, level, lastMessageAt) {
    return await this.db.run(
      'UPDATE users SET xp = ?, level = ?, last_message_at = ? WHERE id = ?',
      [xp, level, lastMessageAt, id]
    );
  }

  async updateCooldown(id, cooldownUntil) {
    return await this.db.run(
      'UPDATE users SET cooldown_until = ? WHERE id = ?',
      [cooldownUntil, id]
    );
  }

  async updateLastReply(id, lastReplyAt) {
    return await this.db.run(
      'UPDATE users SET last_reply_at = ? WHERE id = ?',
      [lastReplyAt, id]
    );
  }
}

module.exports = new UserRepository();
