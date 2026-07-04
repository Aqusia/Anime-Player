# Anime1 介面 / 功能優化 — 工作紀錄

> 這份檔案記錄每次優化做了什麼、為什麼這樣做、可調參數在哪，方便日後接續、不忘東忘西。
> 最新的工作寫在最上面。

---

## 2026-07-04（第十二輪）— 全面 UX 打磨:操作回饋 / 感知速度 / 效能 / 舒適度

使用者要求「盡可能優化使用感受、介面、速度、舒適度」。四個方向,全部實機驗證。

### 一、播放器操作回饋 + 快捷鍵(Player.tsx)
- **OSD 即時回饋**:快轉/音量/速度/靜音等鍵盤與滾輪操作,畫面上方閃現膠囊提示(±10 秒、音量 N%、Nx 速度、靜音…)。`osd` state + `flashOsd()`,`n` 計數 key 讓同鍵連按也重播動畫(css `.osd-flash`)。
- **新快捷鍵**:`M` 靜音、`J`/`L` ±10 秒(YouTube 慣性)、數字 `0-9` 跳至該成數、`S` 跳過片頭(+90 秒,動畫 OP 長度);控制列新增「跳OP」小按鈕。`Esc` 先關速度選單再返回。
- **滾輪 = 音量**(桌面播放器慣例),含 OSD。
- **速度選單點外面自動關閉**(先前開著不動就一直開著):`speedRef` + window pointerdown。
- **★ 離開播放器立即存進度(修真 bug)**:原本進度存檔節流 4 秒,「快轉完馬上退出」會掉最新位置。經 CDP 實測發現兩層問題:(1) unmount 時 React **先解除 videoRef 才跑 passive effect cleanup**,cleanup 讀不到 video → 改用 `lastPos` ref(onTimeUpdate / seek() / onSeeked 即時鏡寫,換集時歸零),cleanup 由它存檔;(2) 守門 `t>5 && t<dur-1` 避免剛載入/已看完誤寫。驗證:seek 到 123s 立刻退出 → 存回 123 ✓。

### 二、感知速度(skeleton + 圖片淡入 + 預載)
- **components/Skeleton.tsx**:PosterSkeleton / PosterGridSkeleton / RowSkeleton / HomeSkeleton / EpisodeGridSkeleton / DetailSkeleton,css `.skeleton` shimmer。取代所有純文字「載入中…」:Home 首載(hero+兩排)、Detail 劇集格、Detail 深連結未載完(原本會閃「找不到此動畫」)、MyselfDetail 劇集格(保留自動重試字樣)、MyselfHome 首次建索引、Search 的 Myself 區塊。
- **components/FadeImg.tsx**:封面解碼完成才淡入(`.img-fade` + onLoad;已快取的圖用 ref callback 檢 `complete` 直接顯示),用於 PosterCard/ContinueCard;`decoding="async"`。
- **Hero 輪播預載下一張**:輪到前先 `new Image().src` 暖圖,8 秒換頁交叉淡化時不再現場載圖。

### 三、效能(重繪範圍)
- **Card / MyCard / ContinueCard 全部 React.memo**;Home 的衍生陣列(continueWatching / latest / my / personalRows / heroPool)改 useMemo → hero 每 8 秒輪播、meta/下載進度廣播不再重繪整頁幾百張卡片。
- **Home / Detail 改逐欄位 zustand selector**(原本解構整個 store = 訂閱所有變更,下載進度每個事件都重繪整頁)。
- Nav / BackToTop scroll listener 加 `passive: true`。

### 四、導覽舒適度
- **`/` 聚焦搜尋框**(打字中不攔截),搜尋框 `Esc` 關閉下拉並失焦,placeholder 提示「(/)」。
- **繼續觀看卡片 hover ✕ 移除**(= 觀看紀錄頁行為:清該部進度),Home 傳 `removeContinue` 進 ContinueRow/ContinueCard,移除後刷新列與海報標記。
- **回到頂部浮動鈕**(components/BackToTop.tsx,捲逾 800px 出現;meta 建置 toast 移到左下避免重疊)。
- **Nav 分頁高亮支援子路徑**(在 /myself/anime/… 時「Myself 動漫」也亮)。
- 鍵盤使用者 `:focus-visible` 外框。

### 驗證
`tsc --noEmit` 零錯、`npm run build` ✅、`npm run verify` 15/15 ✅。新增 **scripts/cdp-ux-smoke.mjs**(取代呼叫已移除 cc API 的死腳本 cdp-hls-test.mjs):15 項實機檢查全過 — 首頁 249 張卡片渲染+淡入、skeleton css、回到頂部、`/` 聚焦、影片可播(readyState 4)、→/M/S/5 快捷鍵與 OSD、離開即存進度、零 console error。
**測試環境陷阱(記下)**:視窗被遮蔽時 Chromium 佔用偵測(CalculateNativeWinOcclusion)把頁面標 hidden → rendering steps 暫停,程式化捲動不觸發 scroll 事件,回到頂部/Nav 捲動樣式測不到;啟動加 `--disable-features=CalculateNativeWinOcclusion` 或 `Page.bringToFront` 且視窗真的可見才測得到。

---

## 2026-07-02（第十一輪）— 持久化:紀錄不因關機遺失 + smoke:my TLS

回報「很多紀錄會因未關機不見」。查證結論:**一半是真的**。

### 調查（實證)
- **electron-store(進度/我的清單/已看完/下載)**:`.set()` 是 `atomically.writeFileSync` **同步原子寫**,已提交的不會因中斷/關機大量遺失或毀損。實讀 `%APPDATA%\anime1-netflix\anime1-data.json` → 31 筆進度、20 部、橫跨 6/26–6/29,都在。中斷最多掉「正在寫的那一筆」。遺留 `.tmp-*` 是中斷寫入的無害殘留(原子 rename 保護主檔)。
- **localStorage(搜尋紀錄 / 音量 / 播放速度)**:Chromium 延遲寫盤,未正常關閉會掉最近寫入。**這才是會掉的部分**。

