# 更新日誌 (Changelog)

此專案的所有顯著變更將會記錄在此檔案中。

格式基於 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)，
並且本專案遵循 [語意化版本控制 (Semantic Versioning)](https://semver.org/spec/v2.0.0.html)。

## [2.1.3] - 2026-06-15

### 修復 (Fixed)
- **記憶混淆防呆機制**：修復了 `memoryManager.js` 在提取多人頻道對話上下文時，可能將其他人的特徵誤認並總結給當前使用者的問題。現在壓縮時會明確從對話中解析出目標發言者的名字（例如 `[the_reaper_of_soul]`），並在 Prompt 中嚴格指定 LLM「絕對不能」混淆其他人的特徵。

## [2.1.2] - 2026-06-15
### 修復 (Fixed)
- **海馬迴上下文缺失問題**：修正 `memoryManager.js` 在進行長期記憶壓縮時，原本只提取「使用者的單方面發言」導致大模型缺乏上下文而總結出奇怪記憶點的問題。現在壓縮時會直接拉取頻道內最新 20 筆完整對話（包含 Gura 的回覆），讓總結更加精準。
- **海馬迴門檻降低**：將壓縮觸發門檻從 10 則未壓縮訊息降低至 5 則，讓使用者能更快感受到記憶建立。

## [2.1.1] - 2026-06-15
### 變更 (Changed)
- **附件無差別辨識**：修改 `messageCreate.js` 中附件類型的判定，改為將所有「非圖片 (非 image/)」的附件都當作文字檔送交解析，徹底避免 Discord 未給予正確 `contentType` 導致 LLM 略過檔案的問題。
- **取消嚴格冒號過濾**：移除了原本會無視所有包含冒號 (`:`) 訊息的舊防呆機制，避免正常帶有 URL 或 `前綴:` 的訊息被誤殺。
- **加入無視訊息前綴過濾**：新增自訂的 Regex (`^[!\.\/]` 與 `//`)，當使用者的訊息以此開頭時，系統會完全忽視該訊息，方便使用者避開觸發對話或傳送機器人專用指令。

## [2.1.0] - 2026-06-15
### 新增 (Added)
- **動態超時機制 (Dynamic Timeout)**: 針對不同意圖 (CHAT, CODE, VISION, AUDIO) 實作不同的 API 請求超時容忍度，徹底解決生成長篇程式碼時被 15 秒限制誤殺的問題。
- **Persona 報錯整合**: 將生硬的 API 錯誤 (如 429 限流、500 Timeout) 轉化為符合 Gura 角色的專屬回應 (如大腦超載、George 模式當機)，大幅提升 UX 沉浸感。
- **回覆耗時顯示**: 於每則對話結尾利用 Discord 官方最新的 Subtext Markdown (`-#`) 顯示該次回覆的運算耗時。

### 變更 (Changed)
- 刪除了原本用於壓測模型延遲時間的測試腳本 `tests/benchmark.js`。

## [2.0.1] - 2026-06-15
- 修復 `intentEngine.js` 判定問題：由於小模型 (8B) 容易將口語化的程式請求（如「妳有辦法寫個簡單的...」）誤判為一般聊天 `CHAT`，現已在 System Prompt 中加入 Few-Shot 範例，強迫將此類意圖正確歸類為 `CODE` 模式。

## [2.0.0] - 2026-06-15

### 新增 (Added)
- **多模型動態架構與意圖引擎**：導入 `intentEngine.js`，自動分類使用者訊息 (CHAT, CODE, WIKI_SEARCH)，並分配至 NVIDIA API 上對應的最佳模型。
- **動態模型管理與 Fallback 系統**：新增 `modelManager.js` 於啟動時自動同步 NVIDIA NIM 模型清單並執行體檢 (Health Check)，遇到 404 或死機時會自動切換降級 (Auto-Fallback) 保護機制。
- **Slash Command 動態權限系統 (Plan B)**：導入資料庫 `command_channels` 管理指令白名單，並加入管理員專屬的 `/allow_channel` 進行熱更新設定。

### 變更 (Changed)
- 全面廢除 Groq 服務，底層生成模型全面改為對接 NVIDIA API。

## [1.5.0] - 2026-06-15
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
