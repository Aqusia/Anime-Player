# src/main/ — Electron 主行程

特權層（Node）。負責所有網路爬取、串流代理、中繼資料、檔案／設定持久化，並透過 IPC 服務渲染端。渲染端不直接連網或碰檔案。

## 進入點

- `index.ts` — 建 BrowserWindow、載入 renderer、啟動 `proxy.ts`、`registerIpc()`，並背景啟動 Bangumi 中繼資料建置與 myself 全站索引。
- `ipc.ts` — 所有 `ipcMain.handle` 入口（清單、集數、中繼資料、串流 URL、進度、片單、已看完、下載、myself 系列）。
- `types.ts` — 跨主行程共用型別（Anime / Meta / MyAnime / Progress / Download…）。

## 子模組

- `anime1/` — anime1.me 爬蟲
  - `http.ts` 基礎請求；`list.ts` 解析 `動畫列表` TablePress 表（~1841 部）；`episodes.ts` 解析分類頁 `data-apireq`（含分頁）；`resolve.ts` 打 `v.anime1.me/api` 取 mp4 src + cookie；`service.ts` 對外整合 + 快取。
- `myself/` — myself-bbs 爬蟲（第二來源）
  - `http.ts` 用 `https.request`+IPv4+重試（apex/undici 會 timeout）；含 `myGetHtmlHedged` 對沖式抓取（互動用，秒回不乾等）。
  - `list.ts` 完結／連載分頁列表；`details.ts` 詳情頁（封面／簡介／集數，含新舊兩種 player URL）；`resolve.ts` 手刻 WebSocket→HLS；`index.ts` 背景建全站索引（搜尋用，弱 TTL）；`service.ts` 整合 + 評分／年份 enrich + 單集簡介解析。
- `metadata/` — Bangumi 中繼資料
  - `convert.ts`（opencc 繁簡）、`bangumi.ts`（subject 搜尋 + 類型標籤過濾）、`build.ts`（背景批次、限速、429 退避、14 天更新）、`bgmEpisodes.ts`（單集名稱／簡介）、`translate.ts`（日文簡介→繁中，免金鑰、偵測假名才翻、快取）。

## 串流 / 下載 / 儲存

- `proxy.ts` — 本機 HTTP 代理：anime1 帶 cookie+Referer 轉送 mp4（206 range）；myself 在伺服器端抓 m3u8+.ts 重送（補 CORS）；離線檔走 `/file/`、`/myfile/`。
- `download.ts` — 下載佇列：anime1 串 mp4 寫檔；myself 抓整份 HLS 片段；進度廣播 `download:progress`。
- `store.ts` — electron-store 封裝。三個檔：`anime1-data`（清單/片單/進度/已看完/下載）、`anime1-meta`（中繼資料 + 單集快取）、`myself`（索引/詳情/對應）。

> 串流取得與來源網站的非顯而易見細節，集中在 [../../docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)。
