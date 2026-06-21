// ==================== 時間工具 ====================
function getNowTimeTW() {
  const now = new Date();
  const timeString = now.toLocaleString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Taipei",
  });
  return `${timeString} (Asia/Taipei 台灣時間)`;
}

// ==================== 語言處理 ====================
function detectChinese(text) {
  return /[\u4e00-\u9fff]/.test(text);
}

function mapLangCodeToWikiLang(code) {
  return { cmn: 'zh', eng: 'en', jpn: 'ja', kor: 'ko' }[code] || 'en';
}

module.exports = {
  getNowTimeTW,
  detectChinese,
  mapLangCodeToWikiLang,
};
