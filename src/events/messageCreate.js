const { PermissionFlagsBits } = require('discord.js');
const { franc } = require('franc');
const { detectChinese } = require('../utils/helpers');
const { getSystemPromptByLang, getPersonaErrorReply } = require('../data/persona');
const { askNvidiaWithFallback } = require('../services/nvidiaService');
const { classifyIntent, extractWikiKeyword } = require('../services/intentEngine');
const { fetchWikiSummary } = require('../services/wikiService');
const { retrieveRelevantMemories, summarizeAndStoreMemory } = require('../services/memoryManager');
const { downloadTextFile } = require('../utils/fileHelper');
const emojiManager = require('../services/emojiManager');
const logger = require('../utils/logger');
const { getMessage } = require('../utils/i18n');

// 載入資料庫 Repositories
const userRepository = require('../db/repositories/UserRepository');
const historyRepository = require('../db/repositories/HistoryRepository');
const guildSettingsRepository = require('../db/repositories/GuildSettingsRepository');
const commandChannelRepository = require('../db/repositories/CommandChannelRepository');
const botStateRepository = require('../db/repositories/BotStateRepository');
const knowledgeRepository = require('../db/repositories/KnowledgeRepository');

// 記憶體中記錄使用者最後收到冷卻監獄警告的時間，防止 Discord API 限流
const jailWarningCooldowns = new Map();

/**
 * 清理 AI 回覆中可能被模仿生出的時間戳或角色名稱前綴
 */
