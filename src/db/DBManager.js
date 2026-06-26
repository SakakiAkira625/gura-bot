const MySQLAdapter = require('./adapters/MySQLAdapter');
const logger = require('../utils/logger');

class DBManager {
  constructor() {
    this.adapter = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      logger.info('[DBManager] 正在初始化資料庫轉譯器...');
      const mySQLAdapter = new MySQLAdapter();
      await mySQLAdapter.initialize();
      this.adapter = mySQLAdapter;
      this.initialized = true;
      logger.info('[DBManager] 資料庫初始化成功！');
    } catch (err) {
      logger.error('[DBManager] 資料庫初始化失敗：', err);
      throw err;
    }
  }

  getAdapter() {
    if (!this.initialized || !this.adapter) {
      throw new Error('[DBManager] 資料庫尚未初始化，請先呼叫 initialize()');
    }
    return this.adapter;
  }
}

module.exports = new DBManager();
