const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');


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

// 捕捉未預期的全域錯誤，防止機器人崩潰
process.on('unhandledRejection', error => {
  logger.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
  logger.error('Uncaught Exception:', error);
});

// Connect
client.login(DISCORD_TOKEN);