### 修法:dual-write + 開機對帳(讓 localStorage 那三項也永久)
localStorage 續當同步讀取快取(Player 同步讀音量/速度、Nav/Search 同步讀歷史,consumer 全不動),但**每次寫入同步鏡寫 electron-store**,開機時 `reconcilePrefs()` / `reconcileSearchHistory()` 從 electron-store 拉回 localStorage(electron-store 為準)。任何關機情境都不再遺失。
- 主:`store.ts` `getPrefs/setPrefs/getSearchHistory/setSearchHistory`;`ipc.ts` 四個 handler(`prefs:*`、`searchHistory:*`)。
- 橋:`preload/index.ts` + `api.ts` 型別四支。
- renderer:`playerPrefs.ts`、`searchHistory.ts` 改雙寫 + reconcile;`App.tsx` 開機呼叫。

### smoke:my TLS(先前的「try」)
myself-bbs 憑證鏈含跨簽 CA(Root YE→ISRG),Node OpenSSL 建不出路徑(`UNABLE_TO_GET_ISSUER_CERT`),Chromium/app 用系統信任庫則正常。`my-smoke.cjs` 改為遇憑證鏈錯誤透明放寬驗證重試、警告一次(`SMOKE_INSECURE=1` 可強制)。三個請求點一致處理 → **全綠**。

### 驗證
`tsc --noEmit` 零錯、`npm run build` ✅、`npm run verify` ✅ 15/15、`npm run smoke`/`smoke:my` ✅。
新增 `npm run verify:persist`(`scripts/persist-verify.mjs`):writer 子進程同步寫入後 `SIGKILL` 硬殺,全新進程讀回 → 證明同步寫入撐過「未關機」。實機 `npm run dev` 開機正常(myself 索引 2356 部載入、無錯誤),三層 bundle 皆含新 IPC 頻道。

---

## 2026-07-02（第十輪）— 測試驗證與修正

第九輪跨來源整合提交後,做建置驗證與優化。

### 一、新增純函式驗證 `scripts/lib-verify.mjs`（`npm run verify`）
`lib.ts` 只 `import type`(編譯期抹除),故可用 esbuild `transform` 轉譯後**直接測真正的函式**,不需網路(有別於 `smoke.mjs` / `my-smoke.cjs` 打 live 站台)。涵蓋 `titleCore`(跨來源辨識、季數區分、空核心邊界)、`recommendedUnified`(franchise 去重 / votes 門檻 / 排序)、泛型 `sampleRecommended`(混合陣列 / 同 seed 穩定)。15/15 通過。

### 二、Home 空核心去重防呆
純符號標題 `titleCore` 回 `''`,原年份去重 Set 會把兩個空核心誤當同一部。Detail/MyselfDetail 早已用 `c ? … : undefined` 防呆,這裡補齊三處一致(中文標題實務不會空,屬 hardening)。

### 三、修正 Player PiP 事件(連帶真 bug)
`onEnterPictureInPicture` / `onLeavePictureInPicture` **不在 React 合成事件集**,JSX prop 會被靜默忽略 → `setIsPiP` 執行期從未觸發,子母畫面按鈕高亮狀態不會亮。改用 `videoRef` 掛原生 `enterpictureinpicture` / `leavepictureinpicture` 監聽(deps `[src]`,隨 video 重掛)。順帶消除唯一的 `tsc` 型別錯誤 → 現在 `tsc --noEmit` 全綠。

### 驗證結果
`tsc` 零錯、`npm run build` ✅、`npm run smoke`(anime1)✅ 1844 部、`npm run verify` ✅ 15/15。(`smoke:my` 因本機 TLS 憑證鏈環境問題失敗,非程式碼;app 走 Chromium 憑證庫不受影響。)

---

## 2026-06-29（第九輪）— 推薦少一點/含 myself + 跨來源去重 + 選擇片源

三個回饋。

### 一、「因為你看了」2 排就好
`becauseYouWatched` 預設 `maxRows` 3→2。驗證：首頁剩 2 排。

### 二、雙來源重複的動漫 → 合成一個 + 可切換片源
- 新 `lib.ts` `titleCore(title)`：跨來源同作品辨識鍵（去括號英文、只留 CJK 核心、否則拉丁正規化；比 `franchiseKey` 嚴，**保留季數**，只併「同一部跨來源」不併不同季）。
- **年份瀏覽去重**：myself 與 anime1 同 `titleCore` 的會被濾掉（**anime1 為主**）。驗證：2019 年 Myself 192→**106**（去掉 86 個重複）。
- **選擇片源**：Detail（anime1）若該作在 myself 也有 → 顯示「⇄ 在 Myself 觀看」；MyselfDetail 反向顯示「⇄ 在 anime1 觀看」。各自用 `titleCore` 比對 myById / list。驗證：鑽石王牌 act2（anime1）有按鈕、大室家（myself）有反向按鈕。

### 三、首頁推薦要有 myself
- 新 `lib.ts` `recommendedUnified(list, meta, myCatalog)`：anime1 `recommendedPool` + myself 中**franchise 不與 anime1 重複**（anime1 為主）、votes≥150 的高分作品，合併後依綜合評分排序。
- `sampleRecommended` 改泛型 `<T>`，可吃混合陣列。
- `Home.tsx`：為你推薦列 + 輪播 Hero 都改用 `recoUnified`；Hero 依型別渲染 `<Hero>`(anime1) 或 `<MyHero>`(myself)。驗證：為你推薦 40 張含 ~22 張 myself（之前 0），且 franchise 去重無重複。

### 四、移除 bin/（澄清）
使用者本意是「app 放 bin」，但 app 本體是 `release/win-unpacked/Anime1.exe`（建置產物、git-ignore、不進 repo）。`bin/` 只放了部署腳本 `repack-asar.mjs`，那本就屬於 `scripts/`。故**移除 `bin/`**，`repack-asar.mjs` 移回 `scripts/`（路徑可攜，root = scripts 上層），更新 `package.json deploy`、README、scripts/README。

---

## 2026-06-29（第八輪）— 年份瀏覽：修排序 + 正規化跨年份 + 整合雙來源

回報：anime1 年份排序很怪、跨年份很複雜、且要分開找（anime1 / myself 各一）。

