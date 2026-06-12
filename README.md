# Gura Discord Bot

這是一個基於 Node.js 與 Discord.js 開發的 Gawr Gura 語氣模仿 Discord 機器人。
它串接了 Groq 的大型語言模型 (LLM) API 來生成對話，並整合了維基百科 (Wikipedia) 的搜尋功能。

## 功能特色
- 🦈 **Gura 人格模擬**：完全還原 Gawr Gura 的說話風格、顏文字與迷因，並會根據白天或深夜展現不同的性格（例如深夜會比較愛撒嬌）。
- 🌐 **雙語支援**：自動偵測使用者的語言（中文或英文），並使用對應語言回覆。
- 📚 **維基百科搜尋**：輸入 `/查詢wiki <關鍵字>` 即可讓 Gura 幫你快速尋找並總結維基百科上的資料。
- 🧠 **對話記憶**：能記住頻道內最近的對話上下文，對話更自然流暢。

## 安裝與執行

1. **安裝依賴套件**
   請確保你已安裝 Node.js (建議 v18 以上版本)。
   ```bash
   npm install
   ```

2. **設定環境變數**
   請將根目錄的 `.env.example` 複製或重新命名為 `.env`，並填入你的金鑰：
   ```env
   DISCORD_TOKEN=你的_DISCORD_機器人_TOKEN
   GROQ_API_KEY=你的_GROQ_API_金鑰
   ```

3. **啟動機器人**
   ```bash
   npm start
   ```

## 專案架構
本專案採用模組化架構設計，以便後續維護與擴展：
- `src/index.js`: 主程式入口。
- `src/config/`: 環境變數與設定管理。
- `src/data/`: 存放 Gura 的提示詞 (Prompt) 與人格設定。
- `src/services/`: 封裝外部 API (Groq, Wikipedia) 的呼叫。
- `src/commands/`: 機器人指令處理 (目前包含 wiki 查詢)。
- `src/events/`: Discord 事件監聽器 (如 `ready`, `messageCreate`)。
- `src/utils/`: 共用工具函數 (日誌、時間、語言偵測)。
