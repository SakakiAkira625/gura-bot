# 更新日誌 (Changelog)

此專案的所有顯著變更將會記錄在此檔案中。

格式基於 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)，
並且本專案遵循 [語意化版本控制 (Semantic Versioning)](https://semver.org/spec/v2.0.0.html)。

## [1.5.0] - 2026-06-15

### 變更 (Changed)
- **架構升級**：將底層資料庫從 SQLite 遷移至高效能的 MySQL，以支援更好的併發與多執行緒連線效能。
- 修改了 `database.js` 底層連線池機制，透過 `mysql2/promise` 建立連線，並兼容舊有的非同步執行語法。
- 新增環境變數設定 (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`)。

## [1.4.0] - 2026-06-15

### 新增 (Added)
- 導入本地端 SQLite 資料庫 (`better-sqlite3` 替代品 `sqlite3` + `sqlite`) 作為永久資料儲存方案。
- **好感度與等級系統**：使用者透過與 Gura 聊天可以累積 Shrimp Points (XP)，並透過 `/rank` 斜線指令查詢目前好感度。
- **對話永久化 (Persistent Memory)**：Gura 的聊天上下文現在改為寫入資料庫，解決機器人重啟後會遺忘聊天對話的問題。

## [1.3.0] - 2026-06-15

### 新增 (Added)
- 導入完整的日誌追蹤系統，將原本的 `console.log` 替換為 `winston` 框架。
- 實作日誌檔案輸出與自動輪轉 (`winston-daily-rotate-file`)，日誌檔會被妥善保存在 `logs/` 資料夾並設定 14 天的保留上限。
- 終端機輸出現在會帶有易於辨識的顏色與一致化的時間戳記。

## [1.2.0] - 2026-06-12

### 新增 (Added)
- 實作了完整的自動多語系 (i18n) 系統，並將預設語言設為繁體中文 (`cmn`)。
- 將 `wiki` 指令升級為真正的斜線指令 (Slash Command)，並於開機時自動向 Discord 伺服器註冊。
- 引入動態指令與事件載入機制 (Dynamic Command Handler)，大幅提高專案可擴展性。
- 將原本死板的 `wiki` 指令升級，現在它會先讀取維基百科內容，再由 AI 模擬 Gura 的語氣，用使用者的語言自動解說。

### 修正 (Fixed)
- 修復了斜線指令因超過 3 秒未回覆而導致「應用程式沒有回應」的錯誤，現已加入 `deferReply` 等待狀態機制。
- 修復了如果 AI 生成過多文字會超過 Discord 2000 字元上限的崩潰問題，加入了提示詞字數限制與長度防呆截斷。
- 移除了啟動時 Discord.js v14 舊版 `ready` 事件導致的 `DeprecationWarning`。

## [1.1.0] - 2026-06-12

### 新增 (Added)
- 在 `src/` 目錄下建立靜態、模組化的專案架構。
- 於 `src/config/env.js` 實作集中的環境變數載入與驗證。
- 於 `src/utils/logger.js` 實作標準化的日誌輸出工具。
- 新增 Discord.js 事件的動態載入機制。
- 將 API 呼叫獨立抽取至專屬的服務模組 (`groqService`, `wikiService`)。

### 修正 (Fixed)
- 修復了對話歷史紀錄緩衝區的嚴重記憶體洩漏 (Memory Leak) 漏洞，現在會強制將歷史訊息數量限制在 50 筆以內。
- 修復了未處理的 Promise Rejections 問題，已為所有的 API 呼叫加入 `try-catch` 例外處理區塊。
- 移除了先前未加密並寫死在程式碼版本控制中的 Discord Token，確保資安無虞。
