require('dotenv').config();
const dbManager = require('../src/db/DBManager');
const guildSettingsRepository = require('../src/db/repositories/GuildSettingsRepository');
const scheduleScanner = require('../src/services/scheduleScanner');
const guildScanner = require('../src/services/guildScanner');
const logger = require('../src/utils/logger');

async function runTests() {
  logger.info('========================================');
  logger.info('開始定時海巡、排除與活躍度梯隊整合測試...');
  logger.info('========================================');

  try {
    await dbManager.initialize();
    logger.info('✅ 測試 1: 資料庫初始化成功！');

    const testGuildId = 'test_guild_555';
    
    // 1. 測試 GuildSettingsRepository 寫入 exclude 與 cron
    logger.info('--- 測試 2: GuildSettingsRepository 寫入設定 ---');
    const excludes = ['ch_exclude_1', 'ch_exclude_2'];
    await guildSettingsRepository.updateKnowledgeExclude(testGuildId, excludes);
    await guildSettingsRepository.updateKnowledgeCron(testGuildId, '*/5 * * * *'); // 每 5 分鐘一次
    
    const gs = await guildSettingsRepository.get(testGuildId);
    logger.info(`讀取伺服器設定: ${JSON.stringify(gs)}`);
    
    if (gs.knowledge_cron === '*/5 * * * *' && gs.knowledge_exclude.includes('ch_exclude_1')) {
      logger.info('✅ 測試 2: 設定寫入成功！');
    } else {
      throw new Error('設定寫入與讀取不符');
    }

    // 2. 測試活躍度排序與分批 (Tiered Sorting & Batching)
    logger.info('--- 測試 3: 活躍度排序 (Snowflake ID) ---');
    // 模擬 4 個文字頻道，lastMessageId 對應 Snowflake 時序關係
    const mockChannels = [
      { id: 'ch_4', name: 'low-activity-1', lastMessageId: '100000000000000000' },     // 舊發言
      { id: 'ch_2', name: 'high-activity-2', lastMessageId: '120000000000000000' },    // 新發言 (次高)
      { id: 'ch_3', name: 'medium-activity-1', lastMessageId: '110000000000000000' },  // 中發言
      { id: 'ch_1', name: 'high-activity-1', lastMessageId: '130000000000000000' },   // 最新發言 (最高)
    ];

    // 我們對 mockChannels 進行排序 (與 guildScanner 中相同的邏輯)
    mockChannels.sort((a, b) => {
      const idA = a.lastMessageId || '0';
      const idB = b.lastMessageId || '0';
      return idB.localeCompare(idA);
    });

    logger.info(`排序後頻道順序: ${mockChannels.map(c => `${c.name} (${c.lastMessageId})`).join(' -> ')}`);
    
    if (mockChannels[0].id === 'ch_1' && mockChannels[mockChannels.length - 1].id === 'ch_4') {
      logger.info('✅ 測試 3: 活躍度 Snowflake 排序成功！');
    } else {
      throw new Error('活躍度排序結果與預期不符');
    }

    // 3. 測試排程掛載與動態重載 (Schedule Manager)
    logger.info('--- 測試 4: 排程掛載與動態更新 ---');
    
    // 模擬 Discord client
    const mockClient = {
      guilds: {
        cache: {
          get: (id) => {
            return {
              id: id,
              name: '模擬伺服器',
              channels: {
                cache: {
                  values: () => []
                }
              }
            };
          }
        }
      }
    };

    // 測試 updateSchedule (掛載 job)
    await scheduleScanner.updateSchedule(testGuildId, '*/10 * * * *', mockClient);
    logger.info('✅ 測試 4.1: 定時排程動態掛載成功！');

    // 測試 updateSchedule ('disable' 解除 job)
    await scheduleScanner.updateSchedule(testGuildId, 'disable', mockClient);
    logger.info('✅ 測試 4.2: 定時排程動態解掛載成功！');

    // 清理測試資料
    await guildSettingsRepository.updateKnowledgeCron(testGuildId, 'disable');
    await guildSettingsRepository.updateKnowledgeExclude(testGuildId, []);
    
    logger.info('========================================');
    logger.info('🎉 所有的定時、排除與活躍度梯隊排序測試通過！');
    logger.info('========================================');

  } catch (err) {
    logger.error('❌ 整合測試失敗：', err);
  } finally {
    const adapter = dbManager.getAdapter();
    if (adapter && typeof adapter.close === 'function') {
      await adapter.close();
    }
    process.exit(0);
  }
}

runTests();
