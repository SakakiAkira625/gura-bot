const cron = require('node-cron');
const db = require('../db/database');
const logger = require('../utils/logger');
const { askNvidiaWithFallback } = require('./nvidiaService');

/**
 * 產生夢境並存入資料庫
 */
async function generateDream() {
  try {
    const pool = await db.getDb();
    
    // 隨機抽取 3 條長期的記憶點作為夢境素材
    const memories = await pool.all('SELECT summary FROM long_term_memories ORDER BY RAND() LIMIT 3');
    
    if (!memories || memories.length === 0) {
      logger.info('[Dream Engine] 缺乏記憶素材，今晚不做夢。');
      return null;
    }

    const memoryPoints = memories.map(m => `- ${m.summary}`).join('\n');
    logger.info('[Dream Engine] 正在將以下記憶融合作夢:\n' + memoryPoints);

    const systemPrompt = {
      role: 'system',
      content: `你現在是 Gawr Gura。你剛睡醒，現在要向你的粉絲分享你昨天晚上作的夢。
這個夢境必須非常荒謬、好笑，並且「隱晦地」把以下三個記憶點隨機拼湊在一起。
請用你平時充滿活力的語氣（帶點剛睡醒的呆萌感），並且一定要在句首或是內容中加一兩句「早安」或是「Morning」。
長度控制在 50~100 字左右，不要太長。
記憶點素材：
${memoryPoints}`
    };

    const dreamLog = await askNvidiaWithFallback("請生出一段你剛睡醒分享夢境的發言", [], systemPrompt, 'CHAT');
    
    // 確保有 bot_state
    const stateCount = await pool.get('SELECT COUNT(*) as count FROM bot_state');
    if (stateCount.count === 0) {
      await pool.run('INSERT INTO bot_state (id, current_dream, last_dream_at) VALUES (1, ?, ?)', [dreamLog, Date.now()]);
    } else {
      await pool.run('UPDATE bot_state SET current_dream = ?, last_dream_at = ? WHERE id = 1', [dreamLog, Date.now()]);
    }

    logger.info(`[Dream Engine] 作夢完成！已儲存夢境等待早晨觸發。`);
    return dreamLog;

  } catch (error) {
    logger.error(`[Dream Engine Error] 作夢失敗: ${error.message}`);
    return null;
  }
}

/**
 * 啟動每日凌晨 3 點的作夢排程
 */
function startDreamCronJob() {
  // 每天凌晨 3:00 執行作夢程序
  cron.schedule('0 3 * * *', async () => {
    logger.info('[Dream Engine] 凌晨 3 點到了，Gura 正在進入夢鄉...');
    await generateDream();
  });
  logger.info('[Dream Engine] 已掛載深夜作夢排程 (Cron: 0 3 * * *)');
}

module.exports = {
  startDreamCronJob,
  generateDream
};
