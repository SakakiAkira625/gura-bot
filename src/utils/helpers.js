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
