const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

async function deployCommands(clientId, token) {
  const commands = [];
  const commandsPath = path.join(__dirname, '../commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
    } else {
      logger.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    logger.info(`正在向 Discord 註冊 ${commands.length} 個全域斜線指令 (Slash Commands)...`);

    // 覆寫所有全域指令
    const data = await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands },
    );

    logger.info(`成功註冊 ${data.length} 個全域斜線指令！`);
  } catch (error) {
    logger.error('註冊指令時發生錯誤:', error.message);
  }
}

module.exports = { deployCommands };