- **根因**：anime1 `year` 是字串、可跨年份（如 `"2019/2020"`）。舊 `yearOptions` 直接把整串當選項、`sort((x,y)=>+y-+x)` 對 `"2019/2020"` 得 NaN → 下拉排序亂掉；篩選用 `a.year === year` 精確比對 → 跨年份作品自成怪選項、不會出現在正常年份；且只有 anime1。
- **修正**（`lib.ts` 新增 `primaryYear(year)`：抓第一個 4 位數年份，`"2019/2020"→2019`、myself 數字直接用）：
  - `Home.tsx` 年份下拉 = anime1 ∪ myself 的**正規化年份**集合，數字降冪、無 `/` 選項。
  - 純年份瀏覽時**合併兩來源**（anime1 依年份+選擇性類型；myself 依年份），用綜合評分（anime1 `weightedScore` / myself `weightedScoreMy`，同一把尺）排序，渲染成單一 `<Grid>`（多型）。類型篩選仍只限 anime1。
  - 標題顯示「YYYY 年 作品 N（anime1 X · Myself Y）」。
  - Home 掛載時 `loadMyCatalog()`（快取）以供年份整合。
- **驗證** `cdp-verify-year.mjs`：38 個年份選項、降冪、無跨年份 `/`；選 2019 → 372 部（anime1 180 · Myself 192）；跨年份「Alicization War of Underworld」正確歸到 2019。

---

## 2026-06-29（第七輪）— 個人化推薦 + 倉庫整理 + 文件 + 首次 commit

### 一、個人化推薦「因為你看了《X》」
- `lib.ts` `becauseYouWatched(progress, watched, list, byId, meta, maxRows=3)`：取觀看進度中**最近、不同系列**的 anime1 作品為種子，對每個用 `relatedAnime`（類型標籤重疊）產出相似清單、排除已看過；無紀錄時回空。
- `Home.tsx`：繼續觀看下方插入最多 3 排「因為你看了《X》」（種子片名去括號英文）。驗證：3 排（女僕龍／紫羅蘭外傳／命運石之門0），每排 18 張。

