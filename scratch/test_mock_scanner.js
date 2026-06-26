require('dotenv').config();
const dbManager = require('../src/db/DBManager');
const guildScanner = require('../src/services/guildScanner');
const knowledgeRepository = require('../src/db/repositories/KnowledgeRepository');
const logger = require('../src/utils/logger');

async function testScanner() {
  logger.info('========================================');
  logger.info('開始執行 Mock GuildScanner 整合測試...');
  logger.info('========================================');

  try {
    await dbManager.initialize();

    const mockChannel = {
      id: 'test_mock_channel_777',
      name: '鯊鯊專區',
      guildId: 'test_guild_777',
      messages: {
        fetch: async (options) => {
          // 如果帶有 before，代表第二分頁，回傳空資料結束 fetch loop
          if (options.before) {
            return {
              size: 0,
              values: () => [],
              last: () => null
            };
          }
          // 第一分頁，回傳 3 條模擬對話
          const mockMsgs = [
            {
              id: 'msg_001',
              createdTimestamp: Date.now() - 5000,
              author: { username: 'Alice', bot: false },
              content: '今天天氣真好，想去海邊玩！'
            },
            {
              id: 'msg_002',
              createdTimestamp: Date.now() - 3000,
              author: { username: 'Bob', bot: false },
              content: '對阿，順便吃個烤魷魚。'
            },
            {
              id: 'msg_003',
              createdTimestamp: Date.now(),
              author: { username: 'GuraBot', bot: true }, // 機器人發的，應該會被 filter
              content: 'a... 我也想去！'
            }
          ];
          return {
            size: mockMsgs.length,
            values: () => mockMsgs,
            last: () => mockMsgs[mockMsgs.length - 1]
          };
        }
      }
    };

    // 啟動背景掃描任務並等待其完成
    // 為了在此處等待，我們直接呼叫非公開的 scanChannel (其為非同步函數)
    // 取得 guildScanner 中的內部實作 scanChannel 並呼叫它
    // 我們可以藉由 require 內部的方法，或者修改 guildScanner 導出 scanChannel 供測試用
    // 為了好測試，我們看一下 guildScanner 匯出了什麼
    logger.info('正在啟動掃描...');
    
    // 為了安全測試，我們可以直接呼叫匯出的 startScan，然後輪詢資料庫狀態直到 completed
    await knowledgeRepository.clearKnowledge(mockChannel.id);
    await knowledgeRepository.updateScanStatus(mockChannel.id, mockChannel.guildId, null, 'idle');

    guildScanner.startScan(mockChannel, 100);

    // 輪詢檢查直到狀態變更為 completed
    let completed = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const status = await knowledgeRepository.getScanStatus(mockChannel.id);
      logger.info(`輪詢掃描狀態... 當前狀態: ${status ? status.status : '無狀態'}`);
      if (status && (status.status === 'completed' || status.status === 'failed')) {
        completed = true;
        if (status.status === 'completed') {
          logger.info('✅ 掃描成功完成！');
        } else {
          throw new Error('背景掃描失敗了');
        }
        break;
      }
    }

    if (!completed) {
      throw new Error('掃描超時未完成');
    }

    // 檢查寫入的知識
    const records = await knowledgeRepository.getKnowledgeByChannel(mockChannel.id, 5);
    logger.info(`海巡產生的對話摘要：\n${JSON.stringify(records, null, 2)}`);
    if (records.length > 0) {
      logger.info('✅ 測試成功：順利寫入海巡知識摘要！');
    } else {
      throw new Error('未產生任何海巡摘要');
    }

    // 清理測試資料
    await knowledgeRepository.clearKnowledge(mockChannel.id);
    await knowledgeRepository.updateScanStatus(mockChannel.id, mockChannel.guildId, null, 'idle');
    logger.info('========================================');
    logger.info('🎉 Mock GuildScanner 測試成功！');
    logger.info('========================================');

  } catch (err) {
    logger.error('❌ Scanner 測試失敗：', err);
  } finally {
    const adapter = dbManager.getAdapter();
    if (adapter && typeof adapter.close === 'function') {
      await adapter.close();
    }
    process.exit(0);
  }
}

testScanner();
