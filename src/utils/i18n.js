const staticMessages = {
  cmn: {
    systemInstruction: '請用繁體中文回答，並保持 Gura 的語氣。',
    error: '抱歉啦，我的大腦剛剛短路了一下，請再說一次！',
    wikiEmpty: '欸…你要我查什麼？',
    wikiSearching: '等我一下喔，我幫你查一下...',
    wikiFail: '找不到資料呢…你是故意考我嗎？'
  },
  chs: {
    systemInstruction: '请用简体中文回答，并保持 Gura 的语气。',
    error: '抱歉啦，我的大脑刚刚短路了一下，请再说一次！',
    wikiEmpty: '诶…你要我查什么？',
    wikiSearching: '等我一下哦，我帮你查一下...',
    wikiFail: '找不到资料呢…你是故意考我吗？'
  },
  eng: {
    systemInstruction: 'Please respond in English, keeping Gura style.',
    error: 'Oops, my shark brain short-circuited! Can you say that again?',
    wikiEmpty: 'Umm... what do you want me to search?',
    wikiSearching: 'Give me a sec, searching...',
    wikiFail: 'I can\'t find anything on that... Are you testing me?'
  },
  jpn: {
    systemInstruction: '日本語で回答してください。Guraの口調で。',
    error: 'ごめん！サメの脳みそがショートしちゃった！もう一回言って？',
    wikiEmpty: 'えっと…何を調べればいいの？',
    wikiSearching: 'ちょっと待ってね、調べてみる...',
    wikiFail: '何も見つからないよ…わざと意地悪してるの？'
  }
};

// Map cht to cmn for consistency
staticMessages.cht = staticMessages.cmn;

const defaultLang = 'cmn';

function getMessage(langCode, key) {
  const lang = staticMessages[langCode] ? langCode : defaultLang;
  return staticMessages[lang][key];
}

function getSystemLanguageInstruction(langCode) {
  const instruction = getMessage(langCode, 'systemInstruction');
  return `【語言指令 / Language Instruction】\n${instruction}\nCRITICAL: You MUST detect the language of the user's latest message and reply in THAT EXACT SAME language. Do NOT reply in a different language!`;
}

module.exports = {
  getMessage,
  getSystemLanguageInstruction
};
