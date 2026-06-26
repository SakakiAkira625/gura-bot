const BaseRepository = require('./BaseRepository');

class MemoryRepository extends BaseRepository {
  async getAllByUser(userId) {
    return await this.db.all(
      'SELECT summary, embedding FROM long_term_memories WHERE user_id = ?',
      [userId]
    );
  }

  async add(userId, summary, embedding, timestamp = Date.now()) {
    return await this.db.run(
      'INSERT INTO long_term_memories (user_id, summary, embedding, timestamp) VALUES (?, ?, ?, ?)',
      [userId, summary, JSON.stringify(embedding), timestamp]
    );
  }

  async getRandomMemories(limit = 3) {
    return await this.db.all(
      'SELECT summary FROM long_term_memories ORDER BY RAND() LIMIT ?',
      [limit]
    );
  }
}

module.exports = new MemoryRepository();
