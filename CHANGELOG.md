# 更新日誌 (Changelog)

此專案的所有顯著變更將會記錄在此檔案中。

格式基於 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)，
並且本專案遵循 [語意化版本控制 (Semantic Versioning)](https://semver.org/spec/v2.0.0.html)。

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
