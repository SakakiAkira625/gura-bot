const BaseRepository = require('./BaseRepository');

class BotStateRepository extends BaseRepository {
  async get() {
    return await this.db.get('SELECT current_dream FROM bot_state WHERE id = 1');
  }

  async count() {
    const res = await this.db.get('SELECT COUNT(*) as count FROM bot_state');
    return res ? res.count : 0;
  }

  async insert(dreamLog, timestamp = Date.now()) {
    return await this.db.run(
      'INSERT INTO bot_state (id, current_dream, last_dream_at) VALUES (1, ?, ?)',
      [dreamLog, timestamp]
    );
  }

  async update(dreamLog, timestamp = Date.now()) {
    return await this.db.run(
      'UPDATE bot_state SET current_dream = ?, last_dream_at = ? WHERE id = 1',
      [dreamLog, timestamp]
    );
  }

  async clearDream() {
    return await this.db.run('UPDATE bot_state SET current_dream = NULL WHERE id = 1');
  }
}

module.exports = new BotStateRepository();
