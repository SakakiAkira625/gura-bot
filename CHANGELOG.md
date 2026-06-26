# 更新日誌 (Changelog)

此專案的所有顯著變更將會記錄在此檔案中。

## [3.1.1] - 2026-06-27

### 變更 (Changed)
- **大上下文海巡與實時進度回報**：
  - 重構 `guildScanner.js`，將分段 100 筆對話摘要模式調整為單一大型上下文視窗彙整模式（最多 1000 筆對話），能精確分析頻道綜觀與區分活躍使用者的行為特徵紀錄（User Profiles）。
  - 優化 `/knowledge scan` 指令，支援對整個伺服器所有活躍文字頻道（最多 5 個）進行批次海巡。
  - 實作管理員實時進度面板，在掃描過程中即時展示讀取進度、狀態圖示與已生成摘要之焦點簡報 snippet。

## [3.1.0] - 2026-06-27

### 新增 (Added)
- **伺服器海巡知識庫 (Guild Knowledge Patrol)**：
  - 新增 `KnowledgeRepository` 類別，管理頻道的掃描狀態與儲存對話的彙整摘要。
  - 開發 `guildScanner.js` 背景服務，具備 Discord API (分頁抓取) 與 NVIDIA NIM API (速率限制延遲) 防護的無阻塞非同步海巡功能。
  - 新增 `/knowledge` 斜線指令組：
    - `/knowledge scan [channel]`：開始背景掃描指定頻道的對話紀錄。
    - `/knowledge status [channel]`：查詢海巡掃描的進度狀態（idle, scanning, completed, failed）。
    - `/knowledge check [channel]`：預覽已產生的對話摘要。
  - 擴充 `intentEngine.js` 以支援 `SERVER_QUERY` 意圖分類。
  - 於 `messageCreate.js` 整合海巡上下文，當使用者詢問伺服器近況時，AI 能根據海巡所得摘要進行符合鯊魚 Persona 的生動回覆。

## [3.0.0] - 2026-06-27

### 變更 (Changed)
- **底層資料庫大重構 (Repository & Adapter Pattern)**：完成了整個資料庫層的架構重組，成功將底層 MySQL 數據讀寫從主程式業務邏輯中抽離。
  - 新增 `DBManager` 作為多資料庫連線的單一入口。
  - 建立 `BaseAdapter` 與 `MySQLAdapter` 定義標準連線協議，保留未來擴充 Postgres/MongoDB 的能力。
  - 開發並替換所有的 Repositories (`UserRepository`, `HistoryRepository`, `GuildSettingsRepository`, `MemoryRepository`, `BotStateRepository`, `CommandChannelRepository`) 代替原生 SQL 操作。

## [2.9.9] - 2026-06-27

### 修正 (Fixed)
- **安全稽核漏洞修復 (NVIDIA API Rate Limit)**：調整模型背景掃描 `modelScanner.js` 的批次設定（併發度降至 2，批次延遲增至 3 秒），降低衝擊 NVIDIA NIM API 40 RPM 限制的機率。
- **安全稽核漏洞修復 (音樂播放子程序錯誤處理)**：在 `musicEngine.js` 的 `ytdlExec` 子程序掛載 `error` 事件監聽器，確保下載串流異常終止時能正確捕獲並寫入日誌。
- **程式碼異味清理 (Unused Imports)**：移除 `src/index.js` 中引入但未使用到的 `execSync` 模組。

## [2.9.8] - 2026-06-27

### 修正 (Fixed)
- **Discord.js ready 事件棄用警報修正**：將 `ready` 事件監聽器更名為 `clientReady`，以完全相容 Discord.js v14 與 v15 並消除主控台的棄用警報。
- **安全漏洞修復 (SSRF)**：在 `downloadTextFile` 中限制僅允許從 Discord 官方 CDN 域名下載附件，防止潛在的 Server-Side Request Forgery 攻擊。
- **安全漏洞修復 (API Rate Limit)**：針對被關入「冷卻監獄」用戶的警告回應加上 30 秒記憶體內冷卻鎖定，避免用戶惡意洗頻觸發 Discord API Rate Limit。

## [2.9.7] - 2026-06-27

### 修正 (Fixed)
- **歷史對話格式污染修正**：新增 `cleanReplyPrefix` 輔助函數，在發送與儲存 AI 回覆前過濾開頭可能被 AI 模仿生出的時間戳記（例如 `[下午08:20]`）與角色前綴（例如 `[Gura]:`），解決連續對話後時間戳記層疊的問題。

## [2.9.6] - 2026-06-23

### 修正 (Fixed)
- **PM2 Watch 優化**：進一步限縮 `pm2` 的 `watch` 範圍至僅監聽 `src`、`.env` 與 `package.json`，並確實排除 `src/data` (動態寫入的 JSON)。徹底解決自動抓取模型清單時的檔案變更引發重啟死迴圈的問題。