### 二、倉庫整理 + 文件 + commit
- **bin/**：`repack-asar.mjs` 從 scripts 移來並改成**可攜路徑**（以腳本位置推 repo root，不再寫死 `D:/ANIME1`）。`package.json` 加 `deploy`（build+repack）、`smoke`、`smoke:my`。
- **scripts/**：刪掉死掉（anime1.cc）與一次性的驗證腳本，只留可重用的：`smoke.mjs`、`my-smoke.cjs`、`cdp-hls-test.mjs`、`cdp-my-test.mjs`、`cdp-dl-test.mjs`。
- 刪除過時 build log（dev/dist/distdir.log）。`.gitignore` 補強（out/release/dist/node_modules/.asar-staging/*.log/*.tmp/*.bak）。
- **文件**：重寫 `README.md`（總覽/結構/開發建置/部署/驗證）、新增 `docs/ARCHITECTURE.md`（三層架構、串流機制、Bangumi、store 檔）、`bin/README.md`、`scripts/README.md`、`src/main/README.md`、`src/renderer/README.md`。
- **git**：`git init` + 首次 commit（產物與相依已 ignore）。

---

## 2026-06-29（第六輪 g）— 一次做掉建議清單 A–F

使用者：「都做看看」。

- **A. Myself 首頁輪播 Hero**：新 `components/MyHero.tsx`（仿 anime1 Hero，吃 MyAnime，立即觀看會解析首集播放）。`MyselfHome.tsx` 加 heroIdx + 8s 輪播 + 滑入暫停；heroPool = catalog 依 `weightedScoreMy` 排序、franchise 去重、**排除已看過**、取前 12。驗證：present + 8s 換片（CLANNAD→星際牛仔）✓。
- **B. 首頁大圖「立即觀看」直接播放**：`Hero.tsx` `playNow()` — 有進度則續看該集、否則 `api.episodes` 取首集播放（失敗退回詳情）；按鈕文字依進度顯示 立即觀看／繼續觀看。驗證：點擊→ `/watch/me/1833/27795` ✓（注意：anime1 取集數需 1–數秒，非瞬間）。
- **C. 搜尋框清除鈕**：Nav 與 MyselfHome 搜尋框，有字時顯示 ✕ 清除。驗證 ✓。
- **D. 詳情頁集數摺疊**：Detail/MyselfDetail 集數 >30 時先顯示 30 + 「顯示全部 N 集／收合」。驗證：火影忍者(424) → 顯示 30 → 展開 424 ✓。（anime1 多按季拆分，通常 ≤26 不觸發；主要惠及 myself 長片。）
- **E. 自動標記已看完只限完結**：`Player.tsx` `onEnded` 看完最後一集時，`isMy && myById[id].kind==='airing'` 則**不**自動標記（連載中作品不誤標）。Player 掛載時 `loadMyCatalog` 取得 kind。
- **F. 換頁捲動**：`App.tsx` 改成記錄每個 history entry 的 scrollY；前進(PUSH)→頂端、返回(POP)→還原原位置（rAF）。驗證：首頁捲到 1300 → 點卡片(詳情 y=0) → 返回(首頁 y=1300 還原)✓。
- **G. 繼續觀看橫列 vs 觀看中標記**：判斷為用途互補（快速續看 vs 瀏覽辨識），**保留兩者**，不改。

驗證腳本（暫存）：`cdp-verify-all.mjs` / `verify-bf.mjs` / `verify-d3.mjs`。

---

## 2026-06-29（第六輪 f）— 整體健檢 + 換頁回頂端

使用者要求整體檢視（統整/細節/UX）並測試。

### 健檢（CDP `scripts/cdp-audit.mjs`，9 頁）
- 首頁/詳情/myself 首頁/myself 詳情/搜尋/紀錄/下載/片單/推薦：**全無 console error、無水平溢出、無破圖**。健康。

### 修正
- **換頁不回頂端**（實測：首頁捲到 1200 → 點進詳情仍停在 800）。`App.tsx` 加 scroll-to-top：前進導航（PUSH/REPLACE）`window.scrollTo(0,0)`，返回（POP）不動。實測點卡片→詳情 y=0、點 nav 連結 y=0 ✓。
- 用詞統一：紀錄頁打勾 `標記看完`→`標記已看完`（與詳情頁一致）。

### 待選的後續建議（已列給使用者，多為行為變更需確認）
A. myself 首頁加輪播 Hero（與 anime1 一致）。B. 大圖「立即觀看」直接播放（而非進詳情）。C. 搜尋框加清除鈕。D. 詳情頁集數過多時可摺疊。E. 自動標記已看完只限完結作品。F. 返回還原捲動位置（Home 無限捲動較 tricky）。

---

## 2026-06-29（第六輪 e）— 海報上直接顯示「已看完 / 觀看中」狀態

回饋：把「已觀看 / 正在觀看」標記直接加到海報插圖上，更一目了然。

- **全域進度 map**：`store.ts` 加 `progressByCat`（catId→最近 Progress）+ `loadProgress()`（progressList 建 map，newest-first 取每部最新）+ `notePlayed(p)`（播放器存檔時同步，不必重抓）。`App.tsx` 掛載時 `loadProgress()` + 視窗 focus 時刷新；`Player.tsx` `saveProgress` 一併 `notePlayed`。
- **PosterCard 標記**（anime1 `<Card>` + myself `<MyCard>` 都吃這個，所以首頁/瀏覽/搜尋/推薦/季/片單/相關全都有）：傳入 `catId`，讀 store。
  - 已看完（在 `watched` 集合）→ 海報底部整條**綠色「✓ 已看完」**。
  - 觀看中（有 progress 未標完成）→ 左下**「觀看中 N/M」**藍標 + 底部進度條（優先用 集數/總集數，否則該集播放位置）。
  - 兩者互斥，已看完優先。
- `Card.tsx` 傳 `catId={anime.catId}`、`MyCard.tsx` 傳 `catId={'my:'+a.id}`。

### 驗證（CDP 實機）`scripts/cdp-verify-markers.mjs`
- 搜尋進行中的「刀劍神域 第二季」→ 海報顯示「觀看中 1/25」✓；搜尋已看完的「暗殺教室 第二季」→「✓ 已看完」✓；對照組「葬送的芙莉蓮」無標記 ✓。
- 清掉先前播放器驗證留下的 SAO(86) 殘留 progress（pos/dur 為 null，是 dispatch ended 的產物，非真實觀看）。

---

## 2026-06-29（第六輪 d）— 觀看紀錄頁：已看完區 + 打勾 + 可摺疊/顯示更多

回饋：已看完可在卡片打勾、並在觀看紀錄下面開一區顯示；各區可摺疊、預設大概一頁、需要再「顯示更多」。

- `History.tsx` 重做成兩個**可摺疊區段**（`Section` 元件：標題 + 數量 + ▶ 旋轉箭頭，點標題收合）：
  - **最近觀看** = progress（依 anime 去重、newest-first）**排除已標記已看完的**（打勾後就移到下面）。
  - **已看完** = `watched` 集合，解析成海報卡。
  - 每區預設只顯示約一頁（最近觀看 12、已看完 18），超過給「顯示更多（還有 N）」/「收合」。
- `HistoryCard`：左上角原本的「已看完」徽章換成**可點的打勾**（☐ 標記看完 / 已看完）→ `onMarkWatched`→`toggleWatched`，標記後該卡移到「已看完」區。
- 新 `components/WatchedCard.tsx`：海報卡（2:3）、綠色「✓ 已看完」標、hover ✕ 取消（`toggleWatched`），解析 anime1（byId+meta）或 myself（myById）標題/封面，點擊進詳情。
- 「清除紀錄」只清 progress、**不影響已看完標記**（confirm 文案已註明）。

### 驗證（CDP 實機）`scripts/cdp-verify-hist2.mjs`
- 兩區「最近觀看 14」「已看完 1」✓；最近觀看上限 12 + 「顯示更多（還有 2）」→ 展開成 14 ✓；點標題收合 → 卡片 12→0 ✓。
- 打勾移動：勾第一張 → 最近觀看 14→13、已看完 1→2（加入 86）✓；取消後 watched 還原成原狀（乾淨，未留測試資料）✓。

---

## 2026-06-29（第六輪 c）— Hero 滑入暫停 + 以沒看過為主 + 已看完按鈕

三項：①滑鼠移到大圖暫停輪播 ②輪播以「沒看過」的為主 ③詳情頁新增「已看完」按鈕（含在別處看過的）。

### 一、已看完（watched）資料層
- `store.ts` `getWatched()/setWatched()`（dataStore `watched`，整部 anime 的 catId 清單；anime1 用純 catId、myself 用 `my:<tid>`）。
- IPC：`watched:get`、`watched:toggle`（按鈕用）、`watched:mark`（add-only，播放器看完最後一集自動標記用）。preload + `api.ts` 對應。
- 渲染端 store：`watched` state（`load()` 一併載入）+ action `toggleWatched`/`markWatched`（更新 state，首頁即時反映）。

### 二、Hero 滑入暫停 + 以沒看過為主（Home.tsx）
- `heroPausedRef`，輪播 interval 內 `if(!paused)` 才換；`<Hero>` 外層包 `onMouseEnter/Leave` 切換旗標。
- `seen = progress 的 catId ∪ watched`；`unseenReco = recoPool.filter(沒看過)`；`basePool = unseenReco.length ? unseenReco : recoPool`（沒看過的優先，全看過才退回全部），取前 12 輪播。

### 三、「已看完」按鈕（Detail.tsx + MyselfDetail.tsx）
- 我的片單按鈕旁加一顆：未標記顯示「標記已看完」、已標記顯示綠色「✓ 已看完」，點擊 `toggleWatched`。tooltip 說明「含在別處看過的，看過的不再出現在首頁推薦輪播」。
- 播放器 `onEnded`：看完**最後一集**（無 nextEp）→ `markWatched(progCat)` 自動標記整部已看完（中間集數只倒數跳下一集，不誤標）。

### 驗證（CDP 實機）`scripts/cdp-verify-watched.mjs`
- 滑入暫停：hover 時 9s 標題不變（奇巧計程車）✓；移開後 9s 換成進擊的巨人第三季 ✓。
- 以沒看過為主：當前 hero（catId 395）不在 seen 集合（15 筆）內 ✓。
- 已看完按鈕：anime1（刀劍神域 S1）標記→「✓ 已看完」+ 持久化 true→再點取消 false ✓；myself（CLANNAD）同樣 ✓。（測試後都復原，未留測試資料。）

---

## 2026-06-29（第六輪 b）— 首頁 Hero 輪播

- 回報：首頁大圖推薦永遠是白箱（SHIROBAKO）。原因：`hero = recoPool[0]`，而 recoPool 依綜合分排序、第 0 名固定 → 永遠同一部。
- 修正：`Home.tsx` 加 `heroIdx` state + 每 8 秒 `setInterval` 遞增；`heroPool = recoPool.slice(0,12)`（無推薦時退回繼續觀看/最新），`hero = heroPool[heroIdx % len]`。`<Hero key={hero.catId}>` 讓切換時重掛載 → 配合 `index.css` 新增的 `.hero-fade`（`@keyframes heroFade` 0.7s）做淡入。metaGet 重抓是記憶體快取、瞬間。
- 驗證 `scripts/cdp-verify-hero.mjs`：8 秒取樣四次 → 超時空輝耀姬 / BanG Dream MyGO / 無職轉生 / 白箱，4 部不同 ✓（白箱變成輪播之一，不再固定）。

---

## 2026-06-29（第六輪）— 播放器體驗 + 觀看紀錄頁

使用者挑了兩項優化來做。

### 一、播放器體驗（記住設定 + 下一集倒數可取消）
- **記住音量 / 播放速度**：新增 `src/renderer/src/playerPrefs.ts`（localStorage `anime1:volume` / `anime1:rate`，UI-only 不進 electron-store）。`Player.tsx` 的 `vol`/`rate` 初始值改讀 `getSavedVolume()`/`getSavedRate()`；`setVolume`/`setSpeed` 同步寫回。跨集數、跨重開 app 都保留（`onLoadedMeta` 本來就會把 `vol`/`rate` 套到 video）。
- **下一集倒數（可取消）**：原本 `onEnded` 直接 `go(nextEp)` 瞬跳。改成 `setCountdown(5)`，右下角浮出卡片「N 秒後播放下一集 + 下一集名稱 + 立即播放 / 取消」，倒數到 0 才跳。`epId` 改變會 reset；手動 `togglePlay`/`seek` 會取消（代表使用者不想自動跳）。倒數中隱藏中央大播放鈕避免重疊。
- 沒有 nextEp（最後一集）就不倒數。

### 二、觀看紀錄頁（完整看過歷史，含已看完）
- 新頁 `pages/History.tsx` + 路由 `/history` + Nav「觀看紀錄」連結（在我的片單後）。
- 用既有 `progress:list`（已 newest-first），**依 anime 去重**（每部顯示最近看的那集），**含已看完**（不像首頁「繼續觀看」只留進行中）。anime1 需在 `byId`、myself（`my:`）一律保留（封面/標題隨 progress record 帶著走）。
- 新 `components/HistoryCard.tsx`（仿 ContinueCard）：封面 + 集數 + 時間 + 進度條，**已看完徽章**，hover 出現 **✕ 從紀錄移除**，點卡片續看、點標題進介紹頁。
- 移除/清除後端：`store.ts` `removeAnimeProgress(catId)`（刪該部所有集數）/ `clearProgress()`；IPC `progress:removeAnime` / `progress:clear`；preload + `api.ts` 對應。頁面有「清除全部」（confirm 後）。

### 驗證（CDP 實機）`scripts/cdp-verify-23.mjs`（暫存）
- 觀看紀錄頁：Nav 連結 ✓、13 張真實紀錄卡 ✓、heading「觀看紀錄 13」✓；remove/clear 後端用**假 entry** round-trip 驗證（不動真實紀錄）✓。
- 播放器：設 localStorage rate=1.5 後開播放器 → 速度鈕顯示「1.5x」(prefs 有讀到) ✓；對 `<video>` dispatch `ended` → 浮出「秒後播放下一集 / 立即播放 / 取消」✓；按取消即關閉 ✓。驗證後還原使用者原本的 prefs。

---

## 2026-06-28（第五輪）— 單集簡介日文→中文 + 同系列歸併再升級（SAO）

使用者回饋：①「日文要是中文」②「像 SAO 也其他季數阿」。

### 一、單集簡介 日文 → 繁體中文（anime1 + myself 共用）
- 問題：Bangumi `/v0/episodes` 的 `desc`（劇情簡介）對很多作品只有**日文**（如 SAO），`name_cn` 集名是中文但內文是日文 → hover 顯示日文。
- 解法：新增 `src/main/metadata/translate.ts` — **免金鑰** Google translate web 端點（`translate_a/single?client=gtx&sl=ja&tl=zh-TW`），ja→繁中，記憶體快取、失敗靜默退回原文。
  - `hasJapanese(s)`：偵測**真‧假名**（`ぁ-ゖ`/`ァ-ヺ`/`ー`），**排除片假名中點 ・**，避免「炎柱・煉獄杏壽郎」這種中文被誤判成日文。
- `bgmEpisodes.ts` `fetchBgmEpisodes`：取回後跑 `localizeEps()` — 收集所有含假名的 name/desc（去重）、并發 4、每次間隔 120ms 翻譯，回填。anime1（`meta:episodes`）與 myself（`getMyEpisodeInfo`）都走這條，兩邊都受惠。
- **快取版本 bump**：`store.ts` 集數快取鍵 `eps.` → `eps2.`，讓舊的「日文版」快取自動失效、重抓+翻譯。
- **防呆**：`ipc.ts` / `myself/service.ts` 只在「整份都已中文化（無假名殘留）」時才寫快取（`!eps.some(hasJapanese)`），避免某次 Google 暫時擋掉就把日文永久烤進快取（集數快取無 TTL）。
- 註：集名本來就用 `name_cn`（中文），只有純日文集名才會被翻；內文則全面翻成中文。

### 二、`franchiseKey` 再升級 — SAO 各季/外傳/劇場版歸併
- 問題：SAO 各條目片名帶**英文/羅馬字副標**（`(Sword Art Online II)`、`Alicization`、`Gun Gale Online`、`-Progressive-`）→ 每條 key 都不同 → 詳情頁「本系列其他季數」空白。
- 新 `franchiseKey`（`lib.ts`）步驟：
  1. **整組刪除括號內容**（`(Sword Art Online II)` / `(第三季下)` 都是冗餘英文或季數標示）。
  2. 季數標記（第N季 / Season N / Final Season / the）。
  3. **片型/外傳標記改成「任意位置」刪除**：劇場版/OVA/OAD/ONA/**外傳**/番外篇/特別篇/總集篇。
  4. 句尾 …篇/編/章 故事篇名（鬼滅 無限列車篇 → 鬼滅之刃，沿用）。
  5. **若片名以 CJK 開頭 → 只取開頭 CJK 核心、丟棄尾端羅馬字副標**（刀劍神域 Alicization → 刀劍神域）。CJK 核心需 ≥2 字才套用。