function cleanReplyPrefix(text) {
  if (!text) return '';
  let previousText;
  do {
    previousText = text;
    // 移除時間戳，例如 [下午08:20]、[14:30]、[上午 09:15]
    text = text.replace(/^\[(?:上午|下午)?\s*\d{1,2}:\d{2}(?::\d{2})?\]\s*/i, '');
    // 移除可能模仿的角色名前綴，例如 [Gura]:、[Gawr Gura]:、[assistant]:、[GawrGura]:
    text = text.replace(/^\[(?:Gura|Gawr\s+Gura|assistant|GawrGura)\]:\s*/i, '');
  } while (text !== previousText);
  return text;
}

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;

    const userPrompt = message.content.trim();
    
    // 使用 Regex 檢查第一個字元，如果以 !、.、/ 或 // 開頭，則機器人無視該訊息
    if (/^[!\.\/]/.test(userPrompt) || userPrompt.startsWith('//')) return;

    // Detect language early
    const langCode = detectChinese(userPrompt) ? 'cmn' : franc(userPrompt);

    const { mapLangCodeToWikiLang } = require('../utils/helpers');

    const userId = message.author.id;
    const channelId = message.channel.id;
    
    // 檢查頻道是否在 AI 對話白名單內 (如果該伺服器有設定白名單的話)
    if (message.guildId) {
      const allowedChannels = await commandChannelRepository.getAllowed(message.guildId);
      if (allowedChannels.length > 0) {
        const isAllowed = allowedChannels.some(row => row.channel_id === channelId);
        if (!isAllowed) return; // 不在白名單內，不進行 AI 對話
      }
    }
    const now = Date.now();

    // 🌟 檢查身分組標註限制 (Tag Limit)
    if (message.guildId) {
      try {
        const gs = await guildSettingsRepository.get(message.guildId);
        if (gs && gs.tag_limit_role_id && message.mentions.roles.has(gs.tag_limit_role_id)) {
          // 如果標註了受保護身分組，檢查權限
          const member = message.member;
          const hasPerm = member && member.permissions.has(PermissionFlagsBits.Administrator);
          
          if (!hasPerm) {
            const targetRole = message.guild.roles.cache.get(gs.tag_limit_role_id);
            if (targetRole && targetRole.mentionable) {
              const disabledUntil = now + (gs.tag_limit_hours * 60 * 60 * 1000);
              await guildSettingsRepository.updateTagDisabledUntil(message.guildId, disabledUntil);
              await targetRole.setMentionable(false, 'User triggered tag limit');
              const untilDate = new Date(disabledUntil).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
              logger.info(`用戶 ${message.author.username} (${message.author.id}) 標註了保護身分組 ${targetRole.name}，已關閉 mentionable 直到 ${untilDate}。`);
              
              const reply = await message.reply(`🚨 **警告**：你標註了受保護的身分組！此身分組已暫時關閉標註功能，直到 \`${untilDate}\` 為止。`);
              setTimeout(() => reply.delete().catch(() => {}), 5000);
            }
          }
        }
      } catch (err) {
        logger.error('[Tag Limit Check Error]', err);
      }
    }

    // 🌟 功能一：好感度與等級系統 (Shrimp Level System)
    let user = null;
    try {
      user = await userRepository.getById(userId);
      
      if (!user) {
        user = await userRepository.create(userId, now);
      }

      // 60秒冷卻時間，避免洗頻刷經驗
      if (now - user.last_message_at > 60000) {
        const gainedXp = Math.floor(Math.random() * 11) + 15; // 獲得 15~25 XP
        let newXp = user.xp + gainedXp;
        let newLevel = user.level;
        const xpNeeded = newLevel * 100;

        if (newXp >= xpNeeded) {
          newLevel += 1;
          newXp -= xpNeeded;
          await message.channel.send(`🎉 <@${userId}> 的蝦蝦好感度提升到了等級 **${newLevel}**！a... 謝謝你的陪伴！`);
        }

        await userRepository.updateXpAndLevel(userId, newXp, newLevel, now);
      }
    } catch (err) {
      logger.error('更新使用者等級失敗', err);
    }

    // 🌟 功能一點五：檢查 AI 回覆冷卻與懲罰
    if (user) {
      // 1. 檢查是否在強制冷卻懲罰中
      if (user.cooldown_until && user.cooldown_until > now) {
        const lastWarn = jailWarningCooldowns.get(userId) || 0;
        // 每 30 秒最多警告一次，其餘直接無視不回覆
        if (now - lastWarn > 30000) {
          jailWarningCooldowns.set(userId, now);
          try {
            const reply = await message.reply('a... 不要吵啦！Gura 現在不想理你了！🦈💢 *(被關入冷卻監獄中)*');
            setTimeout(() => reply.delete().catch(() => {}), 5000);
          } catch (e) { /* ignore */ }
        }
        return; // 懲罰中，直接無視
      }

      // 2. 檢查是否在全域冷卻中
      if (message.guildId) {
        const gs = await guildSettingsRepository.get(message.guildId);
        if (gs && gs.reply_cooldown > 0 && user.last_reply_at) {
          if (now - user.last_reply_at < gs.reply_cooldown * 1000) {
            try {
              const reply = await message.reply('a... 讓 Gura 喘口氣好嗎！游太快會累的！🦈💦 *(冷卻中)*');
              setTimeout(() => reply.delete().catch(() => {}), 5000);
            } catch (e) { /* ignore */ }
            return; // 全域冷卻中，直接無視
          }
        }
      }
    }

    // 🌟 功能二：對話記憶永久化 (Persistent Memory)
    try {
      // 加入使用者名稱讓 Gura 可以識別是誰在說話
      const userPromptWithName = `[${message.author.username}]: ${userPrompt}`;

      // 讀取最近的 10 筆對話紀錄 (取得先前的歷史，不包含當前訊息)
      const rawHistory = await historyRepository.getRecent(channelId, 10);
      const history = rawHistory.reverse().map(row => {
        const timeStr = new Date(row.timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Taipei' });
        return {
          role: row.role,
          content: `[${timeStr}] ${row.content}`
        };
      });

      // 儲存使用者的當前對話
      await historyRepository.add(userId, channelId, 'user', userPromptWithName, now);

      const systemPrompt = getSystemPromptByLang(langCode);

      // 隨機抽取伺服器表符
      if (message.guild) {
        const emojis = message.guild.emojis.cache;
        if (emojis.size > 0) {
          const emojiArray = Array.from(emojis.values());
          const shuffled = emojiArray.sort(() => 0.5 - Math.random());
          const selectedEmojis = shuffled.slice(0, 15).map(e => e.toString());
          systemPrompt.content += `\n\n【伺服器專屬表符】\n你可以使用這些表情符號來增加互動趣味，請自然地穿插在回覆中：\n${selectedEmojis.join(' ')}`;
        }
      }

      // 🌟 夢境觸發系統：檢查是否有人說早安，且昨晚有作夢
      if (userPrompt.match(/早安|morning|早阿|早上好/i)) {
        const state = await botStateRepository.get();
        if (state && state.current_dream) {
          try {
            await message.channel.sendTyping();
          } catch (err) {}
          logger.info(`[Dream Engine] 觸發晨間夢境分享給 ${message.author.username}`);
          
          const reply = state.current_dream;
          await botStateRepository.clearDream(); // 清空夢境，避免重複分享
          
          await historyRepository.add(message.client.user.id, channelId, 'assistant', reply, Date.now());
          await message.reply(reply);
          return; // 結束流程，不繼續進入普通 LLM 回覆
        }
      }

      // 海馬迴檢索：找尋相關長期記憶
      const relevantMemories = await retrieveRelevantMemories(userId, userPrompt);
      if (relevantMemories.length > 0) {
        systemPrompt.content += `\n\n【海馬迴記憶喚醒】\n（重要指示：雖然你的角色設定是記憶力像金魚，但當這裡提供資訊時，你**必須**準確回答出來！你可以表現出「其實我偷偷記住了」或「突然靈光一閃想起來」的得意感，**絕對不可以**裝傻說不知道或忘記！）\n根據過去的紀錄，請記得關於使用者的這些事：\n${relevantMemories.map(m => '- ' + m).join('\n')}`;
      }
      // 注入伺服器自訂表情符號 context
      systemPrompt.content += emojiManager.getSystemPromptContext();

      try {
        await message.channel.sendTyping();
      } catch (err) {
        logger.warn(`[Message] 無法發送打字狀態 (可能缺乏權限): ${err.message}`);
      }
      const reqStartTime = Date.now();
      
      // 處理附件 (檔案與圖片)
      const currentTimeStr = new Date(now).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Taipei' });
      let finalUserPrompt = `[${currentTimeStr}] ${userPromptWithName}`;
      let finalPromptPayload = null; // 放 OpenAI Vision Array
      let forceIntent = null;

      if (message.attachments.size > 0) {
        const textAttachments = [];
        const imageAttachments = [];

        message.attachments.forEach(att => {
          // 將所有非圖片的附件都視為文字檔進行下載解析
          if (att.contentType && att.contentType.startsWith('image/')) {
            imageAttachments.push(att);
          } else {
            textAttachments.push(att);
          }
        });

        logger.info(`[Attachment Debug] textAttachments: ${textAttachments.length}, imageAttachments: ${imageAttachments.length}`);

        for (const att of textAttachments) {
          logger.info(`[Attachment Debug] Downloading text file: ${att.url}`);
          const content = await downloadTextFile(att.url);
          if (content) {
            logger.info(`[Attachment Debug] Download successful, content length: ${content.length}`);
            finalUserPrompt += `\n\n[使用者上傳了檔案 ${att.name}，內容如下]\n${content}`;
          } else {
            logger.warn(`[Attachment Debug] Content is empty or failed to download.`);
          }
        }

        if (imageAttachments.length > 0) {
          forceIntent = 'VISION';
          finalPromptPayload = [
            { type: 'text', text: finalUserPrompt }
          ];
          for (const att of imageAttachments) {
            finalPromptPayload.push({
              type: 'image_url',
              image_url: { url: att.url }
            });
          }
        }
      }

      if (!finalPromptPayload) {
        finalPromptPayload = finalUserPrompt;
      }

      const intent = forceIntent || await classifyIntent(userPrompt);
      logger.info(`[Intent Engine] User: ${message.author.username} | Intent: ${intent}`);

      let reply = '';
      if (intent === 'SERVER_QUERY') {
        if (!message.guildId) {
          reply = "a... 這裡不是伺服器耶，我沒辦法幫你海巡喔！🦈";
        } else {
          const isChannelSpecific = /頻道|channel|這台|這裡|這區/.test(userPrompt);
          let records = [];
          if (isChannelSpecific) {
            records = await knowledgeRepository.getKnowledgeByChannel(channelId, 5);
          } else {
            records = await knowledgeRepository.getKnowledgeByGuild(message.guildId, 10);
          }

          if (records.length === 0) {
            reply = "a... Gura 還沒有去海巡過這裡耶！你可以用 `/knowledge scan` 叫我去海巡看看喔！🦈";
          } else {
            let knowledgeContext = "\n\n【伺服器海巡日誌與歷史對話摘要】\n以下是 Gura 之前幫你海巡記錄下來的對話重點摘要，請參考這些內容回答使用者的問題。請注意，這些是歷史摘要，不是現在發生的事，你可以用得意、炫耀的語氣（比如「我可是很聰明的鯊鯊，我都幫你們記下來了」）說出你記得的這些內容，千萬不要說這是外部摘要或系統注入的！\n";
            
            const formattedRecords = records.map(record => {
              const chName = message.guild.channels.cache.get(record.channel_id)?.name || '未知頻道';
              const timeStr = new Date(record.timestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
              return `[頻道: #${chName} | 時間: ${timeStr}]\n${record.summary}`;
            }).join('\n\n');
            
            const serverQueryPrompt = {
              role: 'system',
              content: `${systemPrompt.content}${knowledgeContext}${formattedRecords}`
            };
            
            reply = await askNvidiaWithFallback(finalPromptPayload, history, serverQueryPrompt, 'CHAT');
          }
        }
      } else if (intent === 'WIKI_SEARCH') {
        const keyword = await extractWikiKeyword(userPrompt);
        logger.info(`[Intent Engine] Wiki Keyword extracted: ${keyword}`);
        const wikiLang = mapLangCodeToWikiLang(langCode);
        const wikiData = await fetchWikiSummary(keyword, wikiLang);

        let wikiContextPrompt = systemPrompt;
        if (wikiData) {
          wikiContextPrompt = {
            role: 'system',
            content: `${systemPrompt.content}\n\n【維基百科搜尋結果】\n請根據以下資料，用Gura的語氣簡單向使用者說明：\n${wikiData}`
          };
        } else {
          wikiContextPrompt = {
            role: 'system',
            content: `${systemPrompt.content}\n\n【系統提示】找不到相關資料，請用Gura的語氣向使用者裝傻或抱怨找不到。`
          };
        }
        reply = await askNvidiaWithFallback(finalPromptPayload, history, wikiContextPrompt, 'CHAT');
      } else if (intent === 'CODE') {
        reply = await askNvidiaWithFallback(finalPromptPayload, history, systemPrompt, 'CODE');
      } else if (intent === 'VISION') {
        reply = await askNvidiaWithFallback(finalPromptPayload, history, systemPrompt, 'VISION');
      } else {
        reply = await askNvidiaWithFallback(finalPromptPayload, history, systemPrompt, 'CHAT');
      }

      // 清理 reply 開頭可能被 AI 模仿生出的時間戳或角色標籤
      reply = cleanReplyPrefix(reply);
      // 自動將 reply 中的 :emoji_name: 替換為帶有 ID 的伺服器自訂表情符號
      reply = emojiManager.replaceEmojiNames(reply);
      
      // 儲存 Gura 的回覆 (機器人本身的 user_id)，注意不要把耗時字串存進資料庫，否則模型會學習並自己產生
      await historyRepository.add(message.client.user.id, channelId, 'assistant', reply, Date.now());

      const reqEndTime = Date.now();
      const timeTaken = ((reqEndTime - reqStartTime) / 1000).toFixed(1);
      const finalReply = reply + `\n\n-# 回覆耗時: ${timeTaken} 秒`;
      
      logger.info(`[AI Response to ${message.author.username}]: ${finalReply}`);
      
      // 處理 Discord 2000 字元限制
      const maxLength = 1990;
      if (finalReply.length <= maxLength) {
        await message.reply(finalReply);
      } else {
        let remainingText = finalReply;
        let isFirst = true;
        while (remainingText.length > 0) {
          let chunkLength = maxLength;
          if (remainingText.length > maxLength) {
            // 尋找最後一個換行符號，盡量不切斷句子或程式碼區塊
            const lastNewline = remainingText.lastIndexOf('\n', maxLength);
            if (lastNewline > 0) {
              chunkLength = lastNewline;
            }
          }
          
          let chunk = remainingText.slice(0, chunkLength);
          remainingText = remainingText.slice(chunkLength).trimStart();
          
          if (isFirst) {
            await message.reply(chunk);
            isFirst = false;
          } else {
            await message.channel.send(chunk);
          }
        }
      }

      // 對話結束後，背景非同步執行海馬迴總結與沉澱
      summarizeAndStoreMemory(userId, channelId).catch(e => logger.error(`[海馬迴背景處理失敗] ${e.message}`));

      // 更新使用者的最後 AI 回覆時間
      await userRepository.updateLastReply(userId, Date.now());

    } catch (error) {
      logger.error('Error handling message:', error);
      try {
        const errorReply = getPersonaErrorReply(langCode, error.status);
        await message.reply(errorReply);
      } catch(e) {}
    }
  },
};
