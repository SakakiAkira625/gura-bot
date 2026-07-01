# 未來開發計畫 (TODO)

## 企業級多資料庫叢集 (Multi-DB Cluster) 與 海巡知識庫 (Knowledge Patrol)

這是一份針對系統底層大重構與新功能的開發清單，目前暫緩實作，留作未來擴充參考。

### Phase 1: 底層資料庫架構重構 (Repository Pattern & Multi-DB)
- [x] 建立統一的資料庫管理核心 `src/db/DBManager.js`（處理連線池、雙寫備援、負載平衡）。
- [x] 開發資料庫轉譯器 (Adapters)：
  - [x] `MySQLAdapter.js` (相容 TiDB)
  - [ ] `PostgresAdapter.js` (未來擴充預留)
  - [ ] `MongoAdapter.js` (未來擴充預留)
- [x] 開發資料倉儲 (Repositories) 取代原生 SQL：
  - [x] `UserRepository.js`
  - [x] `HistoryRepository.js`
  - [x] `GuildSettingsRepository.js`
  - [x] `MemoryRepository.js`
  - [x] `BotStateRepository.js`
- [x] 全面替換現有程式碼中的 `db.run` 與 `db.get`：
  - [x] 重構 `src/events/messageCreate.js`
  - [x] 重構 `src/events/ready.js`
  - [x] 重構 `src/commands/cooldown.js` 與 `src/commands/taglimit.js`
  - [x] 重構 `src/services/memoryManager.js` 與 `src/services/dreamEngine.js`

### Phase 2: 全伺服器海巡知識庫 (Guild Knowledge Patrol)
- [ ] 建立 `KnowledgeRepository.js` 處理知識庫資料讀寫。
- [ ] 開發 `src/services/guildScanner.js` (背景非同步佇列任務，具備防阻塞延遲機制)。
- [ ] 開發新指令 `src/commands/knowledge.js` (`scan`, `status`, `check`)。
- [ ] 修改 `src/services/intentEngine.js` 支援 `SERVER_QUERY` 意圖判斷。
- [ ] 實作：當判斷為伺服器詢問時，從 KnowledgeRepository 提取上下文並動態注入 Prompt 給 AI。

### Phase 3: 系統驗證與壓力測試
- [ ] 測試 Repository 轉譯邏輯，確保升級經驗值、身分組標註防護功能正常運作。
- [ ] 測試雙寫備援架構 (單一 DB 斷線不影響系統)。
- [ ] 測試海巡掃描功能，觀察背景執行時對話是否依然順暢無阻塞。
- [ ] 測試 AI 查詢伺服器知識的正確性。

## 新增未來升級計畫 (New Feature Proposals)

### 💡 方向 1：雲端 CI/CD 無人值守自動部署 (Auto-CD Deploy)
- [ ] 當 GitHub Release 成功發布時，自動觸發 GCP VM 執行 `git pull && pm2 restart gura-bot`，實現 100% 完全自動化部署。

### 💡 方向 2：Gawr Gura 的 Persona 與記憶再進化 (AI Memory & Persona)
- [ ] **Gura 的深夜作夢日記頻道**：定時將昨晚「夢到的奇幻故事與蝦蝦記憶」自動發送到專屬的 `#gura-作夢日記` 頻道。
- [ ] **記憶查詢與管理指令 (`/memory`)**：提供斜線指令查詢「Gura 目前記住了關於我的哪些事？」，並支援忘記/重置記憶功能。

### 💡 方向 3：MCP 雲端運維工具庫擴充 (GCP Health Monitor)
- [ ] **GCP VM 主機健康與資源監控**：在 `discord-ops-mcp` 中加入查詢 CPU/記憶體使用率、PM2 狀態與磁碟空間的 MCP 工具，讓 AI 代理人可在對話中直接獲取並呈現 VM 的即時健康數據 Embed 卡片。
