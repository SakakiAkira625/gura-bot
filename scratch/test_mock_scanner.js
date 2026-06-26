require('dotenv').config();
const dbManager = require('../src/db/DBManager');
const guildScanner = require('../src/services/guildScanner');
const knowledgeRepository = require('../src/db/repositories/KnowledgeRepository');
const logger = require('../src/utils/logger');

async function testScanner() {
  logger.info('========================================');
  logger.info('開始執行 Multi-Channel Mock GuildScanner 整合測試...');
  logger.info('========================================');

  try {
    await dbManager.initialize();

    // 模擬兩個頻道
    const mockChannel1 = {
      id: 'test_mock_channel_111',
      name: '一般閒聊區',
      guildId: 'test_guild_777',
      isTextBased: () => true,
      messages: {
        fetch: async (options) => {
          if (options.before) return { size: 0, values: () => [] };
          const mockMsgs = [
            { id: 'msg_101', createdTimestamp: Date.now() - 5000, author: { username: 'Alice', bot: false }, content: '大家吃飽沒？剛才去吃了拉麵。' },
            { id: 'msg_102', createdTimestamp: Date.now() - 3000, author: { username: 'Bob', bot: false }, content: '我正在吃披薩！' }
          ];
          return { size: mockMsgs.length, values: () => mockMsgs, last: () => mockMsgs[mockMsgs.length - 1] };
        }
      }
    };

    const mockChannel2 = {
      id: 'test_mock_channel_222',
      name: '程式碼交流',
      guildId: 'test_guild_777',
      isTextBased: () => true,
      messages: {
        fetch: async (options) => {
          if (options.before) return { size: 0, values: () => [] };
          const mockMsgs = [
            { id: 'msg_201', createdTimestamp: Date.now() - 5000, author: { username: 'Charlie', bot: false }, content: '有人會用 node-cron 嗎？' },
            { id: 'msg_202', createdTimestamp: Date.now() - 3000, author: { username: 'David', bot: false }, content: '會，要用 cron.schedule(expr, task) 就可以了。' }
          ];
          return { size: mockMsgs.length, values: () => mockMsgs, last: () => mockMsgs[mockMsgs.length - 1] };
        }
      }
    };

    // 清理舊資料
    await knowledgeRepository.clearKnowledge(mockChannel1.id);
    await knowledgeRepository.clearKnowledge(mockChannel2.id);
    await knowledgeRepository.updateScanStatus(mockChannel1.id, 'test_guild_777', null, 'idle');
    await knowledgeRepository.updateScanStatus(mockChannel2.id, 'test_guild_777', null, 'idle');

    logger.info('正在啟動雙頻道海巡掃描...');

    const channelStates = {
      [mockChannel1.id]: { name: mockChannel1.name, status: 'pending', info: '', snippet: '' },
      [mockChannel2.id]: { name: mockChannel2.name, status: 'pending', info: '', snippet: '' }
    };

    // 啟動掃描並傳入實時回呼
    guildScanner.startScan([mockChannel1, mockChannel2], 100, (channelId, state, currentIdx, totalCount) => {
      channelStates[channelId].status = state.status;
      channelStates[channelId].info = state.info;
      channelStates[channelId].snippet = state.snippet;
      
      logger.info(`[實時進度更新] 頻道 #${channelStates[channelId].name} | 狀態: ${state.status} | 訊息: ${state.info}`);
      if (state.snippet) {
        logger.info(`   └ 💡 焦點簡報: ${state.snippet}`);
      }
    });

    // 輪詢檢查直到所有頻道掃描完畢
    let allFinished = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const status1 = await knowledgeRepository.getScanStatus(mockChannel1.id);
      const status2 = await knowledgeRepository.getScanStatus(mockChannel2.id);

      if (
        status1 && (status1.status === 'completed' || status1.status === 'failed') &&
        status2 && (status2.status === 'completed' || status2.status === 'failed')
      ) {
        allFinished = true;
        logger.info(`✅ 雙頻道掃描結束！狀態 -> 頻道1: ${status1.status}, 頻道2: ${status2.status}`);
        break;
      }
    }

    if (!allFinished) {
      throw new Error('雙頻道海巡掃描超時未完成');
    }

    // 驗證生成的摘要與使用者特徵
    const records1 = await knowledgeRepository.getKnowledgeByChannel(mockChannel1.id, 5);
    const records2 = await knowledgeRepository.getKnowledgeByChannel(mockChannel2.id, 5);

    logger.info(`--- 頻道1 (#一般閒聊區) 成果 ---`);
    logger.info(records1[0] ? records1[0].summary : '無資料');
    logger.info(`--- 頻道2 (#程式碼交流) 成果 ---`);
    logger.info(records2[0] ? records2[0].summary : '無資料');

    if (records1.length > 0 && records2.length > 0) {
      logger.info('✅ 測試成功：雙頻道的海巡摘要與使用者特徵皆已正確儲存！');
    } else {
      throw new Error('未產生所有頻道的摘要資料');
    }

    // 清理測試資料
    await knowledgeRepository.clearKnowledge(mockChannel1.id);
    await knowledgeRepository.clearKnowledge(mockChannel2.id);
    await knowledgeRepository.updateScanStatus(mockChannel1.id, 'test_guild_777', null, 'idle');
    await knowledgeRepository.updateScanStatus(mockChannel2.id, 'test_guild_777', null, 'idle');

    logger.info('========================================');
    logger.info('🎉 Multi-Channel Mock GuildScanner 測試成功！');
    logger.info('========================================');

  } catch (err) {
    logger.error('❌ Multi-Channel Scanner 測試失敗：', err);
  } finally {
    const adapter = dbManager.getAdapter();
    if (adapter && typeof adapter.close === 'function') {
      await adapter.close();
    }
    process.exit(0);
  }
}

testScanner();
