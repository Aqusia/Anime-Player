# src/renderer/ — React UI

沙箱渲染層。只透過 `window.api`（preload 暴露）與主行程溝通，不直接連網／碰檔。

## 進入點與路由

`src/main.tsx`（HashRouter）：

| 路徑 | 頁面 |
|---|---|
| `/` | `Home` — Hero 輪播、為你推薦、繼續觀看、因為你看了《X》、最新更新、我的片單、季度列；年份／類型篩選 |
| `/anime/:catId` | `Detail`（anime1 詳情） |
| `/myself`、`/myself/anime/:id` | `MyselfHome`（含輪播 Hero）、`MyselfDetail` |
| `/search` | `Search`（anime1 + Myself 分頁統一搜尋） |
| `/season/:key` | `Season` |
| `/mylist`、`/history`、`/downloads`、`/recommend` | 我的片單 / 觀看紀錄 / 離線下載 / 全部推薦 |
| `/watch/:source/:animeId/:epId` | `Player`（獨立於 App 版面，自帶返回列） |

`App.tsx` 是版面外殼（Nav + Outlet），並處理捲動：前進(PUSH)回頂端、返回(POP)還原原位置。

## 狀態（Zustand `store.ts`）

`list/byId`、`meta`、`myList`、`watched`、`progressByCat`（海報「已看完／觀看中」標記用，播放器即時更新）、`downloads`、`myById`（lazy 載入 myself 目錄）。動作：`load`、`loadMeta`、`loadProgress`/`notePlayed`、`toggleMy`、`toggleWatched`/`markWatched`、`loadMyCatalog`。

## 共用元件 `components/`

- `PosterCard` — anime1 `Card` 與 myself `MyCard` 共用的海報（封面 + 綜合評分 ★ + 年份 + 已看完／觀看中標記 + hover 標題）。
- `Hero` / `MyHero` — 首頁輪播大圖（8s、滑入暫停、立即觀看直接播放）。
- `Row` / `Grid` — 多型列／格（吃 `Anime | MyAnime`）。
- `ContinueCard`（首頁繼續觀看）、`HistoryCard` / `WatchedCard`（觀看紀錄頁）。
- `HoverPreview` — 卡片 hover 靜音預覽 + 單集簡介。
- `Dropdown`、`Nav`（含搜尋 + 最近紀錄 + 返回）。

## 工具 `lib.ts`

- `heatScore(score, votes)` — **綜合評分**（品質 Bayesian × log 人氣），全站排序與顯示 ★ 共用；可調常數在檔頭。
- `franchiseKey(title)` — 系列歸併鍵（去季數／劇場版／外傳／英文副標…），把同系列各季/劇場版收成一組。
- `recommendedPool`/`sampleRecommended`/`recommendedMy` — 推薦池與抽樣。
- `relatedAnime`/`becauseYouWatched`/`relatedMy` — 相似與個人化推薦。
- `genreList`、`groupBySeason`、`timeAgo`、`fmtTime`、`dedupeBy`。

`api.ts`（型別 + `window.api` 包裝）、`convert.ts`（繁簡）、`searchHistory.ts`（localStorage 搜尋紀錄）、`playerPrefs.ts`（記住音量／速度）。

> 串流／中繼資料的取得在主行程，見 [../main/README.md](../main/README.md) 與 [../../docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)。
