# Agent Workflow & Knowledge Base

這份檔案主要用來記錄協助開發 Gura Bot 的 AI Agents 應該遵守的工作流程，以及未來可用的資源。

## 工作流程與版本控制 (Workflow Rules)
1. **本地版本滾動與 Commit**：
   - 每次協助使用者完成並測試好一項更動（Bug Fix 或新功能）後，必須在 `package.json` 與 `CHANGELOG.md` 中滾動版本號。
   - 遵循 Semantic Versioning（MAJOR.MINOR.PATCH）。
   - 進行本地 Git Commit 紀錄與標籤 (Tag) 標記（如 `git commit -m "..." && git tag vX.Y.Z`）。
   - 完成後主動或提醒使用者推送到遠端伺服器（`git push origin main --tags`）。

2. **開發原則**：
   - Gura 的 Persona 不應被破壞，所有對話、回覆設計必須符合 Gawr Gura 的設定與語氣。
   - 注意 NVIDIA API 的速率限制 (40 RPM)，在使用迴圈或大批量測試時，務必採用非同步批次與延遲 (Delay) 保護機制。
   - 所有的功能擴展（如海馬迴、自動掃描等）都應盡量設計在背景執行，不阻塞主執行緒或使用者的對話體驗。

3. **安全防護與錯誤處理**：
   - **全面檢查錯誤處理機制**：不論更新規模大小，每次修改程式碼時必須確保所有可能失敗的操作（如非同步請求、外部 API 呼叫、資料庫讀寫、子程序啟動等）都包覆在 `try-catch` 中或妥善處理 `.catch()`，防止異常向上拋出導致機器人崩潰。
   - **例行安全稽核**：每次發布前均需進行安全審查，特別防範 SSRF（如下載附件限縮官方網域）、API Rate Limit 防護（如 Discord 與 NVIDIA API 的頻率控制）、SQL 注入與敏感資訊外洩。

## 資源與擴充靈感 (Resources & API Inspirations)

### Public APIs
🔗 **[Public APIs GitHub Repository](https://github.com/public-apis/public-apis)**
這裡包含了大量免費且實用的公開 API，未來若要為 Gura 擴充更多有趣的技能時可以使用，例如：
- **Animals**: 抓取隨機的貓咪/狗狗/海洋生物圖片。
- **Anime**: 查詢新番、動漫資訊，讓 Gura 陪聊 ACG 話題。
- **Games & Comics**: 擴充特定遊戲或漫畫的數據查詢功能。
- **Weather / Geocoding**: 讓 Gura 能告訴你今天的天氣（雖然她住在亞特蘭提斯）。
- **Machine Learning**: 其他有趣的圖像/聲音生成 API 串接。
