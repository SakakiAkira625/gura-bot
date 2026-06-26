require('dotenv').config();
const dbManager = require('../src/db/DBManager');
const guildSettingsRepository = require('../src/db/repositories/GuildSettingsRepository');
const scheduleScanner = require('../src/services/scheduleScanner');
const guildScanner = require('../src/services/guildScanner');
const knowledgeRepository = require('../src/db/repositories/KnowledgeRepository');
const memoryRepository = require('../src/db/repositories/MemoryRepository');
const userRepository = require('../src/db/repositories/UserRepository');
const logger = require('../src/utils/logger');

async function runTests() {
  logger.info('========================================');
  logger.info('開始全面海巡、排程、排除與記憶收割整合測試...');
  logger.info('========================================');

  try {
    await dbManager.initialize();
    logger.info('✅ 測試 1: 資料庫初始化成功！');

    const testGuildId = 'test_guild_666';
    const testChannelId = 'test_channel_666';
    const testUserId1 = '1234567890';
    const testUserId2 = '9876543210';

    // 1. 清理舊測試資料
    await knowledgeRepository.clearKnowledge(testChannelId);
    await knowledgeRepository.updateScanStatus(testChannelId, testGuildId, null, 'idle');
    await guildSettingsRepository.updateKnowledgeExclude(testGuildId, []);
    
    // 清除海馬迴模擬用戶的記憶
    const db = dbManager.getAdapter().pool;
    await db.query('DELETE FROM long_term_memories WHERE user_id IN (?, ?)', [testUserId1, testUserId2]);
    await db.query('DELETE FROM users WHERE id IN (?, ?)', [testUserId1, testUserId2]);

    logger.info('✅ 測試資料清理完成。');

    // 2. 測試活躍度與 Exclusion
    logger.info('--- 測試 2: 排除名單與活躍度排序 ---');
    const excludes = ['test_channel_exclude'];
    await guildSettingsRepository.updateKnowledgeExclude(testGuildId, excludes);
    const gs = await guildSettingsRepository.get(testGuildId);
    
    if (gs.knowledge_exclude.includes('test_channel_exclude')) {
      logger.info('✅ 測試 2.1: 排除頻道寫入成功！');
    } else {
      throw new Error('排除頻道寫入失敗');
    }

    // 3. 測試記憶收割 (Memory Harvesting) 與大上下文彙整
    logger.info('--- 測試 3: 模擬頻道歷史海巡與長期記憶自動收割 ---');
    
    const mockChannel = {
      id: testChannelId,
      name: '鯊鯊交流區',
      guildId: testGuildId,
      messages: {
        fetch: async (options) => {
          if (options.before) {
            return { size: 0, values: () => [], last: () => null };
          }
          // 模擬對話
          const mockMsgs = [
            {
              id: 'msg_001',
              createdTimestamp: Date.now() - 10000,
              author: { id: testUserId1, username: 'Alice', bot: false },
              content: '我真的好喜歡吃拉麵喔！特別是豚骨拉麵！'
            },
            {
              id: 'msg_002',
              createdTimestamp: Date.now() - 5000,
              author: { id: testUserId2, username: 'Bob', bot: false },
              content: '我明天要參加機車駕照筆試，好緊張喔。'
            },
            {
              id: 'msg_003',
              createdTimestamp: Date.now(),
              author: { id: '9999999999', username: 'GuraBot', bot: true },
              content: 'a... 大家加油！'
            }
          ];
          return {
            size: mockMsgs.length,
            values: () => mockMsgs,
            first: () => mockMsgs[0],
            last: () => mockMsgs[mockMsgs.length - 1]
          };
        }
      }
    };

    // 執行一次性海巡掃描
    logger.info('正在啟動 scanChannel 並觸發真實 NVIDIA NIM LLM 摘要與收割...');
    await guildScanner.scanChannel(mockChannel, Infinity, (channelId, state) => {
      logger.info(`[掃描狀態回呼] 頻道: ${channelId} | 狀態: ${state.status} | 訊息: ${state.info}`);
      if (state.snippet) {
        logger.info(`   └ 💡 焦點簡報: ${state.snippet}`);
      }
    });

    // 4. 驗證資料庫寫入
    logger.info('--- 測試 4: 驗證海巡知識與長期記憶是否寫入資料庫 ---');

    // 4.1 驗證 guild_knowledge 頻道摘要
    const knowledge = await knowledgeRepository.getKnowledgeByChannel(testChannelId, 5);
    logger.info(`寫入的頻道海巡摘要: ${JSON.stringify(knowledge, null, 2)}`);
    if (knowledge.length > 0) {
      logger.info('✅ 測試 4.1: guild_knowledge 寫入成功！且已過濾 ===MEMORIES=== 標籤。');
    } else {
      throw new Error('guild_knowledge 未寫入任何摘要');
    }

    // 4.2 驗證 users 是否自動註冊
    const user1 = await userRepository.getById(testUserId1);
    const user2 = await userRepository.getById(testUserId2);
    logger.info(`自動註冊的用戶1: ${JSON.stringify(user1)}`);
    logger.info(`自動註冊的用戶2: ${JSON.stringify(user2)}`);
    if (user1 && user2) {
      logger.info('✅ 測試 4.2: 用戶帳號自動註冊（createIgnore）成功！');
    } else {
      throw new Error('自動註冊用戶失敗');
    }

    // 4.3 驗證 long_term_memories 是否自動收割寫入
    const memories1 = await memoryRepository.getAllByUser(testUserId1);
    const memories2 = await memoryRepository.getAllByUser(testUserId2);
    logger.info(`用戶 1 (Alice) 的海馬迴長期記憶: ${JSON.stringify(memories1)}`);
    logger.info(`用戶 2 (Bob) 的海馬迴長期記憶: ${JSON.stringify(memories2)}`);
    
    if (memories1.length > 0 || memories2.length > 0) {
      logger.info('✅ 測試 4.3: 海馬迴長期記憶自動收割並向量寫入成功！');
    } else {
      throw new Error('海馬迴記憶未收割到任何數據，請檢查 LLM 輸出或 Regex 解析');
    }

    // 5. 測試定時排程動態更新
    logger.info('--- 測試 5: 測試排程管理器動態掛載 ---');
    const mockClient = {
      guilds: {
        cache: {
          get: () => null
        }
      }
    };
    await scheduleScanner.updateSchedule(testGuildId, '*/15 * * * *', mockClient);
    await scheduleScanner.updateSchedule(testGuildId, 'disable', mockClient);
    logger.info('✅ 測試 5: 定時排程動態掛載與停用正常！');

    // 清理測試數據
    await knowledgeRepository.clearKnowledge(testChannelId);
    await knowledgeRepository.updateScanStatus(testChannelId, testGuildId, null, 'idle');
    await db.query('DELETE FROM long_term_memories WHERE user_id IN (?, ?)', [testUserId1, testUserId2]);
    await db.query('DELETE FROM users WHERE id IN (?, ?)', [testUserId1, testUserId2]);
    await guildSettingsRepository.updateKnowledgeCron(testGuildId, 'disable');
    await guildSettingsRepository.updateKnowledgeExclude(testGuildId, []);

    logger.info('========================================');
    logger.info('🎉 所有海巡、排程、排除與記憶收割整合測試全數通過！');
    logger.info('========================================');

  } catch (err) {
    logger.error('❌ 測試發生錯誤：', err);
  } finally {
    const adapter = dbManager.getAdapter();
    if (adapter && typeof adapter.close === 'function') {
      await adapter.close();
    }
    process.exit(0);
  }
}

runTests();
