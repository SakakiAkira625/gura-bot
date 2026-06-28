const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');

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

// Send Discord Webhook Embed
function sendDiscordWebhook(webhookUrl, tag, notes) {
  const parsedUrl = new URL(webhookUrl);

  // Truncate notes if exceeding Discord's embed description limit (4000 chars)
  let description = notes || '尚無詳細變更紀錄。';
  if (description.length > 3900) {
    description = description.substring(0, 3900) + '\n\n*(變更日誌過長，已截斷，請至 GitHub 查看完整內容)*';
  }

  const releaseUrl = `https://github.com/SakakiAkira625/gura-bot/releases/tag/${tag}`;

  const payload = JSON.stringify({
    embeds: [
      {
        title: `:Gura_wink: Gura Bot 更新啦 [${tag}]`,
        description: description,
        color: 0x00A2E8, // Gawr Gura Ocean Blue
        fields: [
          {
            name: '🔗 相關連結',
            value: `[前往 GitHub Release 查看完整紀錄與附件](${releaseUrl})`,
            inline: false
          }
        ],
        footer: {
          text: 'Gawr Gura Bot CI/CD Service'
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
          console.log(`[Success] Discord Webhook notification sent for ${tag}.`);
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

  console.log(`Preparing Discord notification for tag: ${tag}...`);
  const notes = getChangelogForVersion(tag);

  try {
    await sendDiscordWebhook(webhookUrl, tag, notes);
  } catch (error) {
    console.error(`[Error] Failed to send Discord Webhook notification: ${error.message}`);
    // Non-zero exit is omitted to prevent blocking the entire CI workflow if Webhook fails
  }
}

if (require.main === module) {
  main();
}