- **安全性**：以英文起頭的片名（Re:Zero / Fate…）**不**套用步驟 5，避免過度合併；純中文副標區分的不同作品（一堆**魔法少女X**、**光之美少女**各代）也保持各自獨立。
- 在**真實全片庫（1841 部）**上驗證：
  - SAO → 7 條歸成「刀劍神域」；鬼滅 6 條、我的英雄學院 8 條（含 FINAL SEASON）、Re:Zero 4 條都正確。
  - 危險家族零誤併：魔法少女各作、光之美少女各代、Fate/伊莉雅 各自獨立。
  - 短 key（艦隊/雀魂/阿松…）皆同系列，無跨作品碰撞。

### 驗證（CDP 實機）`scripts/cdp-verify-jp-sao.mjs`
- SAO II（catId 86）「本系列其他季數」= **6 部**（之前 0）。
- SAO II 集數 25/25 有簡介、**0 殘留日文**；myself 進擊完結篇 16/16 中文。無 console error。

### 三、myself 詳情頁「沒下載 / 卡在載入劇集中」修正
- 回報：開 CLANNAD~AFTER STORY~ 卡在「載入劇集中…」、沒有下載按鈕。
- 根因：myself-bbs 來源時好時壞；`fetchMyDetails` 用預設重試（**5 次 × 20s ≈ 最壞 100s**）會**靜默 hang**。而**下載按鈕 gated 在 `eps.length>0`**（要有劇集 vid 才能下載/播放）→ 劇集沒載出來就沒有下載鈕、播放也 disabled。（site 恢復後實測 35ms 取回 25 集，確認是暫時性。）
- 修正：
  1. `http.ts` 新增 **`myGetHtmlHedged()`**（互動式用）：myself 正常回應是 sub-second、壞掉時是 connect 卡住乾等 timeout，所以**不要**用「等滿 timeout 才重試」的循序重試。改成 **hedge**——每 `hedgeMs`(2.2s) 就開一條新連線、誰先回傳就用誰（attempts 4、timeout 7s）。來源短暫卡住時新 socket 通常 ~1s 就回，使用者只等幾秒而非數十秒；全失敗約 ~14s reject → 跳重試。背景爬蟲（list.ts）維持耐心的循序 `myGetHtml`。
  2. `details.ts` 互動式取詳情改用 `myGetHtmlHedged()`。
  3. `MyselfDetail.tsx`：**載入失敗時不丟「重新載入」按鈕給使用者**，改成**載入器自己自動重試**（使用者回饋：「載入失敗的話載入器就不用跳出重新載入按鈕」）。`failed`→effect 以**遞增退避**（1.5s→3s→6s→8s 上限）排一次 `setReload` 重抓；成功就顯示劇集、不再重試。畫面只有轉圈 spinner，第二次起加「自動重試中」字樣。離開頁面時 cleanup 會停掉（`alive` 旗標 + clearTimeout），不會無限打。
