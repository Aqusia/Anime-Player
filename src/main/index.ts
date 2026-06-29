import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { startProxy } from './proxy'
import { registerIpc } from './ipc'
import { getAnimeList } from './anime1/service'
import { buildMetadata } from './metadata/build'
import { ensureMyIndex, enrichMeta } from './myself/service'
import { setDownloadProgressHandler } from './download'

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload)
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0b0b0f',
    autoHideMenuBar: true,
    title: 'Anime1',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Forward renderer console + load failures to the main stdout (dev aid).
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log(`[renderer] ${message}`)
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.log(`[did-fail-load] ${code} ${desc} ${url}`)
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  await startProxy()
  registerIpc()
  setDownloadProgressHandler((s) => broadcast('download:progress', s))
  createWindow()

  // Build/refresh Bangumi metadata in the background (non-blocking).
  getAnimeList()
    .then((list) => buildMetadata(list, (s) => broadcast('meta:progress', s)))
    .catch((e) => console.log('[metadata build skipped]', e?.message || e))

  // Warm the myself-bbs catalog index so browse + search are instant when the
  // user needs them (the first build crawls ~120 list pages). Non-blocking. Once
  // it's ready, enrich it with Bangumi score + premiere year in the background
  // (unifies the look with anime1 and powers the year filter).
  ensureMyIndex()
    .then((idx) => {
      console.log('[myself index ready]', idx.length, 'titles')
      return enrichMeta(() => broadcast('my:enriched', null))
    })
    .then(() => console.log('[myself meta enriched]'))
    .catch((e) => console.log('[myself index/meta skipped]', e?.message || e))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