## [2.9.5] - 2026-06-23

### 修正 (Fixed)
- **PM2 無限重啟修正**：修正 `ecosystem.config.js` 的 `ignore_watch` 路徑設定，將原本的 `data` 更改為 `src/data`，避免開機時 Model Manager 更新 `models.json` 觸發 PM2 的自動重啟迴圈。

## [2.9.4] - 2026-06-21

### 變更 (Changed)
- **PM2 設定優化**：將 `ecosystem.config.js` 中的 `watch` 模式設為 `true`，並設定 `ignore_watch` (排除 `logs`、`node_modules` 等目錄) 確保檔案一有更新就能自動重啟，同時避免被 Log 變化觸發無限重啟。

## [2.9.3] - 2026-06-21

### 修正 (Fixed)
- **身分組保護權限調整**：將 `/taglimit` 指令以及觸發防護的判定門檻，從「管理身分組」更改為嚴格的「管理員」權限。

## [2.9.2] - 2026-06-21

### 修正 (Fixed)
- **全域錯誤處理**：新增 Node.js 程序層級的 `unhandledRejection` 與 `uncaughtException` 捕捉，確保非預期錯誤不會導致整個機器人進程崩潰，進一步提升穩定性。

## [2.9.1] - 2026-06-21

### 修正 (Fixed)
- **時間觀念增強**：現在 Gura 擁有完整的時間觀念，系統提示中會包含完整的年份、日期、星期與時區資訊。
- **對話記憶時間戳**：現在海馬迴與短期記憶中的對話紀錄，都會標記精準的時間戳記 `[HH:mm]`，讓 AI 能理解對話的先後順序與時間間隔。

## [2.9.0] - 2026-06-18

### 新增 (Added)
- **身分組標註限制系統 (Tag Limit)**：新增保護身分組功能，防止一般成員惡意洗頻標註。
  - 新增斜線指令 `/taglimit` 供管理員動態設定目標身分組與保護時間。
  - 當一般成員標註保護身分組時，自動關閉該身分組的 `mentionable` 權限。
  - 背景排程會自動檢查並於限制時間到期後重新開啟標註權限。

## [2.8.1] - 2026-06-18

### 新增 (Added)
- **冷卻提示訊息**：加入符合 Gura 人設的冷卻與懲罰提示訊息，發送後 5 秒自動刪除，避免洗版。

## [2.8.0] - 2026-06-18

### 新增 (Added)
- **AI 回覆冷卻系統 (Cooldown)**：新增對個別使用者的 AI 回覆頻率控制。
  - 支援全域預設冷卻時間設定，防止連續發言快速消耗額度。
  - 支援管理員強制懲罰特定使用者 (關入冷卻監獄)。
  - 新增斜線指令 `/cooldown` 以供管理員設定與使用者查詢狀態。

## [2.7.0] - 2026-06-17

### 新增 (Added)
- **高音質無損播放支援**：優化了核心的音訊下載管線設定，解除了原先為了防止封鎖而捨棄的 DASH Manifest 限制，並將背景下載速率上限由 1M 提升至 5M。現在 Gura 會自動從 YouTube/Spotify 抓取最高位元率的音軌 (如 256kbps)，搭配 Discord 伺服器的加成音質設定，能獲得最頂級的聽覺饗宴！

## [2.6.1] - 2026-06-17

### 修復 (Fixed)
- **YouTube 播放清單解析崩潰**：修復了因 YouTube 介面改版導致 `play-dl` 無法取得 `browseId` 或 `contents` 進而引發 `Cannot read properties of undefined` 的致命錯誤。現在播放清單的解析工作也一併轉交給了原生 `yt-dlp` (透過 `youtube-dl-exec`) 處理，確保清單擷取的穩定性。

## [2.6.0] - 2026-06-16

### 新增 (Added)
- **Spotify 全面支援**：改用 `spotify-url-info` 解析器，繞過 Spotify 官方匿名驗證限制。支援 Spotify 單曲與播放清單加入列隊。
- **YouTube 播放清單支援**：系統現能解析 YouTube Playlist，自動將清單內所有歌曲加入隊列。
- **動態播放面板 `/nowplaying`**：大幅重構！加入進度條每 5 秒動態更新機制，並在面板底部新增實體互動按鈕（播放/暫停、跳過、循環模式、洗牌、停止）。
- **進階隊列管理系統**：
  - 新增 `/loop` 指令：支援單曲循環與列表循環。
  - 新增 `/shuffle` 指令：一鍵打亂目前等待中的所有歌曲順序。
  - 新增 `/remove` 指令：移除隊列中特定編號的歌曲。
  - 新增 `/clear` 指令：清空所有等待中的歌曲。
  - 新增 `/volume` 指令：自由調整機器人唱歌的音量 (1-100)。
  - 新增 `/leave` 指令：強制退出語音頻道。