- 驗證（CDP）：①真實作品（忍者神威）載出 13 集、**無重新載入按鈕**；②首頁 patch 過的 contextBridge 物件是唯讀無法注入假失敗（產品碼不受影響），改以狀態機 trace + typecheck 確認每次失敗只排一次重試、卸載時清乾淨。CLANNAD~AFTER STORY~ 載出 **25 集** + 「下載整部」；6 部全新詳情實測 **260ms–1.6s**。

---

## 2026-06-28（第四輪）— 依類型瀏覽 + 同系列歸併升級 + myself 單集簡介

### 一、依類型瀏覽（首頁類型下拉 + 標籤可點）
- `lib.ts` `genreList(list, meta)`：彙整所有 Bangumi 類型標籤（依出現次數排序）。
- `Home.tsx`：年份下拉旁加**類型下拉**，兩者**可組合**（年份 AND 類型）。任一非「全部」就顯示篩選後的 `<Grid>`（依綜合分排序）+「清除篩選」。
- 可由網址驅動：`/?genre=奇幻`（`useSearchParams`）。`Detail.tsx` 的**類型 chip 改成可點**，點了就跳到首頁該類型清單。
- 驗證：`奇幻` → 988 部。

### 二、同系列歸併升級（鬼滅劇場版/各篇）
- `lib.ts` `franchiseKey` 增強：除了原本的 第N季/Season，再去掉 **劇場版/OVA/TV版/總集篇** 等格式詞、句尾的 **「…篇/編/章」arc 名**（鬼滅之刃 無限列車篇 → 鬼滅之刃）、`Final Season`、`The`。
- **只去掉「空白分隔的句尾 token」**，保留有辨識度的核心 → 一堆不同的「魔法少女X」不會被誤併（已用真實標題測試，見 scratchpad fk-test）。
- 驗證：鬼滅之刃 詳情頁「本系列其他季數」現在含 刀匠村篇/遊郭篇/無限列車篇/**劇場版**。
- ⚠ 仍會漏：純副標題分季（例「-覺醒前夜-」「冰結之絆」「／自由之翼」）不含季數字樣，無法安全歸併。

### 三、myself 單集劇情簡介（隨選解析 bgmId）
- 不重抓整個片庫：新增 `my:episodes(id,title)` IPC →
  `myself/service.ts` `getMyEpisodeInfo`：先 `resolveBgmId(title)`（**先查 anime1 已快取的 Bangumi 比對，零請求；不行才查一次 Bangumi**），再 `fetchBgmEpisodes(bgmId)`（共用快取）。bgmId 以 **`bgm2.<id>`** 快取（版本化鍵，改邏輯就失效）。
- ⚠ **配對陷阱（已修）**：`titlesMatch` 用 bigram，兩標題都含英文「Final Season」時光英文就過關 → 「進擊的巨人 The Final Season」誤配《我的英雄學院 FINAL SEASON》。修法：`coreTitle()` 比對前先去掉 季數/Final Season/完結篇/劇場版/The 等通用詞，只比核心片名。
- `MyselfDetail.tsx`：抓 `myselfEpisodes`，劇集 hover 顯示 Bangumi 集名+簡介（同 anime1 的 MeEp）。
- 驗證：進擊/鬼滅/間諜教室 配對正確；簡介內文常為日文（Bangumi 資料限制，與 anime1 相同）。

### 驗證腳本
`scripts/cdp-verify-browse.mjs`（類型瀏覽/鬼滅歸併/myself 單集）。全程無 console 錯誤。

---

## 2026-06-28（第三輪）— 相關推薦：類型標籤 + 同系列 + 你可能也喜歡

### 〇、需求
點進一部動漫，下面要有：(a)「類似風格」推薦、(b)「同系列其他集數」(例：鬼滅)。參數（評分常數）這輪不動。

### 一、anime1：類型標籤（零額外請求）
Bangumi 的 `/v0/search/subjects` 回應**本來就含 `tags`**（我們已在發的同一個請求），所以擷取類型標籤**不需任何新請求**。
- `metadata/bangumi.ts`：新增**類型白名單** `GENRE_TAGS`（簡體比對，約 100 個真正的類型/主題詞），過濾掉人名/製作公司/年份/格式/來源等雜訊；保留的轉繁體、去重、最多 6 個 → `MetaResult.tags`。
  - ⚠ 為何用白名單：一開始用「黑名單+長度」過濾，結果 staff 人名（岡田麿裡/秋元康…）混進來當「類型」chip 很怪。白名單只留真類型，chip 乾淨、相似度也純。
- `metadata/build.ts`：`targets` 增列「已快取但沒有 tags」的項目 → 沿用現有溫和限速背景建檔**增量回填**，不需另開爬蟲。另加 `TAGS_VER` 一次性遷移：版本不符就 `clearAllTags()` 重抓（這樣改了過濾邏輯後舊的髒標籤會被重洗）。**改了 `GENRE_TAGS` 要把 `TAGS_VER` +1**。
- `types.ts`/`store.ts`/`api.ts`：`Meta`+`MetaLite` 加 `tags?: string[]`；`getAllMetaLite` 一併送出（讓 renderer 能跨全清單算相似度）。

### 二、推薦演算法（`lib.ts`）
- `relatedAnime(current, list, meta, n)`：和當前作品**類型標籤重疊數**排序（其次綜合分），排除同系列、franchise 去重；當前作品還沒有標籤時退回「高分推薦」。
- `relatedMy(cur, catalog, n)`：myself 沒有類型資料 → 用**同年代(±4年)優先 + 綜合分**，franchise 去重。誠實標示為「你可能也喜歡」而非「類似風格」。

### 三、UI
- `Detail.tsx`(anime1)：hero 顯示**類型 chips**(meta.tags 前 6)；最下方加「你可能也喜歡」(relatedAnime)。「本系列其他季數」本來就有。
- `MyselfDetail.tsx`：加「本系列其他作品」(franchiseKey 過 catalog) + 「你可能也喜歡」(relatedMy)；rating/siblings/related 都改從 store `myById` 取（`loadMyCatalog` 已存在）。

### 驗證（CDP，`scripts/cdp-verify-reco.mjs`、`cdp-tag-quality.mjs`）✅
- 標籤回填運作中（377/1827 持續增加），且**乾淨**：抽樣全是 戰鬥/戀愛/奇幻/推理/懸疑/治癒… 無人名雜訊。
- anime1 詳情：類型 chips 乾淨、「你可能也喜歡」出現；myself 詳情：「你可能也喜歡」12 張卡。無 console 錯誤。
- ⚠ 已知限制：franchiseKey 只處理「第N季/Season」式分季；鬼滅那種**用「篇」命名的劇場版/外傳**(無限列車篇…)不會被歸到同系列。要更準需擴充 franchiseKey 或加 arc 命名規則。
- 註：標籤是背景增量回填，**全部填滿需數分鐘**；填到的作品才有 chips/類型相似推薦，其餘暫時退回高分推薦。

---

## 2026-06-28（第二輪）— myself 加入片單 + 搜尋紀錄

### 一、myself 也能加入「我的片單」
原本只有 anime1 詳情頁有「＋ 我的片單」。片單後端只存 catId 字串陣列，`my:<tid>` 就能代表 myself，toggle 本來就通用，問題只在**渲染**（片單頁／首頁用 `byId` 查不到 myself）。
- `store.ts` 新增 `myById`（myself catalog 的 id→物件對照）+ `loadMyCatalog()`（惰性、只在片單有 `my:` 項目時抓一次）。
- `components/Row.tsx`、`Grid.tsx` 改成**多型**：`items: (Anime | MyAnime)[]`，用 `'catId' in it` 判斷渲染 `<Card>` 或 `<MyCard>`（兩者本來就共用 PosterCard，外觀一致）。
- `pages/MyList.tsx`：保留加入順序（最新在前），anime1+myself 混合用 `<Grid>` 呈現。
- `pages/Home.tsx`：「我的片單」橫列也支援 myself（不再用 sortByScore，改保留加入順序）。
- `pages/MyselfDetail.tsx`：hero 按鈕列加「＋ 我的片單／✓ 已加入片單」，catId = `my:${id}`。

### 二、搜尋有紀錄可看
- 新增 `src/renderer/src/searchHistory.ts`（localStorage，最近 12 筆、去重、最新在前；純 UI 不動 main process）。
- `components/Nav.tsx`：搜尋框聚焦時下拉顯示「最近搜尋」（可點擊直接搜、可逐筆 ✕ 移除、可清除全部）。下拉邏輯：聚焦/保留前次關鍵字時顯示全部紀錄（排除當前完全相同字）；**實際打字**（`typing` 旗標）時才做子字串過濾。
- `pages/Search.tsx`：每次搜尋自動記錄；無關鍵字時顯示「最近搜尋」chips（可點/可移除/可清除）。

### 驗證（CDP，`scripts/cdp-verify-features.mjs`）✅
- 加入片單：按鈕 `＋ 我的片單`→`✓ 已加入片單`，`api.myList()` 出現 `my:<id>`，我的片單頁正確渲染 myself 卡片。
- 搜尋紀錄：紀錄持久化、Nav 下拉顯示、Search 空白頁 chips 顯示，皆 OK；無 console 錯誤。
- 測試後已清除測試資料（恢復使用者原本片單、清空測試搜尋紀錄）。

---

## 2026-06-28 — 評分邏輯重做 + 卡片格式統一 + 播放器 HLS 拖曳預覽

### 〇、使用者回饋（這次的需求來源）
1. **myself 來源（HLS）沒有拖曳預覽縮圖**了 → 要補回來。
2. 介面與功能要**優化**、相關**格式要統一**（可參考現有網站）。
3. 要把工作內容記錄在 MD 檔（就是這份）。
4. **評分不合理**：很多不熱門的番分數很高；《鬼滅之刃》熱度高但分數很低；目前最高是《星際牛仔》9.1，覺得怪。希望**觀看人數 / 熱度佔比高一點**。

### 一、評分邏輯：改成「綜合評分」（熱度 + 品質合一）

**問題根源**：原本卡片上的 `★ 9.1` = **直接拿 Bangumi（bgm.tv）原始評分**，裡面 0% 熱度。
- Bangumi 使用者偏硬核，對大眾向少年漫（鬼滅）打分嚴 → 分數低；對冷門經典（星際牛仔）打超高。
- 舊排序 `weightedScore` 只加了很弱的 `0.5·log10(票數)`，壓不住冷門高分。

**新做法**：在 `src/renderer/src/lib.ts` 新增單一公式 `heatScore(score, votes)`，**顯示與排序都用它**，anime1 / myself 共用同一套，數字統一。

```
quality   = Bayesian 修正後的 Bangumi 分（票數少 → 往全站平均 C 拉）
heat      = 由票數 log 縮放出的人氣分（0..10）
composite = (1 - POP_WEIGHT)·quality + POP_WEIGHT·heat
```

**可調常數（都在 lib.ts 最上方，想再調人氣比重就改 `POP_WEIGHT`）**：
| 常數 | 值 | 意義 |
|------|----|------|
| `BAYES_M` | 150 | 信賴所需票數；越大 → 低票數的高分被壓得越兇 |
| `BAYES_C` | 6.3 | 全站平均基準（Bangumi 動畫平均約 6.x） |
| `POP_WEIGHT` | 0.35 | **人氣（熱度）在最終分數的佔比**；要更重就調高（0~1） |
| `POP_LO` | 1.8 | log10(票數) 對應人氣 0（約 60 票） |
| `POP_HI` | 4.4 | log10(票數) 對應人氣 10（約 25000 票） |

**效果（示意，實際依真實票數）**：
- 鬼滅之刃 7.5 → 約 8.2（↑ 被熱度拉高）
- 星際牛仔 9.1 → 約 8.7（↓ 一點，仍高，因為它也算多人評）
- 冷門神作 9.0（少票）→ 約 6.2（↓ 很多，不再霸榜）
- 票數未知（score 有、votes 無）→ 直接顯示原始 quality，不亂壓。

**統一**：主程序 `src/main/myself/service.ts` 的 `bayesMy()`（搜尋排序用）也同步改成相同公式，以 lib.ts 的 `heatScore` 為準。

**改到的檔案**：
- `src/renderer/src/lib.ts` — 新增 `heatScore` / `heatFromVotes`；`weightedScore`、`weightedScoreMy` 改為呼叫它。
- `src/renderer/src/components/PosterCard.tsx`（新）/ `Card.tsx` / `MyCard.tsx` — ★ 改顯示綜合分。
- `src/renderer/src/pages/Detail.tsx` — 標題列 ★ 顯示綜合分，後面附「Bangumi 原始 X.X（N 人）」保持透明誠實。
- `src/main/myself/service.ts` — `bayesMy` 對齊。

### 二、卡片格式統一（抽出共用 `PosterCard`）

原本 `Card.tsx`（anime1）和 `MyCard.tsx`（myself）幾乎一樣卻各寫一份、且不一致（anime1 沒有左上年份標、myself 有）。
- 新增 `components/PosterCard.tsx` 當共用呈現元件（封面 + 右上 ★ 綜合分 + 左上年份 + hover 標題 + 底部標題/副標）。
- `Card.tsx`、`MyCard.tsx` 改成薄包裝，外觀完全一致。
- anime1 卡片也補上左上年份標（與 myself 一致）。
- `MyCard` 導頁時順便把 `score/votes` 放進 router state，讓 myself 詳情頁也能顯示綜合分。

### 三、播放器：HLS（myself）拖曳預覽縮圖

原本 `Player.tsx` 在 `isHls` 時跳過縮圖（只剩時間），所以 myself 沒預覽畫面。
- 隱藏的預覽 `<video>` 改成永遠掛載；HLS 時用**獨立的 hls.js instance** 餵它（主播放器那顆在播放，不能借）。
- 移除 canvas 的 `!isHls` 限制 → HLS 也畫得出縮圖。
- proxy 已對 segment 設 `ACAO:*`，且 hls.js 走 MSE（blob 同源），canvas 讀取不會 taint。
- 預覽 instance 用小 buffer（maxBufferLength 4），避免吃頻寬影響主播放。

### 四、詳情頁格式統一（MyselfDetail 對齊 Detail）

- `MyselfDetail.tsx` 改成與 `Detail.tsx` 相同的 **hero 背景（模糊封面）版型**。
- 顯示綜合 ★ 評分（來自 router state 或退而求其次抓 catalog）。
- 劇集卡加上**觀看進度條 + 已看完標記**、有進度時「立即觀看」變「繼續觀看」（與 anime1 一致）。
- 也同步把 `Hero.tsx`（首頁大圖）的 ★ 改成綜合分。

### 五、驗證結果（2026-06-28，已部署 release/win-unpacked）✅
- `npm run build` 通過；`tsc --noEmit` 僅剩**既有**的 `onEnterPictureInPicture` 型別警告（與本次無關，esbuild 忽略），**零新錯誤**。
- 以 CDP 實機驗證（`scripts/cdp-verify-optimize.mjs`、`cdp-verify3.mjs`）：
  - 首頁卡片 ★ 已是綜合分（樣本 7.8–9.1，多數 8.x，符合壓縮預期）。
  - MyselfDetail 真實點擊導航穩定停在 `/myself/anime/:id`，hero ✓、★ 評分 ✓、續看 ✓、劇集 ✓。
  - **HLS 拖曳預覽縮圖 ✓**：預覽影片 readyState 4、canvas 畫出 14400 非零像素、未被 taint。
  - 全程無 console 錯誤。
- 註：用 `window.location.hash` 直接設值跳轉到子路由會出現「跳回上一頁」假象（生產版無 StrictMode 雙呼叫），**真實點擊不會**；測試一律用點擊。

---

## 既有架構速記（避免重查，詳見記憶檔 anime1-netflix-app.md）
- Electron + React + Tailwind；anime1.me 主來源、myself-bbs.com 第二來源。
- 評分/封面來自 Bangumi（bgm.tv），背景建檔，存 electron-store。
- myself 為 WebSocket→HLS、經本機 proxy 轉發；anime1 為帶 cookie 的 mp4 經 proxy。
- 建置：`npm run build`；打包 broken（Developer Mode off）→ 用 `node scripts/repack-asar.mjs` 更新 `release/win-unpacked`。
- PowerShell 每次要先補 PATH：`$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")`。
