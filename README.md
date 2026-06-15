# Gawr Gura Discord Bot (NVIDIA Agentic AI)

這是一個基於 Node.js 與 Discord.js 開發的 Gawr Gura 語氣模仿 Discord 機器人。
本專案整合了 **NVIDIA AI Foundation Endpoints**，並配備了 **意圖引擎 (Intent Engine)** 與 **長期記憶庫 (MySQL)**，讓 Gura 不只會聊天，還能自動分流任務並使用工具。

## 功能特色
- 🦈 **Gura 人格模擬**：完全還原 Gawr Gura 的說話風格、顏文字與迷因，並會根據白天或深夜展現不同的性格。
- 🧠 **意圖引擎 (Intent Routing)**：採用 Multi-Agent 架構，Gura 收到訊息後會先啟動「意圖引擎 (Llama-3.1-8b)」來判斷任務類型，再轉交給對應的模型處理：
  - `CHAT`: 日常閒聊，轉交給 `Llama-3.1-70b`，反應快速自然。
  - `CODE`: 程式碼撰寫，轉交給 `Llama-3.1-405b` 旗艦模型，確保邏輯正確。
  - `WIKI_SEARCH`: 知識查詢，觸發維基百科 API 搜尋工具補充知識後再回答。
- 💾 **長期記憶庫與好感度系統**：採用 MySQL 資料庫永久記錄使用者的對話歷史與好感度 (XP/Level)。
- 🛡️ **權限與頻道管理**：支援使用 `/allow_channel` 讓管理員動態設定允許觸發 Slash Command 的頻道。
- 🌐 **雙語支援**：自動偵測使用者的語言（中文或英文），並使用對應語言回覆。

## 安裝與執行

1. **安裝依賴套件**
   請確保你已安裝 Node.js (建議 v18 以上版本)。
   ```bash
   npm install
   ```

2. **設定環境變數**
   請將根目錄的 `.env.example` 複製或重新命名為 `.env`，並填入你的金鑰與資料庫連線資訊：
   ```env
   DISCORD_TOKEN=你的_DISCORD_機器人_TOKEN
   NVIDIA_API_KEY=你的_NVIDIA_API_金鑰
   
   # 資料庫連線設定
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=你的_DB_密碼
   DB_NAME=gura_db
   ```

3. **啟動機器人**
   ```bash
   npm start
   ```

## 專案架構
本專案採用模組化架構設計，以便後續維護與擴展：
- `src/index.js`: 主程式入口。
- `src/config/`: 環境變數與設定管理。
- `src/db/`: MySQL 資料庫連線與自動建表機制。
- `src/data/`: 存放 Gura 的提示詞 (Prompt) 與人格設定。
- `src/services/`: 封裝外部 API (NVIDIA, Wikipedia) 以及意圖引擎的核心邏輯。
- `src/commands/`: 機器人指令處理 (包含 wiki 查詢與 allow_channel 權限管理)。
- `src/events/`: Discord 事件監聽器 (如 `ready`, `messageCreate`)。
- `src/utils/`: 共用工具函數 (日誌、時間、語言偵測)。
