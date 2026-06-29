# 架構說明（ARCHITECTURE）

Electron 三層：**main**（Node，特權）、**preload**（橋接）、**renderer**（React UI，沙箱）。
渲染端不直接碰網路／檔案，一切透過 `window.api`（preload 暴露的白名單 IPC）呼叫主行程。

```
renderer (React) ──window.api──▶ preload ──ipcRenderer──▶ main (ipc.ts)
                                                              │
                          ┌───────────────────┬───────────────┼────────────────┐
                          ▼                   ▼               ▼                ▼
                     anime1/ 爬蟲        myself/ 爬蟲      metadata/ Bangumi   proxy.ts 串流代理
                          │                   │               │                │
                          └─────────── store.ts (electron-store 持久化) ───────┘
```

---

## 主行程 `src/main/`

| 模組 | 職責 |
|---|---|
| `index.ts` | 建立 BrowserWindow、啟動代理、註冊 IPC、背景啟動中繼資料建置與 myself 索引 |
| `ipc.ts` | 所有 `ipcMain.handle` 入口（list / episodes / meta / stream / progress / mylist / watched / downloads / myself…） |
| `proxy.ts` | 本機 HTTP 串流代理（見下方「串流機制」） |
| `store.ts` | electron-store 封裝：清單快取、片單、觀看進度、已看完、下載、中繼資料、myself 索引／詳情 |
| `download.ts` | 離線下載佇列（anime1 mp4 串流寫檔；myself HLS 抓所有 .ts） |
| `anime1/` | anime1.me 爬蟲：`list`（動畫列表）、`episodes`、`resolve`（影片來源）、`http`、`service` |
| `myself/` | myself-bbs 爬蟲：`list`、`details`、`resolve`（WebSocket→HLS）、`http`、`service`、`index`（背景全站索引） |
| `metadata/` | Bangumi 中繼資料：`bangumi`（搜尋）、`bgmEpisodes`（單集）、`build`（批次）、`convert`（opencc 繁簡）、`translate`（日→中） |

---

## 串流機制（最關鍵的兩處）

### anime1.me（mp4，需 cookie + Referer）
1. `?cat=ID` → 分類頁，內含每集 `<video data-apireq="<urlencoded JSON>">`。
2. `POST https://v.anime1.me/api`（body `d=<apireq>`，帶 `Referer: https://anime1.me/`）→ 回 `{s:[{src}]}` + 3 個 HttpOnly cookie。
3. CDN 只在帶**那一次呼叫的** cookie + Referer 時才給 mp4（206 range）。**src 子網域每次輪替、cookie 與該次呼叫綁定。**
4. 所以用主行程本機代理（`proxy.ts`）持有 cookie/Referer 轉送串流；瀏覽器只連 `127.0.0.1:PORT`。

### myself-bbs（WebSocket → HLS）
- VPX-Player 開 `wss://v.myself-bbs.com/ws`，送 `{tid,vid,id}`，回 `{video:"//vpxNN…"}`。
- Electron 的 Node 20 無全域 WebSocket → `myself/resolve.ts` 用 `https.request` **手刻**一次性 WS client（IPv4），不引入 `ws` 套件。
- m3u8 CDN 的 CORS 不是 `*` → 代理路由 `GET /myself/<tid>/<vid>/<file>` 在伺服器端抓 playlist + .ts 再以 `ACAO:*` 重送，hls.js 才能播。
- ⚠ 兩種 player URL：舊 `…/player/play/<tid>/<vid>`（數字）與新 `…/player/<token>`（token 為主流）；`resolve.ts` 以 `/^\d+$/` 分支。
- ⚠ 網路怪癖：apex `myself-bbs.com` 會 CONNECT timeout，只有 `www.` 可用；連 Node 的 `fetch`(undici) 也常 timeout，故 `myself/http.ts` 用 `https.request` + `family:4` + 重試。詳情頁互動式抓取用 `myGetHtmlHedged`（對沖式：每 2.2s 開新連線、取最快回應）。

---

## 中繼資料（Bangumi）

- 來源 **bgm.tv**（非 AniList — 繁中片名比對命中率高很多）。
- `POST https://api.bgm.tv/v0/search/subjects`，查詢前用 opencc 把片名轉**簡體**（Bangumi 以簡體索引），顯示時再轉回繁體。
- 取 `images`、`summary`、`rating`、`tags`（用允許清單過濾成類型標籤）。
- `build.ts` 背景批次（最新優先、並發 3、限速、429 退避、14 天更新），存進**獨立** store 檔，分批 flush。
- 單集名稱／簡介：`bgmEpisodes.ts`；簡介常為日文 → `translate.ts` 用免金鑰 Google 端點 ja→zh-TW，偵測假名才翻、快取。

---

## electron-store 持久化檔（userData/）

| 檔 | 內容 |
|---|---|
| `anime1-data.json` | 動畫清單快取、我的片單、觀看進度、已看完、下載狀態 |
| `anime1-meta.json` | Bangumi 中繼資料 map（大、分批寫）+ 單集快取（`eps2.<bgmId>`，已翻譯） |
| `myself.json` | myself 全站索引（含評分／年份 enrich）、詳情快取、myself→bgmId 對應 |

---

## 渲染端 `src/renderer/src/`

- **路由**（`main.tsx`，HashRouter）：`/`(Home)、`/anime/:catId`(Detail)、`/myself`、`/myself/anime/:id`、`/search`、`/season/:key`、`/mylist`、`/history`、`/downloads`、`/recommend`、`/watch/:source/:animeId/:epId`(Player，獨立於 App 版面)。
- **狀態**（Zustand `store.ts`）：`list/byId`、`meta`、`myList`、`watched`、`progressByCat`（海報狀態標記用）、`downloads`、`myById`（lazy）。
- **共用元件**：`PosterCard`（anime1 `Card` + myself `MyCard` 共用，含 ★／年份／已看完／觀看中標記）、`Hero`/`MyHero`（輪播大圖）、`Row`/`Grid`、`ContinueCard`/`HistoryCard`/`WatchedCard`、`HoverPreview`、`Dropdown`、`Nav`。
- **排序核心**：`lib.ts` 的 `heatScore(score, votes)` — 品質（Bayesian 調和）× 人氣（log 票數）的綜合評分，anime1／myself 共用同一把尺；可調常數在檔頭。

各頁細節見 [../src/renderer/README.md](../src/renderer/README.md)。
