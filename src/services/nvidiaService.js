const OpenAI = require('openai');
const logger = require('../utils/logger');
const { NVIDIA_API_KEY } = require('../config/env');
const modelManager = require('./modelManager');

const openai = new OpenAI({
  apiKey: NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

// 動態超時對照表 (基於本地測試數據)
const TIMEOUT_MAP = {
  'CHAT': 90000,
  'WIKI_SEARCH': 90000,
  'CODE': 120000,
  'VISION': 180000,
  'AUDIO': 120000
};

// 等待函數
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 呼叫單一模型並有動態超時機制
 */
async function callModelWithTimeout(prompt, history, systemPrompt, modelName, timeoutMs = 90000, temperature = 0.85) {
  const messages = [];
  if (systemPrompt) messages.push(systemPrompt);
  
  if (history && history.length > 0) {
    messages.push(...history);
  }
  
  if (prompt) {
    messages.push({ role: 'user', content: prompt });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const completion = await openai.chat.completions.create({
      model: modelName,
      messages: messages,
      temperature: temperature,
      max_tokens: 1024,
    }, { signal: controller.signal });
    
    clearTimeout(timeoutId);

    if (completion.usage) {
      logger.info(`[NVIDIA API Response (${modelName})]: Token Usage -> ${JSON.stringify(completion.usage)}`);
    }
    return completion.choices[0].message.content;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * 具有自動容錯切換機制的呼叫方法
 * @param {string} prompt 使用者目前的對話
 * @param {Array} history 對話歷史陣列
 * @param {Object} systemPrompt 系統提示詞物件
 * @param {string} intent 使用者的對話意圖 ('CODE', 'CHAT')
 */
async function askNvidiaWithFallback(prompt, history, systemPrompt, intent = 'CHAT') {
  const models = modelManager.getModelsForIntent(intent);
  const maxTries = Math.min(3, models.length); // 最多嘗試 3 個備用模型
  const timeoutMs = TIMEOUT_MAP[intent] || 90000;
  
  let lastError = null;

  for (let i = 0; i < maxTries; i++) {
    const currentModel = models[i];
    try {
      if (i > 0) {
        logger.warn(`[NVIDIA Fallback] 正在切換備用模型 (${i}/${maxTries - 1}): ${currentModel}`);
        await delay(1000); // 失敗後強制冷卻 1 秒，保護 40 RPM
      }

      const response = await callModelWithTimeout(prompt, history, systemPrompt, currentModel, timeoutMs);
      
      // 成功執行，回報成功以重置失敗計數
      modelManager.reportSuccess(currentModel);
      
      return response;

    } catch (error) {
      lastError = error;
      logger.error(`[NVIDIA API Error] 模型 ${currentModel} 執行失敗或超時: ${error.message}`);
      
      // 紀錄失敗，若連續失敗會觸發熔斷降級
      modelManager.reportFailure(intent, currentModel);
      
      // 如果遇到 429 Too Many Requests，直接跳出迴圈避免繼續浪費額度
      if (error.status === 429) {
        break;
      }
    }
  }

  // 整理要拋出的錯誤供 messageCreate 捕捉
  if (lastError && lastError.status === 429) {
    const err = new Error('Rate Limit Exceeded');
    err.status = 429;
    throw err;
  }
  
  const err = new Error(lastError ? lastError.message : 'API Error or Timeout');
  err.status = lastError && lastError.status ? lastError.status : 500;
  if (lastError && lastError.name === 'AbortError') err.status = 'Timeout';
  throw err;
}

// 為了相容原本可能有其他地方直接使用，保留 askNvidia 但實際已不用
async function askNvidia(prompt, history, systemPrompt, model) {
  return await callModelWithTimeout(prompt, history, systemPrompt, model);
}

module.exports = { askNvidiaWithFallback, askNvidia };
