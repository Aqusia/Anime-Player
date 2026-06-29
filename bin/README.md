# bin/ — 操作腳本

執行 / 部署用的腳本（非應用程式碼）。

## `repack-asar.mjs` — 把新建置部署進已封裝的 app

**用途**：在不重跑 electron-builder 的情況下，把 `npm run build` 產出的 `out/` 換進**既有**的 `release/win-unpacked/Anime1.exe` 裡的 `app.asar`。

**為什麼需要**：本機 electron-builder 的 winCodeSign 解壓會建立 darwin 符號連結，Windows 開發者模式關閉時權限不足而失敗（`npm run dist` 因此壞掉）。本腳本繞過打包流程直接換碼。

**做法**：
1. 第一次先把 `app.asar` 備份成 `.bak`。
2. 解開現有 `app.asar` 到 `.asar-staging`（保留封裝好的 prod `node_modules`）。
3. 用剛建好的 `out/` 換掉 staging 裡的 `out/`。
4. 重新打包回 `app.asar`，清掉 staging。

`hls.js` 是 renderer 相依、已在 `out/renderer` 內，所以 asar 內的 `node_modules` 不需動。

**用法**（一般直接用 npm script）：
```bash
npm run deploy           # = electron-vite build + node bin/repack-asar.mjs
# 或單獨重打（已先 build 過）
node bin/repack-asar.mjs
```

> 路徑以腳本所在位置（bin/ 的上層）為 repo root，與機器無關。需先用 `npm run dist:dir` 產生過一次 `release/win-unpacked/`。
