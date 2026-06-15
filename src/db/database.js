const mysql = require('mysql2/promise');
const logger = require('../utils/logger');
const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = require('../config/env');

let poolPromise = null;

async function getDb() {
  if (poolPromise) return poolPromise;

  try {
    const pool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // Test connection
    await pool.query('SELECT 1');
    logger.info('成功連接到 MySQL 資料庫');

    // 建立使用者好感度與等級表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        xp INT DEFAULT 0,
        level INT DEFAULT 1,
        last_message_at BIGINT DEFAULT 0
      )
    `);

    // 建立對話紀錄歷史表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255),
        channel_id VARCHAR(255),
        role VARCHAR(50),
        content TEXT,
        timestamp BIGINT
      )
    `);

    // 建立伺服器設定表 (未來備用)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id VARCHAR(255) PRIMARY KEY,
        default_lang VARCHAR(50) DEFAULT 'cmn'
      )
    `);

    // 建立指令允許頻道表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS command_channels (
        guild_id VARCHAR(255),
        channel_id VARCHAR(255),
        PRIMARY KEY (guild_id, channel_id)
      )
    `);

    // 封裝層 (Wrapper): 讓 mysql2 的語法相容原本 sqlite 的語法，減少商業邏輯的改動
    pool.run = async (sql, params = []) => {
      const [result] = await pool.execute(sql, params);
      return result;
    };
    
    pool.get = async (sql, params = []) => {
      const [rows] = await pool.execute(sql, params);
      return rows[0] || null;
    };
    
    pool.all = async (sql, params = []) => {
      const [rows] = await pool.execute(sql, params);
      return rows;
    };

    poolPromise = pool;
    return poolPromise;
  } catch (err) {
    logger.error('MySQL 資料庫初始化失敗', err);
    throw err;
  }
}

module.exports = {
  getDb
};
