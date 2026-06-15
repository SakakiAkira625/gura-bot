const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const logger = require('../utils/logger');

let dbPromise = null;

async function getDb() {
  if (dbPromise) return dbPromise;

  dbPromise = open({
    filename: path.join(__dirname, '../../data.sqlite'),
    driver: sqlite3.Database
  }).then(async (db) => {
    logger.info('成功連接到 SQLite 資料庫 (data.sqlite)');

    // 建立使用者好感度與等級表
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        last_message_at INTEGER DEFAULT 0
      )
    `);

    // 建立對話紀錄歷史表
    await db.exec(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        channel_id TEXT,
        role TEXT,
        content TEXT,
        timestamp INTEGER
      )
    `);

    // 建立伺服器設定表 (未來備用)
    await db.exec(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        default_lang TEXT DEFAULT 'cmn'
      )
    `);

    return db;
  }).catch((err) => {
    logger.error('資料庫初始化失敗', err);
    throw err;
  });

  return dbPromise;
}

module.exports = {
  getDb
};
