const { Client, GatewayIntentBits } = require('discord.js');
const { execSync } = require('child_process');
const fs = require('fs');

// [System] Orihost/Pterodactyl 限制繞過：檢查核心二進位檔是否因為 ignore-scripts 而沒下載
try {
  let needsRebuild = false;
  
  // 檢查 ffmpeg 是否存在
  const ffmpegPath = require('ffmpeg-static');
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) needsRebuild = true;
  
  // 檢查 Opus 和 Sodium C++ 模組是否編譯成功
  try {
    require('@discordjs/opus');
    require('sodium-native');
  } catch (e) {
    needsRebuild = true; // require 失敗代表沒編譯
  }

  if (needsRebuild) {
    console.log('[System] 發現 Orihost 阻擋了套件安裝腳本 (C++模組未編譯)，正在強制編譯引擎...');
    try {
      execSync('npm approve-scripts --allow-scripts-pending || true', { stdio: 'inherit' });
    } catch(err) {}
    execSync('npm rebuild', { stdio: 'inherit' });
    console.log('[System] 強制編譯完成！');
  }
} catch (err) {
  console.log('[System] 強制編譯檢查發生錯誤:', err.message);
}

const fsPromises = require('fs').promises;
const path = require('path');
const { DISCORD_TOKEN } = require('./config/env');
const logger = require('./utils/logger');
const { getDb } = require('./db/database');

// 初始化資料庫
getDb();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  allowedMentions: { parse: [] },
});

const { Collection } = require('discord.js');
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    logger.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

// Load events dynamically
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// Log errors from the client
client.on('error', (error) => logger.error('Discord Client Error:', error));

// Connect
client.login(DISCORD_TOKEN);
