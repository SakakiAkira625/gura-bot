const axios = require('axios');
const logger = require('../utils/logger');
const { GROQ_API_KEY } = require('../config/env');

async function askGroq(prompt, history, systemPrompt) {
  try {
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [systemPrompt, ...history, { role: 'user', content: prompt }],
        temperature: 0.85,
      },
      { 
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        timeout: 10000 // 10 second timeout
      }
    );
    logger.info(`[Groq API Raw Response]: ${JSON.stringify(res.data)}`);
    return res.data.choices[0].message.content;
  } catch (error) {
    logger.error('Groq API Error:', error.message);
    if (error.response) {
      logger.error('Groq API Response Data:', JSON.stringify(error.response.data));
    }
    throw new Error('抱歉啦，我的大腦剛剛短路了一下，請再說一次！(API Error)');
  }
}

module.exports = { askGroq };