- **長隊列保護機制**：優化 `/queue` 指令的顯示邏輯，自動裁切過長標題，並將顯示上限設定為 15 首以避免 Discord API 1024 字元限制。

## [2.5.5] - 2026-06-16

### 修復 (Fixed)
- **YouTube 簽名演算法緊急修復**：修正了因 YouTube 突發更新 `player-script.js` 簽名解析演算法，導致 `@distube/ytdl-core` 拋出 `Could not parse decipher function` 嚴重錯誤。為了追求極致的穩定性，現在播放引擎改為直接呼叫 `youtube-dl-exec` 啟動原生的 `yt-dlp` 子程序，並利用 `pipe` 管線直接傳輸音源流，將破解 YouTube 防護的任務完全交由世界上更新最快的 `yt-dlp` 社群負責。

## [2.5.4] - 2026-06-16

### 修復 (Fixed)
- **GCP IP 遭 YouTube 阻擋問題修復**：修正了 `play-dl` 由於 GCP 伺服器 IP 被 YouTube 防火牆攔截，導致回傳 403 Forbidden 網頁進而觸發 `Invalid URL` 的錯誤。改採 `@distube/ytdl-core` 負責串流下載，其內部維護的繞過簽名演算法能有效對抗雲端 IP 封鎖。

## [2.5.3] - 2026-06-16

### 修復 (Fixed)
- **YouTube 串流播放閃退修復**：修正了在使用 `youtube-dl-exec` 時，將原始 URL 丟給 FFmpeg 會導致解析失敗並瞬間結束播放的問題。現在改用 `play-dl` 原生的 `stream()` API 來處理 YouTube 音源流，徹底確保音軌的穩定度。

## [2.5.2] - 2026-06-16

### 升級 (Upgraded)
- **Discord 核心套件升級**：將 `discord.js` 升級至最新版 (`v14.26.4`)，並將 `@discordjs/voice` 升級至最新版 (`v0.19.2`)，以確保符合 Discord 官方最近強制啟用的語音端對端加密 (DAVE E2EE) 協定，嘗試解決卡在 `Signalling` 的網路交握問題。

