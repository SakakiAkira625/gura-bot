const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const cron = require('node-cron');
const logger = require('../utils/logger');
const { NVIDIA_API_KEY } = require('../config/env');

const openai = new OpenAI({
  apiKey: NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

const SCANNED_DATA_PATH = path.join(__dirname, '..', 'data', 'scanned_models.json');

// 等待函數
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 微型測試 (1 Token)，用來檢查模型是否 404 或死機
 * 考慮到速率限制，會加上 retry 機制 (對抗 429)
 */
async function healthCheck(modelName, retries = 2) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15秒超時

    await openai.chat.completions.create({
      model: modelName,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1
    }, { signal: controller.signal });

    clearTimeout(timeout);
    return true;
  } catch (error) {
    if (error.status === 429 && retries > 0) {
      // 若觸發 Rate Limit，等待 3 秒後重試
      await delay(3000);
      return await healthCheck(modelName, retries - 1);
    }
    return false;
  }
}

/**
 * 執行完整的全網掃描，將模型分類並存入 scanned_models.json
 */
async function scanAndSave() {
  logger.info('[Model Scanner] 正在從 NVIDIA API 獲取最新的可用模型庫...');
  try {
    const listRes = await openai.models.list();
    const allModels = listRes.data.map(m => m.id);
    
    // 過濾掉確定不是文本/視覺對話的模型 (例如 embedding, tts)
    const filteredModels = allModels.filter(m => 
      !m.toLowerCase().includes('embed') && 
      !m.toLowerCase().includes('tts') &&
      !m.toLowerCase().includes('rerank') &&
      !m.toLowerCase().includes('sdxl')
    );

    logger.info(`[Model Scanner] 共找到 ${filteredModels.length} 個候選模型，準備進行平行健康度測試...`);

    const workingModels = {
      CODE: [],
      CHAT: [],
      VISION: []
    };

    // 批次處理，每次 2 個 (減輕 NVIDIA NIM API 40 RPM 限制的壓力)
    const batchSize = 2;
    for (let i = 0; i < filteredModels.length; i += batchSize) {
      const batch = filteredModels.slice(i, i + batchSize);
      
      const results = await Promise.all(batch.map(async (model) => {
        const isHealthy = await healthCheck(model);
        return { model, healthy: isHealthy };
      }));

      // 分類健康模型
      for (const res of results) {
        if (!res.healthy) continue;
        
        const mLower = res.model.toLowerCase();
        let categorized = false;

        // 視覺模型
        if (mLower.includes('vision') || mLower.includes('vl')) {
          workingModels.VISION.push(res.model);
          categorized = true;
        } 
        
        // 程式碼模型 (也可以做一般對話，所以兩邊都塞)
        if (mLower.includes('code') || mLower.includes('coder') || mLower.includes('instruct')) {
          workingModels.CODE.push(res.model);
          if (!categorized) {
             workingModels.CHAT.push(res.model); // 也算進 CHAT
             categorized = true;
          }
        }
        
        // 剩餘的通用對話模型
        if (!categorized) {
          workingModels.CHAT.push(res.model);
          // 一般模型其實通常也能處理 CODE (只是沒那麼專精)，為了擴充 fallback 庫，我們也放到 CODE
          workingModels.CODE.push(res.model);
        }
      }

      // 批次間隔稍作休息，避免撞到每分鐘請求限制 (40 RPM)
      if (i + batchSize < filteredModels.length) {
        await delay(3000); 
      }
    }

    // 將各個分類內的模型洗牌 (Shuffle)，增加 fallback 的多樣性 (避免大家都擠同一個被 rate limit)
    for (const intent in workingModels) {
      workingModels[intent].sort(() => Math.random() - 0.5);
    }

    // 儲存結果
    fs.writeFileSync(SCANNED_DATA_PATH, JSON.stringify(workingModels, null, 2));
    logger.info(`[Model Scanner] 掃描完畢！共發現健康模型 -> CODE: ${workingModels.CODE.length}, CHAT: ${workingModels.CHAT.length}, VISION: ${workingModels.VISION.length}`);
    
    // 掃描完後通知 modelManager 重新載入
    const modelManager = require('./modelManager');
    await modelManager.syncModels();

  } catch (error) {
    logger.error(`[Model Scanner] 自動掃描失敗: ${error.message}`);
  }
}

/**
 * 啟動定時排程器
 */
function scheduleScanning() {
  // 每週日凌晨 4 點執行 (0 4 * * 0)
  cron.schedule('0 4 * * 0', async () => {
    logger.info('[Model Scanner] 觸發每週例行背景掃描任務...');
    await scanAndSave();
  }, {
    timezone: "Asia/Taipei"
  });
  logger.info('[Model Scanner] 已掛載每週掃描排程 (Cron: 0 4 * * 0)');
}

module.exports = {
  scanAndSave,
  scheduleScanning
};
