const https = require('https');
const { URL } = require('url');

function sendMaintenanceNotice() {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('[Warning] DISCORD_WEBHOOK_URL environment variable is not set. Skipping notification.');
    return;
  }

  const args = process.argv.slice(2);
  const reason = args[0] || '進行例行系統維修與核心升級';
  const duration = args[1] || '視維修進度而定';
  const startTime = args[2] || '即刻起';

  const parsedUrl = new URL(webhookUrl);
  const payload = JSON.stringify({
    embeds: [
      {
        title: '🛠️ Gawr Gura Bot 系統維修公告 🔱',
        description: '親愛的蝦蝦們！為了提供更優質與穩定的對話服務，機器人即將進行系統維修與升級！',
        color: 0xFFA500, // Amber / Orange warning color
        fields: [
          { name: '📌 說明 / 原因', value: reason, inline: false },
          { name: '⏰ 開始時間', value: startTime, inline: true },
          { name: '⏳ 預計耗時', value: duration, inline: true },
          { name: '⚡ 受影響服務', value: 'AI 自動對話與相關互動指令將暫時停用', inline: false },
        ],
        footer: {
          text: 'Gawr Gura Bot Maintenance Service',
        },
        timestamp: new Date().toISOString(),
      },
    ],
  });

  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  const req = https.request(options, (res) => {
    let responseBody = '';
    res.on('data', (chunk) => { responseBody += chunk; });
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('[Success] Discord maintenance notice sent successfully.');
      } else {
        console.error(`[Error] HTTP ${res.statusCode}: ${responseBody}`);
      }
    });
  });

  req.on('error', (err) => {
    console.error('[Error] Failed to send webhook:', err.message);
  });

  req.write(payload);
  req.end();
}

if (require.main === module) {
  sendMaintenanceNotice();
}
