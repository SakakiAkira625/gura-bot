require('dotenv').config();

const requiredEnvVars = ['DISCORD_TOKEN', 'GROQ_API_KEY'];

function validateEnv() {
  const missing = requiredEnvVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

validateEnv();

module.exports = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
};
