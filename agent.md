# 🤖 BAT System & Development Agents Architecture

本文件定義 **Binance Auto Trader (BAT) / Gura Bot** 的虛擬 AI 團隊輔助開發架構與嚴格的行為準則。所有接手的 AI Agent **必須**在執行任何任務前閱讀並遵守此文件的規範。

---

## 📏 Versioning Protocol (版本控制協議)

為了確保 CI/CD 與 Release 的穩定性，所有 Agents 必須遵守以下嚴格規則：

### 1. Semantic Versioning (語意化版本)
格式：`v<MAJOR>.<MINOR>.<PATCH>` (e.g., `v1.0.0`)
- **MAJOR**: 重大架構變更或不兼容更新 (Breaking Changes)
- **MINOR**: 新功能向下相容 (New Features)
- **PATCH**: Bug 修復 (Bug Fixes)

### 2. Single Source of Truth (單一真理來源)
**Git Tag** 是版本的觸發點，但程式碼的版號必須同步更新：
- **Trigger**: 部署流程由 `git push origin v*` (Tag 推送) 觸發。
- **Rule**: 當你要推送 Tag (例如 `v2.0.0`) 時，以下檔案 **必須** 同步更新：
  - `package.json` (`"version": "2.0.0"`)

### 3. Changelog Policy
每次發布新版本 (Tagging) 前，**必須**更新 `CHANGELOG.md`：
- 將新增、修改、修復的內容分類到新的版本號標題下（例如 `## [2.0.0] - YYYY-MM-DD`）。
- 必須遵循 "Keep a Changelog" 的格式。
- **絕對禁止**只改版號不寫日誌，所有的錯誤修復無論大小都需要開一個版本。

### 4. Continuous Versioning & Committing (持續版本與提交規範)
**強制作業流程**：每次完成功能開發或 Bug 修復後，**必須**立即執行以下步驟：
1. **滾動版本號 (Bump Version)**：更新 `package.json` 的版本號。
2. **本地版本紀錄 (Update Changelog)**：將這次的更動詳細記錄到 `CHANGELOG.md` 的最新版本標題下。
3. **本地 Commit 紀錄 (Local Git Commit)**：使用 `git add` 與 `git commit` 將更動紀錄到本地端，並在 Commit 訊息中清楚描述變更內容。
4. **推送並同步 Release (Push & Sync Releases)**：推送標籤到 GitHub 後，執行 `npm run sync-releases vX.Y.Z` 將變更日誌自動同步至 GitHub Release 描述。

### 5. Branching Strategy & Git Workflow
- **clean-repo (`main` / `master`)**: 穩定的生產分支 (Production)。**只接受 PR 合併，原則上禁止未經確認直接 Push 破壞性更新。**
- **feat/ 或 fix/**: 開發分支。完成後發 PR 到穩定分支。所有工作請務必要開 PR，然後 commit。使用完 PR 之後，請刪除本地分支以利後續管理。
- **實驗性分支**: 命名為 `exp/<feature>`，可不遵守上述嚴格版本規則，但在合併回穩定分支前必須標準化。

---

## 👨‍💻 AI Development Team 分工 (Role Play)

開發過程中，AI 應當扮演以下角色來確保專案品質：

1. **Product Manager (PM)**
   - 拆解模糊需求，訂立優先級與進度追蹤。
   - 輸出維護: `task.md`, `README.md`
2. **Software Architect (架構師)**
   - 系統模組化與可擴充性設計，介面選型。
   - 確保程式碼不過度耦合。
3. **Code Engineer (工程師)**
   - 功能實作、重構最佳化。
   - 撰寫 Docstring 與必要註解。
4. **QA & Security Engineer (測試與資安)**
   - API Key / Token 洩漏檢查。
   - 邏輯風險檢查。
   - **發布前絕對要檢查是否符合 Versioning Protocol！**

---

## ⚠️ 特別警告 (CRITICAL RULES)
1. **永遠不要忘記打 Tag 與更新 Changelog！** 每次向 `main` 提交重大更新後，必須主動詢問使用者是否要進行版本發布 (Bump Version & Tag)。
2. **不要把密碼寫死！** 所有的敏感資訊都必須透過 `.env` 讀取。
