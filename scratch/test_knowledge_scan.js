require('dotenv').config();
const dbManager = require('../src/db/DBManager');
const knowledgeRepository = require('../src/db/repositories/KnowledgeRepository');
const logger = require('../src/utils/logger');

async function runTests() {
  logger.info('========================================');
  logger.info('開始執行 KnowledgeRepository 整合測試...');
  logger.info('========================================');

  try {
    // 1. 初始化資料庫連線，會自動跑建表
    await dbManager.initialize();
    logger.info('✅ 測試 1: 資料庫初始化成功！');

    const testChannelId = 'test_channel_888';
    const testGuildId = 'test_guild_888';

    // 2. 清除乾淨
    await knowledgeRepository.clearKnowledge(testChannelId);
    logger.info('✅ 測試 2: 清理測試頻道知識庫成功！');

    // 3. 測試 updateScanStatus -> 'scanning'
    logger.info('--- 測試更新掃描狀態為 scanning ---');
    await knowledgeRepository.updateScanStatus(testChannelId, testGuildId, null, 'scanning');
    let scanStatus = await knowledgeRepository.getScanStatus(testChannelId);
    logger.info(`當前掃描狀態: ${JSON.stringify(scanStatus)}`);
    if (scanStatus && scanStatus.status === 'scanning') {
      logger.info('✅ 測試 3: 狀態更新至 scanning 成功！');
    } else {
      throw new Error('狀態未正確更新至 scanning');
    }

    // 4. 測試 saveKnowledge
    logger.info('--- 測試寫入海巡摘要 ---');
    await knowledgeRepository.saveKnowledge(
      testGuildId,
      testChannelId,
      '- 用戶討論了如何吃鮭魚壽司\n- Gura 想要吃麵包',
      'msg_start_001',
      'msg_end_100',
      100,
      Date.now()
    );
    logger.info('✅ 測試 4: 儲存海巡摘要成功！');

    // 5. 測試 getKnowledgeByChannel
    logger.info('--- 測試獲取頻道海巡摘要 ---');
    const records = await knowledgeRepository.getKnowledgeByChannel(testChannelId, 5);
    logger.info(`查詢到的摘要長度: ${records.length}`);
    logger.info(`摘要內容: ${JSON.stringify(records)}`);
    if (records.length === 1 && records[0].start_message_id === 'msg_start_001') {
      logger.info('✅ 測試 5: 讀取頻道摘要成功！');
    } else {
      throw new Error('讀取頻道摘要與預期不符');
    }

    // 6. 測試 getKnowledgeByGuild
    logger.info('--- 測試獲取伺服器海巡摘要 ---');
    const guildRecords = await knowledgeRepository.getKnowledgeByGuild(testGuildId, 5);
    logger.info(`伺服器摘要長度: ${guildRecords.length}`);
    if (guildRecords.length === 1) {
      logger.info('✅ 測試 6: 讀取伺服器摘要成功！');
    } else {
      throw new Error('讀取伺服器摘要與預期不符');
    }

    // 7. 測試 updateScanStatus -> 'completed'
    logger.info('--- 測試更新掃描狀態為 completed ---');
    await knowledgeRepository.updateScanStatus(testChannelId, testGuildId, 'msg_end_100', 'completed');
    scanStatus = await knowledgeRepository.getScanStatus(testChannelId);
    logger.info(`更新後掃描狀態: ${JSON.stringify(scanStatus)}`);
    if (scanStatus && scanStatus.status === 'completed' && scanStatus.last_scanned_message_id === 'msg_end_100') {
      logger.info('✅ 測試 7: 狀態更新至 completed 成功！');
    } else {
      throw new Error('狀態未正確更新至 completed');
    }

    // 8. 測試 clearKnowledge
    logger.info('--- 測試清除頻道摘要 ---');
    await knowledgeRepository.clearKnowledge(testChannelId);
    const recordsCleared = await knowledgeRepository.getKnowledgeByChannel(testChannelId, 5);
    if (recordsCleared.length === 0) {
      logger.info('✅ 測試 8: 清除頻道摘要成功！');
    } else {
      throw new Error('清除頻道摘要失敗，仍有剩餘資料');
    }

    logger.info('========================================');
    logger.info('🎉 所有 KnowledgeRepository 測試全數通過！');
    logger.info('========================================');

  } catch (err) {
    logger.error('❌ 測試中途發生錯誤：', err);
  } finally {
    const adapter = dbManager.getAdapter();
    if (adapter && typeof adapter.close === 'function') {
      await adapter.close();
    }
    process.exit(0);
  }
}

runTests();
