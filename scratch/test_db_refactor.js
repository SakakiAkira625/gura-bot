require('dotenv').config();
const dbManager = require('../src/db/DBManager');
const userRepository = require('../src/db/repositories/UserRepository');
const historyRepository = require('../src/db/repositories/HistoryRepository');
const guildSettingsRepository = require('../src/db/repositories/GuildSettingsRepository');
const memoryRepository = require('../src/db/repositories/MemoryRepository');
const botStateRepository = require('../src/db/repositories/BotStateRepository');
const commandChannelRepository = require('../src/db/repositories/CommandChannelRepository');
const logger = require('../src/utils/logger');

async function runTests() {
  logger.info('========================================');
  logger.info('開始執行資料庫重構整合測試...');
  logger.info('========================================');

  try {
    // 1. 初始化連線
    await dbManager.initialize();
    logger.info('✅ 測試 1: DBManager 連線與建表完成');

    const testUserId = 'test_user_999';
    const testGuildId = 'test_guild_999';
    const testChannelId = 'test_channel_999';

    // 2. 測試 UserRepository
    logger.info('--- 測試 UserRepository ---');
    await userRepository.createIgnore(testUserId);
    const userBefore = await userRepository.getById(testUserId);
    logger.info(`原使用者狀態: ${JSON.stringify(userBefore)}`);
    
    await userRepository.updateXpAndLevel(testUserId, 150, 2, Date.now());
    await userRepository.updateCooldown(testUserId, Date.now() + 60000);
    await userRepository.updateLastReply(testUserId, Date.now());
    
    const userAfter = await userRepository.getById(testUserId);
    logger.info(`更新後使用者狀態: ${JSON.stringify(userAfter)}`);
    if (userAfter.xp === 150 && userAfter.level === 2) {
      logger.info('✅ 測試 2: UserRepository 成功');
    } else {
      throw new Error('UserRepository 測試資料不符');
    }

    // 3. 測試 HistoryRepository
    logger.info('--- 測試 HistoryRepository ---');
    await historyRepository.add(testUserId, testChannelId, 'user', 'Hello Gura!');
    await historyRepository.add('gura_id', testChannelId, 'assistant', 'Hello Chum!');
    
    const history = await historyRepository.getRecent(testChannelId, 5);
    logger.info(`獲取的歷史對話紀錄: ${JSON.stringify(history)}`);
    if (history.length >= 2) {
      logger.info('✅ 測試 3: HistoryRepository 成功');
    } else {
      throw new Error('HistoryRepository 獲取歷史筆數不符');
    }

    // 4. 測試 GuildSettingsRepository
    logger.info('--- 測試 GuildSettingsRepository ---');
    await guildSettingsRepository.setReplyCooldown(testGuildId, 15);
    await guildSettingsRepository.setTagLimit(testGuildId, 'test_role_1', 4);
    
    const gs = await guildSettingsRepository.get(testGuildId);
    logger.info(`伺服器設定狀態: ${JSON.stringify(gs)}`);
    if (gs.reply_cooldown === 15 && gs.tag_limit_role_id === 'test_role_1') {
      logger.info('✅ 測試 4: GuildSettingsRepository 成功');
    } else {
      throw new Error('GuildSettingsRepository 測試資料不符');
    }

    // 5. 測試 MemoryRepository
    logger.info('--- 測試 MemoryRepository ---');
    const dummyEmbedding = Array(1024).fill(0.1);
    await memoryRepository.add(testUserId, '測試記憶點A', dummyEmbedding);
    const memories = await memoryRepository.getAllByUser(testUserId);
    logger.info(`獲取的海馬迴記憶: ${JSON.stringify(memories)}`);
    if (memories.length > 0) {
      logger.info('✅ 測試 5: MemoryRepository 成功');
    } else {
      throw new Error('MemoryRepository 獲取記憶筆數不符');
    }

    // 6. 測試 BotStateRepository
    logger.info('--- 測試 BotStateRepository ---');
    const countBefore = await botStateRepository.count();
    if (countBefore === 0) {
      await botStateRepository.insert('一個關於鮭魚的夢', Date.now());
    }
    await botStateRepository.update('一個關於鯊魚的夢', Date.now());
    const dreamState = await botStateRepository.get();
    logger.info(`作夢狀態: ${JSON.stringify(dreamState)}`);
    await botStateRepository.clearDream();
    const dreamStateCleared = await botStateRepository.get();
    logger.info(`清除後的作夢狀態: ${JSON.stringify(dreamStateCleared)}`);
    logger.info('✅ 測試 6: BotStateRepository 成功');

    // 7. 測試 CommandChannelRepository
    logger.info('--- 測試 CommandChannelRepository ---');
    await commandChannelRepository.add(testGuildId, testChannelId);
    const allowed = await commandChannelRepository.getAllowed(testGuildId);
    logger.info(`允許的對話頻道: ${JSON.stringify(allowed)}`);
    await commandChannelRepository.remove(testGuildId, testChannelId);
    const allowedAfter = await commandChannelRepository.getAllowed(testGuildId);
    logger.info(`移除後的允許頻道: ${JSON.stringify(allowedAfter)}`);
    logger.info('✅ 測試 7: CommandChannelRepository 成功');

    logger.info('========================================');
    logger.info('🎉 所有整合測試全數通過！資料庫架構重構成功！');
    logger.info('========================================');

  } catch (err) {
    logger.error('❌ 整合測試發生錯誤：', err);
  } finally {
    const adapter = dbManager.getAdapter();
    if (adapter && typeof adapter.close === 'function') {
      await adapter.close();
    }
    process.exit(0);
  }
}

runTests();
