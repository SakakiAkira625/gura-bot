const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const logger = require('../utils/logger');
const { NVIDIA_API_KEY } = require('../config/env');

const openai = new OpenAI({
  apiKey: NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

const MODELS_DATA_PATH = path.join(__dirname, '..', 'data', 'models.json');

// 我們精心設計的首選排序梯隊
const PREFERRED_MODELS = {
  CODE: [
    'deepseek-ai/deepseek-v4-flash',
    'meta/llama-3.3-70b-instruct',
    'meta/llama-3.1-70b-instruct',
    'meta/llama-3.1-8b-instruct'
  ],
  CHAT: [
    'deepseek-ai/deepseek-v4-flash',
    'meta/llama-3.3-70b-instruct',
    'meta/llama-3.1-70b-instruct',
    'meta/llama-3.1-8b-instruct'
  ],
  VISION: [
    'meta/llama-3.2-90b-vision-instruct',
    'meta/llama-3.2-11b-vision-instruct'
  ]
};

// 儲存在記憶體中的最終名單 (開機更新後)
let activeModels = {
  CODE: [],
  CHAT: [],
  VISION: []
};

/**
 * 極輕量的微型測試 (1 Token)，用來檢查模型是否 404 或死機
 * @param {string} modelName 
 * @returns {Promise<boolean>}
 */
async function healthCheck(modelName) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 健康檢查最多等 10 秒

    await openai.chat.completions.create({
      model: modelName,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1
    }, { signal: controller.signal });

    clearTimeout(timeout);
    return true;
  } catch (error) {
    logger.warn(`[Model Manager] Health check failed for ${modelName}: ${error.message}`);
    return false;
  }
}

/**
 * 開機時向 NVIDIA 抓取最新清單，並測試首選模型
 */
async function syncModels() {
  logger.info('[Model Manager] 正在同步 NVIDIA API 模型清單...');
  try {
    const listRes = await openai.models.list();
    const availableModels = listRes.data.map(m => m.id);

    let oldData = { CODE: [], CHAT: [], VISION: [] };
    if (fs.existsSync(MODELS_DATA_PATH)) {
      try {
        oldData = JSON.parse(fs.readFileSync(MODELS_DATA_PATH, 'utf-8'));
      } catch (e) {}
    }

    // 更新並過濾出可用的模型
    for (const intent of ['CODE', 'CHAT', 'VISION']) {
      // 1. 確保該模型在 availableModels 清單中
      let intentModels = PREFERRED_MODELS[intent].filter(m => availableModels.includes(m));
      
      // 2. 對過濾後的模型進行平行健康檢查
      const healthResults = await Promise.all(
        intentModels.map(async (m) => {
          const isHealthy = await healthCheck(m);
          return { model: m, healthy: isHealthy };
        })
      );
      
      const healthyModels = healthResults.filter(r => r.healthy).map(r => r.model);
      
      // 更新可用清單 (只保留健康的)
      activeModels[intent] = healthyModels.length > 0 ? healthyModels : PREFERRED_MODELS[intent];
      
      const added = activeModels[intent].length - (oldData[intent] ? oldData[intent].length : 0);
      const diffText = added > 0 ? `(新增 ${added} 個可用)` : added < 0 ? `(減少 ${Math.abs(added)} 個可用)` : `(無變化)`;
      logger.info(`[Model Manager] ${intent} 意圖模型已更新，共 ${activeModels[intent].length} 個可用 ${diffText}`);
    }

    // 儲存到硬碟
    fs.writeFileSync(MODELS_DATA_PATH, JSON.stringify(activeModels, null, 2));
    logger.info('[Model Manager] 模型清單同步完畢！');

  } catch (error) {
    logger.error(`[Model Manager] 同步模型失敗: ${error.message}`);
    // 若失敗，退回使用本地的緩存
    if (fs.existsSync(MODELS_DATA_PATH)) {
      try {
        activeModels = JSON.parse(fs.readFileSync(MODELS_DATA_PATH, 'utf-8'));
        logger.info('[Model Manager] 已退回使用本地模型緩存。');
      } catch (e) {}
    }
  }
}

/**
 * 取得指定意圖的候選模型清單 (已排好優先順序)
 */
function getModelsForIntent(intent) {
  if (activeModels[intent] && activeModels[intent].length > 0) {
    return activeModels[intent];
  }
  // 萬一出錯，至少給個預設值
  return PREFERRED_MODELS[intent] || PREFERRED_MODELS['CHAT'];
}

module.exports = {
  syncModels,
  getModelsForIntent
};
