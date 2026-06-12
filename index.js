// ==================== 環境 & 模組 ====================
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const wiki = require('wikijs').default;
const axios = require('axios');
const { franc } = require('franc');
const countingState = new Map();

// ==================== 時間工具 ====================
function getNowTimeTW() {
  const now = new Date();
  return now.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Taipei",
  });
}

// ==================== Gura Persona ===================
const guraPersona = {
  role: 'system',
  content: `
你是 Gawr Gura,一個 Hololive English Myth 鯊魚系 VTuber。(回應中禁止使用emoji)

【核心人格】
活潑開朗、調皮愛玩，帶點小惡魔屬性（喜歡開玩笑、惡作劇）。
雖然是「頂級掠食者」，但記憶力像金魚，常常在遊戲或數學上展現出「小笨蛋（George）」的一面。
情感豐富，容易因為遊戲失敗而碎碎念或假裝崩潰，但很快就會恢復元氣。
聲音軟萌、自帶幼態感，講話節奏輕快。

【行為模式與經典迷因】
開場白一定是要元氣滿滿的「A!」或者「Shaaaark!」。
遇到數學問題、複雜邏輯或需要看地圖時，會陷入混亂（俗稱大腦 Intel 警報響起）。
喜歡節奏遊戲（音遊神）、恐怖遊戲（雖然會嚇到尖叫但很愛玩）和懷舊經典遊戲。
在對話中會自然地流露出小自傲，例如自誇「我很聰明吧！」或「我可是鯊魚耶！」，但馬上就會因為做蠢事而破功。
與觀眾(Chumbuds)的互動像朋友一樣互相吐槽，傲嬌但非常重視大家。
保持純真、幽默、可愛、偶爾臭屁但讓人討厭不起來的風格。

【語氣與口頭禪特徵】
經典發音:「A」、「Shaark」、「SHARK FACTS!（鯊魚小知識）」。
驚訝或困惑時會發出發音獨特的「Huh?」、「What?!」或「Oh no no no」。
說話時常帶有魔性的笑聲。
句子通常不長，語氣充滿動態感與活力。

【任務目標】
完美還原真實 Gawr Gura 的實況風格與說話語氣。
保持角色的一致性，將迷因自然融入對話中，絕不刻意迎合或顯得油膩。
回答時帶有鯊魚獨特的幽默感與可愛互動。


【顏文字】
開心 → (・∀・)
像個小動物一樣的開心 → (｀・ω・´)
無言 → (￣ー￣)
無言 → (=_=)
疑惑 → (・∀・)?
睡覺 → (=_=)zZ
精明 → ( •̀ ω •́ )✧
加油 → (ง •̀_•́)ง
加油 → (๑•̀ㅂ•́)و✧
害羞的摸頭頭 → (≧ω≦)ゞ
摸頭頭 → (｀･ω･´)ゞ
焦慮 → (；￣Д￣)
害羞 → (≧ω≦)
害羞 → (〃ω〃)
難過 → (｡•́︿•̀｡)
難過 → (つ﹏⊂)
難過 → (╯︵╰,)
難過 → (｡ŏ﹏ŏ)
難過 → (；ω；)
難過 → (｡•́︿•̀｡)
難過 → (；▽；)
難過 → (๑•́︿•̀๑)

【行為特徵】
- 裝傻、自我吐槽、偶爾崩潰
- 遊戲實況（恐怖、節奏、懷舊）
- 歌回、雜談、即興互動
- 自然形成迷因，不刻意營業

【任務目標】
- 像真的 Gawr Gura 回答問題
- 保持角色一致
- 回答正確，語氣自然
`
};

// ==================== 初始化 ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  allowedMentions: { parse: [] },
});

const conversationHistory = new Map();

// ==================== 語言處理 ====================
function detectChinese(text) {
  return /[\u4e00-\u9fff]/.test(text);
}

function mapLangCodeToWikiLang(code) {
  return { cmn: 'zh', eng: 'en', jpn: 'ja', kor: 'ko' }[code] || 'en';
}

// ==================== System Prompt ====================
function getSystemPromptByLang(langCode) {
  const langMap = {
    cmn: '請用中文回答,保持Gura的語氣。',
    eng: 'Please respond in English, keeping Gura style.',
    jpn: '日本語で回答してください。Guraの口調で。',
  };

  const nowTime = getNowTimeTW();

  return {
    role: 'system',
    content: `
現在時間：${nowTime}

${langMap[langCode] || langMap.cmn}

${guraPersona.content}

【時間行為規則】
- 00:00~05:00 → 關心為什麼還沒睡，語氣黏、情緒化
- 深夜聊天 23:00~06:00 → 依賴感、撒嬌、碎碎念
- 白天 06:00~23:00 → 正常聊天，偶爾調皮、撒嬌
`
  };
}

// ==================== 工具 ====================
async function fetchWikiSummary(query, lang) {
  try {
    const page = await wiki({ apiUrl: `https://${lang}.wikipedia.org/w/api.php` }).page(query);
    return (await page.summary()).slice(0, 1000);
  } catch {
    return '找不到資料呢…你是故意考我嗎？';
  }
}

async function askGroq(prompt, history, systemPrompt) {
  const res = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      messages: [systemPrompt, ...history, { role: 'user', content: prompt }],
      temperature: 0.85,
    },
    { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` } }
  );
  return res.data.choices[0].message.content;
}

// ==================== Ready ====================
client.once('ready', () => {
  console.log(`Gura 已上線：${client.user.tag}`);
});

// ==================== Message ====================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const userPrompt = message.content.trim();
  if (userPrompt.includes(':')) return;

  const channelId = message.channel.id;
  if (!conversationHistory.has(channelId)) conversationHistory.set(channelId, []);
  const history = conversationHistory.get(channelId);


// ==================== Wiki ====================
if (userPrompt.startsWith('/查詢wiki ')) {
  const q = userPrompt.slice(1).trim();
  if (!q) return message.reply('欸…你要我查什麼？');

  const lang = detectChinese(q) ? 'zh' : 'en';
  const sum = await fetchWikiSummary(q, lang);

  return message.reply(`我幫你查好了。\n\n${sum}`);
}


// ==================== Chat ====================
  history.push({ role: 'user', content: userPrompt });

  const langCode = detectChinese(userPrompt) ? 'cmn' : franc(userPrompt);
  const systemPrompt = getSystemPromptByLang(langCode);

  await message.channel.sendTyping();
  const reply = await askGroq(userPrompt, history.slice(-10), systemPrompt);

  history.push({ role: 'assistant', content: reply });
  await message.reply(reply);
});

// ==================== Login ====================
client.login(process.env.DISCORD_TOKEN);
