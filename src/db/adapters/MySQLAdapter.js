const mysql = require('mysql2/promise');
const logger = require('../../utils/logger');
const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = require('../../config/env');
const BaseAdapter = require('./BaseAdapter');

class MySQLAdapter extends BaseAdapter {
  constructor() {
    super();
    this.pool = null;
  }

  async initialize() {
    try {
      this.pool = mysql.createPool({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });

      // 測試連線
      await this.pool.query('SELECT 1');
      logger.info('[MySQLAdapter] 成功連接到 MySQL 資料庫');

      // 建立必要的資料表
      await this.createTables();
    } catch (err) {
      logger.error('[MySQLAdapter] 初始化失敗：', err);
      throw err;
    }
  }

  async createTables() {
    // 建立使用者好感度與等級表
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        xp INT DEFAULT 0,
        level INT DEFAULT 1,
        last_message_at BIGINT DEFAULT 0,
        last_reply_at BIGINT DEFAULT 0,
        cooldown_until BIGINT DEFAULT 0
      )
    `);

    try {
      await this.pool.query('ALTER TABLE users ADD COLUMN last_reply_at BIGINT DEFAULT 0');
    } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') logger.warn(err); }

    try {
      await this.pool.query('ALTER TABLE users ADD COLUMN cooldown_until BIGINT DEFAULT 0');
    } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') logger.warn(err); }

    // 建立對話紀錄歷史表
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255),
        channel_id VARCHAR(255),
        role VARCHAR(50),
        content TEXT,
        timestamp BIGINT
      )
    `);

    try {
      await this.pool.query('ALTER TABLE history ADD COLUMN is_summarized BOOLEAN DEFAULT 0');
      logger.info('成功為 history 表新增 is_summarized 欄位');
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        logger.warn('為 history 新增 is_summarized 欄位時發生錯誤', err);
      }
    }

    // 建立長期記憶表 (海馬迴)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS long_term_memories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255),
        summary TEXT,
        embedding JSON,
        timestamp BIGINT
      )
    `);

    // 建立機器人狀態表 (作夢系統)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS bot_state (
        id INT AUTO_INCREMENT PRIMARY KEY,
        current_dream TEXT,
        last_dream_at BIGINT
      )
    `);

    // 建立伺服器設定表
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id VARCHAR(255) PRIMARY KEY,
        default_lang VARCHAR(50) DEFAULT 'cmn',
        reply_cooldown INT DEFAULT 0,
        tag_limit_role_id VARCHAR(255) DEFAULT NULL,
        tag_limit_hours INT DEFAULT 3,
        tag_disabled_until BIGINT DEFAULT 0
      )
    `);

    try {
      await this.pool.query('ALTER TABLE guild_settings ADD COLUMN reply_cooldown INT DEFAULT 0');
    } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') logger.warn(err); }

    try {
      await this.pool.query('ALTER TABLE guild_settings ADD COLUMN tag_limit_role_id VARCHAR(255) DEFAULT NULL');
    } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') logger.warn(err); }

    try {
      await this.pool.query('ALTER TABLE guild_settings ADD COLUMN tag_limit_hours INT DEFAULT 3');
    } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') logger.warn(err); }

    try {
      await this.pool.query('ALTER TABLE guild_settings ADD COLUMN tag_disabled_until BIGINT DEFAULT 0');
    } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') logger.warn(err); }

    // 建立指令允許頻道表
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS command_channels (
        guild_id VARCHAR(255),
        channel_id VARCHAR(255),
        PRIMARY KEY (guild_id, channel_id)
      )
    `);

    // 建立海巡掃描狀態表
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_scans (
        channel_id VARCHAR(255) PRIMARY KEY,
        guild_id VARCHAR(255),
        last_scanned_message_id VARCHAR(255) DEFAULT NULL,
        status VARCHAR(50) DEFAULT 'idle',
        updated_at BIGINT DEFAULT 0
      )
    `);

    // 建立伺服器海巡知識庫表
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS guild_knowledge (
        id INT AUTO_INCREMENT PRIMARY KEY,
        guild_id VARCHAR(255),
        channel_id VARCHAR(255),
        summary TEXT,
        start_message_id VARCHAR(255),
        end_message_id VARCHAR(255),
        message_count INT DEFAULT 0,
        timestamp BIGINT DEFAULT 0
      )
    `);
  }

  async run(sql, params = []) {
    const [result] = await this.pool.execute(sql, params);
    return result;
  }

  async get(sql, params = []) {
    const [rows] = await this.pool.execute(sql, params);
    return rows[0] || null;
  }

  async all(sql, params = []) {
    const [rows] = await this.pool.execute(sql, params);
    return rows;
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      logger.info('[MySQLAdapter] 資料庫連線池已關閉');
    }
  }
}

module.exports = MySQLAdapter;