格式基於 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)，
並且本專案遵循 [語意化版本控制 (Semantic Versioning)](https://semver.org/spec/v2.0.0.html)。
## [2.5.1] - 2026-06-16

### 修復 (Fixed)
- **音樂播放訊息權限崩潰修復**：為 `musicEngine.js` 中播放歌曲時的頻道通知訊息（`▶️ 正在播放...`）加入 `try-catch` 防護，避免使用者在沒有「發送訊息」權限的語音文字頻道觸發點歌時，導致整個機器人崩潰重啟。


## [2.5.0] - 2026-06-16

### 新增 (Added)
- **Orihost / Pterodactyl 編譯防護網**：在 `index.js` 核心加入「木馬式自動編譯腳本 (`npm rebuild`)」，強制繞過面板 `ignore-scripts` 限制，自動下載 `ffmpeg` 與編譯 `sodium-native` 底層加密模組，徹底解決雲端伺服器佈署卡住的問題。
- **音訊進度條即時顯示系統**：`/nowplaying` 支援動態進度條與時間計算。

### 修復 (Fixed)
- **Discord 語音連線底層翻新**：安裝了正統 `@discordjs/opus` 與 `sodium-native` 等網路連線必備的 C++ 加解密與編解碼套件，修復了進入語音頻道時會卡在 `Signalling -> Connecting` 死迴圈的重大 Bug。
- **Git 版本管理衝突修復**：將 `models.json` 與 `scanned_models.json` 等會隨機器人運行改變的檔案移出 Git 追蹤名單 (`.gitignore`)，一勞永逸地解決自動 `git pull` 更新失敗的問題。
- **AI 權限當機修復**：針對缺少 `發送訊息` 權限的語音文字頻道加入了 `try-catch` 防護網，防止觸發 `sendTyping()` 造成機器人全面崩潰。
- **權限白名單邏輯修正**：把 `/allow_channel` 的白名單限制目標從「所有的 `/指令`」更正為「**吃費用的 AI 自動對話**」。現在音樂指令可以自由在任何地方呼叫，但 AI 聊天只限於被允許的文字頻道，完美防止濫用 (Abuse)。

## [2.4.0] - 2026-06-16

### 新增 (Added)
- **Spotify 歌單/專輯完美支援 (Lazy Loading)**：大幅優化音樂播放器底層。現在丟入包含數百首歌的 Spotify 歌單連結時，Gura 會在一秒內將所有曲目加入隊列，並在「要播到該首歌的前一刻」才去 YouTube 抓取音源，徹底解決超大歌單導致指令超時與 API 被鎖的問題。
- **進階播放控制指令**：新增了 `/queue` (查看歌單)、`/pause` (暫停播放)、`/resume` (恢復播放)、`/nowplaying` (查看當前播放歌曲)。

## [2.3.0] - 2026-06-16

### 新增 (Added)
- **音樂播放器 (Music Player)**：實作 `musicEngine.js` 並加入 `/play`, `/skip`, `/stop` 指令。
- **自動進房狀態設定**：機器人加入語音頻道時會自動設定為 `selfDeaf: true` (預設拒聽) 及 `selfMute: false` (麥克風開啟)。
- **Spotify 完美支援**：原生串接 Spotify API (`SPOTIFY_CLIENT_ID` / `SECRET`)，支援讀取 Spotify 歌曲資料並自動轉尋 YouTube 音源播放。

## [2.2.0] - 2026-06-16

### 新增 (Added)
- **每週自動模型掃描引擎 (Auto Model Scanner)**：新增了背景模型掃描機制 (`modelScanner.js`)，每週日固定從 NVIDIA API 抓取並平行測試所有可用模型（分批並行測試以防觸發 429 速率限制）。掃描出來的模型將會依照關鍵字自動歸類為 `VISION`, `CODE`, `CHAT` 並存入快取。
- **超深度備用機制 (Deep Fallback)**：`modelManager.js` 現在會將自動掃描產生的 50+ 個存活模型陣列（已隨機洗牌），全數墊在「手動首選模型」的後面作為深度備援。這確保了 Gura 未來遇到原定模型集體下架的極端情況時，依然有源源不絕的備用模型可以切換，實現零當機的穩定度。

## [2.1.9] - 2026-06-16

### 修復 (Fixed)
- **Discord 2000 字元限制崩潰問題**：修復了當模型（特別是 `CODE` 意圖）產生超過 2000 個字元的超長回覆或程式碼時，Discord API 會拒絕請求並拋出 `DiscordAPIError[50035]: Invalid Form Body`，導致後續流程中斷的問題。現在在 `messageCreate.js` 實作了自動切分發送機制（依賴換行符號），確保長訊息能被正確分段回覆。

## [2.1.8] - 2026-06-16

### 新增 (Added)
- **運行時模型熔斷降級機制 (Runtime Circuit Breaker)**：在 `modelManager.js` 與 `nvidiaService.js` 中加入了動態失敗計數機制。如果當前首選模型在運作期間連續失敗或超時 3 次，系統會將該模型降級並移至 `activeModels` 備用清單的最後面。這能有效避免因為某個模型在運行中途突然掛掉，導致每一次使用者對話都會經歷漫長的 Fallback 等待時間。

## [2.1.7] - 2026-06-16

### 修復 (Fixed)
- **NVIDIA API 404 崩潰與模型不可用問題**：修復了 `modelManager.js` 在同步可用模型時，僅會過濾健康度但仍會保留並切換至 404 不可用模型的問題，這導致程式在嘗試所有 fallback 皆遭遇 404 後拋出例外中斷執行。現在系統會在背景平行測試該意圖的所有首選模型，並將無法回應的無效模型完全剔除出 activeModels，確保 `CODE` 與其他意圖能穩定切換到真正健康的可用模型。同時也更新了首選清單移除已下架的過期模型。

## [2.1.6] - 2026-06-16

### 修復 (Fixed)
- **部署遺漏檔案補齊**：修復了在先前版本發布時，部分新建立的功能模組（如 `dreamEngine.js`, `embeddingService.js`, `trigger_dream.js`, `fileHelper.js`）未被加入至 Git 版本控制，導致部署至伺服器時發生 `Cannot find module './embeddingService'` 的崩潰錯誤。目前已將所有依賴檔案加入追蹤並釋出。

## [2.1.5] - 2026-06-16
### 修復 (Fixed)
- **海馬迴系統提示強化**：修復了即使海馬迴成功檢索到過往記憶，但 LLM 仍會受限於「記憶力像金魚」的 Persona 設定而裝傻說忘記的問題。現在在注入記憶時，會加上強烈的 System Prompt 覆寫指令，強制 Gura 必須準確回答檢索到的內容，並表現出得意感。

## [2.1.4] - 2026-06-16
### 修復 (Fixed)
- **海馬迴喚醒失敗問題**：修復了 `memoryManager.js` 在比對語意向量相似度 (Cosine Similarity) 時，過於嚴格的預設門檻 (`0.7`) 導致幾乎無法成功喚醒長期記憶的問題。目前已將喚醒門檻降至 `0.35`，大幅提升 Gura 召回過往記憶的機率。

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
