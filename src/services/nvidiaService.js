const OpenAI = require('openai');
const logger = require('../utils/logger');
const { NVIDIA_API_KEY } = require('../config/env');
const modelManager = require('./modelManager');

const openai = new OpenAI({
  apiKey: NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

// 等待函數
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 呼叫單一模型並有超時機制 (15秒)
 */
async function callModelWithTimeout(prompt, history, systemPrompt, modelName, temperature = 0.85) {
  const messages = [];
  if (systemPrompt) messages.push(systemPrompt);
  
  if (history && history.length > 0) {
    messages.push(...history);
  }
  
  if (prompt) {
    messages.push({ role: 'user', content: prompt });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超時

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

  for (let i = 0; i < maxTries; i++) {
    const currentModel = models[i];
    try {
      if (i > 0) {
        logger.warn(`[NVIDIA Fallback] 正在切換備用模型 (${i}/${maxTries - 1}): ${currentModel}`);
        await delay(1000); // 失敗後強制冷卻 1 秒，保護 40 RPM
      }

      const response = await callModelWithTimeout(prompt, history, systemPrompt, currentModel);
      return response;

    } catch (error) {
      logger.error(`[NVIDIA API Error] 模型 ${currentModel} 執行失敗或超時: ${error.message}`);
      
      // 如果已經是最後一次嘗試，就把錯誤拋出去
      if (i === maxTries - 1) {
        throw new Error('抱歉啦，我的大腦剛剛短路了一下，請再說一次！(API Error or Timeout)');
      }
    }
  }
}

// 為了相容原本可能有其他地方直接使用，保留 askNvidia 但實際已不用
async function askNvidia(prompt, history, systemPrompt, model) {
  return await callModelWithTimeout(prompt, history, systemPrompt, model);
}

module.exports = { askNvidiaWithFallback, askNvidia };
