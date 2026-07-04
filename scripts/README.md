# scripts/ — 開發 / QA / 部署腳本

非自動化測試，是開發時驅動真實來源 / 真實 app 來確認沒壞的工具腳本，外加一支部署腳本。

## 部署

| 腳本 | 做什麼 |
|---|---|
| `repack-asar.mjs` | 把 `npm run build` 的 `out/` 換進**既有**的 `release/win-unpacked/Anime1.exe`（繞過壞掉的 electron-builder）。一般直接用 `npm run deploy`（= build + 這支）。路徑以腳本上層為 repo root，與機器無關；需先 `npm run dist:dir` 產生過一次封裝。 |

## 爬蟲煙霧測試（直接連來源網站）

| 腳本 | 測什麼 |
|---|---|
| `smoke.mjs` | anime1.me：抓動畫列表、解析某部的集數與影片來源（apireq → v.anime1.me/api → mp4 src）。`npm run smoke` |
| `my-smoke.cjs` | myself-bbs：列表 / 詳情解析 + WebSocket→HLS 影片解析鏈。`npm run smoke:my` |

## 封裝 app 的 GUI 驗證（CDP）

透過 Chrome DevTools Protocol 驅動已封裝的 app。先用除錯埠啟動：

```bash
release/win-unpacked/Anime1.exe --remote-debugging-port=9222
```

再跑（`node scripts/<name>`）：

| 腳本 | 測什麼 |
|---|---|
| `cdp-ux-smoke.mjs` | 介面/播放器 UX 冒煙：首頁卡片與封面淡入、skeleton、回到頂部、`/` 搜尋聚焦、播放器 OSD 與 M/S/數字快捷鍵、離開播放器立即存進度。視窗被遮蔽會使捲動類檢查失敗，啟動時加 `--disable-features=CalculateNativeWinOcclusion` |
| `cdp-my-test.mjs` | myself 詳情頁載入 + 集數 + 播放 |
| `cdp-dl-test.mjs` | 離線下載端到端（下載 → 落地檔案 → 離線播放） |

> 這些腳本連 `ws://127.0.0.1:9222`，用 `Runtime.evaluate`（`awaitPromise`）在頁面情境執行檢查。寫法可當作新驗證腳本的範本。
> 過去逐輪的一次性驗證腳本不保留在版控；當輪做了什麼、怎麼驗的都記在 [../WORKLOG.md](../WORKLOG.md)。
