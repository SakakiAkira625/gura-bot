const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
const emojisFilePath = path.join(__dirname, '..', 'src', 'data', 'emojis.json');

// Helper to get cached guild emoji by name if available
function getCachedEmoji(name, fallback = '') {
  try {
    if (fs.existsSync(emojisFilePath)) {
      const json = JSON.parse(fs.readFileSync(emojisFilePath, 'utf8'));
      if (json[name]) {
        return json[name];
      }
    }
  } catch (e) {
    // ignore lookup error
  }
  return fallback;
}

// Parse CHANGELOG.md for a specific version
function getChangelogForVersion(targetTag) {
  if (!fs.existsSync(changelogPath)) {
    console.error(`[Error] Changelog not found at ${changelogPath}`);
    return null;
  }

  const version = targetTag.replace(/^v/, '');
  const content = fs.readFileSync(changelogPath, 'utf8');
  const lines = content.split(/\r?\n/);

  let currentVersion = null;
  let currentNotes = [];
  const versionHeaderRegex = /^##\s+\[?([0-9]+\.[0-9]+\.[0-9]+)\]?/;

  for (const line of lines) {
    const match = line.match(versionHeaderRegex);
    if (match) {
      if (currentVersion === version) {
        break; // Reached next version header
      }
      currentVersion = match[1];
      currentNotes = [];
    } else if (currentVersion === version) {
      if (line.includes('格式基於 [Keep a Changelog]') || line.includes('並且本專案遵循 [語意化版本控制]')) {
        continue;
      }
      currentNotes.push(line);
    }
  }

  if (currentNotes.length === 0) {
    return null;
  }

  return currentNotes.join('\n').trim();
}

// Send Discord Webhook Notice (Text + Embed)
function sendDiscordWebhook(webhookUrl, tag, notes, statusState = 'success') {
  const parsedUrl = new URL(webhookUrl);
  const today = new Date();
  const dateStr = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;
  const isSuccess = statusState === 'success';

  // Support Custom Emojis via ENV -> local emojis.json cache -> fallback strings
  const fallbackOnline = ':online~1:';
  const fallbackOffline = ':offline~1:';
  const cachedOnline = getCachedEmoji('online', fallbackOnline);
  const cachedOffline = getCachedEmoji('offline', fallbackOffline);

  const customOnlineEmoji = process.env.DISCORD_EMOJI_ONLINE || cachedOnline;
  const customOfflineEmoji = process.env.DISCORD_EMOJI_OFFLINE || cachedOffline;
  const statusEmoji = isSuccess ? customOnlineEmoji : customOfflineEmoji;

  const statusText = isSuccess ? '升級完成，服務正常運作 🟢 🔱' : `建置遭遇異常，排查中... ${customOfflineEmoji} ⚠️`;
  const reasonText = isSuccess ? `🚀 完成版本升級 (${tag})` : `🔧 自動建置過程異常`;
  const durationText = isSuccess ? '✨ 已完成' : '⏳ 處理中';

  // Mention Role (e.g. @everyone or <@&ROLE_ID>) if provided in environment
  const mentionPrefix = process.env.DISCORD_MENTION_ROLE ? `${process.env.DISCORD_MENTION_ROLE}\n` : '';

  // 1. Plain text header conforming to user's specified format
  const plainContent = `${mentionPrefix}${dateStr}\n🛠️ 主機更新通知　${statusEmoji}\n影響節點: Gura機器人 🦈\n原因: ${reasonText}\n預計時間: ${durationText}\n目前狀態: ${statusText}`;

  // 2. Beautiful Embed enriched with lively emojis
  let description = notes || '尚無詳細變更紀錄。';
  if (description.length > 3900) {
    description = description.substring(0, 3900) + '\n\n*(變更日誌過長，已截斷，請至 GitHub 查看完整內容)*';
  }

  const releaseUrl = `https://github.com/SakakiAkira625/gura-bot/releases/tag/${tag}`;
  const embedColor = isSuccess ? 0x00A2E8 : 0xE74C3C; // Ocean Blue or Crimson Red

  const payload = JSON.stringify({
    content: plainContent,
    embeds: [
      {
        title: isSuccess ? `🔱 :Gura_wink: Gawr Gura Bot 更新成功啦！[${tag}] ✨` : `⚠️ Gura Bot 自動建置提醒 [${tag}]`,
        description: `💙 **感謝大家的耐心等待！以下是本次更新亮點：**\n\n${description}`,
        color: embedColor,
        fields: [
          {
            name: '📦 跨平台執行檔與完整紀錄',
            value: `🔗 [點我前往 GitHub Release 查看與下載附件](${releaseUrl})`,
            inline: false
          }
        ],
        footer: {
          text: '🔱 Gawr Gura Bot CI/CD Operations'
        },
        timestamp: new Date().toISOString()
      }
    ]
  });

  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[Success] Discord Webhook notification sent for ${tag} (status: ${statusState}).`);
          resolve();
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(payload);
    req.end();
  });
}

async function main() {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('[Warning] DISCORD_WEBHOOK_URL environment variable is not set. Skipping Discord notification.');
    return;
  }

  const args = process.argv.slice(2);
  const tag = args[0] || 'v' + require('../package.json').version;
  const statusState = args[1] || 'success'; // success, failure, etc.

  console.log(`Preparing Discord notification for tag: ${tag} (Status: ${statusState})...`);
  const notes = getChangelogForVersion(tag);

  try {
    await sendDiscordWebhook(webhookUrl, tag, notes, statusState);
  } catch (error) {
    console.error(`[Error] Failed to send Discord Webhook notification: ${error.message}`);
  }
}

if (require.main === module) {
  main();
}
