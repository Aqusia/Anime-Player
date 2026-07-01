# Anime1 — Netflix-style 動畫播放器

一個用 **Electron + React + Tailwind** 打造的桌面動畫播放器，從 [anime1.me](https://anime1.me)（主來源）與 [myself-bbs.com](https://myself-bbs.com)（第二來源）瀏覽、搜尋、播放動畫，介面與體驗對齊 Netflix。

> 個人自用 / 學習性質專案。串流內容來自第三方網站，請尊重來源網站與著作權，勿用於商業或散布。

---

## ✨ 功能總覽

- **瀏覽**：首頁輪播大圖（Hero，每 8 秒換、滑入暫停、以沒看過的為主）、為你推薦、繼續觀看、依年份／類型篩選、季度分組、無限捲動。
- **個人化推薦**：依觀看紀錄產生「因為你看了《X》」類型相似的推薦列。
- **搜尋**：統一搜尋頁（anime1 + Myself 分頁），繁簡互換、模糊比對；導覽列搜尋含最近紀錄與清除鈕。
- **詳情頁**：綜合評分 ★、類型標籤（可點跳轉）、劇情簡介、本系列其他季數、你可能也喜歡、單集劇情簡介（hover，日文自動翻成中文）、集數過多可摺疊。
- **播放器**：自訂控制列、拖曳進度條 + Netflix 式預覽縮圖、播放速度、音量（記住設定）、子母畫面（PiP）、看完倒數自動播下一集（可取消）、鍵盤快捷鍵。
- **觀看狀態**：海報上直接標示「✓ 已看完／觀看中 N/M」；觀看紀錄頁（最近觀看 + 已看完兩區，可摺疊、顯示更多、打勾標記）。
- **我的片單**、**離線下載**（anime1 mp4 / myself HLS 皆可，含一鍵刪除）。
- **Bangumi 中繼資料**：封面、中文簡介、評分、類型標籤、單集名稱／簡介。

詳細的每一輪開發內容與「為什麼這樣做」，見 [WORKLOG.md](WORKLOG.md)。

---

## 🧱 技術棧

electron-vite · Electron 31 (Node 20) · React 18 · React Router (HashRouter) · Zustand · TailwindCSS · cheerio · electron-store · opencc-js · hls.js

---

## 📁 專案結構

```
ANIME1/
├─ scripts/            開發 / QA 腳本（爬蟲煙霧、CDP 播放驗證、部署）— 見 scripts/README.md
├─ docs/               架構與設計文件
│  └─ ARCHITECTURE.md  主行程 / 渲染端 / 資料流 / 串流機制詳解
├─ src/
│  ├─ main/            Electron 主行程（爬蟲、串流代理、中繼資料、IPC）— 見 src/main/README.md
│  ├─ preload/         contextBridge：把白名單 IPC 暴露成 window.api
│  └─ renderer/        React UI（pages / components / store）— 見 src/renderer/README.md
├─ electron.vite.config.ts   electron-vite 設定
├─ electron-builder.yml      打包設定
├─ tailwind.config.js / postcss.config.js / tsconfig.json
├─ README.md / WORKLOG.md
└─ package.json
```

> **「app 本體」在哪？** 打包後的執行檔是 `release/win-unpacked/Anime1.exe`，由 `npm run dist:dir` 產生，屬**建置產物**（約 337MB）。它和 `out/`、`node_modules/` 一樣都 `.gitignore`、不進版控——要用就重新建置，不放進 repo。

---

## 🚀 開發與建置

需求：Node 18+、npm。

```bash
npm install         # 安裝相依
npm run dev         # 開發模式（HMR）
npm run build       # 編譯 main/preload/renderer 到 out/
npm run smoke       # anime1 爬蟲煙霧測試
npm run smoke:my    # myself-bbs 爬蟲 + WebSocket 解析測試
```

### 打包成桌面 App

```bash
npm run dist        # 完整安裝包（electron-builder）
npm run dist:dir    # 免安裝資料夾版（release/win-unpacked/）
```

> ⚠️ **本機 `dist` 已知問題**：electron-builder 的 winCodeSign 解壓會嘗試建立 darwin `.dylib` 符號連結，Windows 在**開發者模式關閉**時沒有符號連結權限而失敗。
>
> 解法：把改動部署進**既有的** `release/win-unpacked/Anime1.exe`，**不重跑 electron-builder**：
>
> ```bash
> npm run deploy      # = npm run build + node scripts/repack-asar.mjs
> ```
>
> 細節見 [scripts/README.md](scripts/README.md)。

---

## ✅ 驗證方式

GUI 功能透過 **Chrome DevTools Protocol** 驅動已封裝的 app 來測：

```bash
# 1) 用除錯埠啟動
release/win-unpacked/Anime1.exe --remote-debugging-port=9222
# 2) 跑驗證腳本
node scripts/cdp-hls-test.mjs    # HLS / myself 播放
node scripts/cdp-my-test.mjs     # myself 詳情 + 播放
node scripts/cdp-dl-test.mjs     # 離線下載端到端
```

見 [scripts/README.md](scripts/README.md)。

---

## 📚 延伸文件

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 主行程模組、渲染端結構、串流／中繼資料資料流、各 electron-store 檔。
- [WORKLOG.md](WORKLOG.md) — 逐輪開發紀錄（做了什麼、為什麼、可調參數）。
- [src/main/README.md](src/main/README.md) / [src/renderer/README.md](src/renderer/README.md) — 模組層級說明。
