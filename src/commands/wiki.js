const { fetchWikiSummary } = require('../services/wikiService');
const { detectChinese, mapLangCodeToWikiLang } = require('../utils/helpers');

async function handleWikiCommand(message, query) {
  if (!query) return message.reply('欸…你要我查什麼？');
  const isChinese = detectChinese(query);
  const lang = mapLangCodeToWikiLang(isChinese ? 'cmn' : 'eng');
  const summary = await fetchWikiSummary(query, lang);
  return message.reply(`我幫你查好了。\n\n${summary}`);
}

module.exports = {
  name: 'wiki',
  execute: handleWikiCommand
};
