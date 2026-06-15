const axios = require('axios');
const logger = require('../utils/logger');
const { NVIDIA_API_KEY } = require('../config/env');

/**
 * 呼叫 NVIDIA NIM API 生成特徵向量 (Embedding)
 * 使用模型: nvidia/nv-embedqa-e5-v5 (1024 維度)
 * @param {string} text 要轉換的文字
 * @returns {Promise<number[]>} 1024 維度的浮點數陣列
 */
async function getEmbedding(text) {
  try {
    const response = await axios.post(
      'https://integrate.api.nvidia.com/v1/embeddings',
      {
        input: [text],
        model: "nvidia/nv-embedqa-e5-v5",
        input_type: "query",
        encoding_format: "float"
      },
      {
        headers: {
          'Authorization': `Bearer ${NVIDIA_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const embedding = response.data.data[0].embedding;
    return embedding;
  } catch (error) {
    const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
    logger.error(`[Embedding API Error] 生成向量失敗: ${errorMessage}`);
    throw new Error('Failed to generate embedding');
  }
}

module.exports = {
  getEmbedding
};
