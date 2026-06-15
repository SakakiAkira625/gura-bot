const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { fetchWikiSummary } = require('../services/wikiService');
const { askNvidia } = require('../services/nvidiaService');
const { getSystemPromptByLang } = require('../data/persona');
const { getMessage } = require('../utils/i18n');
const logger = require('../utils/logger');
const { detectChinese, mapLangCodeToWikiLang } = require('../utils/helpers');

async function handleWikiCommand(message, query, langCode) {
  if (!query) return message.reply(getMessage(langCode, 'wikiEmpty'));
  
  const loadingMsg = await message.reply(getMessage(langCode, 'wikiSearching'));

  const isChinese = detectChinese(query);
  const lang = mapLangCodeToWikiLang(isChinese ? 'cmn' : 'eng');
  const summary = await fetchWikiSummary(query, lang);

  const systemPrompt = getSystemPromptByLang(langCode);
  
  let prompt = '';
  if (!summary) {
    prompt = `使用者查詢了關於「${query}」的資料，但是找不到任何東西。請用你的風格告訴使用者查不到資料。`;
  } else {
    prompt = `使用者查詢了關於「${query}」的資料，這是維基百科的結果：\n\n${summary}\n\n請用你自己的語氣，並使用使用者的語言，生動地向使用者解說這段內容。（非常重要：請將回覆字數嚴格限制在 300 字以內，不要太長！）`;
  }

  try {
    const reply = await askNvidia(prompt, [], systemPrompt, 'meta/llama-3.1-70b-instruct');
    // If the reply is somehow still over 2000 characters, truncate it safely
    const safeReply = reply.length > 1950 ? reply.slice(0, 1950) + '... (字數太多被截斷啦！)' : reply;
    await loadingMsg.edit(safeReply);
  } catch (error) {
    logger.error(`[Wiki Command Error] ${query}:`, error);
    await loadingMsg.edit(getMessage(langCode, 'error')).catch(e => logger.error('Failed to edit loading message', e));
  }
}

async function handleWikiInteraction(interaction, query, langCode) {
  if (!query) {
    return interaction.reply({ content: getMessage(langCode, 'wikiEmpty'), flags: MessageFlags.Ephemeral });
  }
  
  // Slash command 專用的等待狀態 (會顯示 應用程式思考中...)
  await interaction.deferReply();

  const isChinese = detectChinese(query);
  const lang = mapLangCodeToWikiLang(isChinese ? 'cmn' : 'eng');
  const summary = await fetchWikiSummary(query, lang);

  const systemPrompt = getSystemPromptByLang(langCode);
  
  let prompt = '';
  if (!summary) {
    prompt = `使用者查詢了關於「${query}」的資料，但是找不到任何東西。請用你的風格告訴使用者查不到資料。`;
  } else {
    prompt = `使用者查詢了關於「${query}」的資料，這是維基百科的結果：\n\n${summary}\n\n請用你自己的語氣，並使用使用者的語言，生動地向使用者解說這段內容。（非常重要：請將回覆字數嚴格限制在 300 字以內，不要太長！）`;
  }

  try {
    const reply = await askNvidia(prompt, [], systemPrompt, 'meta/llama-3.1-70b-instruct');
    const safeReply = reply.length > 1950 ? reply.slice(0, 1950) + '... (字數太多被截斷啦！)' : reply;
    await interaction.editReply(safeReply);
  } catch (error) {
    logger.error(`[Wiki Interaction Error] ${query}:`, error);
    await interaction.editReply(getMessage(langCode, 'error')).catch(e => logger.error('Failed to edit interaction reply', e));
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wiki')
    .setDescription('呼叫 Gura 幫你查詢維基百科上的資料！')
    .addStringOption(option => 
      option.setName('query')
        .setDescription('你要查詢的關鍵字 (例如: Gawr Gura)')
        .setRequired(true)
    ),
  execute: handleWikiInteraction,
  executeText: handleWikiCommand
};
