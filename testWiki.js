const wiki = require('wikijs').default;

async function testWiki(keyword, lang = 'en') {
  try {
    const page = await wiki({ apiUrl: `https://${lang}.wikipedia.org/w/api.php` }).page(keyword);
    const summary = await page.summary();
    console.log(`✅ 成功取得 Wiki 內容：\n\n${summary}`);
  } catch (err) {
    console.error('❌ Wiki 查詢錯誤:', err.message || err);
  }
}

testWiki('Gawr Gura'); // 可改成其他關鍵字
