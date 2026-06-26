const dbManager = require('../DBManager');

class BaseRepository {
  get db() {
    return dbManager.getAdapter();
  }
}

module.exports = BaseRepository;
